/* Loop Station prototype — Web Audio looper for RIFFJAMS chips.
 *
 * Audio model
 *   Each chip is a set of stem files (vocals, drums, bass, other, guitar) cut from the
 *   full-song Demucs separation, with ~0.5 s of extra audio around the loop.
 *
 *   Playback runs through Signalsmith Stretch (vendor/SignalsmithStretch.js, MIT), which
 *   changes tempo and pitch independently in real time and loops a section by itself.
 *   All five stems go through ONE 10-channel stretch node, so they stay locked together.
 *
 *   There are two "decks" (stretch nodes). The playing chip is on one; a queued chip is
 *   loaded onto the other and crossfaded in exactly on the playing chip's loop seam.
 *
 *   deck node (10 ch) -> deck gain -> splitter -> 5 stereo stem pairs -> stem bus -> master
 *
 *   Timing model: for the deck you hear, audible time t maps to input position
 *     anchor.inp + (t - anchor.t) * rate   (wrapping inside [loopStart, loopEnd))
 *   which is exactly what the node does, so seams and progress can be computed in JS.
 */
(() => {
  'use strict';

  const STORE_KEY = 'rj-looper-v1';
  const STEMS = ['vocals', 'drums', 'bass', 'other', 'guitar'];
  const STEM_LABEL = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other · piano', guitar: 'Guitar (original)' };
  const TICK_MS = 25;
  const MAX_CACHED = 3;        // decoded chips kept in memory (decks hold their own copy)
  const COMMIT_AHEAD = 0.3;    // a chip switch is locked in this long (plus latency) before the seam
  const A4 = 440;
  const PANELS = [
    { id: 'now', label: 'Now', width: 340 },
    { id: 'stems', label: 'Mix', width: 340 },
    { id: 'tune', label: 'Tempo & Key', width: 340 },
    { id: 'needs', label: 'Needs improvement', width: 340 },
    { id: 'playboard', label: 'Tab', width: 520, embed: true },
    { id: 'songmap', label: 'Song Map', width: 680, embed: true }
  ];
  const PANEL_IDS = PANELS.map((p) => p.id);

  /* Section colours — same values and lightening rule as the Song Map (arrChipColors). */
  const SECTION_BASE = { V: '#2a14f2', I: '#e02020', C: '#7030a0', B: '#18d060', S: '#ff5cad', L: '#ff5cad', P: '#f0c008', PC: '#f0c008', O: '#d86820' };
  const SECTION_NAME = { V: 'Verse', I: 'Intro', C: 'Chorus', B: 'Bridge', S: 'Solo', L: 'Lead', P: 'Pre-chorus', PC: 'Pre-chorus', O: 'Outro' };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ---------- persisted state ---------- */
  const DEFAULT_STATE = {
    looper: ['V1', 'V2', 'I1', 'S1', 'V3', 'O1', 'O2', 'S2'].map((c) => 'war-pigs/' + c),   // chip ids are "song-slug/CODE"
    stemOn: { vocals: true, drums: true, bass: true, other: true, guitar: false },
    stemVol: { vocals: 1, drums: 1, bass: 1, other: 1, guitar: 1 },
    nudges: {},
    fadeMs: 10,
    loopOn: true,
    panel: 'now',
    panels: PANEL_IDS.slice(),
    panelsSeen: PANEL_IDS.slice(),   // panels that existed when the user last chose; new ones start visible
    sidebarW: {},                    // per-panel sidebar width chosen with the divider
    rate: 1,              // tempo multiplier for every chip
    keyGlobal: 0,         // semitones, every chip
    hzGlobal: 0,          // fine tune for every chip, Hz relative to A = 440
    chipPitch: {},        // per chip: { key: semitones, hz: Hz }
    chainSet: [],         // chips linked into the chain (none = no chain)
    chainPasses: 1,       // passes per chip before moving on
    chainPer: {},         // per-chip passes override
    clickOn: false,       // click track
    clickVol: 1,
    needs: [],            // Needs improvement list: [{ album, song, code, tier, cover }] from Song Map clicks
    songsSeen: ['war-pigs']   // songs already offered; a newly processed song's chips join the looper once
  };
  function loadState() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { s = null; }
    const out = JSON.parse(JSON.stringify(DEFAULT_STATE));
    if (s && typeof s === 'object') {
      if (Array.isArray(s.looper)) out.looper = s.looper.slice(0, 16);
      if (s.slots && typeof s.slots === 'object') out.slots = s.slots;
      if (s.stemOn) Object.assign(out.stemOn, s.stemOn);
      if (s.stemVol) Object.assign(out.stemVol, s.stemVol);
      if (s.nudges && typeof s.nudges === 'object') out.nudges = s.nudges;
      if ([5, 10, 20, 40].includes(s.fadeMs)) out.fadeMs = s.fadeMs;
      if (typeof s.loopOn === 'boolean') out.loopOn = s.loopOn;
      if (Array.isArray(s.panels)) {
        const seen = Array.isArray(s.panelsSeen) ? s.panelsSeen : ['now', 'map', 'stems', 'tune'];
        out.panels = PANEL_IDS.filter((id) => s.panels.includes(id) || !seen.includes(id));
      }
      if (s.sidebarW && typeof s.sidebarW === 'object') out.sidebarW = s.sidebarW;
      if (typeof s.panel === 'string' && (s.panel === 'off' || out.panels.includes(s.panel))) out.panel = s.panel;
      if (typeof s.rate === 'number' && isFinite(s.rate)) out.rate = clamp(s.rate, 0.5, 1.5);
      if (Number.isInteger(s.keyGlobal)) out.keyGlobal = clamp(s.keyGlobal, -12, 12);
      if (Number.isInteger(s.hzGlobal)) out.hzGlobal = clamp(s.hzGlobal, -40, 40);
      if (s.chipPitch && typeof s.chipPitch === 'object') out.chipPitch = s.chipPitch;
      if (Array.isArray(s.songsSeen)) out.songsSeen = s.songsSeen;
      if (Array.isArray(s.chainSet)) out.chainSet = s.chainSet.filter((x) => typeof x === 'string');
      if (Number.isInteger(s.chainPasses)) out.chainPasses = clamp(s.chainPasses, 1, 16);
      if (s.chainPer && typeof s.chainPer === 'object') out.chainPer = s.chainPer;
      if (typeof s.clickOn === 'boolean') out.clickOn = s.clickOn;
      if (typeof s.clickVol === 'number' && isFinite(s.clickVol)) out.clickVol = clamp(s.clickVol, 0, 1.5);
      if (Array.isArray(s.needs)) out.needs = s.needs.filter((n) => n && n.song && n.code);
    }
    if (out.panel !== 'off' && !out.panels.includes(out.panel)) out.panel = out.panels[0] || 'off';
    // Before Paranoid, chips were plain codes (all War Pigs): carry them over as "war-pigs/CODE".
    const mig = (k) => (k.includes('/') ? k : 'war-pigs/' + k);
    const migKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [mig(k), v]));
    out.looper = out.looper.map(mig);
    out.nudges = migKeys(out.nudges);
    out.chipPitch = migKeys(out.chipPitch);
    return out;
  }
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: keep going */ } }

  let state = loadState();
  let songs = [];          // manifest.json "songs": [{album, song, slug, map, chips}]
  let chipsByCode = {};    // chip id "slug/CODE" -> chip (plus id, song, slug, album, lickPrefix)
  const lab = (id) => (chipsByCode[id] ? chipsByCode[id].code : String(id));   // the code you see, e.g. "V1"

  /* ---------- pitch / tempo ---------- */
  function chipPitch(code) { return Object.assign({ key: 0, hz: 0 }, state.chipPitch[code]); }
  function semitonesFor(code) {
    const p = chipPitch(code);
    const hz = A4 + state.hzGlobal + p.hz;
    return state.keyGlobal + p.key + 12 * Math.log2(hz / A4);
  }
  function chipBpm(code) { const c = chipsByCode[code]; return c && c.quantized ? c.quantized.bpm : null; }
  function chipGain(code) { return Math.pow(10, ((chipsByCode[code] || {}).gainDb || 0) / 20); }

  /* ---------- audio graph ---------- */
  let ctx = null, master = null, LAT = 0.2;
  const stemBus = {};
  const decks = [];
  const cache = new Map();     // code -> { buffers: {stem: AudioBuffer}, used }
  const inflight = new Map();  // "code/stem" -> Promise
  let audioReady = null;

  function initAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC({ sampleRate: 44100, latencyHint: 'interactive' }); }
    catch (e) { ctx = new AC(); }
    master = ctx.createGain();
    master.connect(ctx.destination);
    STEMS.forEach((s) => {
      const g = ctx.createGain();
      g.gain.value = stemTarget(s);
      g.connect(master);
      stemBus[s] = g;
    });
    audioReady = (async () => {
      if (typeof window.SignalsmithStretch !== 'function') throw new Error('The tempo/pitch engine (vendor/SignalsmithStretch.js) did not load.');
      for (let i = 0; i < 2; i++) decks.push(await makeDeck(i));
      LAT = (await decks[0].node.latency()) + 0.03;
    })();
    return audioReady;
  }

  async function makeDeck(i) {
    const node = await window.SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [STEMS.length * 2] });
    const gain = ctx.createGain();
    gain.channelCount = STEMS.length * 2;
    gain.channelCountMode = 'explicit';
    gain.channelInterpretation = 'discrete';
    gain.gain.value = 0;
    node.connect(gain);
    const split = ctx.createChannelSplitter(STEMS.length * 2);
    gain.connect(split);
    STEMS.forEach((s, k) => {
      const m = ctx.createChannelMerger(2);
      split.connect(m, 2 * k, 0);
      split.connect(m, 2 * k + 1, 1);
      m.connect(stemBus[s]);
    });
    return { id: i, node, gain, code: null, loading: null, playCode: null, anchor: null, loop: null, used: 0 };
  }

  function stemTarget(s) { return state.stemOn[s] ? state.stemVol[s] : 0; }
  function applyStem(s) { if (ctx) stemBus[s].gain.setTargetAtTime(stemTarget(s), ctx.currentTime, 0.015); }
  async function ensureRunning() { if (ctx.state !== 'running') await ctx.resume(); }

  /* ---------- chip folder ----------
     The audio is copyrighted, so it never goes in the RIFFJAMS repo. You choose the folder that
     holds manifest.json (every chip's timing) and audio/<song>/<chip>/<stem>.flac once, and the
     browser remembers it (Chrome / Edge on a computer). Lock in saves manifest.json there.
     ?audio=<url> loads the same layout from a server instead (serve_looper.py, or hosting later). */
  /* Each band has its own chip folder (Guns N' Roses: Loop Prototype\\looper-gnr); the browser remembers each separately. */
  const CHIP_FOLDER = (window.RJ_BAND && window.RJ_BAND.id !== 'sabbath') ? 'looper-' + window.RJ_BAND.id : 'looper';
  const CHIP_PATH = 'D:\\RIFFJAMS Audio\\Loop Prototype\\' + CHIP_FOLDER;   // where the chip folders live on this computer
  let source = null;   // { name, read(path) -> ArrayBuffer, manifest() -> object, lockIn(req) -> {status, body} }
  function idb(mode, fn) {
    return new Promise((res, rej) => {
      const o = indexedDB.open('rj-looper-folder', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('h');
      o.onerror = () => rej(o.error);
      o.onsuccess = () => {
        const tx = o.result.transaction('h', mode);
        const r = fn(tx.objectStore('h'));
        tx.oncomplete = () => { o.result.close(); res(r && r.result); };
        tx.onerror = () => rej(tx.error);
      };
    });
  }
  const savedFolder = () => idb('readonly', (st) => st.get('root')).catch(() => null);
  const rememberFolder = (h) => idb('readwrite', (st) => st.put(h, 'root')).catch(() => {});
  async function fileIn(dir, path) {
    const parts = path.split('/');
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    return (await dir.getFileHandle(parts[parts.length - 1])).getFile();
  }
  async function subdir(dir, name) { try { return await dir.getDirectoryHandle(name); } catch (e) { return null; } }
  async function hasFile(dir, name) { try { await dir.getFileHandle(name); return true; } catch (e) { return false; } }
  // The looper folder itself works, and so do its parent (Loop Prototype) or an audio folder holding manifest.json.
  async function folderSource(picked) {
    let home = picked;
    if (!(await hasFile(home, 'manifest.json'))) {
      const inner = await subdir(home, CHIP_FOLDER);
      if (inner && await hasFile(inner, 'manifest.json')) home = inner;
      else throw new Error('There’s no manifest.json in “' + picked.name + '”. Choose ' + CHIP_PATH + ' instead.');
    }
    const audio = (await subdir(home, 'audio')) || home;
    const write = async (name, text) => {
      const w = await (await home.getFileHandle(name, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    };
    return {
      name: picked.name,
      read: async (path) => (await fileIn(audio, path)).arrayBuffer(),
      manifest: async () => JSON.parse(await (await fileIn(home, 'manifest.json')).text()),
      async lockIn(req) {
        const text = await (await fileIn(home, 'manifest.json')).text();
        const res = bakeLockIn(JSON.parse(text), req);
        if (res.status === 200) {
          await write('manifest.json.bak', text);
          await write('manifest.json', JSON.stringify(res.root, null, 2));
        }
        return res;
      }
    };
  }
  function urlSource(base) {
    if (!base.endsWith('/')) base += '/';
    const get = async (u) => {
      const r = await fetch(base + u, { cache: 'no-store' });
      if (!r.ok) throw new Error('Could not load ' + base + u + ' (' + r.status + ')');
      return r;
    };
    return {
      name: base,
      read: async (path) => (await get('audio/' + path)).arrayBuffer(),
      manifest: async () => (await get('manifest.json')).json(),
      async lockIn(req) {
        const r = await fetch(base + 'api/lock-in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
        let body = null;
        try { body = await r.json(); } catch (e) { /* not JSON */ }
        if (r.status === 501 || (r.status === 404 && !body)) return { status: 501, body: { error: 'that server can’t save. Run start-looper.bat' } };
        return { status: r.status, body };
      }
    };
  }
  // Same rules as serve_looper.py: offset, length and song start move; the beat grid stays at gridOrigin; rev goes up.
  function bakeLockIn(root, { slug, code, rev, s, e }) {
    const rnd = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
    if (Math.abs(s) > 600000 || Math.abs(e) > 600000) return { status: 400, body: { error: 'Adjustment out of range' } };
    const song = (root.songs || [root]).find((x) => x.slug === slug);
    const chip = song && song.chips.find((x) => x.code === code);
    if (!chip) return { status: 404, body: { error: 'No chip ' + slug + '/' + code + ' in manifest.json' } };
    if ((chip.rev || 0) !== rev) return { status: 409, body: { error: 'This chip changed since the page loaded. Reload the page and try again.' } };
    const off = +chip.offset, newOff = off + s / 1000, newEnd = off + +chip.length + e / 1000;
    if (newOff < 0 || newEnd > +chip.fileLength - 0.02 + 1e-6 || newEnd - newOff < 0.5) {
      return { status: 400, body: { error: 'Those loop points fall outside the chip’s audio' } };
    }
    if (!('gridOrigin' in chip)) chip.gridOrigin = rnd(off, 4);
    chip.offset = rnd(newOff, 4);
    chip.length = rnd(newEnd - newOff, 4);
    chip.start = rnd(+chip.start + s / 1000, 3);
    chip.rev = rev + 1;
    (chip.lockIns = chip.lockIns || []).push({ s, e, date: new Date().toLocaleDateString('en-CA') });
    return { status: 200, root, body: { chip } };
  }

  function loadStem(code, stem, entry) {
    const key = code + '/' + stem;
    if (entry.buffers[stem]) return Promise.resolve();
    if (inflight.has(key)) return inflight.get(key);
    const c = chipsByCode[code];
    const path = c.slug + '/' + (c.dir || c.code) + '/' + stem + '.flac';
    const p = source.read(path)
      .catch((e) => { throw new Error('Could not load ' + path + ' from ' + source.name + ' (' + (e.message || e) + ')'); })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { entry.buffers[stem] = buf; })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  async function loadChip(code) {
    let entry = cache.get(code);
    if (!entry) { entry = { buffers: {}, used: 0 }; cache.set(code, entry); }
    entry.used = performance.now();
    await Promise.all(STEMS.map((s) => loadStem(code, s, entry)));
    evict();
    return entry;
  }
  function isDecoded(code) { const e = cache.get(code); return !!e && STEMS.every((s) => e.buffers[s]); }
  function deckWith(code) { return decks.find((d) => d.code === code && !d.loading) || null; }
  function isReady(code) { return !!deckWith(code) || isDecoded(code); }
  function evict() {
    if (cache.size <= MAX_CACHED) return;
    const keep = new Set([queued, focusCode].filter(Boolean));
    const order = [...cache.entries()].filter(([c]) => !keep.has(c)).sort((a, b) => a[1].used - b[1].used);
    while (cache.size > MAX_CACHED && order.length) cache.delete(order.shift()[0]);
  }

  /* Copy a chip's stems into a deck (5 stereo stems -> 10 channels). */
  async function loadIntoDeck(deck, code) {
    if (deck === active || (pending && deck === pending.deck)) return;
    if (deck.code === code && !deck.loading) return;
    const token = {};
    deck.loading = token;
    deck.code = null;
    try {
      const entry = await loadChip(code);
      if (deck.loading !== token) return;
      const chans = [];
      STEMS.forEach((s) => {
        const b = entry.buffers[s];
        const L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L;
        chans.push(new Float32Array(L), new Float32Array(R));
      });
      await deck.node.dropBuffers();
      await deck.node.addBuffers(chans, chans.map((a) => a.buffer));   // transfer, no extra copy
      if (deck.loading !== token) return;
      deck.code = code;
      deck.used = performance.now();
    } finally {
      if (deck.loading === token) deck.loading = null;
    }
  }

  /* ---------- loop geometry ---------- */
  /* Nudges are stored per audio version, so re-rendered (quantized) chips start clean. */
  function nudgeKey(code) {
    const c = chipsByCode[code];
    if (!c || (!c.dir && !c.rev)) return code;
    return code + '@' + (c.dir || '') + (c.rev ? '#' + c.rev : '');   // a new rev means adjustments were baked in
  }
  /* Where a tempo-locked chip's beat grid starts (file seconds). Locking in a loop-point change
     moves the loop's offset, but the beats stay where they were rendered. */
  function gridOf(c) { return c.gridOrigin != null ? c.gridOrigin : c.offset; }
  /* A chip that starts on a pickup (e.g. the & of 4) has "pickup" beats before its bar line. */
  function pickupSec(c) { return c.pickup && c.quantized ? c.pickup * 60 / c.quantized.bpm : 0; }
  function nudgeOf(code) { return state.nudges[nudgeKey(code)] || { s: 0, e: 0 }; }
  function loopGeom(code) {
    const c = chipsByCode[code];
    const n = nudgeOf(code);
    let ls = c.offset + n.s / 1000;
    let le = c.offset + c.length + n.e / 1000;
    ls = Math.max(0, ls);
    le = Math.min(c.fileLength - 0.02, le);
    return { ls, le, L: le - ls };
  }

  /* ---------- transport ---------- */
  let active = null;        // deck you hear
  let pending = null;       // { deck, code, at } a switch locked in for the next seam
  let queued = null;        // chip waiting for the next seam
  let stopAt = null;        // loop off: when the current chip finishes
  let deferred = false;     // tempo/pitch/loop change waiting for a locked-in switch
  let focusCode = null;     // chip shown in the Now / Tempo & Key panels
  let startToken = 0;

  function otherDeck(d) { return decks[0] === d ? decks[1] : decks[0]; }
  function sched(deck, T, obj) { deck.node.schedule(Object.assign({ outputTime: T, output: T }, obj)); }
  function holdGain(param, at) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(at);
    else { param.cancelScheduledValues(at); param.setValueAtTime(param.value, at); }
  }

  function inputAt(deck, t) {
    const a = deck.anchor, lp = deck.loop;
    let x = a.inp + (t - a.t) * a.rate;
    const L = lp.le - lp.ls;
    if (x >= lp.le && L > 0) x = lp.ls + ((x - lp.ls) % L);
    return x;
  }
  function nextSeam(deck, t) { return t + (deck.loop.le - inputAt(deck, t)) / deck.anchor.rate; }

  function startDeck(deck, code, T, inputPos) {
    const g = loopGeom(code);
    const inp = inputPos == null ? g.ls : inputPos;
    deck.loop = { ls: g.ls, le: g.le };
    deck.anchor = { t: T, inp, rate: state.rate };
    deck.prevAnchor = null;
    deck.playCode = code;
    deck.used = performance.now();
    sched(deck, T, { active: true, input: inp, rate: state.rate, semitones: semitonesFor(code), loopStart: g.ls, loopEnd: g.le });
  }
  function fadeOutDeck(deck, from, to) {
    const g = deck.gain.gain;
    holdGain(g, from);
    g.linearRampToValueAtTime(0, to);
    sched(deck, to + 0.03, { active: false });
  }

  async function startChip(code, countIn) {
    const token = ++startToken;
    if (!audioReady) return;
    try { await audioReady; } catch (e) { showError(e); return; }
    await ensureRunning();
    focusCode = code;
    const deck = deckWith(code) || (active ? otherDeck(active) : [...decks].sort((a, b) => a.used - b.used)[0]);
    if (!deckWith(code)) {
      setStatus('Loading ' + lab(code) + '…');
      render();
      try { await loadIntoDeck(deck, code); } catch (e) { showError(e); return; }
    }
    if (token !== startToken || deck.code !== code) return;
    setStatus('');
    // Count-in: four clicks at the chip's tempo (accent on the first), the chip comes in on the fifth.
    const bpm = countIn ? chipBpm(code) : null;
    const T0 = ctx.currentTime + LAT;
    const q = bpm ? 60 / (bpm * state.rate) : 0;
    // The chip's next bar line lands on beat 5: a loop that starts before its bar line (a pickup,
    // or loop points moved off the bar) comes in that much earlier, e.g. on the & of 4.
    let lead = 0;
    if (bpm) {
      const c = chipsByCode[code], g = loopGeom(code), barF = 4 * 60 / bpm;   // file seconds
      lead = (((gridOf(c) - g.ls) % barF) + barF) % barF;
      if (lead > barF - 0.005) lead = 0;
      lead /= state.rate;
    }
    const T = T0 + 4 * q - lead;
    const g = deck.gain.gain;
    g.cancelScheduledValues(T);          // any fade-out still running finishes before T
    g.setValueAtTime(0, T);
    g.linearRampToValueAtTime(chipGain(code), T + 0.008);
    startDeck(deck, code, T);
    active = deck; pending = null; queued = null; stopAt = null; deferred = false;
    clickReset();
    if (bpm) {
      for (let i = 0; i < 4; i++) playClick(T0 + i * q, i === 0);
      setStatus('Count-in: ' + lab(code) + ' at ' + (bpm * state.rate).toFixed(1) + ' BPM');
      setTimeout(() => { if ($('statusText').textContent.startsWith('Count-in')) setStatus(''); }, (T - ctx.currentTime) * 1000 + 300);
    }
    render();
  }
  /* "C" on a chip: stop whatever plays, count four beats at the chip's tempo, then start it. */
  function countInChip(code) {
    if (!chipBpm(code)) { setStatus(lab(code) + ' has no locked tempo to count in'); return; }
    stopAll();
    startChip(code, true);
  }

  function stopAll() {
    startToken++;
    if (ctx) {
      const now = ctx.currentTime;
      decks.forEach((d) => { if (d.anchor) fadeOutDeck(d, now, now + 0.03); d.anchor = null; d.playCode = null; });
    }
    active = null; pending = null; queued = null; stopAt = null; deferred = false;
    clickReset();
    render();
  }

  /* Lock in what happens at the next seam (switch chip, or stop when loop is off). */
  function tick() {
    if (!ctx || !active) return;
    const now = ctx.currentTime;
    if (pending && now >= pending.at) {
      active.playCode = null; active.anchor = null;
      active = pending.deck;
      pending = null;
      if (deferred) { deferred = false; applyLive(); }
      render();
    }
    if (stopAt !== null && now >= stopAt) {
      sched(active, now, { active: false });
      active.anchor = null; active.playCode = null; active = null; stopAt = null;
      render();
      return;
    }
    if (pending || stopAt !== null || !active.anchor) return;
    const seam = nextSeam(active, now + LAT);
    if (queued && queued === active.playCode) queued = null;
    chainStep(now);
    if (queued) {
      const nd = otherDeck(active);
      if (nd.code !== queued && !nd.loading) {
        loadIntoDeck(nd, queued).then(render).catch(showError);   // keep looping until it's ready
        return;
      }
      if (nd.code === queued && !nd.loading && seam - now <= LAT + COMMIT_AHEAD) {
        commitSwitch(nd, queued, seam);
        queued = null;
        render();
      }
      return;
    }
    if (!state.loopOn && seam - now <= LAT + COMMIT_AHEAD) {
      const x = state.fadeMs / 1000;
      fadeOutDeck(active, seam - x / 2, seam + x / 2);
      stopAt = seam + x / 2;
      render();
    }
  }
  setInterval(tick, TICK_MS);

  /* ---------- chain ----------
     A chain is two or more chips side by side on the board (no empty slot between) with their
     chain-link buttons on; that alone switches chaining on (there is no separate CHAIN switch).
     While a chain chip plays, the looper moves through the chain by itself: each plays its number
     of passes, then the next chain chip (board order, wrapping) is queued and takes over on the
     seam like a manual queue. Unlinked chips just loop. If the chain gets split (a chip dragged
     away), the piece holding the playing chip runs. A manual tap still queues as usual. */
  const chain = { code: null, done: 0, seamAt: null, hold: -1 };   // done = passes finished of chain.code
  // Split chips (board order) into runs of neighbouring slots.
  function runsOf(ids) {
    const runs = [];
    ids.forEach((id) => {
      const r = runs[runs.length - 1];
      if (r && state.slots[id] === state.slots[r[r.length - 1]] + 1) r.push(id);
      else runs.push([id]);
    });
    return runs;
  }
  function linkedChips() { return state.looper.filter((id) => state.chainSet.includes(id)); }
  function chainList() {
    // Only linked chips, and only runs of two or more: a lone linked chip isn't a chain yet.
    const runs = runsOf(linkedChips()).filter((r) => r.length >= 2);
    const pc = playingCode();
    return runs.find((r) => r.includes(pc)) || runs[0] || [];
  }
  function chainPassesOf(code) { return state.chainPer[code] || state.chainPasses; }
  function nextInChain(code) {
    const list = new Set(chainList());
    const L = state.looper;
    const i = L.indexOf(code);
    for (let k = 1; k <= L.length; k++) {
      const id = L[((i < 0 ? -1 : i) + k + L.length) % L.length];
      if (list.has(id) && id !== code) return id;
    }
    return null;
  }
  function chainStep(now) {
    const code = active.playCode;
    if (chain.code !== code) { chain.code = code; chain.done = 0; chain.seamAt = null; chain.hold = -1; }
    // Count passes: the upcoming seam jumps a whole loop later each time one goes by.
    const g = active.loop, L = (g.le - g.ls) / active.anchor.rate;
    const s = nextSeam(active, now);
    if (chain.seamAt != null && s - chain.seamAt > 0.5 * L) chain.done++;
    chain.seamAt = s;
    // The chain's own queue follows the current settings: if repeats went up (or the chain
    // changed) after it lined up the next chip, take that back or swap it. A chip you queued
    // yourself is left alone.
    const linked = chainList().includes(code);   // a chip outside the chain just loops
    if (queued && queued === chain.autoQueued) {
      const want = linked && chain.hold !== chain.done && chain.done >= chainPassesOf(code) - 1 ? nextInChain(code) : null;
      if (want !== queued) { queued = want; chain.autoQueued = want; render(); }
      return;
    }
    if (!linked || queued || chain.hold === chain.done) return;
    if (chain.done >= chainPassesOf(code) - 1) {     // this is its last pass: line up the next chip
      const nx = nextInChain(code);
      if (nx) { queued = nx; chain.autoQueued = nx; render(); }
    }
  }
  // Link / unlink a chip. Only a chip next to the chain can join it, and only an end can leave
  // it, so the chain stays in one piece.
  function toggleChainChip(id) {
    const linked = linkedChips();
    const s = state.slots[id];
    const at = (slot) => linked.some((x) => state.slots[x] === slot);
    if (state.chainSet.includes(id)) {
      if (at(s - 1) && at(s + 1)) { setStatus('Unlink ' + lab(id) + ' from an end of the chain: the chain has to stay in one piece'); return; }
      state.chainSet = state.chainSet.filter((x) => x !== id);
    } else {
      if (linked.length && !at(s - 1) && !at(s + 1)) { setStatus('Only a chip right next to the chain can join it'); return; }
      state.chainSet = state.chainSet.filter((x) => state.looper.includes(x)).concat([id]);
    }
    saveState(); render();
  }
  function setChainPasses(v) { state.chainPasses = clamp(v, 1, 16); saveState(); render(); }
  function setChipPasses(id, v) {
    if (v == null) delete state.chainPer[id]; else state.chainPer[id] = clamp(v, 1, 16);
    saveState(); render();
  }

  /* ---------- click track ----------
     Tempo-locked chips have a steady beat grid in file time (c.offset + k·60/bpm). A lookahead
     scheduler maps that grid through the deck's timing model (anchor, rate, loop wrap) to audio
     clock times and schedules short blips there, so the click follows tempo changes, seams,
     chip switches and nudged loop points. Bar downbeats (every 4th beat from the loop's rendered
     start) are accented. Chips without a locked tempo don't click. */
  const CLICK_LOOK = 0.12;     // seconds scheduled ahead
  let clickBus = null;
  let clickHorizon = 0;        // audio time up to which clicks are scheduled
  let clickNodes = [];         // [{ osc, t }] scheduled, for cancelling on transport changes

  function clickReset() {
    if (!ctx) return;
    const now = ctx.currentTime;
    clickNodes.forEach((n) => { if (n.t > now) { try { n.osc.stop(); } catch (e) { /* ignore */ } } });
    clickNodes = [];
    clickHorizon = now;
  }
  function playClick(t, accent) {
    if (!clickBus) { clickBus = ctx.createGain(); clickBus.connect(ctx.destination); }
    clickBus.gain.value = state.clickVol;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.32 : 0.2, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    osc.connect(g); g.connect(clickBus);
    osc.start(t); osc.stop(t + 0.04);
    clickNodes.push({ osc, t });
  }
  // Beats of the chip on deck d heard during audio time [w0, w1): [{ t, accent }].
  function deckBeats(d, w0, w1) {
    const c = d && d.playCode && chipsByCode[d.playCode];
    if (!c || !c.quantized || !d.anchor || !d.loop) return [];
    // A live change (tempo, loop points, seek) lands at its anchor time; until then the old timing holds.
    const pa = d.prevAnchor;
    if (pa && w0 < pa.until) {
      return beatsFor(c, pa.anchor, pa.loop, w0, Math.min(w1, pa.until))
        .concat(beatsFor(c, d.anchor, d.loop, Math.max(w0, pa.until), w1));
    }
    return beatsFor(c, d.anchor, d.loop, w0, w1);
  }
  function beatsFor(c, a, loop, w0, w1) {
    if (!a || !loop) return [];
    const T = 60 / c.quantized.bpm;
    const ls = loop.ls, le = loop.le, L = le - ls;
    if (L <= 0) return [];
    w0 = Math.max(w0, a.t);                       // nothing to say about time before this anchor
    if (w1 <= w0) return [];
    const ua = a.inp + (w0 - a.t) * a.rate - ls;  // unwrapped offset from the loop start
    const ub = a.inp + (w1 - a.t) * a.rate - ls;
    const toT = (u) => a.t + (u + ls - a.inp) / a.rate;
    const out = [];
    const push = (pos, u) => {
      const k = Math.round((pos - gridOf(c)) / T);
      out.push({ t: toT(u), accent: ((k % 4) + 4) % 4 === 0 });
    };
    // pre-roll before the loop start (a switch starts the new chip a hair early)
    if (ua < 0) {
      for (let k = Math.ceil((ls + ua - gridOf(c)) / T); gridOf(c) + k * T < ls && gridOf(c) + k * T - ls <= ub; k++) {
        const pos = gridOf(c) + k * T;
        if (pos - ls >= ua) push(pos, pos - ls);
      }
    }
    // beats inside the loop, pass by pass
    const kIn0 = Math.ceil((ls - gridOf(c)) / T - 1e-9);
    const inLoop = [];
    for (let k = kIn0; gridOf(c) + k * T < le - 1e-9; k++) inLoop.push(gridOf(c) + k * T);
    if (!inLoop.length) return out;
    for (let p = Math.max(0, Math.floor(ua / L)); p * L <= ub; p++) {
      inLoop.forEach((pos) => { const u = p * L + (pos - ls); if (u >= ua && u < ub && u >= 0) push(pos, u); });
    }
    return out;
  }
  function clickTick() {
    if (!ctx || !state.clickOn || !active) return;
    const now = ctx.currentTime;
    clickNodes = clickNodes.filter((n) => n.t > now - 0.1);
    const w0 = Math.max(now, clickHorizon), w1 = now + CLICK_LOOK;
    if (w1 <= w0) return;
    let beats;
    if (pending) beats = deckBeats(active, w0, Math.min(w1, pending.at)).concat(deckBeats(pending.deck, Math.max(w0, pending.at), w1));
    else beats = deckBeats(active, w0, w1);
    const until = stopAt !== null ? stopAt - state.fadeMs / 2000 - 0.002 : Infinity;   // loop off: no click on the seam after the end
    beats.forEach((b) => { if (b.t >= w0 && b.t < w1 && b.t < until) playClick(b.t, b.accent); });
    clickHorizon = w1;
  }
  setInterval(clickTick, TICK_MS);
  function setClick(on) {
    state.clickOn = !!on;
    if (!state.clickOn) clickReset();
    else if (ctx) clickHorizon = ctx.currentTime;
    saveState();
    renderTransport();
  }

  function commitSwitch(nd, code, seam) {
    const x = state.fadeMs / 1000;
    fadeOutDeck(active, seam - x / 2, seam + x / 2);
    const g = nd.gain.gain;
    g.cancelScheduledValues(seam - x / 2);
    g.setValueAtTime(0, seam - x / 2);
    g.linearRampToValueAtTime(chipGain(code), seam + x / 2);
    const geo = loopGeom(code);
    // start half a fade early so the new chip reaches its loop start exactly on the seam
    startDeck(nd, code, seam - x / 2, geo.ls - (x / 2) * state.rate);
    pending = { deck: nd, code, at: seam };
  }

  /* Apply tempo / pitch / loop-point changes to the chip that's playing, right away. */
  function applyLive() {
    if (!ctx || !active || !active.anchor) return;
    if (pending) { deferred = true; return; }
    if (stopAt !== null) {                       // loop-off stop was locked in: re-plan it
      stopAt = null;
      holdGain(active.gain.gain, ctx.currentTime);
      active.gain.gain.setValueAtTime(chipGain(active.playCode), ctx.currentTime + 0.01);
    }
    const T = ctx.currentTime + LAT;
    const geo = loopGeom(active.playCode);
    let x = inputAt(active, T);
    if (x >= geo.le || x < geo.ls - 0.5) x = geo.ls;
    active.prevAnchor = { anchor: active.anchor, loop: active.loop, until: T };
    active.loop = { ls: geo.ls, le: geo.le };
    active.anchor = { t: T, inp: x, rate: state.rate };
    sched(active, T, { input: x, rate: state.rate, semitones: semitonesFor(active.playCode), loopStart: geo.ls, loopEnd: geo.le });
    clickReset();
  }

  /* Jump within the playing loop by `delta` seconds of playback (wraps around). */
  function seek(delta) {
    if (!ctx || !active || !active.anchor || pending) return;
    chain.seamAt = null;   // a jump isn't a pass
    const T = ctx.currentTime + LAT;
    const geo = loopGeom(active.playCode);
    const L = geo.le - geo.ls;
    let pos = inputAt(active, T) - geo.ls + delta * state.rate;
    pos = ((pos % L) + L) % L;
    if (L - pos < 0.1) pos = 0;
    if (stopAt !== null) { stopAt = null; holdGain(active.gain.gain, ctx.currentTime); active.gain.gain.setValueAtTime(chipGain(active.playCode), ctx.currentTime + 0.01); }
    active.prevAnchor = { anchor: active.anchor, loop: active.loop, until: T };
    active.anchor = { t: T, inp: geo.ls + pos, rate: state.rate };
    sched(active, T, { input: geo.ls + pos });
    clickReset();
  }

  function playingCode() { return active ? (pending && ctx.currentTime >= pending.at ? pending.code : active.playCode) : null; }
  function isActive() { return !!active; }
  function isCounting() { return !!(ctx && active && active.anchor && ctx.currentTime < active.anchor.t - LAT); }
  function upcomingCode() { return pending ? pending.code : queued; }

  function trigger(code, immediate) {
    if (!chipsByCode[code]) return;
    focusCode = code;
    if (!isActive()) { startChip(code); return; }
    if (immediate) { stopAll(); startChip(code); return; }
    const pc = active.playCode;
    if (code === queued) { queued = null; chain.hold = chain.done; }   // tap a queued chip again to cancel (the chain waits a pass)
    else if (code === pc && !pending) queued = null;    // tap the playing chip: keep it, drop the queue
    else {
      queued = code;
      if (!pending) {
        const nd = otherDeck(active);
        if (nd.code !== code) {
          setStatus('Loading ' + lab(code) + '…');
          loadIntoDeck(nd, code).then(() => { setStatus(''); render(); }).catch(showError);
        }
      }
    }
    render();
  }

  /* ---------- UI ---------- */
  function setStatus(t) { $('statusText').textContent = t; }
  function showError(e) {
    const b = $('banner');
    b.hidden = false;
    b.textContent = e && e.message ? e.message : String(e);
    setStatus('');
  }
  function fmt(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  function fmtShort(t) {
    t = Math.max(0, Math.round(t));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  const signed = (v, unit) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v) + (unit || '');
  function sectionType(code) { const m = /^([A-Z]+)/.exec(code); return m ? m[1] : ''; }
  function sectionNum(code) { const m = /(\d+)/.exec(code); return m ? parseInt(m[1], 10) : 1; }
  function mixWhite(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (v) => Math.round(v + (255 - v) * f);
    return { r: m(r), g: m(g), b: m(b) };
  }
  function sectionColors(code) {
    const base = SECTION_BASE[sectionType(code)] || '#546e7a';
    const n = Math.max(1, sectionNum(code));
    const cn = n >= 4 ? 3 : n;
    const c = mixWhite(base, 1 - Math.pow(0.5, cn - 1));
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return { bg: 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')', fg: lum > 0.62 ? '#1a1020' : '#ffffff' };
  }
  function vstack(gap) { const d = el('div'); d.style.display = 'flex'; d.style.flexDirection = 'column'; d.style.gap = (gap || 8) + 'px'; return d; }

  /* ---------- board slots ----------
     Each looper chip sits in one of the 16 board slots (state.slots: id -> 0..15), gaps allowed.
     state.looper stays the chips in board order (left to right, top to bottom), which is the
     chain order; keys 1–9 play slots 1–9. */
  let wantSlot = null;   // empty slot that opened the chip picker: the next added chip goes there
  function layoutSlots() {
    const slots = {}, used = new Set();
    state.looper.forEach((id) => {
      const s = (state.slots || {})[id];
      if (Number.isInteger(s) && s >= 0 && s < 16 && !used.has(s)) { slots[id] = s; used.add(s); }
    });
    state.looper.forEach((id) => {
      if (id in slots) return;
      let s = wantSlot != null && !used.has(wantSlot) ? wantSlot : -1;
      if (s === wantSlot) wantSlot = null;
      for (let i = 0; s < 0 && i < 16; i++) if (!used.has(i)) s = i;
      slots[id] = s;
      used.add(s);
    });
    state.slots = slots;
    state.looper.sort((a, b) => slots[a] - slots[b]);
  }
  function chipInSlot(i) { return state.looper.find((id) => state.slots[id] === i) || null; }

  // Small line icons for the chip buttons (currentColor, so they follow the button's colour).
  const ICON_LINK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3"/>' +
    '<path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3"/></svg>';
  const ICON_METRONOME = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M9 3h6l4 18H5z"/><path d="M7.2 16h9.6"/><path d="M12 16 17 6"/></svg>';

  /* ---------- drag to move ---------- */
  let gridDrag = null;   // chip id being dragged; the grid isn't rebuilt mid-drag
  // Drop on an empty slot: the chip moves there. Drop on another chip: the two swap places.
  function dropTarget(node, slot) {
    node.addEventListener('dragover', (ev) => {
      if (!gridDrag || state.slots[gridDrag] === slot) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      node.classList.add('dropover');
    });
    node.addEventListener('dragleave', () => node.classList.remove('dropover'));
    node.addEventListener('drop', (ev) => {
      ev.preventDefault();
      node.classList.remove('dropover');
      const id = gridDrag;
      if (!id || !state.looper.includes(id)) return;
      const other = chipInSlot(slot);
      if (other && other !== id) state.slots[other] = state.slots[id];
      state.slots[id] = slot;
      gridDrag = null;
      layoutSlots();
      saveState();
      render();
    });
  }

  function renderGrid() {
    if (gridDrag) return;   // keep the dragged element alive until the drop
    const grid = $('grid');
    grid.textContent = '';
    layoutSlots();
    const cells = [];
    const pc = playingCode();
    const up = upcomingCode();
    state.looper.forEach((code) => {
      const c = chipsByCode[code];
      if (!c) return;
      const b = el('button', 'chip ' + (c.tier >= 2 ? 'wash' : 'full'));   // T2 and T3 get the wash art, T1 the full cover
      const bandArt = bandChipArt(c.album, c.tier);   // the chip's own album cover (Paranoid keeps the full / wash art)
      if (bandArt) { b.style.backgroundImage = bandArt; b.style.backgroundPosition = coverPosition(c.album); }
      b.type = 'button';
      b.dataset.code = code;
      if (c.tier === 1) b.classList.add('t1');
      if (code === pc) b.classList.add('playing');
      else if (code === up) b.classList.add('queued');
      b.setAttribute('aria-label', c.code + ' ' + c.song + (code === pc ? ', playing' : code === up ? ', queued' : ''));

      const top = el('div', 'row');
      const left = el('div');
      left.append(el('div', 'code', c.code));
      const p = chipPitch(code);
      if (p.key || p.hz) left.append(el('div', 'pitchtag', [p.key ? signed(p.key, ' st') : '', p.hz ? signed(p.hz, ' Hz') : ''].filter(Boolean).join(' · ')));
      top.append(left);
      const slot = state.slots[code];
      if (slot < 9) top.append(el('span', 'key', String(slot + 1)));   // key = slot number
      b.append(top);

      const bottom = el('div');
      let badge = '';
      if (code === pc) badge = isCounting() ? 'COUNT-IN' : 'PLAYING';
      else if (code === up) badge = isReady(code) && (!queued || deckWith(code)) ? 'QUEUED' : 'LOADING';
      if (badge) bottom.append(el('span', 'badge', badge));
      if (c.chord) bottom.append(el('div', 'chord', c.chord));
      bottom.append(el('div', 'song', c.song));
      if (code === pc) { const bar = el('div', 'bar'); bar.append(el('i')); bottom.append(bar); }
      b.append(bottom);

      b.addEventListener('click', (ev) => trigger(code, ev.shiftKey));

      const rm = el('button', 'remove', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + c.code + ' ' + c.song + ' from looper');
      rm.addEventListener('click', () => removeFromLooper(code));

      // Chained chips get their code underlined.
      const linked = state.chainSet.includes(code);
      const inChain = chainList().includes(code);
      if (linked && inChain) b.classList.add('chained');

      // Buttons under the slot number: repeat counter (chain chips) left of the chain link,
      // then the metronome (count-in) below.
      const ctr = el('div', 'ctrls');
      const chainRow = el('div', 'ctrl-row');   // counter to the left of the chain link
      if (inChain) {
        const passes = chainPassesOf(code);
        // While the chain runs, the playing chip shows which pass it's on, e.g. "2/8".
        const counting = code === pc && chain.code === code;
        const cnt = el('div', 'counter');
        const lbl = el('span', 'cn-label', counting ? Math.min(chain.done + 1, passes) + '/' + passes : '×' + passes);
        lbl.title = (counting ? 'Pass ' + Math.min(chain.done + 1, passes) + ' of ' + passes + '. ' : '') + 'Repeats in the chain: ' + passes +
          (state.chainPer[code] != null ? ' (its own count; the Now panel’s Reset puts it back to the shared count)' : '');
        // −/+ set this chip's own repeats right here, without selecting (and so queuing) it.
        const mk = (txt, d) => {
          const b2 = el('button', 'cn-step', txt);
          b2.type = 'button';
          b2.disabled = d < 0 ? passes <= 1 : passes >= 16;
          b2.setAttribute('aria-label', (d < 0 ? 'Fewer' : 'More') + ' repeats of ' + c.code + ' ' + c.song + ' in the chain (now ' + passes + ')');
          b2.addEventListener('click', () => setChipPasses(code, passes + d));
          return b2;
        };
        cnt.append(mk('−', -1), lbl, mk('+', 1));
        chainRow.append(cnt);
      }
      {
        const lk = el('button', 'iconbtn link' + (linked ? ' on' : ''));
        lk.type = 'button';
        lk.innerHTML = ICON_LINK;
        lk.title = linked ? (inChain ? 'In the chain: click to take it out' : 'Linked: link a chip next to it to start a chain')
          : 'Link into a chain (two or more chips side by side)';
        lk.setAttribute('aria-pressed', String(linked));
        lk.setAttribute('aria-label', (linked ? 'Take ' : 'Add ') + c.code + ' ' + c.song + (linked ? ' out of' : ' to') + ' the chain');
        lk.addEventListener('click', () => toggleChainChip(code));
        chainRow.append(lk);
      }
      if (chainRow.childNodes.length) ctr.append(chainRow);
      if (c.quantized) {                         // count-in needs a locked tempo
        const ci = el('button', 'iconbtn countin');
        ci.type = 'button';
        ci.innerHTML = ICON_METRONOME;
        const cbpm = (c.quantized.bpm * state.rate).toFixed(1);
        ci.title = 'Count in: four clicks at ' + cbpm + ' BPM, then ' + c.code + ' starts';
        ci.setAttribute('aria-label', 'Count in and start ' + c.code + ' ' + c.song + ' at ' + cbpm + ' BPM');
        ci.addEventListener('click', () => countInChip(code));
        ctr.append(ci);
      }

      const cell = el('div', 'cell');
      cell.append(b, rm, ctr);
      // Drag a chip to any slot: an empty one moves it there, another chip swaps the two.
      cell.draggable = true;
      cell.dataset.code = code;
      cell.addEventListener('dragstart', (ev) => {
        gridDrag = code;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', code);
        requestAnimationFrame(() => cell.classList.add('dragging'));
      });
      cell.addEventListener('dragend', () => {
        gridDrag = null;
        renderGrid();
      });
      dropTarget(cell, state.slots[code]);
      cells[state.slots[code]] = cell;
    });
    // Every empty spot of the 4×4 board is a dotted "add" slot (and a drop target).
    for (let i = 0; i < 16; i++) {
      if (cells[i]) { grid.append(cells[i]); continue; }
      const add = el('button', 'add-tile', '+ Add chip');
      add.type = 'button';
      add.setAttribute('aria-label', 'Add a chip to slot ' + (i + 1));
      add.addEventListener('click', () => {
        // Chip picker: opens on the looper's song when it holds just one, else on the albums.
        openPicker(looperSong());   // that song's chips, or the albums
        wantSlot = i;               // the first chip picked lands in this slot
      });
      dropTarget(add, i);
      grid.append(add);
    }
    $('looperSub').textContent = state.looper.length + ' chips · guitar ' + (state.stemOn.guitar ? 'on' : 'removed');
  }

  function renderSeg() {
    const seg = $('panelSeg');
    seg.textContent = '';
    PANELS.filter((p) => state.panels.includes(p.id)).concat([{ id: 'off', label: 'Off' }]).forEach((p) => {
      const b = el('button', state.panel === p.id ? 'on' : null, p.label);
      b.type = 'button';
      b.addEventListener('click', () => setPanel(p.id));
      seg.append(b);
    });
    const cfg = el('button', 'cfg', '⋯');
    cfg.type = 'button';
    cfg.setAttribute('aria-label', 'Choose sidebar panels');
    cfg.setAttribute('aria-expanded', String(!$('panelMenu').hidden));
    cfg.addEventListener('click', (ev) => { ev.stopPropagation(); $('panelMenu').hidden = !$('panelMenu').hidden; renderPanelMenu(); renderSeg(); });
    seg.append(cfg);
  }
  function renderPanelMenu() {
    const m = $('panelMenu');
    if (m.hidden) return;
    m.textContent = '';
    m.append(el('div', 'label', 'SHOW IN SIDEBAR'));
    PANELS.forEach((p) => {
      const lab = el('label', 'menurow');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.id = 'panel-' + p.id;
      cb.checked = state.panels.includes(p.id);
      cb.addEventListener('change', () => {
        state.panels = PANELS.map((q) => q.id).filter((id) => (id === p.id ? cb.checked : state.panels.includes(id)));
        if (state.panel !== 'off' && !state.panels.includes(state.panel)) state.panel = state.panels[0] || 'off';
        saveState(); render();
      });
      lab.append(cb, el('span', null, p.label));
      m.append(lab);
    });
  }

  function stemControls(container, withSliders) {
    STEMS.forEach((s) => {
      const row = el('div', 'stem');
      const name = el('span', null, STEM_LABEL[s]);
      const sw = el('button', 'switch');
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.setAttribute('aria-checked', String(!!state.stemOn[s]));
      sw.setAttribute('aria-label', STEM_LABEL[s]);
      sw.addEventListener('click', () => toggleStem(s));
      row.append(name);
      if (withSliders) {
        const r = el('input');
        r.type = 'range'; r.min = '0'; r.max = '1.5'; r.step = '0.05';
        r.value = String(state.stemVol[s]);
        r.id = 'vol-' + s;
        r.setAttribute('aria-label', STEM_LABEL[s] + ' volume');
        r.addEventListener('input', () => { state.stemVol[s] = parseFloat(r.value); applyStem(s); saveState(); });
        row.append(r);
      }
      row.append(sw);
      container.append(row);
    });
  }

  function pointRow(label, code, which) {
    const c = chipsByCode[code];
    const n = nudgeOf(code);
    const row = el('div', 'pointrow');
    row.append(el('span', 'name', label));
    const base = which === 's' ? c.start : c.start + c.length;
    row.append(el('span', 'val', fmt(base + n[which] / 1000) + (n[which] ? ' ' + (n[which] > 0 ? '+' : '') + n[which] : '')));
    [-50, -10, 10, 50].forEach((d) => {
      const bt = el('button', null, (d > 0 ? '+' : '−') + Math.abs(d));
      bt.type = 'button';
      bt.setAttribute('aria-label', label + ' ' + (d > 0 ? 'later' : 'earlier') + ' by ' + Math.abs(d) + ' milliseconds');
      bt.addEventListener('click', () => nudge(code, which, d));
      row.append(bt);
    });
    return row;
  }
  /* Move start and end together: same loop length, shifted earlier or later. */
  function moveRow(code) {
    const n = nudgeOf(code);
    const row = el('div', 'pointrow');
    row.append(el('span', 'name', 'Move'));
    const shift = n.s === n.e ? n.s : null;
    row.append(el('span', 'val', shift ? (shift > 0 ? '+' : '') + shift + ' ms' : 'both points'));
    [-50, -10, 10, 50].forEach((d) => {
      const bt = el('button', null, (d > 0 ? '+' : '−') + Math.abs(d));
      bt.type = 'button';
      bt.setAttribute('aria-label', 'Move the whole loop ' + (d > 0 ? 'later' : 'earlier') + ' by ' + Math.abs(d) + ' milliseconds');
      bt.addEventListener('click', () => nudgeBoth(code, d));
      row.append(bt);
    });
    return row;
  }

  /* A labelled −/value/+ control. */
  function stepper(label, value, onMinus, onPlus, ariaWhat, onReset) {
    const row = el('div', 'stepper');
    row.append(el('span', 'name', label));
    const minus = el('button', 'stepbtn', '−');
    minus.type = 'button';
    minus.setAttribute('aria-label', 'Lower ' + ariaWhat);
    minus.addEventListener('click', onMinus);
    const val = el('span', 'stepval', value);
    const plus = el('button', 'stepbtn', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Raise ' + ariaWhat);
    plus.addEventListener('click', onPlus);
    row.append(minus, val, plus);
    if (onReset) {
      const r = el('button', 'smallbtn', 'Reset');
      r.type = 'button';
      r.setAttribute('aria-label', 'Reset ' + ariaWhat);
      r.addEventListener('click', onReset);
      row.append(r);
    }
    return row;
  }

  function renderTune(sb) {
    const code = playingCode() || focusCode || state.looper[0];
    const bpm = code ? chipBpm(code) : null;

    const tempo = vstack(8);
    tempo.append(el('div', 'label', 'TEMPO · ALL CHIPS'));
    const tval = bpm ? (bpm * state.rate).toFixed(1) + ' BPM' : Math.round(state.rate * 100) + '%';
    tempo.append(stepper('Tempo', tval, () => setTempoStep(-1), () => setTempoStep(1), 'tempo by 1 BPM', () => setRate(1)));
    tempo.append(el('div', 'note', Math.round(state.rate * 1000) / 10 + '% of the original' + (bpm ? ' · ' + lab(code) + ' is ' + bpm + ' BPM at 100%' : '') + '. Changes happen live.'));
    sb.append(tempo);

    const key = vstack(8);
    key.append(el('div', 'label', 'KEY · ALL CHIPS'));
    key.append(stepper('Key', signed(state.keyGlobal, ' st'), () => setKeyGlobal(state.keyGlobal - 1), () => setKeyGlobal(state.keyGlobal + 1), 'key of all chips by a semitone', () => setKeyGlobal(0)));
    key.append(stepper('Tuning', 'A = ' + (A4 + state.hzGlobal) + ' Hz', () => setHzGlobal(state.hzGlobal - 1), () => setHzGlobal(state.hzGlobal + 1), 'tuning of all chips by 1 Hz', () => setHzGlobal(0)));
    sb.append(key);

    if (code) {
      const p = chipPitch(code);
      const one = vstack(8);
      const nm = lab(code) + ' (' + chipsByCode[code].song + ')';
      one.append(el('div', 'label', 'THIS CHIP · ' + lab(code) + ' · ' + chipsByCode[code].song.toUpperCase()));
      one.append(stepper('Key', signed(p.key, ' st'), () => setChipPitch(code, 'key', -1), () => setChipPitch(code, 'key', 1), 'key of ' + nm + ' by a semitone', () => resetChipPitch(code, 'key')));
      one.append(stepper('Tuning', signed(p.hz, ' Hz'), () => setChipPitch(code, 'hz', -1), () => setChipPitch(code, 'hz', 1), 'tuning of ' + nm + ' by 1 Hz', () => resetChipPitch(code, 'hz')));
      const total = semitonesFor(code);
      one.append(el('div', 'note', 'Total shift for ' + lab(code) + ': ' + (total >= 0 ? '+' : '−') + Math.abs(total).toFixed(2) + ' semitones. Click a chip to choose which one this edits.'));
      sb.append(one);
    }
  }

  /* ---------- waveform (Now panel) ----------
     Overview: the whole chip file (the loop plus its padding) with the loop shaded, Start/End
     handles, beat ticks on tempo-locked chips and the playhead. Drag a handle to move that
     point, drag inside the loop to move both. Seam zoom below: ZOOM_W seconds around End and
     around Start, side by side, for fine placement. Changes are the same per-chip nudges the
     ±ms buttons make: shown live while dragging, applied and saved on release. */
  const WAVE_HOP = 256;            // samples per peak column (~5.8 ms)
  const ZOOM_W = 0.8;              // seconds shown around each point in the seam zoom
  const HANDLE_PX = 8;             // grab distance for a handle
  const SNAP_PX = 6;               // a dragged point this close to a bar line snaps onto it
  const MIN_LOOP_MS = 500;
  const peaksCache = new Map();    // "code|stems" -> { mn, mx, sr, peak }
  const wave = { code: null, root: null, ov: null, zm: null, read: null, drag: null, loading: null };

  function waveStems() { const on = STEMS.filter((s) => state.stemOn[s]); return on.length ? on : STEMS; }
  function peaksFor(code) {
    const stems = waveStems();
    const key = code + '|' + stems.join(',');
    if (peaksCache.has(key)) return peaksCache.get(key);
    const e = cache.get(code);
    if (!e || !STEMS.every((s) => e.buffers[s])) return null;
    const chans = [];
    stems.forEach((s) => { const b = e.buffers[s]; for (let ch = 0; ch < Math.min(2, b.numberOfChannels); ch++) chans.push({ d: b.getChannelData(ch), w: b.numberOfChannels > 1 ? 0.5 : 1 }); });
    const n = e.buffers[stems[0]].length;
    const cols = Math.ceil(n / WAVE_HOP);
    const mn = new Float32Array(cols), mx = new Float32Array(cols);
    let peak = 1e-6;
    for (let k = 0; k < cols; k++) {
      let lo = 0, hi = 0;
      const end = Math.min(n, (k + 1) * WAVE_HOP);
      for (let i = k * WAVE_HOP; i < end; i++) {
        let v = 0;
        for (let j = 0; j < chans.length; j++) v += chans[j].d[i] * chans[j].w;
        if (v < lo) lo = v; else if (v > hi) hi = v;
      }
      mn[k] = lo; mx[k] = hi;
      if (-lo > peak) peak = -lo;
      if (hi > peak) peak = hi;
    }
    const p = { mn, mx, sr: e.buffers[stems[0]].sampleRate, peak };
    peaksCache.set(key, p);
    if (peaksCache.size > 6) peaksCache.delete(peaksCache.keys().next().value);
    return p;
  }

  function clampNudge(c, n, which) {
    const minS = -Math.floor(c.offset * 1000);
    const maxE = Math.floor((c.fileLength - c.offset - c.length) * 1000) - 25;
    const len0 = c.length * 1000;
    if (which === 'both') {
      let d = 0;
      if (n.s < minS) d = minS - n.s;
      if (n.e > maxE) d = maxE - n.e;
      n.s += d; n.e += d;
      return n;
    }
    n.s = Math.max(minS, n.s);
    n.e = Math.min(maxE, n.e);
    if (which === 's') n.s = Math.min(n.s, len0 + n.e - MIN_LOOP_MS);
    else n.e = Math.max(n.e, n.s - len0 + MIN_LOOP_MS);
    return n;
  }

  function waveEl(code) {
    if (!wave.root) {
      const root = el('div', 'wave');
      const head = el('div', 'wave-head');
      head.append(el('div', 'label', 'WAVEFORM'));
      wave.read = el('span', 'note wave-read', '');
      head.append(wave.read);
      const ov = el('canvas', 'wave-ov');
      ov.setAttribute('role', 'img');
      ov.setAttribute('aria-label', 'Waveform of the chip. Drag the Start or End line to move it; drag inside the loop to move both.');
      const zl = el('div', 'wave-zlabel');
      zl.append(el('span', null, 'END'), el('span', null, 'SEAM'), el('span', null, 'START'));
      const zm = el('canvas', 'wave-zm');
      zm.setAttribute('role', 'img');
      zm.setAttribute('aria-label', 'Seam zoom: the end of the loop on the left, its start on the right. Drag either line for fine placement.');
      root.append(head, ov, zl, zm, el('div', 'note', 'Drag Start or End, or drag inside the loop to move both. On tempo-locked chips a point snaps onto a bar line when you get close (hold Alt to place it freely). Fine-tune in the seam zoom, which shows the audio just before the loop wraps (left) and just after it restarts (right). Changes apply on the next pass.'));
      wireWave(ov, 'ov');
      wireWave(zm, 'zm');
      wave.root = root; wave.ov = ov; wave.zm = zm;
    }
    if (wave.code !== code) { wave.code = code; wave.drag = null; }
    return wave.root;
  }
  // Peaks for the waveform, decoding the chip if it isn't in memory (it may have been evicted).
  function wavePeaks(code) {
    const p = peaksFor(code);
    if (!p && wave.loading !== code && ctx) {
      wave.loading = code;
      loadChip(code).then(() => { if (wave.loading === code) wave.loading = null; })
        .catch(() => { if (wave.loading === code) wave.loading = null; });
    }
    return p;
  }

  /* Geometry of each drawable view: [{x, w, t0, t1, point}] in CSS px. */
  function waveViews(cv, kind, g, c) {
    const W = cv.clientWidth;
    if (kind === 'ov') return [{ x: 0, w: W, t0: 0, t1: c.fileLength }];
    const half = (W - 6) / 2;
    const d = wave.drag && wave.drag.kind === 'zm' ? wave.drag : null;
    const ce = d && d.zc ? d.zc.e : g.le, cs = d && d.zc ? d.zc.s : g.ls;   // window stays put while dragging
    return [
      { x: 0, w: half, t0: ce - ZOOM_W / 2, t1: ce + ZOOM_W / 2, point: 'e' },
      { x: half + 6, w: half, t0: cs - ZOOM_W / 2, t1: cs + ZOOM_W / 2, point: 's' }
    ];
  }

  function drawWave() {
    if (!wave.root || !wave.root.isConnected || !wave.code) return;
    const code = wave.code;
    const c = chipsByCode[code];
    if (!c) return;
    const g = loopGeom(code);
    const n = nudgeOf(code);
    wave.read.textContent = 'Start ' + fmt(c.start + n.s / 1000) + (n.s ? ' (' + (n.s > 0 ? '+' : '') + n.s + ')' : '') +
      ' · End ' + fmt(c.start + c.length + n.e / 1000) + (n.e ? ' (' + (n.e > 0 ? '+' : '') + n.e + ')' : '') +
      ' · ' + g.L.toFixed(2) + ' s' +
      (wave.drag && wave.drag.snap ? ' · ' + (wave.drag.snap.w === 's' ? 'Start' : 'End') +
        (c.pickup ? ' on the pickup to bar ' : ' on bar ') + wave.drag.snap.bar : '');
    const p = wavePeaks(code);
    let play = null;
    if (ctx && active) {
      const now = ctx.currentTime;
      const d = pending && now >= pending.at ? pending.deck : active;
      if (d.playCode === code && d.anchor) play = now < d.anchor.t ? d.anchor.inp : inputAt(d, now);
    }
    const bpm = c.quantized ? c.quantized.bpm : null;
    [[wave.ov, 'ov', 64], [wave.zm, 'zm', 64]].forEach(([cv, kind, H]) => {
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth;
      if (!W) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      const x2 = cv.getContext('2d');
      x2.setTransform(dpr, 0, 0, dpr, 0, 0);
      x2.clearRect(0, 0, W, H);
      waveViews(cv, kind, g, c).forEach((v) => {
        const tx = (t) => v.x + (t - v.t0) / (v.t1 - v.t0) * v.w;
        x2.save();
        x2.beginPath(); x2.rect(v.x, 0, v.w, H); x2.clip();
        x2.fillStyle = '#0d0d0d'; x2.fillRect(v.x, 0, v.w, H);
        // loop region
        const a = Math.max(v.x, tx(g.ls)), b = Math.min(v.x + v.w, tx(g.le));
        if (b > a) { x2.fillStyle = 'rgba(112,48,160,.28)'; x2.fillRect(a, 0, b - a, H); }
        // beat ticks (tempo-locked chips): every beat, stronger every bar, counted from the rendered loop start
        if (bpm) {
          const T = 60 / bpm;
          const k0 = Math.ceil((v.t0 - gridOf(c)) / T), k1 = Math.floor((v.t1 - gridOf(c)) / T);
          for (let k = k0; k <= k1 && k1 - k0 < 2000; k++) {
            const x = tx(gridOf(c) + k * T);
            x2.fillStyle = k % 4 === 0 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.10)';
            x2.fillRect(Math.round(x), 0, 1, H);
          }
        }
        // waveform
        if (p) {
          const mid = H / 2, amp = (H / 2 - 3) / p.peak, cps = p.sr / WAVE_HOP;
          for (let px = 0; px < v.w; px++) {
            const ta = v.t0 + px / v.w * (v.t1 - v.t0), tb = v.t0 + (px + 1) / v.w * (v.t1 - v.t0);
            let ca = Math.floor(ta * cps), cb = Math.max(ca + 1, Math.ceil(tb * cps));
            if (cb <= 0 || ca >= p.mn.length) continue;
            ca = Math.max(0, ca); cb = Math.min(p.mn.length, cb);
            let lo = 0, hi = 0;
            for (let k = ca; k < cb; k++) { if (p.mn[k] < lo) lo = p.mn[k]; if (p.mx[k] > hi) hi = p.mx[k]; }
            const inLoop = ta >= g.ls && ta < g.le;
            x2.fillStyle = inLoop ? '#e8e0f0' : '#5a5a5a';
            const y0 = mid - hi * amp, y1 = mid - lo * amp;
            x2.fillRect(v.x + px, y0, 1, Math.max(1, y1 - y0));
          }
        } else {
          x2.fillStyle = '#777'; x2.font = '12px Inter, system-ui, sans-serif';
          x2.fillText('Loading waveform…', v.x + 8, H / 2 + 4);
        }
        // handles
        [['s', g.ls], ['e', g.le]].forEach(([w, t]) => {
          const x = tx(t);
          if (x < v.x - 2 || x > v.x + v.w + 2) return;
          const hot = wave.drag && (wave.drag.which === w || wave.drag.which === 'both');
          const snapped = wave.drag && wave.drag.snap && wave.drag.snap.w === w;
          x2.fillStyle = snapped ? '#c08ae8' : hot ? '#ffd400' : '#fff';   // purple while locked to a bar line
          x2.fillRect(Math.round(x) - 1, 0, 2, H);
          x2.fillRect(Math.round(x) - (w === 's' ? 0 : 9), 0, 10, 12);
          x2.fillStyle = '#121212'; x2.font = 'bold 9px Inter, system-ui, sans-serif';
          x2.fillText(w === 's' ? 'S' : 'E', Math.round(x) - (w === 's' ? -2 : 7), 9);
        });
        // playhead
        if (play != null) {
          const x = tx(play);
          if (x >= v.x && x <= v.x + v.w) { x2.fillStyle = '#ffd400'; x2.fillRect(Math.round(x), 0, 1, H); }
        }
        x2.restore();
      });
      if (kind === 'zm') { x2.fillStyle = '#2a2a2a'; x2.fillRect((W - 6) / 2 + 2, 0, 2, H); }
    });
  }

  function wireWave(cv, kind) {
    const pos = (ev) => { const r = cv.getBoundingClientRect(); return ev.clientX - r.left; };
    const ctxOf = () => { const code = wave.code, c = chipsByCode[code]; return c ? { code, c, g: loopGeom(code) } : null; };
    const hit = (x) => {
      const k = ctxOf(); if (!k) return null;
      const views = waveViews(cv, kind, k.g, k.c);
      for (const v of views) {
        if (x < v.x || x > v.x + v.w) continue;
        const tx = (t) => v.x + (t - v.t0) / (v.t1 - v.t0) * v.w;
        const ds = Math.abs(x - tx(k.g.ls)), de = Math.abs(x - tx(k.g.le));
        if (kind === 'zm') return { v, which: v.point };
        if (Math.min(ds, de) <= HANDLE_PX) return { v, which: ds <= de ? 's' : 'e' };
        if (x > tx(k.g.ls) && x < tx(k.g.le)) return { v, which: 'both' };
        return null;
      }
      return null;
    };
    cv.addEventListener('pointermove', (ev) => {
      if (wave.drag && wave.drag.cv === cv) {
        const k = ctxOf(); if (!k) return;
        const d = wave.drag, v = d.v;
        const t = v.t0 + (pos(ev) - v.x) / v.w * (v.t1 - v.t0);
        const c = k.c;
        const base = { s: c.offset, e: c.offset + c.length };
        // Where the dragged point(s) would land, in file seconds.
        const P = { s: base.s + d.n0.s / 1000, e: base.e + d.n0.e / 1000 };
        if (d.which === 'both') { P.s += t - d.t0; P.e += t - d.t0; }
        else P[d.which] = d.grabOff + t;
        // Magnetic bar lines: a point that comes within SNAP_PX (and under 8% of a bar) of a
        // bar line snaps onto it. Hold Alt to place freely.
        d.snap = null;
        if (c.quantized && !ev.altKey) {
          const bar = 4 * 60 / c.quantized.bpm;
          const thr = Math.min(SNAP_PX * (v.t1 - v.t0) / v.w, 0.08 * bar);
          let best = null;
          const g0 = gridOf(c) - pickupSec(c);   // pickup chips snap to the pickup before each bar line
          (d.which === 'both' ? ['s', 'e'] : [d.which]).forEach((w) => {
            const kb = Math.round((P[w] - g0) / bar);
            const off = g0 + kb * bar - P[w];
            if (Math.abs(off) <= thr && (!best || Math.abs(off) < Math.abs(best.off))) best = { w, off, bar: kb + 1 };
          });
          if (best) {
            if (d.which === 'both') { P.s += best.off; P.e += best.off; } else P[best.w] += best.off;
            d.snap = best;
          }
        }
        const n = { s: Math.round((P.s - base.s) * 1000), e: Math.round((P.e - base.e) * 1000) };
        state.nudges[nudgeKey(k.code)] = clampNudge(c, n, d.which);
        drawWave();
        return;
      }
      const h = hit(pos(ev));
      cv.style.cursor = !h ? 'default' : h.which === 'both' ? 'grab' : 'ew-resize';
    });
    cv.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      const k = ctxOf(); if (!k) return;
      const h = hit(pos(ev)); if (!h) return;
      ev.preventDefault();
      const v = h.v;
      const t = v.t0 + (pos(ev) - v.x) / v.w * (v.t1 - v.t0);
      const pt = h.which === 's' ? k.g.ls : k.g.le;
      wave.drag = {
        cv, kind, which: h.which, v, t0: t, n0: Object.assign({ s: 0, e: 0 }, nudgeOf(k.code)),
        grabOff: h.which === 'both' ? 0 : pt - t,     // keep the line where it was grabbed, no jump
        zc: kind === 'zm' ? { s: k.g.ls, e: k.g.le } : null
      };
      cv.setPointerCapture(ev.pointerId);
      cv.style.cursor = h.which === 'both' ? 'grabbing' : 'ew-resize';
      drawWave();
    });
    const end = () => {
      if (!wave.drag || wave.drag.cv !== cv) return;
      const code = wave.code;
      wave.drag = null;
      const n = state.nudges[nudgeKey(code)];
      if (n && !n.s && !n.e) delete state.nudges[nudgeKey(code)];
      saveState();
      loopPointsChanged(code);
      render();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }

  function renderSidebar() {
    if (wave.drag) return;   // don't rebuild under a waveform drag; it renders on release
    const aside = $('sidebar');
    const off = state.panel === 'off';
    aside.hidden = off;
    $('divider').hidden = off;
    if (off) { showEmbed(null); return; }
    aside.style.setProperty('--sbw', sidebarWidth() + 'px');
    const embedPanel = PANELS.find((p) => p.id === state.panel && p.embed);
    showEmbed(embedPanel ? embedPanel.id : null);
    const sb = $('sbContent');
    sb.hidden = !!embedPanel;
    if (embedPanel) return;
    sb.textContent = '';
    if (state.panel === 'now') {
      const code = playingCode() || focusCode || state.looper[0];
      const c = chipsByCode[code];
      const head = el('div');
      head.append(el('div', 'label', isActive() ? 'NOW LOOPING' : 'SELECTED'));
      if (c) {
        head.append(el('div', 'big', c.code + ' · ' + c.song));
        head.append(el('div', 'note', (SECTION_NAME[sectionType(c.code)] || 'Section') + ' ' + sectionNum(c.code) + ' · Tier ' + c.tier + (c.chord ? ' · ' + c.chord : '')));
        if (c.quantized) {
          const q = c.quantized;
          head.append(el('div', 'note', 'Tempo locked at ' + q.bpm + ' BPM · ' + q.bars + ' bars (played ' + q.driftBpm[0] + '→' + q.driftBpm[1] + ' BPM)'));
        }
      } else head.append(el('div', 'note', 'Add a chip to the looper to start.'));
      sb.append(head);
      if (c) sb.append(waveEl(code));
      if (c) {
        const pts = vstack(8);
        pts.append(el('div', 'label', 'LOOP POINTS'));
        pts.append(pointRow('Start', code, 's'));
        pts.append(pointRow('End', code, 'e'));
        pts.append(moveRow(code));
        const g = loopGeom(code);
        const foot = el('div', 'stem');
        foot.append(el('span', 'note', 'Loop length ' + g.L.toFixed(2) + ' s'));
        const reset = el('button', 'smallbtn', 'Reset');
        reset.type = 'button';
        reset.addEventListener('click', () => { delete state.nudges[nudgeKey(code)]; saveState(); loopPointsChanged(code); render(); });
        foot.append(reset);
        const nn = nudgeOf(code);
        const lock = el('button', 'smallbtn lockbtn', 'Lock in');
        lock.type = 'button';
        lock.disabled = !(nn.s || nn.e);
        lock.title = lock.disabled ? 'No adjustments to lock in' : 'Save these loop points into the chip file so they survive clearing the browser';
        lock.addEventListener('click', () => lockIn(code));
        foot.append(lock);
        pts.append(foot);
        const li = c.lockIns && c.lockIns[c.lockIns.length - 1];
        if (li || c.note) {
          pts.append(el('div', 'note', li
            ? 'Locked in ' + li.date + ': start ' + signed(li.s, ' ms') + ', end ' + signed(li.e, ' ms') + (c.lockIns.length > 1 ? ' (' + c.lockIns.length + ' lock-ins)' : '') + '.'
            : c.note));
        }
        if (nn.s || nn.e) pts.append(el('div', 'note', 'These adjustments are saved in this browser only until you lock them in.'));
        const fade = el('div', 'stem');
        fade.append(el('span', null, 'Chip-switch crossfade'));
        const sel = el('select');
        sel.id = 'fadeSel';
        sel.setAttribute('aria-label', 'Crossfade when switching chips');
        [5, 10, 20, 40].forEach((ms) => { const o = el('option', null, ms + ' ms'); o.value = String(ms); if (ms === state.fadeMs) o.selected = true; sel.append(o); });
        sel.addEventListener('change', () => { state.fadeMs = parseInt(sel.value, 10); saveState(); });
        fade.append(sel);
        pts.append(fade);
        sb.append(pts);

        const ch = vstack(8);
        ch.append(el('div', 'label', 'CHAIN'));
        ch.append(stepper('Passes', '×' + state.chainPasses, () => setChainPasses(state.chainPasses - 1), () => setChainPasses(state.chainPasses + 1), 'passes per chip before the chain moves on', () => setChainPasses(1)));
        const own = state.chainPer[code];
        ch.append(stepper(c.code, own ? '×' + own : 'same', () => setChipPasses(code, (own || state.chainPasses) - 1), () => setChipPasses(code, (own || state.chainPasses) + 1), 'passes for ' + c.code + ' ' + c.song, () => setChipPasses(code, null)));
        const row = el('div', 'stem');
        row.append(el('span', null, 'In the chain'));
        const sw = el('button', 'switch');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-checked', String(state.chainSet.includes(code)));
        sw.setAttribute('aria-label', 'Mark ' + c.code + ' ' + c.song + ' for the chain');
        sw.addEventListener('click', () => toggleChainChip(code));
        row.append(sw);
        ch.append(row);
        const list = chainList();
        const nx = list.length > 1 ? nextInChain(code) : null;
        ch.append(el('div', 'note',
          (list.length ? list.length + ' chips are in the chain.' : 'No chain yet.') +
          (nx && list.includes(code) ? ' After ' + c.code + ' plays ×' + chainPassesOf(code) + ', ' + lab(nx) + ' (' + chipsByCode[nx].song + ') comes next.' : '') +
          ' Turn on the link button of two or more chips side by side to chain them; the looper then moves through them on the seams. Tapping a chip still queues it.'));
        sb.append(ch);
      }
      const stems = vstack(10);
      stems.append(el('div', 'label', 'MIX'));
      stemControls(stems, false);
      sb.append(stems);
      sb.append(el('div', 'note', 'Click a chip to queue it for the next loop boundary. Shift-click switches right away. Keys: 1–9 slots 1–9 · Space play/stop · Esc stop · Shift+←/→ jump 5 s · Shift+C clear looper · G guitar · L loop · K click.'));
    } else if (state.panel === 'needs') {
      renderNeeds(sb);
    } else if (state.panel === 'stems') {
      sb.append(el('div', 'label', 'MIX'));
      const box = vstack(12);
      stemControls(box, true);
      sb.append(box);
      sb.append(el('div', 'note', 'Guitar is the separated original guitar part.'));
      sb.append(el('div', 'label', 'CLICK TRACK'));
      const crow = el('div', 'stem');
      crow.append(el('span', null, 'Click'));
      const cr = el('input');
      cr.type = 'range'; cr.min = '0'; cr.max = '1.5'; cr.step = '0.05';
      cr.value = String(state.clickVol);
      cr.setAttribute('aria-label', 'Click volume');
      cr.addEventListener('input', () => { state.clickVol = parseFloat(cr.value); if (clickBus) clickBus.gain.value = state.clickVol; saveState(); });
      const csw = el('button', 'switch');
      csw.type = 'button';
      csw.setAttribute('role', 'switch');
      csw.setAttribute('aria-checked', String(state.clickOn));
      csw.setAttribute('aria-label', 'Click track');
      csw.addEventListener('click', () => { setClick(!state.clickOn); render(); });
      crow.append(cr, csw);
      sb.append(crow);
      sb.append(el('div', 'note', 'Clicks on every beat of tempo-locked chips, higher on each bar. Chips without a locked tempo have no click. Key: K.'));
    } else if (state.panel === 'tune') {
      renderTune(sb);
    }
  }

  function renderTransport() {
    $('loopBtn').setAttribute('aria-pressed', String(state.loopOn));
    $('loopBtn').textContent = state.loopOn ? 'LOOP ON' : 'LOOP OFF';
    $('clickBtn').setAttribute('aria-pressed', String(state.clickOn));
    $('clickBtn').textContent = state.clickOn ? 'CLICK ON' : 'CLICK OFF';
    const act = isActive();
    $('playBtn').textContent = act ? '❚❚' : '▶';
    $('playBtn').setAttribute('aria-label', act ? 'Stop' : 'Play');
  }

  function render() { renderSeg(); renderPanelMenu(); renderGrid(); renderSidebar(); renderTransport(); }

  /* Progress + state-change polling (changes happen on the audio clock, not on events). */
  let lastSig = '';
  function frame() {
    let frac = 0;
    if (ctx && active && active.anchor) {
      const now = ctx.currentTime;
      const d = pending && now >= pending.at ? pending.deck : active;
      const geo = d.loop, r = d.anchor.rate;
      const L = geo.le - geo.ls;
      const pos = now < d.anchor.t ? 0 : clamp(inputAt(d, now) - geo.ls, 0, L);
      frac = L > 0 ? pos / L : 0;
      $('timeText').textContent = fmtShort(pos / r) + ' / ' + fmtShort(L / r);
    } else {
      const c = chipsByCode[focusCode || state.looper[0]];
      $('timeText').textContent = '0:00 / ' + (c ? fmtShort(loopGeom(c.id).L / state.rate) : '0:00');
    }
    $('progressFill').style.width = (frac * 100).toFixed(2) + '%';
    const bar = document.querySelector('.chip.playing .bar i');
    if (bar) bar.style.width = (frac * 100).toFixed(2) + '%';
    const sig = [playingCode(), upcomingCode(), isActive(), queued && deckWith(queued) ? 1 : 0, chain.code + ':' + chain.done, isCounting()].join('|');
    if (sig !== lastSig) { lastSig = sig; render(); }
    drawWave();
    requestAnimationFrame(frame);
  }

  /* ---------- sidebar width (divider) ---------- */
  function clampWidth(w) { return Math.round(clamp(w, 240, Math.max(260, window.innerWidth - 360))); }
  function sidebarWidth() {
    const p = PANELS.find((q) => q.id === state.panel);
    return clampWidth(state.sidebarW[state.panel] || (p ? p.width : 340));
  }
  function setSidebarWidth(w, save) {
    state.sidebarW[state.panel] = clampWidth(w);
    $('sidebar').style.setProperty('--sbw', state.sidebarW[state.panel] + 'px');
    if (save) saveState();
  }
  (function initDivider() {
    const dv = $('divider');
    let startX = 0, startW = 0;
    dv.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      dv.setPointerCapture(ev.pointerId);
      startX = ev.clientX; startW = sidebarWidth();
      dv.classList.add('dragging');
      document.body.classList.add('resizing');
    });
    dv.addEventListener('pointermove', (ev) => {
      if (dv.classList.contains('dragging')) setSidebarWidth(startW + (startX - ev.clientX), false);
    });
    const end = () => {
      if (!dv.classList.contains('dragging')) return;
      dv.classList.remove('dragging');
      document.body.classList.remove('resizing');
      saveState();
    };
    dv.addEventListener('pointerup', end);
    dv.addEventListener('pointercancel', end);
    dv.addEventListener('dblclick', () => { delete state.sidebarW[state.panel]; saveState(); render(); });   // back to default width
    dv.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      ev.preventDefault(); ev.stopPropagation();
      setSidebarWidth(sidebarWidth() + (ev.key === 'ArrowLeft' ? 20 : -20), true);
    });
    window.addEventListener('resize', () => renderSidebar());
  })();

  /* ---------- embedded RIFFJAMS pages ----------
     Same origin as the rest of RIFFJAMS (looper/ sits next to index.html), so the
     looper can restyle them, and clicking inside one gives it the keyboard: all of its own
     shortcuts work there. The two embeds share storage, so Song Map clicks reach the Playboard. */
  const PLAYBOARD_CSS = [
    'html.looper-embed, html.looper-embed body { background: #121212 !important; }',
    'html.looper-embed .wrap { padding: 8px 10px !important; margin: 0 !important; max-width: none !important; }',
    'html.looper-embed #boardPlayer, html.looper-embed .board-player { display: none !important; }',  /* the looper is the audio */
    'html.looper-embed #rjTimer { display: none !important; }',   /* practice timer would sit over the toolbar in a narrow panel */
    'html.looper-embed #playboardRoot, html.looper-embed .sec-play-pane { width: auto !important; max-width: none !important; }',
    'html.looper-embed .sec-play-board { gap: 12px !important; padding: 6px 2px !important; }',
    /* licks at their native size, cropped to the width you give the panel, purple border on each */
    'html.looper-embed .sec-play-card { max-width: 100% !important; padding: 0 !important; }',
    'html.looper-embed .sec-play-card .face { max-width: 100% !important; overflow: hidden !important; border: 3px solid #7030a0 !important; box-shadow: none !important; }',
    'html.looper-embed .sec-play-card img { width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; object-fit: none !important; object-position: left top !important; }'
  ].join('\n');
  const SONGMAP_CSS = 'html.looper-embed, html.looper-embed body { background: #121212; }\nhtml.looper-embed #rjTimer { display: none !important; }';
  const EMBEDS = {
    playboard: { title: 'Tab', src: bandUrl('../index.html?playboard=1'), css: PLAYBOARD_CSS },
    songmap: {
      title: 'Song Map', src: bandUrl('../index.html'), css: SONGMAP_CSS,
      onload(d, w) {
        const b = d.getElementById('btnHP'); if (b) b.click();   // open the Song Map from the home screen
        // "Add to looper": while it's on, a chip click adds that chip to the looper instead of
        // doing the Song Map's own thing (edit, queue, drag), so catch it before the page does.
        const pick = (ev) => {
          if (!addMode && !needsMode) return null;
          const chip = ev.target.closest && ev.target.closest('.sec-chip');
          return chip && !chip.classList.contains('empty') ? chip : null;
        };
        ['pointerdown', 'mousedown'].forEach((t) => d.addEventListener(t, (ev) => {
          if (pick(ev)) { ev.stopPropagation(); ev.preventDefault(); }
        }, true));
        d.addEventListener('click', (ev) => {
          const chip = pick(ev);
          if (!chip) return;
          ev.stopPropagation(); ev.preventDefault();
          const ai = parseInt(chip.getAttribute('data-ai'), 10);
          let album = '';
          try { const a = w.ALBUMS && w.ALBUMS[ai]; album = (a && (a.name || a.album)) || ''; } catch (e) { /* ignore */ }
          const song = chip.getAttribute('data-song') || '', code = chip.getAttribute('data-sec') || '';
          if (needsMode) {
            const tier = parseInt(chip.getAttribute('data-tier'), 10) || 3;
            let cover = '';
            try { if (album !== 'Paranoid' && typeof w.llCoverForAlbumTier === 'function') cover = w.llCoverForAlbumTier(album, tier) || ''; } catch (e) { /* ignore */ }
            addToNeeds({ album, song, code, tier, cover });
          } else addFromSongMap(album, song, code);
        }, true);
        if (addMode || needsMode) applyViewMode();
      }
    }
  };

  /* ---------- "Add to looper" from the Song Map ---------- */
  // Song Map click modes: "Add to looper" and "Needs improvement". At most one is on.
  let addMode = false;
  let needsMode = false;
  function syncModeButtons() {
    const wrap = embedEls.songmap;
    if (wrap && wrap._addBtn) wrap._addBtn.setAttribute('aria-pressed', String(addMode));
    if (wrap && wrap._needsBtn) wrap._needsBtn.setAttribute('aria-pressed', String(needsMode));
  }
  function setAddMode(on) {
    addMode = !!on;
    if (addMode) needsMode = false;
    syncModeButtons();
    if (addMode) applyViewMode();
    setStatus(addMode ? 'Add to looper is on: click a chip in the Song Map to add it' : '');
  }
  function setNeedsMode(on) {
    needsMode = !!on;
    if (needsMode) addMode = false;
    syncModeButtons();
    if (needsMode) applyViewMode();
    setStatus(needsMode ? 'Needs improvement is on: click a chip in the Song Map to add it to the list' : '');
  }

  /* ---------- Needs improvement list ---------- */
  const needsKey = (n) => n.album + '|' + n.song + '|' + n.code;
  function addToNeeds(n) {
    if (!n.song || !n.code) return;
    const label = n.song + ' ' + n.code;
    if (state.needs.some((x) => needsKey(x) === needsKey(n))) { setStatus(label + ' is already on the Needs improvement list'); return; }
    state.needs.push(n);
    saveState(); render();
    setStatus('Added ' + label + ' to Needs improvement (' + state.needs.length + ')');
  }
  function removeFromNeeds(key) {
    state.needs = state.needs.filter((x) => needsKey(x) !== key);
    saveState(); render();
  }
  function renderNeeds(sb) {
    sb.append(el('div', 'label', 'NEEDS IMPROVEMENT · ' + state.needs.length));
    if (!state.needs.length) {
      sb.append(el('div', 'note', 'Nothing here yet. In the Song Map, turn on Needs improvement and click chips to add them.'));
      return;
    }
    const grid = el('div', 'needs-grid');
    state.needs.forEach((n) => {
      const key = needsKey(n);
      // Same look as the looper: Paranoid chips use the full cover at T1 and the wash at T2/T3;
      // other albums use the cover RIFFJAMS gives that album and tier.
      const ch = el('div', 'chip ' + (n.cover ? '' : n.tier >= 2 ? 'wash' : 'full'));
      if (n.tier === 1) ch.classList.add('t1');
      if (n.cover) { ch.style.backgroundImage = 'linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.78) 100%), url("../' + n.cover + '")'; ch.style.backgroundPosition = coverPosition(n.album); }
      ch.setAttribute('role', 'img');
      ch.setAttribute('aria-label', n.code + ' ' + n.song + (n.album ? ' (' + n.album + ')' : '') + ', tier ' + n.tier);
      const top = el('div', 'row');
      top.append(el('div', 'code', n.code));
      ch.append(top);
      const bottom = el('div');
      bottom.append(el('div', 'song', n.song));
      ch.append(bottom);
      const rm = el('button', 'remove', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + n.code + ' ' + n.song + ' from Needs improvement');
      rm.addEventListener('click', () => removeFromNeeds(key));
      const cell = el('div', 'cell');
      cell.append(ch, rm);
      grid.append(cell);
    });
    sb.append(grid);
  }
  // The Song Map's View mode: no editing, so chip clicks are free to add to the looper.
  function applyViewMode() {
    const wrap = embedEls.songmap;
    try {
      const w = wrap && wrap._frame.contentWindow;
      if (w && typeof w.setSectionsMode === 'function' && w.sectionsMode !== 'view') w.setSectionsMode('view');
    } catch (e) { /* still loading: onload applies it */ }
  }
  function addFromSongMap(album, song, code) {
    const s = songs.find((x) => x.song === song && (!album || x.album === album)) || songs.find((x) => x.song === song);
    if (!s) { setStatus(song + ' isn\'t processed for the looper yet'); return; }
    const id = s.slug + '/' + code;
    if (!chipsByCode[id]) { setStatus(song + ' ' + code + ' isn\'t a looper chip'); return; }
    if (state.looper.includes(id)) { setStatus(song + ' ' + code + ' is already in the looper'); return; }
    if (state.looper.length >= 16) { setStatus('The looper is full (16). Remove a chip to make room'); return; }
    addToLooper(id);
    setStatus('Added ' + song + ' ' + code + ' to the looper (' + state.looper.length + ' / 16)');
  }
  const embedEls = {};
  function showEmbed(id) {
    if (id && !embedEls[id]) embedEls[id] = createEmbed(id);
    Object.keys(embedEls).forEach((k) => { embedEls[k].hidden = k !== id; });
  }
  function createEmbed(id) {
    const cfg = EMBEDS[id];
    const wrap = el('div', 'embed');
    const head = el('div', 'embed-head');
    head.append(el('div', 'label grow', cfg.title.toUpperCase()));
    if (id === 'playboard') {
      const add = el('button', 'smallbtn', 'Add looper chips');
      add.type = 'button';
      add.title = 'Put the tab for every chip in the looper on the Playboard';
      add.addEventListener('click', addChipsToPlayboard);
      head.append(add);
    }
    if (id === 'songmap') {
      const am = el('button', 'smallbtn addmode', 'Add to looper');
      am.type = 'button';
      am.title = 'While this is on, clicking a chip in the Song Map adds it to the looper';
      am.setAttribute('aria-pressed', String(addMode));
      am.addEventListener('click', () => setAddMode(!addMode));
      head.append(am);
      wrap._addBtn = am;
      const nm = el('button', 'smallbtn addmode', 'Needs improvement');
      nm.type = 'button';
      nm.title = 'While this is on, clicking a chip in the Song Map adds it to the Needs improvement list';
      nm.setAttribute('aria-pressed', String(needsMode));
      nm.addEventListener('click', () => setNeedsMode(!needsMode));
      head.append(nm);
      wrap._needsBtn = nm;
    }
    const keys = el('span', 'embed-keys', 'Click inside for its keys');
    head.append(keys);
    const open = el('a', 'smallbtn', 'Open full');
    open.href = cfg.src; open.target = '_blank'; open.rel = 'noopener';
    open.style.textDecoration = 'none'; open.style.color = 'inherit';
    head.append(open);
    const fr = el('iframe');
    fr.title = cfg.title;
    fr.src = cfg.src;
    fr.addEventListener('load', () => {
      try {
        const d = fr.contentDocument;
        d.documentElement.classList.add('looper-embed');
        const st = d.createElement('style');
        st.textContent = cfg.css;
        d.head.append(st);
        if (cfg.onload) cfg.onload(d, fr.contentWindow);
        // Pressing anywhere inside hands it the keyboard (even on plain text), and the
        // indicator follows the frame's own focus.
        const fw = fr.contentWindow;
        d.addEventListener('pointerdown', () => { try { fw.focus(); } catch (e) { /* ignore */ } }, true);
        fw.addEventListener('focus', () => setTimeout(updateEmbedFocus, 0));
        fw.addEventListener('blur', () => setTimeout(updateEmbedFocus, 0));
      } catch (e) { showError(new Error('Could not open the ' + cfg.title + ' inside the looper: ' + e.message)); }
    });
    wrap.append(head, fr);
    wrap._frame = fr;
    wrap._keys = keys;
    $('embeds').append(wrap);
    return wrap;
  }
  /* Show which part of the page has the keyboard: the looper, or an embedded page. */
  function updateEmbedFocus() {
    const ae = document.activeElement;
    Object.values(embedEls).forEach((w) => {
      let f = ae === w._frame;
      try { f = f || w._frame.contentDocument.hasFocus(); } catch (e) { /* not loaded */ }
      w.classList.toggle('focused', f);
      w._keys.textContent = f ? 'Its keys are on' : 'Click inside for its keys';
      w._keys.title = f ? 'Keys go to this page. Click anywhere in the looper to get the looper keys back.' : 'Click inside this page to use its shortcut keys.';
    });
  }
  window.addEventListener('blur', () => setTimeout(updateEmbedFocus, 0));
  window.addEventListener('focus', updateEmbedFocus);
  // Pressing anywhere in the looper takes the keyboard back from an embedded page.
  document.addEventListener('pointerdown', () => {
    const ae = document.activeElement;
    if (ae && ae.tagName === 'IFRAME') { ae.blur(); window.focus(); setTimeout(updateEmbedFocus, 0); }
  }, true);

  function addChipsToPlayboard() {
    const wrap = embedEls.playboard;
    const w = wrap && wrap._frame.contentWindow;
    if (!w || !Array.isArray(w.playQueue) || typeof w.publishPlayQueue !== 'function') { setStatus('The Playboard is still loading'); return; }
    let added = 0;
    state.looper.forEach((code) => {
      const c = chipsByCode[code];
      const lick = c.lick || ((c.lickPrefix || '') + c.code);
      const key = 'looper|' + c.slug + '|' + c.code;
      if (w.findPlayIndex(key) >= 0) return;
      w.playQueue.push({ key, code: c.code, song: c.song, lick, tier: c.tier, src: w.lickSrc(lick) });
      added++;
    });
    w.publishPlayQueue();
    w.renderPlayBoard();
    setStatus(added ? 'Added ' + added + ' chips to the Playboard' : 'Those chips are already on the Playboard');
  }

  /* ---------- chip picker ----------
     An empty slot opens it: Album → album covers → songs → that song's chips as big Song Map
     chips (tier purples, Song Map order). When every looper chip comes from one song it opens
     on that song. Click a chip to add it; the picker stays open. */
  function openSongMapAdd() {
    if (!state.panels.includes('songmap')) state.panels.push('songmap');
    setPanel('songmap');
    setAddMode(true);
  }
  function looperSong() {
    const slugs = new Set(state.looper.map((id) => chipsByCode[id] && chipsByCode[id].slug));
    return slugs.size === 1 ? [...slugs][0] : null;
  }
  /* Albums, songs and chips as the Song Map has them (same site, so its saved data is readable);
     without it, just the songs in the chip folder. Only chips in the chip folder can be added. */
  /* Band switch (rj-band.js): RIFFJAMS links keep ?band=, and another band's chips use their album cover. */
  function bandUrl(u) { return window.rjBandUrl ? window.rjBandUrl(u) : u; }
  /* Black Sabbath: each chip shows its own album's cover, the one RIFFJAMS uses for that album and
     tier (same rules as llCoverForAlbumTier in index.html). Paranoid keeps the full / wash art. */
  function sabbathCover(album, tier) {
    const t = tier >= 1 && tier <= 2 ? tier : 3;
    switch (norm(album)) {
      case 'paranoid': return '';
      case 'blacksabbath': return 'covers/sabbath-hp.png?v=288';
      case 'sabbathbloodysabbath': return t >= 3 ? 'covers/sbs-tier3.png?v=5' : 'covers/sbs-ll.png?v=5';
      case 'masterofreality': return t >= 3 ? 'covers/mor-tier3.png?v=1' : 'covers/mor-ll.png?v=1';
      case 'vol4': return t >= 3 ? 'covers/vol4-tier3.png?v=2' : 'covers/vol4.png';
    }
    const a = albumData().find((x) => x && norm(x.name) === norm(album));
    if (a && a.cover) return a.cover;
    return { sabotage: 'covers/sabotage.jpg', technicalecstasy: 'covers/te.jpg', neversaydie: 'covers/nsd.jpg' }[norm(album)] || '';
  }
  /* Which part of a square cover a wide chip shows. Master of Reality: the top, so "BLACK SABBATH" shows. */
  function coverPosition(album) { return norm(album) === 'masterofreality' ? 'center top' : ''; }
  function bandChipArt(album, tier) {
    if (!window.RJ_BAND || window.RJ_BAND.id === 'sabbath') {
      const cover = sabbathCover(album, tier);
      return cover ? 'linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.78) 100%), url("../' + cover + '")' : '';
    }
    const a = albumData().find((x) => x && norm(x.name) === norm(album));
    if (!a || !a.cover) return '';
    const wash = tier >= 2 ? 'linear-gradient(rgba(255,255,255,.28), rgba(255,255,255,.28)), ' : '';
    return 'linear-gradient(180deg, rgba(0,0,0,.05) 30%, rgba(0,0,0,.78) 100%), ' + wash + 'url("../' + a.cover + '")';
  }
  function albumData() {
    try {
      const a = JSON.parse(localStorage.getItem('lick-sections-albums-v3'));
      if (Array.isArray(a) && a.length) return window.rjApplyBandCovers ? window.rjApplyBandCovers(a) : a;
    } catch (e) { /* no Song Map data */ }
    const by = {};
    songs.forEach((s) => {
      const a = by[s.album] || (by[s.album] = { name: s.album, cover: '', songs: [] });
      a.songs.push({ song: s.song, sections: s.chips.map((c) => [c.code, c.tier]) });
    });
    return Object.values(by);
  }
  const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function folderSong(albumName, songName) {
    return songs.find((s) => norm(s.album) === norm(albumName) && norm(s.song) === norm(songName)) || null;
  }
  // The song's chips in Song Map order with Song Map tiers; chips only in the folder go last.
  function songChips(albumName, sm) {
    const fs = folderSong(albumName, sm.song);
    const out = [], seen = new Set();
    (sm.sections || []).forEach((sec) => {
      if (!sec || !sec[0] || seen.has(sec[0])) return;
      seen.add(sec[0]);
      out.push({ code: sec[0], tier: sec[1] || 3, id: fs && chipsByCode[fs.slug + '/' + sec[0]] ? fs.slug + '/' + sec[0] : null });
    });
    if (fs) fs.chips.forEach((c) => { if (!seen.has(c.code)) out.push({ code: c.code, tier: c.tier || 3, id: c.id }); });
    return out;
  }
  let pickerEl = null;
  function closePicker() {
    wantSlot = null;
    if (!pickerEl) return;
    pickerEl.remove();
    pickerEl = null;
    window.removeEventListener('keydown', pickerKeys, true);
  }
  function pickerKeys(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closePicker(); }
  }
  // view: { kind: 'albums' } | { kind: 'songs', album } | { kind: 'chips', album, song }
  function openPicker(slug) {
    closePicker();
    const albums = albumData();
    let view = { kind: 'albums' };
    const fs = slug && songs.find((x) => x.slug === slug);
    if (fs) {
      const al = albums.find((a) => norm(a.name) === norm(fs.album));
      const sm = al && al.songs.find((s) => norm(s.song) === norm(fs.song));
      if (al && sm) view = { kind: 'chips', album: al, song: sm };
    }
    const ov = el('div', 'picker');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Add chips to the looper');
    const card = el('div', 'picker-card');
    // Nav strip along the top: Back, Album, and close.
    const nav = el('div', 'picker-nav');
    const back = el('button', 'picker-navbtn', '‹ Back');
    const albumBtn = el('button', 'picker-navbtn', 'Album');
    const x = el('button', 'picker-x', '×');
    [back, albumBtn, x].forEach((b) => { b.type = 'button'; });
    x.setAttribute('aria-label', 'Close');
    nav.append(back, albumBtn, el('div', 'spacer'), x);
    const title = el('div', 'picker-title');
    const sub = el('div', 'picker-sub');
    const body = el('div', 'picker-body');
    const go = (v) => { view = v; show(); };
    back.addEventListener('click', () => {
      if (view.kind === 'chips') go({ kind: 'songs', album: view.album });
      else if (view.kind === 'songs') go({ kind: 'albums' });
    });
    albumBtn.addEventListener('click', () => go({ kind: 'albums' }));
    x.addEventListener('click', closePicker);
    const room = () => 16 - state.looper.length;
    function show() {
      body.textContent = '';
      back.disabled = view.kind === 'albums';
      albumBtn.classList.toggle('on', view.kind === 'albums');
      if (view.kind === 'albums') {
        title.textContent = 'Albums';
        sub.textContent = 'Choose an album';
        body.className = 'picker-body palbums';
        albums.forEach((a) => {
          const b = el('button', 'palbum');
          b.type = 'button';
          const art = el('div', 'palbum-art');
          if (a.cover) art.style.backgroundImage = 'url("../' + a.cover + '")';
          b.append(art, el('div', 'palbum-name', a.name));
          b.addEventListener('click', () => go({ kind: 'songs', album: a }));
          body.append(b);
        });
      } else if (view.kind === 'songs') {
        title.textContent = view.album.name;
        sub.textContent = 'Choose a song';
        body.className = 'picker-body psongs';
        view.album.songs.forEach((s) => {
          const ready = songChips(view.album.name, s).filter((c) => c.id).length;
          const b = el('button', 'psong' + (ready ? '' : ' none'));
          b.type = 'button';
          b.append(el('span', 'psong-name', s.song), el('span', 'psong-n', ready ? ready + ' chip' + (ready === 1 ? '' : 's') : 'no chips yet'));
          b.addEventListener('click', () => go({ kind: 'chips', album: view.album, song: s }));
          body.append(b);
        });
      } else {
        title.textContent = view.song.song;
        const list = songChips(view.album.name, view.song);
        const left = room();
        sub.textContent = view.album.name + ' · ' + (left <= 0 ? 'the looper is full'
          : list.some((c) => c.id) ? 'click a chip to add it · ' + left + ' slot' + (left === 1 ? '' : 's') + ' left'
            : 'none of these chips are in the chip folder yet');
        body.className = 'picker-body pchips';
        list.forEach((c) => {
          const inLooper = c.id && state.looper.includes(c.id);
          const b = el('button', 'pchip t' + Math.min(5, Math.max(1, c.tier)) + (c.id ? '' : ' off') + (inLooper ? ' in' : ''), c.code);
          b.type = 'button';
          b.title = (SECTION_NAME[sectionType(c.code)] || 'Section') + ' ' + sectionNum(c.code) + ' · Tier ' + c.tier +
            (inLooper ? ' · already in the looper' : c.id ? '' : ' · not in the chip folder yet');
          b.disabled = !c.id || inLooper || left <= 0;
          b.addEventListener('click', () => { addToLooper(c.id); show(); });
          body.append(b);
        });
      }
    }
    const other = el('button', 'picker-link', 'Or add from the Song Map');
    other.type = 'button';
    other.addEventListener('click', () => { closePicker(); openSongMapAdd(); });
    card.append(nav, title, sub, body, other);
    ov.append(card);
    ov.addEventListener('click', (ev) => { if (ev.target === ov) closePicker(); });
    document.body.append(ov);
    pickerEl = ov;
    window.addEventListener('keydown', pickerKeys, true);
    show();
  }

  /* ---------- actions ---------- */
  function addToLooper(code) {
    if (state.looper.includes(code) || state.looper.length >= 16) return;
    state.looper.push(code); saveState(); render();
  }
  function removeFromLooper(code) {
    state.looper = state.looper.filter((c) => c !== code);
    if (queued === code) queued = null;
    saveState(); render();
  }
  function toggleStem(s) {
    state.stemOn[s] = !state.stemOn[s];
    applyStem(s);
    saveState();
    render();
  }
  /* Lock in: bake the browser-only Start/End adjustments into manifest.json in the chip folder. */
  async function lockIn(code) {
    const c = chipsByCode[code];
    const n = nudgeOf(code);
    if (!c || !(n.s || n.e)) return;
    const oldKey = nudgeKey(code);
    setStatus('Locking in ' + lab(code) + '…');
    let res;
    try { res = await source.lockIn({ slug: c.slug, code: c.code, rev: c.rev || 0, s: n.s, e: n.e }); }
    catch (e) { res = { status: 0, body: { error: (e && e.message) || String(e) } }; }
    const body = res.body;
    if (res.status !== 200) { setStatus('Couldn’t lock in ' + lab(code) + ': ' + ((body && body.error) || res.status)); return; }
    // Same loop, now described by the manifest: swap in the new chip data, drop the browser copy.
    const extra = { id: c.id, song: c.song, slug: c.slug, album: c.album, lickPrefix: c.lickPrefix };
    Object.keys(c).forEach((k) => { delete c[k]; });
    Object.assign(c, body.chip, extra);
    delete state.nudges[oldKey];
    saveState();
    loopPointsChanged(code);
    render();
    setStatus('Locked in ' + lab(code) + ' ' + c.song + ': saved to the chip file');
  }
  function loopPointsChanged(code) { if (active && active.playCode === code) applyLive(); }
  function nudge(code, which, d) {
    const c = chipsByCode[code];
    const n = Object.assign({ s: 0, e: 0 }, state.nudges[nudgeKey(code)]);
    n[which] += d;
    // Stay inside the padded audio and keep loops ≥ 0.5 s.
    const minS = -Math.floor(c.offset * 1000);
    const maxE = Math.floor((c.fileLength - c.offset - c.length) * 1000) - 25;
    n.s = Math.max(minS, n.s);
    n.e = Math.min(maxE, n.e);
    if (c.length + (n.e - n.s) / 1000 < 0.5) n[which] -= d;
    state.nudges[nudgeKey(code)] = n;
    saveState();
    loopPointsChanged(code);
    render();
  }
  function nudgeBoth(code, d) {
    const c = chipsByCode[code];
    const n = Object.assign({ s: 0, e: 0 }, state.nudges[nudgeKey(code)]);
    const minS = -Math.floor(c.offset * 1000);
    const maxE = Math.floor((c.fileLength - c.offset - c.length) * 1000) - 25;
    if (n.s + d < minS || n.e + d > maxE) {
      setStatus('Can’t move further: no more audio past that end');
      return;
    }
    n.s += d; n.e += d;
    state.nudges[nudgeKey(code)] = n;
    setStatus('');
    saveState();
    loopPointsChanged(code);
    render();
  }

  function setRate(r) {
    state.rate = clamp(Math.round(r * 10000) / 10000, 0.5, 1.5);
    saveState(); applyLive(); render();
  }
  /* ±1 BPM of the chip in focus (all chips share one tempo multiplier). */
  function setTempoStep(dir) {
    const code = playingCode() || focusCode || state.looper[0];
    const bpm = code ? chipBpm(code) : null;
    if (bpm) setRate((Math.round(bpm * state.rate) + dir) / bpm);
    else setRate(state.rate + dir * 0.01);
  }
  function setKeyGlobal(v) { state.keyGlobal = clamp(v, -12, 12); saveState(); applyLive(); render(); }
  function setHzGlobal(v) { state.hzGlobal = clamp(v, -40, 40); saveState(); applyLive(); render(); }
  function setChipPitch(code, which, d) {
    const p = chipPitch(code);
    p[which] = which === 'key' ? clamp(p.key + d, -12, 12) : clamp(p.hz + d, -40, 40);
    if (!p.key && !p.hz) delete state.chipPitch[code]; else state.chipPitch[code] = p;
    saveState();
    if (active && active.playCode === code) applyLive();
    render();
  }
  function resetChipPitch(code, which) { setChipPitch(code, which, -chipPitch(code)[which]); }

  // Shift+C: take every chip out of the looper. Whatever is playing keeps playing.
  function clearLooper() {
    if (!state.looper.length) { setStatus('The looper is already empty'); return; }
    const n = state.looper.length;
    state.looper = [];
    queued = null;          // a queued chip is gone from the looper, so drop the queue (like removing it)
    saveState();
    render();
    setStatus('Cleared ' + n + ' chips from the looper');
  }
  function setPanel(p) { state.panel = p; $('panelMenu').hidden = true; saveState(); render(); }
  function togglePlay() {
    if (isActive()) stopAll();
    else { const code = focusCode && state.looper.includes(focusCode) ? focusCode : state.looper[0]; if (code) startChip(code); }
  }

  /* ---------- wiring ---------- */
  $('playBtn').addEventListener('click', togglePlay);
  $('stopBtn').addEventListener('click', stopAll);
  $('loopBtn').addEventListener('click', () => { state.loopOn = !state.loopOn; saveState(); renderTransport(); });
  $('clickBtn').addEventListener('click', () => setClick(!state.clickOn));
  $('sbClose').addEventListener('click', () => setPanel('off'));   // same as the "Off" panel button
  document.addEventListener('click', (ev) => {
    const m = $('panelMenu');
    if (!m.hidden && !m.contains(ev.target)) { m.hidden = true; renderSeg(); }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    if (ev.shiftKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { ev.preventDefault(); seek(k === 'ArrowRight' ? 5 : -5); return; }
    if (ev.shiftKey && (k === 'C' || k === 'c')) { ev.preventDefault(); clearLooper(); return; }
    if (k === ' ') { ev.preventDefault(); togglePlay(); }
    else if (k === 'Escape') { stopAll(); $('panelMenu').hidden = true; }
    else if (/^[1-9]$/.test(k)) { const code = chipInSlot(parseInt(k, 10) - 1); if (code) trigger(code, ev.shiftKey); }
    else if (k === 'g' || k === 'G') toggleStem('guitar');
    else if (k === 'l' || k === 'L') { state.loopOn = !state.loopOn; saveState(); renderTransport(); }
    else if (k === 'k' || k === 'K') setClick(!state.clickOn);
  });
  // Space is play/stop everywhere: stop a focused button from also "clicking" on key-up.
  document.addEventListener('keyup', (ev) => {
    if (ev.key === ' ' && ev.target && ev.target.tagName === 'BUTTON') ev.preventDefault();
  });

  /* ---------- boot ---------- */
  let booted = false;
  async function start() {
    const url = new URLSearchParams(location.search).get('audio');
    if (url) { source = urlSource(url); return boot(await source.manifest()); }
    if (!window.showDirectoryPicker) return gate('none');
    const h = await savedFolder();
    if (h && (await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
      try { return await openFolder(h); } catch (e) { return gate('choose', null, e); }   // folder moved or renamed
    }
    gate(h ? 'reconnect' : 'choose', h);
  }
  async function openFolder(h) {
    const src = await folderSource(h);
    const m = await src.manifest();
    source = src;
    await rememberFolder(h);
    $('gate').hidden = true;
    $('folderBtn').hidden = false;
    $('folderBtn').title = 'Chip folder: ' + h.name + ' (click to choose another)';
    return boot(m);
  }
  async function pickFolder() {
    return window.showDirectoryPicker({ id: 'rj-looper', mode: 'readwrite' });
  }
  // Shown until the chip folder is open: first visit, a browser that can't open folders, or after a
  // browser restart when Chrome asks again for permission (one click).
  function gate(kind, h, err) {
    $('gate').hidden = false;
    $('gateMsg').textContent = kind === 'none'
      ? 'The Loop Station plays audio from a folder on your computer, which needs Chrome or Edge on a computer.'
      : kind === 'reconnect'
        ? 'Allow the Loop Station to open your chip folder “' + h.name + '” again.'
        : 'Choose the folder with your chips: ' + CHIP_PATH + ' (it holds manifest.json and the audio folder). The audio stays on your computer.';
    $('gateErr').textContent = err ? (err.message || String(err)) : '';
    const main = $('gateBtn'), other = $('gateOther');
    main.hidden = kind === 'none';
    main.textContent = kind === 'reconnect' ? 'Open “' + h.name + '”' : 'Choose chip folder';
    other.hidden = kind !== 'reconnect';
    const go = (pick) => async () => {
      try {
        let dir = h;
        if (pick) dir = await pickFolder();
        else if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
        await openFolder(dir);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        $('gateErr').textContent = e.message || String(e);
      }
    };
    main.onclick = go(kind !== 'reconnect');
    other.onclick = go(true);
  }
  $('folderBtn').onclick = async () => {
    try {
      const dir = await pickFolder();
      await folderSource(dir);          // check it before switching
      await rememberFolder(dir);
      location.reload();
    } catch (e) { if (!e || e.name !== 'AbortError') showError(e); }
  };
  function boot(m) {
    if (booted) return;
    booted = true;
    {
      songs = m.songs || [m];
      songs.forEach((s) => s.chips.forEach((c) => {
        const id = s.slug + '/' + c.code;
        chipsByCode[id] = Object.assign(c, { id, song: s.song, slug: s.slug, album: s.album, lickPrefix: s.lickPrefix || '' });
      }));
      state.looper = state.looper.filter((c) => chipsByCode[c]);
      songs.forEach((s) => {
        if (state.songsSeen.includes(s.slug)) return;
        state.songsSeen.push(s.slug);
        [...new Set(s.map)].forEach((cd) => {
          const id = s.slug + '/' + cd;
          if (chipsByCode[id] && !state.looper.includes(id) && state.looper.length < 16) state.looper.push(id);
        });
      });
      saveState();
      focusCode = state.looper[0] || null;
      render();
      requestAnimationFrame(frame);
      return initAudio().then(() => {
        // Warm the first chip onto a deck so the first tap starts quickly.
        if (state.looper[0]) return loadIntoDeck(decks[0], state.looper[0]).then(render);
      }).catch(showError);
    }
  }
  start().catch(showError);

  // Debug handle for testing from the console.
  window.__looper = {
    openFolder, get source() { return source; },
    get ctx() { return ctx; }, get active() { return active; }, get pending() { return pending; }, get queued() { return queued; },
    get decks() { return decks; }, get latency() { return LAT; },
    trigger, stopAll, seek, state: () => state, isReady, inputAt, nextSeam, setRate, setKeyGlobal, setHzGlobal, setChipPitch
  };
})();
