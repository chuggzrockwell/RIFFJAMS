/* RIFFJAMS — Stems in single song mode.
 *
 * The Song Map plays songs through one YouTube player. With Stems on, a song that has a stem
 * file plays from your own audio instead: one 10-channel Opus file per song (vocals, drums, bass,
 * other, guitar as stereo pairs, so they stay sample-locked), made by
 * Loop Prototype\build\make_song_files.py into <chip folder>\songs\ (index.json + <slug>.opus).
 * The audio is copyrighted, so it never goes in this repo: it's read from the Loop Station chip
 * folder you already chose (same browser storage), or ?stems=<url> serves the songs folder.
 *
 * Audio path: <audio> → Signalsmith Stretch (live pitch shift, looper/vendor) → one gain per stem
 * channel → stereo out. Tuning moves A = 440 in 1 Hz steps. Tempo changes use the media element's
 * rate with the pitch put back by the stretch node (better than the browser's own pitch keeping).
 *
 * window.RjStemsPlayer has the YouTube player API, so the Song Map uses it in place of YT.Player:
 * songs without a stem file (or with Stems off) go to the real YouTube player inside it.
 */
(function () {
  "use strict";
  var STEMS = ["vocals", "drums", "bass", "other", "guitar"];
  var LABEL = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other", guitar: "Guitar" };
  var A4 = 440;
  var SAVE_KEY = "rj-stems-v1";
  var BASE = (document.currentScript && document.currentScript.src || "").replace(/[^\/?#]*([?#].*)?$/, "");
  var band = window.RJ_BAND;
  var CHIP_FOLDER = band && band.id && band.id !== "sabbath" ? "looper-" + band.id : "looper";
  var qsBase = new URLSearchParams(location.search).get("stems");
  if (qsBase && !/\/$/.test(qsBase)) qsBase += "/";

  function PS() {
    return (window.YT && window.YT.PlayerState) || { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  }

  /* ---------- saved settings ---------- */
  var st = { on: true, hz: 0, vol: {}, mute: {}, solo: {} };
  try { Object.assign(st, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  STEMS.forEach(function (s) { if (typeof st.vol[s] !== "number") st.vol[s] = 100; });
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); } catch (e) {} }

  /* ---------- where the song files are ---------- */
  function idb(mode, fn) {
    return new Promise(function (res, rej) {
      var o = indexedDB.open("rj-looper-folder", 1);   // the Loop Station's saved chip folder
      o.onupgradeneeded = function () { o.result.createObjectStore("h"); };
      o.onerror = function () { rej(o.error); };
      o.onsuccess = function () {
        var tx = o.result.transaction("h", mode);
        var r = fn(tx.objectStore("h"));
        tx.oncomplete = function () { o.result.close(); res(r && r.result); };
        tx.onerror = function () { rej(tx.error); };
      };
    });
  }
  async function sub(dir, name) { try { return await dir.getDirectoryHandle(name); } catch (e) { return null; } }
  var songsDir = null, index = null, need = null;   // need: {kind: 'choose'|'allow'|'nosongs'|'none'|'error', name}
  async function openFolder(h, interactive) {
    var q = { mode: "read" };
    var p = await h.queryPermission(q);
    if (p !== "granted" && interactive) p = await h.requestPermission(q);
    if (p !== "granted") { need = { kind: "allow", name: h.name }; return null; }
    var d = await sub(h, "songs");
    if (!d) { var inner = await sub(h, CHIP_FOLDER); if (inner) d = await sub(inner, "songs"); }
    if (!d) { need = { kind: "nosongs", name: h.name }; return null; }
    return d;
  }
  /** The songs index ({title: {slug, file, album}}), or null (then `need` says why). */
  async function getIndex(interactive) {
    if (index) return index;
    try {
      if (qsBase) {
        var r = await fetch(qsBase + "index.json");
        if (!r.ok) throw new Error("index.json: HTTP " + r.status);
        index = await r.json();
      } else {
        if (!window.showDirectoryPicker) { need = { kind: "none" }; return null; }
        var h = null;
        try { h = await idb("readonly", function (s) { return s.get("root"); }); } catch (e) {}
        if (!h) { need = { kind: "choose" }; return null; }
        var d = await openFolder(h, interactive);
        if (!d) return null;
        var f = await (await d.getFileHandle("index.json")).getFile();
        index = JSON.parse(await f.text());
        songsDir = d;
      }
      need = null;
      return index;
    } catch (e) {
      need = { kind: "error", msg: e && e.message || String(e) };
      return null;
    }
  }
  async function chooseFolder() {
    var h = await window.showDirectoryPicker({ id: "rj-looper", mode: "readwrite" });
    try { await idb("readwrite", function (s) { return s.put(h, "root"); }); } catch (e) {}   // the Loop Station uses it too
    index = null;
    return getIndex(true);
  }
  var urlCache = {};
  async function fileUrl(entry) {
    if (urlCache[entry.file]) return urlCache[entry.file];
    var blob;
    if (qsBase) {
      var r = await fetch(qsBase + encodeURIComponent(entry.file));
      if (!r.ok) throw new Error(entry.file + ": HTTP " + r.status);
      blob = await r.blob();
    } else {
      blob = await (await songsDir.getFileHandle(entry.file)).getFile();
    }
    Object.keys(urlCache).forEach(function (k) { URL.revokeObjectURL(urlCache[k]); delete urlCache[k]; });
    return (urlCache[entry.file] = URL.createObjectURL(blob));
  }
  function titleFor(id) {
    var map = typeof SM_YT_IDS !== "undefined" ? SM_YT_IDS : {};
    for (var k in map) if (map[k] === id) return k;
    return "";
  }

  /* ---------- audio engine ---------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Couldn't load " + src)); };
      document.head.appendChild(s);
    });
  }
  function Engine(onState) {
    var audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    try { audio.preservesPitch = false; audio.webkitPreservesPitch = false; audio.mozPreservesPitch = false; } catch (e) {}
    (document.body || document.documentElement).appendChild(audio);
    var ctx = null, g = null, gP = null, file = "", wantPlay = false, rate = 1, state = PS().UNSTARTED, silent = false;
    function fire(s) { state = s; if (!silent) onState(s); }
    audio.addEventListener("playing", function () { fire(PS().PLAYING); });
    audio.addEventListener("pause", function () { if (!audio.ended && state !== PS().CUED) fire(PS().PAUSED); });
    audio.addEventListener("ended", function () { wantPlay = false; fire(PS().ENDED); });
    audio.addEventListener("waiting", function () { if (wantPlay) fire(PS().BUFFERING); });

    function graph() {
      if (gP) return gP;
      gP = (async function () {
        if (typeof window.SignalsmithStretch !== "function") await loadScript(BASE + "looper/vendor/SignalsmithStretch.js");
        ctx = new AudioContext({ latencyHint: "playback" });
        var src = ctx.createMediaElementSource(audio);
        var node = await window.SignalsmithStretch(ctx, {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [STEMS.length * 2],
          channelCount: STEMS.length * 2, channelCountMode: "explicit", channelInterpretation: "discrete"
        });
        src.connect(node);
        var split = ctx.createChannelSplitter(STEMS.length * 2);
        node.connect(split);
        var out = ctx.createChannelMerger(2);
        var gains = {};
        STEMS.forEach(function (s, i) {
          var l = ctx.createGain(), r = ctx.createGain();
          split.connect(l, 2 * i); split.connect(r, 2 * i + 1);
          l.connect(out, 0, 0); r.connect(out, 0, 1);
          gains[s] = [l, r];
        });
        var master = ctx.createGain();
        out.connect(master); master.connect(ctx.destination);
        var meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
        var lat = 0;
        try { lat = await node.latency(); } catch (e) {}
        g = { node: node, gains: gains, master: master, meter: meter, lat: lat || 0 };
        applyMix(true); applyPitch();
        return g;
      })();
      gP.catch(function () { gP = null; });
      return gP;
    }
    function applyMix(now) {
      if (!g) return;
      var anySolo = STEMS.some(function (s) { return st.solo[s]; });
      STEMS.forEach(function (s) {
        var v = anySolo ? (st.solo[s] ? st.vol[s] : 0) : (st.mute[s] ? 0 : st.vol[s]);
        g.gains[s].forEach(function (n) {
          if (now) n.gain.value = v / 100;
          else n.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.015);
        });
      });
    }
    function applyPitch() {
      if (!g) return;
      var semis = 12 * Math.log2((A4 + st.hz) / A4) - 12 * Math.log2(rate);   // element rate changes pitch; put it back
      g.node.schedule({ active: true, semitones: semis });
    }
    this.applyMix = function () { applyMix(false); };
    this.applyPitch = applyPitch;
    this.load = async function (entry, start, play) {
      wantPlay = !!play;
      await graph();
      if (file !== entry.file) {
        var url = await fileUrl(entry);
        file = entry.file;
        audio.src = url;
        state = PS().UNSTARTED;
        await new Promise(function (res) { audio.addEventListener("loadedmetadata", res, { once: true }); audio.addEventListener("error", res, { once: true }); });
      }
      try { audio.currentTime = Math.max(0, +start || 0); } catch (e) {}
      if (wantPlay) this.play(); else { audio.pause(); fire(PS().CUED); }
    };
    this.play = function () {
      wantPlay = true;
      if (ctx && ctx.state !== "running") ctx.resume().catch(function () {});
      audio.playbackRate = rate;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    };
    this.pause = function () { wantPlay = false; audio.pause(); };
    /** Quiet stop for a source switch (no state events). */
    this.halt = function () { wantPlay = false; silent = true; audio.pause(); silent = false; };
    this.stop = function () { wantPlay = false; audio.pause(); try { audio.currentTime = 0; } catch (e) {} fire(PS().CUED); };
    this.seek = function (sec) { try { audio.currentTime = Math.max(0, +sec || 0); } catch (e) {} };
    /* Heard time: the stretch node delays the sound by its latency. */
    this.time = function () { return Math.max(0, (audio.currentTime || 0) - (g ? g.lat * rate : 0)); };
    this.duration = function () { var d = audio.duration; return isFinite(d) ? d : 0; };
    this.state = function () { return state; };
    this.file = function () { return file; };
    this.setRate = function (r) { r = +r; if (!(r > 0)) return; rate = r; audio.playbackRate = r; applyPitch(); };
    this.setVolume = function (v, muted) { audio.volume = muted ? 0 : Math.max(0, Math.min(1, v / 100)); };
    /** For checking: context state, stretch latency, output level (RMS). */
    this.debug = function () {
      var rms = 0;
      if (g) { var b = new Float32Array(g.meter.fftSize); g.meter.getFloatTimeDomainData(b); for (var i = 0; i < b.length; i++) rms += b[i] * b[i]; rms = Math.sqrt(rms / b.length); }
      return { ctx: ctx && ctx.state, lat: g && g.lat, file: file, rate: rate, rms: rms, t: audio.currentTime };
    };
    this.destroy = function () { try { audio.pause(); audio.removeAttribute("src"); audio.remove(); } catch (e) {} if (ctx) ctx.close(); };
  }

  /* ---------- YouTube-API player: stems when there's a file, else the real YouTube player ---------- */
  var players = [];
  function RjStemsPlayer(host, opts) {
    var self = this;
    opts = opts || {};
    var ev = opts.events || {};
    var active = "yt", vid = "", title = "", rate = 1, vol = 100, muted = false, token = 0, lastErr = "";
    function fire(s) { if (typeof ev.onStateChange === "function") ev.onStateChange({ target: self, data: s }); }
    var eng = new Engine(function (s) { if (active === "stem") fire(s); });
    var Real = (window.YT && window.YT.Player);
    var real = new Real(host, Object.assign({}, opts, { events: {
      onReady: function () { if (typeof ev.onReady === "function") ev.onReady({ target: self }); },
      onStateChange: function (e) { if (active === "yt") fire(e.data); },
      onError: function (e) { if (active === "yt" && typeof ev.onError === "function") ev.onError({ target: self, data: e.data }); }
    } }));
    function R(m) { var a = [].slice.call(arguments, 1); try { return real[m] && real[m].apply(real, a); } catch (e) {} }

    async function load(arg, start, play) {
      if (arg && typeof arg === "object") { start = arg.startSeconds; arg = arg.videoId; }
      var my = ++token;
      if (arg) vid = String(arg);
      title = titleFor(vid);
      var entry = null;
      lastErr = "";
      if (st.on && title) { var idx = await getIndex(false); entry = idx && idx[title] || null; }
      if (my !== token) return;
      if (entry) {
        if (active === "yt") R("pauseVideo");
        active = "stem"; ui.update();
        try { await eng.load(entry, start || 0, play); return; }
        catch (e) { lastErr = e && e.message || String(e); if (my !== token) return; }
      }
      if (active === "stem") eng.halt();
      active = "yt"; ui.update();
      if (play) R("loadVideoById", vid, start || 0); else R("cueVideoById", vid, start || 0);
      R("setPlaybackRate", rate);
    }
    /** Stems switched on/off or the folder became available: keep the place and play state. */
    this._reswitch = function () {
      if (!vid) { ui.update(); return; }
      var t = self.getCurrentTime(), s = self.getPlayerState(), P = PS();
      load(vid, t, s === P.PLAYING || s === P.BUFFERING);
    };
    this._info = function () { return { active: active, title: title, err: lastErr }; };
    this._eng = eng;

    this.loadVideoById = function (a, s) { load(a, s, true); };
    this.cueVideoById = function (a, s) { load(a, s, false); };
    this.playVideo = function () { if (active === "stem") eng.play(); else R("playVideo"); };
    this.pauseVideo = function () { if (active === "stem") eng.pause(); else R("pauseVideo"); };
    this.stopVideo = function () { if (active === "stem") eng.stop(); else R("stopVideo"); };
    this.seekTo = function (sec, ahead) { if (active === "stem") eng.seek(sec); else R("seekTo", sec, ahead); };
    this.getCurrentTime = function () { return active === "stem" ? eng.time() : (R("getCurrentTime") || 0); };
    this.getDuration = function () { return active === "stem" ? eng.duration() : (R("getDuration") || 0); };
    this.getPlayerState = function () { if (active === "stem") return eng.state(); var s = R("getPlayerState"); return typeof s === "number" ? s : PS().UNSTARTED; };
    this.getVideoData = function () { return active === "stem" ? { video_id: vid, title: title, author: "" } : (R("getVideoData") || { video_id: vid }); };
    this.getVideoUrl = function () { return active === "stem" ? "" : (R("getVideoUrl") || ""); };
    this.getPlaybackRate = function () { return rate; };
    this.setPlaybackRate = function (r) { r = +r; if (!(r > 0)) return; rate = r; eng.setRate(r); R("setPlaybackRate", r); };
    this.getAvailablePlaybackRates = function () { return R("getAvailablePlaybackRates") || [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; };
    this.mute = function () { muted = true; eng.setVolume(vol, true); R("mute"); };
    this.unMute = function () { muted = false; eng.setVolume(vol, false); R("unMute"); };
    this.isMuted = function () { return muted; };
    this.setVolume = function (v) { vol = Math.max(0, Math.min(100, +v || 0)); eng.setVolume(vol, muted); R("setVolume", vol); };
    this.getVolume = function () { return vol; };
    this.getIframe = function () { return R("getIframe"); };
    this.addEventListener = function () { return R.apply(null, ["addEventListener"].concat([].slice.call(arguments))); };
    this.removeEventListener = function () { return R.apply(null, ["removeEventListener"].concat([].slice.call(arguments))); };
    this.destroy = function () { token++; eng.destroy(); R("destroy"); players = players.filter(function (p) { return p !== self; }); };
    players.push(self);
  }
  window.RjStemsPlayer = RjStemsPlayer;

  /* ---------- mixer panel (single song mode) ---------- */
  var ui = { update: function () {} };
  var CSS = [
    ".rj-stems{position:fixed;z-index:199;box-sizing:border-box;background:#000;border:1px solid #222;border-radius:14px;padding:10px 14px;color:#fff;",
    "font-family:'Montserrat','Segoe UI',system-ui,sans-serif;text-transform:uppercase;display:flex;flex-direction:column;gap:8px}",
    ".rj-stems[hidden]{display:none}",
    ".rj-stems-head{display:flex;align-items:center;gap:10px;min-height:20px}",
    ".rj-stems button{appearance:none;font-family:inherit;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;border-radius:999px;line-height:1}",
    ".rj-stems-on{border:1px solid #444;background:#111;color:#fff;font-size:.62rem;padding:5px 9px}",
    ".rj-stems-on[aria-pressed=true]{background:#7030a0;border-color:#7030a0}",
    ".rj-stems-status{font-size:.6rem;color:#aaa;letter-spacing:.03em;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".rj-stems-status b{color:#fff}",
    ".rj-stems-folder{border:1px solid #1db954;background:#1db954;color:#000;font-size:.6rem;padding:5px 9px}",
    ".rj-stems-row{display:flex;gap:12px;align-items:stretch}",
    ".rj-stem{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:5px;border-left:1px solid #222;padding-left:10px}",
    ".rj-stem:first-child{border-left:0;padding-left:0}",
    ".rj-stem-top{display:flex;justify-content:space-between;align-items:baseline;font-size:.62rem;font-weight:700;letter-spacing:.04em}",
    ".rj-stem-pct{color:#aaa;font-weight:600}",
    ".rj-stem input[type=range]{width:100%;margin:0;accent-color:#7030a0;height:16px}",
    ".rj-stem.off input[type=range]{opacity:.35}",
    ".rj-stem-btns{display:flex;gap:5px}",
    ".rj-stem-btns button{flex:1;border:1px solid #444;background:#111;color:#fff;font-size:.6rem;padding:4px 0}",
    ".rj-stem-btns .m[aria-pressed=true]{background:#c0392b;border-color:#c0392b}",
    ".rj-stem-btns .s[aria-pressed=true]{background:#e0b000;border-color:#e0b000;color:#000}",
    ".rj-tune{flex:1.15 1 0}",
    ".rj-tune-val{font-size:.95rem;font-weight:800;text-align:center;cursor:pointer;letter-spacing:.02em;text-transform:none}",
    ".rj-tune-val small{font-size:.6rem;color:#aaa;font-weight:600;margin-left:3px}",
    ".rj-stems.inactive .rj-stem:not(.rj-tune) .rj-stem-top,.rj-stems.inactive .rj-tune-val{color:#777}"
  ].join("");

  function buildUi() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    var box = document.createElement("div");
    box.className = "rj-stems";
    box.id = "rjStems";
    box.hidden = true;
    box.setAttribute("aria-label", "Stems mixer");
    var head = document.createElement("div");
    head.className = "rj-stems-head";
    var onBtn = document.createElement("button");
    onBtn.type = "button"; onBtn.className = "rj-stems-on"; onBtn.textContent = "Stems";
    onBtn.title = "Play songs from your stem files (mix the parts, tune by Hz). Off: YouTube.";
    var status = document.createElement("div");
    status.className = "rj-stems-status";
    var folderBtn = document.createElement("button");
    folderBtn.type = "button"; folderBtn.className = "rj-stems-folder"; folderBtn.hidden = true;
    head.append(onBtn, status, folderBtn);
    var row = document.createElement("div");
    row.className = "rj-stems-row";
    var strips = {};
    STEMS.forEach(function (s) {
      var col = document.createElement("div");
      col.className = "rj-stem";
      var top = document.createElement("div");
      top.className = "rj-stem-top";
      var name = document.createElement("span"); name.textContent = LABEL[s];
      var pct = document.createElement("span"); pct.className = "rj-stem-pct";
      top.append(name, pct);
      var range = document.createElement("input");
      range.type = "range"; range.min = "0"; range.max = "150"; range.step = "1";
      range.title = LABEL[s] + " volume (double-click: 100%)";
      range.setAttribute("aria-label", LABEL[s] + " volume");
      var btns = document.createElement("div"); btns.className = "rj-stem-btns";
      var m = document.createElement("button"); m.type = "button"; m.className = "m"; m.textContent = "M"; m.title = "Mute " + LABEL[s];
      var so = document.createElement("button"); so.type = "button"; so.className = "s"; so.textContent = "S"; so.title = "Solo " + LABEL[s];
      btns.append(m, so);
      col.append(top, range, btns);
      row.appendChild(col);
      strips[s] = { col: col, pct: pct, range: range, m: m, s: so };
      range.addEventListener("input", function () { st.vol[s] = +range.value; changedMix(); });
      range.addEventListener("dblclick", function () { st.vol[s] = 100; changedMix(); });
      range.addEventListener("keydown", function (e) { if (e.key === " ") e.preventDefault(); });
      m.addEventListener("click", function () { st.mute[s] = !st.mute[s]; changedMix(); m.blur(); });
      so.addEventListener("click", function (e) {
        var only = !e.shiftKey && !st.solo[s];   // click: solo just this one; shift-click: add to the solos
        if (only) STEMS.forEach(function (x) { st.solo[x] = false; });
        st.solo[s] = only ? true : !st.solo[s];
        changedMix(); so.blur();
      });
    });
    var tune = document.createElement("div");
    tune.className = "rj-stem rj-tune";
    var tTop = document.createElement("div"); tTop.className = "rj-stem-top";
    var tName = document.createElement("span"); tName.textContent = "Tuning";
    tTop.append(tName);
    var tVal = document.createElement("div"); tVal.className = "rj-tune-val"; tVal.title = "Click: back to A = 440 Hz";
    var tBtns = document.createElement("div"); tBtns.className = "rj-stem-btns";
    var down = document.createElement("button"); down.type = "button"; down.textContent = "− 1 Hz"; down.title = "Tune down 1 Hz";
    var up = document.createElement("button"); up.type = "button"; up.textContent = "+ 1 Hz"; up.title = "Tune up 1 Hz";
    tBtns.append(down, up);
    tune.append(tTop, tVal, tBtns);
    row.appendChild(tune);
    function setHz(hz) { st.hz = Math.max(-40, Math.min(40, Math.round(hz))); save(); players.forEach(function (p) { p._eng.applyPitch(); }); render(); }
    down.addEventListener("click", function () { setHz(st.hz - 1); down.blur(); });
    up.addEventListener("click", function () { setHz(st.hz + 1); up.blur(); });
    tVal.addEventListener("click", function () { setHz(0); });
    box.append(head, row);
    document.body.appendChild(box);

    function changedMix() { save(); players.forEach(function (p) { p._eng.applyMix(); }); render(); }
    onBtn.addEventListener("click", function () {
      st.on = !st.on; save(); onBtn.blur();
      if (st.on && !index) getIndex(true).then(reswitchAll); else reswitchAll();
      render();
    });
    folderBtn.addEventListener("click", async function () {
      folderBtn.blur();
      try {
        if (need && need.kind === "allow") { index = null; await getIndex(true); }
        else await chooseFolder();
      } catch (e) { if (!(e && e.name === "AbortError")) need = { kind: "error", msg: e.message || String(e) }; }
      reswitchAll();
    });
    function reswitchAll() { players.forEach(function (p) { p._reswitch(); }); render(); }

    function render() {
      onBtn.setAttribute("aria-pressed", st.on ? "true" : "false");
      var anySolo = STEMS.some(function (s) { return st.solo[s]; });
      STEMS.forEach(function (s) {
        var x = strips[s];
        x.range.value = String(st.vol[s]);
        x.pct.textContent = st.vol[s] + "%";
        x.m.setAttribute("aria-pressed", st.mute[s] ? "true" : "false");
        x.s.setAttribute("aria-pressed", st.solo[s] ? "true" : "false");
        x.col.classList.toggle("off", anySolo ? !st.solo[s] : !!st.mute[s]);
      });
      tVal.innerHTML = "A = " + (A4 + st.hz) + "<small>Hz</small>";
      var p = players[0], info = p ? p._info() : { active: "yt", title: "" };
      var msg = "", btn = "";
      if (!st.on) msg = "Off · playing YouTube";
      else if (info.active === "stem") msg = "Playing stems · <b>" + esc(info.title) + "</b>";
      else if (need && need.kind === "choose") { msg = "Choose your chip folder (Loop Prototype\\" + CHIP_FOLDER + ") to play stems"; btn = "Choose folder"; }
      else if (need && need.kind === "allow") { msg = "Allow RIFFJAMS to open “" + esc(need.name) + "” again"; btn = "Allow"; }
      else if (need && need.kind === "nosongs") { msg = "No songs folder in “" + esc(need.name) + "” yet (run make_song_files.py)"; btn = "Choose folder"; }
      else if (need && need.kind === "none") msg = "Stems need Chrome or Edge on a computer";
      else if (need && need.kind === "error") { msg = "Couldn't open the stems: " + esc(need.msg); btn = "Choose folder"; }
      else if (info.err) msg = "Couldn't play the stem file: " + esc(info.err) + " · YouTube";
      else if (info.title) msg = "No stem file for <b>" + esc(info.title) + "</b> · playing YouTube";
      else msg = "Stems on · play a song";
      status.innerHTML = msg;
      folderBtn.hidden = !btn || !!qsBase;
      folderBtn.textContent = btn;
      box.classList.toggle("inactive", !(st.on && info.active === "stem"));
    }
    function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    /* Shown in single song mode, next to the Song Map player (left of it, or above it when narrow). */
    function place() {
      var show = document.body.classList.contains("sections-mode") && document.body.classList.contains("sections-single-song");
      box.hidden = !show;
      if (!show) return;
      var pl = document.getElementById("smPlayer");
      var r = pl && pl.getBoundingClientRect();
      var W = window.innerWidth, H = window.innerHeight;
      if (!r || !r.width) r = { left: W - 16, right: W - 16, top: H - 16, bottom: H - 16, width: 0, height: 0 };
      var room = r.left - 16 - 12;
      box.style.top = "auto";
      if (room >= 620) {
        box.style.left = Math.max(16, r.left - 12 - Math.min(room, 900)) + "px";
        box.style.width = Math.min(room, 900) + "px";
        box.style.bottom = Math.max(0, H - r.bottom) + "px";
        box.style.minHeight = r.height ? r.height + "px" : "";
      } else {
        var w = Math.min(W - 32, 640);
        box.style.left = Math.max(16, r.right - w) + "px";
        box.style.width = w + "px";
        box.style.bottom = Math.max(0, H - r.top + 10) + "px";
        box.style.minHeight = "";
      }
    }
    new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", place);
    setInterval(place, 1000);   // the player moves with page zoom; cheap to re-check
    ui.update = render;
    render(); place();
    if (st.on) getIndex(false).then(render);
  }
  if (document.body) buildUi(); else document.addEventListener("DOMContentLoaded", buildUi);
})();
