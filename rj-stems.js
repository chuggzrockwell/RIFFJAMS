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
 * songs without a stem file go to the real YouTube player inside it.
 */
(function () {
  "use strict";
  var STEMS = ["vocals", "drums", "bass", "other", "guitar"];
  var LABEL = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other", guitar: "Guitar" };
  var A4 = 440;
  var HZ_MAX = 40;   // tuning range: A = 400–480 Hz
  var KEY_MAX = 12;  // key change range: ± one octave
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
  var st = { on: true, hz: 0, key: 0, vol: {}, mute: {}, solo: {} };
  try { Object.assign(st, JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); } catch (e) {}
  STEMS.forEach(function (s) { if (typeof st.vol[s] !== "number") st.vol[s] = 100; });
  if (typeof st.key !== "number") st.key = 0;
  /* The Mix panel only shows/hides (st.open); songs with a stem file always play from it, so closing
     the panel keeps the same mix, key and tuning. (st.on used to mean "stems on" and doubled as open.) */
  if (typeof st.open !== "boolean") st.open = st.on !== false;
  st.on = true;
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
    var lastSemis = 0, ctx = null, g = null, gP = null, file = "", wantPlay = false, rate = 1, state = PS().UNSTARTED, silent = false;
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
      STEMS.forEach(function (s) {
        var v = st.mute[s] ? 0 : st.vol[s];   // mute = the part's switch is off
        g.gains[s].forEach(function (n) {
          if (now) n.gain.value = v / 100;
          else n.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.015);
        });
      });
    }
    function applyPitch() {
      if (!g) return;
      var semis = (st.key || 0) + 12 * Math.log2((A4 + st.hz) / A4) - 12 * Math.log2(rate);   // element rate changes pitch; put it back
      lastSemis = semis;
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
      return { ctx: ctx && ctx.state, lat: g && g.lat, file: file, rate: rate, rms: rms, t: audio.currentTime, semitones: lastSemis };
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
      if (title) { var idx = await getIndex(false); entry = idx && idx[title] || null; }
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


  /* ---------- Stems sidebar (single song mode) ----------
     Looks like the Loop Station's Stems panel: a MIX list (name, volume, on/off switch per part) and a
     Tuning stepper. The Stems button in the Song Map toolbar turns stems on and shows the sidebar on
     the left of the stage; pressing it again (or ×) goes back to YouTube and hides it. */
  var ui = { update: function () {} };
  var SB_W = 340;
  var CSS = [
    ".rj-sb{position:fixed;z-index:150;box-sizing:border-box;width:" + SB_W + "px;background:#121212;color:#f2f2f2;border:1px solid #2a2a2a;border-radius:10px;",
    "font-family:Inter,'Segoe UI',system-ui,sans-serif;overflow:hidden;display:flex;flex-direction:column}",
    ".rj-sb[hidden]{display:none}",
    ".rj-sb *{box-sizing:border-box}",
    ".rj-sb button{font:inherit;color:inherit;cursor:pointer}",
    ".rj-sb-body{flex:1;min-height:0;padding:18px 44px 18px 20px;display:flex;flex-direction:column;gap:16px;overflow-y:auto}",
    ".rj-sb-close{position:absolute;top:8px;right:8px;z-index:5;width:28px;height:28px;border-radius:50%;border:1px solid #3a3a3a;background:#1b1b1b;color:#ddd;font-size:17px;line-height:1;padding:0}",
    ".rj-sb-close:hover{background:#7030a0;border-color:#7030a0;color:#fff}",
    ".rj-sb .label{font-size:11px;letter-spacing:.08em;color:#8a8a8a;font-weight:700}",
    ".rj-sb .big{font-family:'Vol4 Title',Impact,sans-serif;font-size:28px;margin-top:4px;line-height:1.1;overflow-wrap:anywhere}",
    ".rj-sb .note{font-size:12px;color:#8a8a8a;line-height:1.5}",
    ".rj-sb .note b{color:#f2f2f2;font-weight:600}",
    ".rj-sb .vstack{display:flex;flex-direction:column;gap:12px}",
    ".rj-sb .stem{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px}",
    ".rj-sb .stem > span{width:52px;flex:0 0 auto}",
    ".rj-sb .stem input[type=range]{flex:1;min-width:0;accent-color:#7030a0}",
    ".rj-sb .stem.off input[type=range]{opacity:.35}",
    ".rj-sb .switch{width:40px;height:22px;border-radius:999px;border:0;background:#3a3a3a;position:relative;flex:0 0 auto;padding:0}",
    ".rj-sb .switch::after{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .12s}",
    ".rj-sb .switch[aria-checked=true]{background:#7030a0}",
    ".rj-sb .switch[aria-checked=true]::after{left:21px}",
    ".rj-sb .stepper{display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #2a2a2a;border-radius:8px}",
    ".rj-sb .stepper .name{color:#8a8a8a;font-size:13px;width:52px;flex:0 0 auto}",
    ".rj-sb .stepbtn{width:34px;height:30px;border-radius:6px;border:1px solid #3a3a3a;background:transparent;font-size:18px;line-height:1;padding:0}",
    ".rj-sb .stepbtn:hover{border-color:#7030a0;background:rgba(112,48,160,.25)}",
    ".rj-sb .stepval{flex:1;text-align:center;font-family:'Vol4 Title',Impact,sans-serif;font-size:18px;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".rj-sb .stepbtn,.rj-sb .stepper .smallbtn{flex:0 0 auto}",
    ".rj-sb .stepper .stepval{min-width:0}",
    ".rj-sb .hzin{width:56px;font:inherit;color:#f2f2f2;background:transparent;border:0;border-bottom:1px dashed #3a3a3a;text-align:center;padding:0 2px;-moz-appearance:textfield}",
    ".rj-sb .hzin::-webkit-outer-spin-button,.rj-sb .hzin::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
    ".rj-sb .hzin:hover{border-bottom-color:#7030a0}",
    ".rj-sb .hzin:focus{outline:none;border-bottom:1px solid #7030a0;background:rgba(112,48,160,.25);border-radius:4px 4px 0 0}",
    ".rj-sb .smallbtn{border:1px solid #3a3a3a;background:transparent;border-radius:6px;font-size:12px;padding:4px 7px}",
    ".rj-sb .smallbtn:hover{border-color:#7030a0}",
    ".rj-sb .lockbtn{border-color:#7030a0;background:#7030a0;color:#fff;font-weight:700;align-self:flex-start;padding:6px 10px}",
    "body:not(.sections-single-song) #secMixBtn{display:none}",
    "#secMixBtn.on{background:#7030a0;border-color:#7030a0;color:#fff}",
    "body.rj-sb-open.sections-single-song.sections-mode #sectionsSheet{margin-left:" + (SB_W + 12) + "px;width:calc(100% - " + (SB_W + 12) + "px)}"
  ].join("");

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function buildUi() {
    var style = el("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var sb = el("aside", "rj-sb");
    sb.id = "rjStems";
    sb.hidden = true;
    sb.setAttribute("aria-label", "Mix");
    var close = el("button", "rj-sb-close", "×");
    close.type = "button"; close.title = "Hide the Mix panel (the mix, key and tuning stay)"; close.setAttribute("aria-label", close.title);
    var body = el("div", "rj-sb-body");
    sb.append(close, body);
    document.body.appendChild(sb);

    /* Toolbar button, after Solo in the Song Map nav */
    var navBtn = el("button", "sec-mode-btn", "Mix");
    navBtn.type = "button"; navBtn.id = "secMixBtn";
    navBtn.title = "Mix: show or hide the panel to mix the parts, change key and tune by Hz (songs with stem files)";
    function mountNav() {
      if (navBtn.isConnected) return;
      var solo = document.getElementById("secSoloBtn"), bar = document.getElementById("secModes");
      if (solo && solo.parentNode) solo.parentNode.insertBefore(navBtn, solo.nextSibling);
      else if (bar) bar.appendChild(navBtn);
    }

    function setOn(on) {
      st.open = !!on; save();
      if (st.open && !index) getIndex(true).then(reswitchAll); else render();   // opening may ask for the folder
    }
    navBtn.addEventListener("click", function () { navBtn.blur(); setOn(!st.open); });
    close.addEventListener("click", function () { setOn(false); });
    function reswitchAll() { players.forEach(function (p) { p._reswitch(); }); render(); }
    function changedMix() { save(); players.forEach(function (p) { p._eng.applyMix(); }); }
    function setKey(k) { st.key = Math.max(-KEY_MAX, Math.min(KEY_MAX, Math.round(k))); save(); players.forEach(function (p) { p._eng.applyPitch(); }); render(); }
    function setHz(hz) { st.hz = Math.max(-HZ_MAX, Math.min(HZ_MAX, Math.round(hz * 10) / 10)); save(); players.forEach(function (p) { p._eng.applyPitch(); }); render(); }
    async function folderAction() {
      try {
        if (need && need.kind === "allow") { index = null; await getIndex(true); }
        else await chooseFolder();
      } catch (e) { if (!(e && e.name === "AbortError")) need = { kind: "error", msg: e.message || String(e) }; }
      reswitchAll();
    }

    function render() {
      mountNav();
      navBtn.classList.toggle("on", !!st.open);
      navBtn.setAttribute("aria-pressed", st.open ? "true" : "false");
      document.body.classList.toggle("rj-sb-open", !!st.open);
      place();
      if (!st.open) return;
      body.textContent = "";
      var p = players[0], info = p ? p._info() : { active: "yt", title: "" };

      var head = el("div");
      head.append(el("div", "label", "MIX"));
      head.append(el("div", "big", info.title || "No song"));
      body.append(head);

      var msg = "", btn = "";
      if (info.active === "stem") msg = "Playing from your stem files.";
      else if (need && need.kind === "choose") { msg = "Choose your chip folder (Loop Prototype\\" + CHIP_FOLDER + ") to play stems."; btn = "Choose folder"; }
      else if (need && need.kind === "allow") { msg = "Allow RIFFJAMS to open “" + esc(need.name) + "” again."; btn = "Allow"; }
      else if (need && need.kind === "nosongs") { msg = "No songs folder in “" + esc(need.name) + "” yet (run make_song_files.py)."; btn = "Choose folder"; }
      else if (need && need.kind === "none") msg = "Stems need Chrome or Edge on a computer.";
      else if (need && need.kind === "error") { msg = "Couldn’t open the stems: " + esc(need.msg); btn = "Choose folder"; }
      else if (info.err) msg = "Couldn’t play the stem file (" + esc(info.err) + "), so this is YouTube.";
      else if (info.title) msg = "No stem file for <b>" + esc(info.title) + "</b>, so this is YouTube.";
      else msg = "Play a song.";
      var note = el("div", "note"); note.innerHTML = msg;
      body.append(note);
      if (btn && !qsBase) {
        var fb = el("button", "smallbtn lockbtn", btn); fb.type = "button";
        fb.addEventListener("click", folderAction);
        body.append(fb);
      }

      body.append(el("div", "label", "PARTS"));
      var box = el("div", "vstack");
      STEMS.forEach(function (s) {
        var row = el("div", "stem" + (st.mute[s] ? " off" : ""));
        var r = el("input");
        r.type = "range"; r.min = "0"; r.max = "150"; r.step = "5"; r.value = String(st.vol[s]);
        r.setAttribute("aria-label", LABEL[s] + " volume");
        r.title = LABEL[s] + " " + st.vol[s] + "% (double-click: 100%)";
        r.addEventListener("input", function () { st.vol[s] = +r.value; r.title = LABEL[s] + " " + st.vol[s] + "% (double-click: 100%)"; changedMix(); });
        r.addEventListener("dblclick", function () { st.vol[s] = 100; r.value = "100"; changedMix(); });
        r.addEventListener("keydown", function (e) { if (e.key === " ") e.preventDefault(); });
        var sw = el("button", "switch");
        sw.type = "button"; sw.setAttribute("role", "switch");
        sw.setAttribute("aria-checked", String(!st.mute[s]));
        sw.setAttribute("aria-label", LABEL[s]);
        sw.addEventListener("click", function () {
          st.mute[s] = !st.mute[s];
          sw.setAttribute("aria-checked", String(!st.mute[s]));
          row.classList.toggle("off", !!st.mute[s]);
          changedMix(); sw.blur();
        });
        row.append(el("span", null, LABEL[s]), r, sw);
        box.append(row);
      });
      body.append(box);

      body.append(el("div", "label", "KEY & TUNING"));
      /* Key: − [Key +2 st] + Reset, in semitones */
      var kstep = el("div", "stepper");
      var kminus = el("button", "stepbtn", "−"); kminus.type = "button"; kminus.setAttribute("aria-label", "Lower the key by a semitone");
      var kval = el("span", "stepval", "Key " + (st.key > 0 ? "+" : st.key < 0 ? "−" : "") + Math.abs(st.key) + " st");
      var kplus = el("button", "stepbtn", "+"); kplus.type = "button"; kplus.setAttribute("aria-label", "Raise the key by a semitone");
      var kreset = el("button", "smallbtn", "Reset"); kreset.type = "button"; kreset.setAttribute("aria-label", "Reset the key");
      kminus.addEventListener("click", function () { setKey(st.key - 1); });
      kplus.addEventListener("click", function () { setKey(st.key + 1); });
      kreset.addEventListener("click", function () { setKey(0); });
      kstep.append(kminus, kval, kplus, kreset);
      body.append(kstep);
      var step = el("div", "stepper");
      var minus = el("button", "stepbtn", "−"); minus.type = "button"; minus.setAttribute("aria-label", "Lower tuning by 1 Hz");
      /* A = [ 440 ] Hz: type a frequency (400–480, decimals OK) and press Enter or click away */
      var val = el("label", "stepval");
      var hzIn = el("input", "hzin");
      hzIn.type = "number"; hzIn.min = String(A4 - HZ_MAX); hzIn.max = String(A4 + HZ_MAX); hzIn.step = "0.1";
      hzIn.value = String(+(A4 + st.hz).toFixed(1));
      hzIn.setAttribute("aria-label", "Tuning: A in Hz");
      hzIn.title = "Type the frequency of A (" + (A4 - HZ_MAX) + "–" + (A4 + HZ_MAX) + " Hz), then Enter";
      function commitHz() {
        var v = parseFloat(hzIn.value);
        if (isFinite(v)) setHz(v - A4); else hzIn.value = String(+(A4 + st.hz).toFixed(1));
      }
      hzIn.addEventListener("change", commitHz);
      hzIn.addEventListener("keydown", function (e) {
        e.stopPropagation();   // typing here must not trigger the Song Map's keyboard shortcuts
        if (e.key === "Enter") { commitHz(); hzIn.blur(); }
        else if (e.key === "Escape") { hzIn.value = String(+(A4 + st.hz).toFixed(1)); hzIn.blur(); }
      });
      hzIn.addEventListener("keyup", function (e) { e.stopPropagation(); });
      hzIn.addEventListener("keypress", function (e) { e.stopPropagation(); });
      val.append("A = ", hzIn, " Hz");
      var plus = el("button", "stepbtn", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Raise tuning by 1 Hz");
      var reset = el("button", "smallbtn", "Reset"); reset.type = "button"; reset.setAttribute("aria-label", "Reset tuning to A = 440 Hz");
      minus.addEventListener("click", function () { setHz(st.hz - 1); });
      plus.addEventListener("click", function () { setHz(st.hz + 1); });
      reset.addEventListener("click", function () { setHz(0); });
      step.append(minus, val, plus, reset);
      body.append(step);
      body.append(el("div", "note", "Key moves the whole song in semitones (± 12). Tuning moves A in 1 Hz steps, or type its frequency (e.g. 432) and press Enter. They add up. Changes happen live."));
    }

    /* Left of the single song stage, same height. */
    function place() {
      var show = !!st.open && document.body.classList.contains("sections-mode") && document.body.classList.contains("sections-single-song");
      var sheet = document.getElementById("sectionsSheet");
      var r = sheet && sheet.getBoundingClientRect();
      if (!show || !r || !r.height) { sb.hidden = true; return; }
      sb.hidden = false;
      sb.style.left = (r.left - SB_W - 12) + "px";   // follows the stage when the page scrolls sideways
      sb.style.top = Math.max(0, r.top) + "px";
      sb.style.height = Math.max(200, Math.min(r.height, window.innerHeight - Math.max(0, r.top) - 8)) + "px";
    }
    new MutationObserver(place).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    setInterval(function () { mountNav(); place(); }, 1000);
    ui.update = render;
    render();
    getIndex(false).then(render);
  }
  if (document.body) buildUi(); else document.addEventListener("DOMContentLoaded", buildUi);
})();
