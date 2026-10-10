(function () {
  "use strict";

  var REPO_OWNER = "chuggzrockwell";
  var REPO_NAME = "RIFFJAMS";
  var REPO_BRANCH = "main";
  var DATA_PATH = "riffjams-data.json";
  var IMAGE_DIR = "user-tabs";
  var TOKEN_KEY = "riffjams-github-token";
  var TOKEN = "";
  var pendingImage = null;
  var pendingPreviewUrl = "";
  var sharedData = { version: 1, updatedAt: null, assets: {} };
  /* Sync protocol: 2 = rebase onto the repo copy and push only this tab's own edits.
     Written to the manifest as minClientVersion; a tab older than that refuses to commit. */
  var CLIENT_VERSION = 2;
  var PENDING_KEY = "riffjams-pending-sync-v1";
  var tabBase = null;      /* per-tab snapshot (JSON per song) of what this tab last loaded/committed */
  var loadingShared = true;

  window.RIFFJAMS_ASSETS = window.RIFFJAMS_ASSETS || {};

  function qs(id) { return document.getElementById(id); }
  function setMessage(text, kind) {
    var el = qs("chipAttachStatus");
    if (!el) return;
    el.textContent = text || "";
    el.className = "chip-attach-status" + (kind ? " " + kind : "");
  }
  function safeId(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .replace(/-+/g, "-");
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function loadStoredToken() {
    try { TOKEN = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { TOKEN = ""; }
    updateConnectionUi();
  }
  function rememberToken(token) {
    TOKEN = token || "";
    try {
      if (TOKEN) localStorage.setItem(TOKEN_KEY, TOKEN);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    updateConnectionUi();
  }
  function updateConnectionUi(login) {
    var connected = !!TOKEN;
    var row = qs("chipGithubConnect");
    var status = qs("chipGithubStatus");
    if (row) row.classList.toggle("connected", connected);
    if (status) status.textContent = connected ? (login ? "Connected as " + login : "GitHub connected") : "GitHub connection required";
    var btn = qs("chipGithubDisconnect");
    if (btn) btn.hidden = !connected;
  }

  async function github(path, options) {
    if (!TOKEN) throw new Error("Connect GitHub first.");
    options = options || {};
    options.headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + TOKEN,
      "X-GitHub-Api-Version": "2022-11-28"
    }, options.headers || {});
    var response = await fetch("https://api.github.com" + path, options);
    var body = null;
    try { body = await response.json(); } catch (e) {}
    if (!response.ok) {
      var message = body && body.message ? body.message : ("GitHub request failed (" + response.status + ")");
      if (response.status === 401) message = "GitHub connection expired. Connect again.";
      if (response.status === 403) message = "GitHub did not grant permission to update this repository.";
      throw new Error(message);
    }
    return body;
  }

  async function verifyConnection(token) {
    TOKEN = token;
    var user = await github("/user");
    if (!user || String(user.login).toLowerCase() !== REPO_OWNER.toLowerCase()) {
      TOKEN = "";
      throw new Error("Please connect the " + REPO_OWNER + " GitHub account.");
    }
    await github("/repos/" + REPO_OWNER + "/" + REPO_NAME);
    rememberToken(token);
    updateConnectionUi(user.login);
    return user;
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
  }
  function textToBase64(text) {
    return arrayBufferToBase64(new TextEncoder().encode(text).buffer);
  }

  async function normalizeToPng(file) {
    if (!file || !/^image\//i.test(file.type || "")) throw new Error("Paste or choose an image file.");
    if (file.size > 12 * 1024 * 1024) throw new Error("The screenshot must be smaller than 12 MB.");
    var bitmap = await createImageBitmap(file);
    var canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    var ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
    return await new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("The screenshot could not be processed."));
      }, "image/png");
    });
  }

  function clearPendingImage() {
    pendingImage = null;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = "";
    var img = qs("chipTabPreview");
    if (img) { img.removeAttribute("src"); img.hidden = true; }
    var preview = qs("chipImagePreview");
    if (preview) preview.hidden = true;
    var clear = qs("chipImageClear");
    if (clear) clear.hidden = true;
  }

  async function acceptImage(file) {
    try {
      setMessage("Preparing screenshot…");
      var png = await normalizeToPng(file);
      clearPendingImage();
      pendingImage = png;
      pendingPreviewUrl = URL.createObjectURL(png);
      var img = qs("chipTabPreview");
      if (img) { img.src = pendingPreviewUrl; img.hidden = false; }
      var preview = qs("chipImagePreview");
      if (preview) preview.hidden = false;
      var clear = qs("chipImageClear");
      if (clear) clear.hidden = false;
      setMessage("Screenshot ready", "success");
    } catch (error) {
      setMessage(error.message || "Could not use that screenshot.", "error");
    }
  }

  async function pasteClipboardImage() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        throw new Error("Clipboard paste is not available in this browser.");
      }
      setMessage("Reading clipboard…");
      var items = await navigator.clipboard.read();
      for (var i = 0; i < items.length; i++) {
        var imageType = items[i].types.find(function (type) { return type.indexOf("image/") === 0; });
        if (imageType) {
          await acceptImage(await items[i].getType(imageType));
          return;
        }
      }
      throw new Error("There is no screenshot on the clipboard.");
    } catch (error) {
      setMessage(error.message || "The screenshot could not be pasted.", "error");
    }
  }

  function readDraft() {
    if (!window.chipEditState) throw new Error("Open a chip before attaching a screenshot.");
    var code = (qs("chipEditId").value || "").trim();
    if (!window.soloMode) code = code.toUpperCase();
    if (!code) throw new Error("Enter the chip name.");
    var lick = safeId(qs("chipEditLick").value || code);
    if (!lick) throw new Error("Enter a tab name.");
    qs("chipEditLick").value = lick;
    var tierButton = document.querySelector("#chipEditTiers .tier-pick.on");
    var tier = tierButton ? parseInt(tierButton.getAttribute("data-tier"), 10) : 3;
    var positions = window.readChipEditPosList();
    return { code: code, lick: lick, tier: tier, positions: positions };
  }

  function buildNextState(draft) {
    var nextAlbums = clone(window.ALBUMS);
    var nextSolo = clone(window.SOLO_MAP);
    var state = window.chipEditState;
    var entry = window.makeChipEntry(draft.code, draft.tier, draft.lick, draft.positions);
    var previousEntry = null;
    if (window.soloMode) {
      var soloSong = nextSolo && nextSolo.albums && nextSolo.albums[state.ai] && nextSolo.albums[state.ai].songs[state.si];
      if (!soloSong) throw new Error("The selected song could not be found.");
      while ((soloSong.licks || (soloSong.licks = [])).length <= state.ci) soloSong.licks.push(null);
      previousEntry = soloSong.licks[state.ci];
      soloSong.licks[state.ci] = entry;
    } else {
      var song = nextAlbums[state.ai] && nextAlbums[state.ai].songs[state.si];
      if (!song) throw new Error("The selected song could not be found.");
      while ((song.sections || (song.sections = [])).length <= state.ci) song.sections.push(null);
      previousEntry = song.sections[state.ci];
      song.sections[state.ci] = entry;
      /* Attach Song Map fretting onto Solo licks that share this lick id */
      if (entry && entry.length > 3 && song.song) {
        var lickId = String(entry[2] || "").trim();
        if (lickId) {
          (nextSolo.albums || []).forEach(function (a) {
            (a.songs || []).forEach(function (ss) {
              if (!ss || ss.song !== song.song) return;
              (ss.licks || []).forEach(function (lp, i) {
                if (!lp || !lp[0]) return;
                var sl = String((lp[2] != null && lp[2] !== "") ? lp[2] : lp[0]).trim();
                if (sl !== lickId) return;
                ss.licks[i] = window.makeChipEntry(lp[0], window.chipTier(lp), sl,
                  (Array.isArray(entry[3]) && entry[3].length === 0) ? [] : window.chipPositions(entry));
              });
            });
          });
        }
      }
    }
    return {
      albums: nextAlbums,
      soloMap: nextSolo,
      previousLick: previousEntry && previousEntry[2] ? String(previousEntry[2]).trim() : ""
    };
  }

  function tabIsStillLinked(albums, soloMap, lick) {
    var found = false;
    function scan(list, field) {
      (list || []).forEach(function (album) {
        (album.songs || []).forEach(function (song) {
          (song[field] || []).forEach(function (pair) {
            if (pair && String(pair[2] || "").trim() === lick) found = true;
          });
        });
      });
    }
    scan(albums, "sections");
    scan((soloMap && soloMap.albums) || [], "licks");
    return found;
  }

  async function attachAndSave() {
    var button = qs("chipAttachSave");
    try {
      if (!pendingImage) throw new Error("Paste or choose a screenshot first.");
      if (!TOKEN) throw new Error("Connect GitHub first.");
      var draft = readDraft();
      var next = buildNextState(draft);
      var imagePath = IMAGE_DIR + "/" + draft.lick + ".png";
      var deleteAssets = [];
      var deletePaths = [];
      if (next.previousLick && next.previousLick !== draft.lick && !tabIsStillLinked(next.albums, next.soloMap, next.previousLick)) {
        var previousPath = (sharedData.assets || {})[next.previousLick] || (window.RIFFJAMS_ASSETS || {})[next.previousLick] || "";
        if (previousPath.indexOf(IMAGE_DIR + "/") === 0) deletePaths.push(previousPath);
        deleteAssets.push(next.previousLick);
      }
      var addAssets = {};
      addAssets[draft.lick] = imagePath;
      button.disabled = true;
      button.textContent = "Attaching…";
      setMessage("Saving screenshot and chip to GitHub…");
      window.ALBUMS = next.albums;
      window.SOLO_MAP = next.soloMap;
      window.saveAlbums();
      window.saveSoloMap();
      var imageBase64 = arrayBufferToBase64(await pendingImage.arrayBuffer());
      var result = await commitWithRebase({
        message: "Attach " + draft.lick + " tab",
        imagePath: imagePath,
        imageBase64: imageBase64,
        deletePaths: deletePaths,
        addAssets: addAssets,
        deleteAssets: deleteAssets,
        force: true
      });
      window.RIFFJAMS_ASSETS = Object.assign({}, result.manifest.assets || {});
      clearPendingImage();
      window.setSaveStatus("Attached. Publishing…");
      window.closeChipEditor();
      window.showSections(true);
    } catch (error) {
      if (/expired|Connect GitHub|Bad credentials/i.test(error.message || "")) rememberToken("");
      setMessage(error.message || "Could not attach the screenshot.", "error");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Attach & Save"; }
    }
  }


  /* ---------- Rebase-safe sync ----------
     Each tab remembers (tabBase) exactly what it loaded from the repo or last committed, per song.
     A commit re-reads riffjams-data.json from the branch head and replaces ONLY the songs this tab
     changed since then; every other song stays as the repo has it. So a tab holding old data can
     never overwrite newer crop links/tiers it did not edit itself. */
  function albumKey(a) { return String((a && a.name) || ""); }
  function songKeyOf(a, s) { return albumKey(a) + "|" + String((s && s.song) || ""); }
  function mapSongs(albums, cb) {
    (albums || []).forEach(function (a) {
      (a && a.songs || []).forEach(function (s) { if (s && s.song) cb(a, s); });
    });
  }
  function currentMaps() {
    return {
      albums: window.ALBUMS || [],
      solo: (window.SOLO_MAP && window.SOLO_MAP.albums) || [],
      arr: (window.ARRANGEMENT_MAP && window.ARRANGEMENT_MAP.albums) || []
    };
  }
  function snapshotOf(albums) {
    var out = {};
    mapSongs(albums, function (a, s) { out[songKeyOf(a, s)] = JSON.stringify(s); });
    return out;
  }
  function takeTabBase() {
    var m = currentMaps();
    tabBase = { albums: snapshotOf(m.albums), solo: snapshotOf(m.solo), arr: snapshotOf(m.arr) };
  }
  function readPending() {
    try {
      var p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
      if (p && typeof p === "object") return { albums: p.albums || {}, solo: p.solo || {}, arr: p.arr || {} };
    } catch (e) {}
    return { albums: {}, solo: {}, arr: {} };
  }
  function writePending(p) {
    try {
      if (!Object.keys(p.albums).length && !Object.keys(p.solo).length && !Object.keys(p.arr).length) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } catch (e) {}
  }
  /** Songs this tab changed since tabBase (any edit path: editor, drag, undo, rulers, times, links). */
  function changedSongs() {
    var out = { albums: {}, solo: {}, arr: {} };
    if (!tabBase) return out;
    var m = currentMaps();
    ["albums", "solo", "arr"].forEach(function (k) {
      mapSongs(m[k], function (a, s) {
        var key = songKeyOf(a, s);
        if (tabBase[k][key] !== JSON.stringify(s)) out[k][key] = true;
      });
    });
    return out;
  }
  /** Pending = this tab's changes + unsynced changes carried over from an earlier session. */
  function pendingSongs() {
    var ch = changedSongs();
    var carried = readPending();
    ["albums", "solo", "arr"].forEach(function (k) {
      Object.keys(carried[k]).forEach(function (key) { ch[k][key] = true; });
    });
    return ch;
  }
  function recordPending() {
    if (loadingShared || !tabBase) return;
    var ch = changedSongs();
    var p = readPending();
    ["albums", "solo", "arr"].forEach(function (k) {
      Object.keys(ch[k]).forEach(function (key) {
        /* keep the repo version the edit was made against, for a 3-way merge after reload */
        if (p[k][key]) return;
        var b = tabBase[k][key];
        p[k][key] = (typeof b === "string" && b !== "__pending__") ? b : true;
      });
    });
    writePending(p);
  }
  function hasAny(p) {
    return !!(Object.keys(p.albums).length || Object.keys(p.solo).length || Object.keys(p.arr).length);
  }
  function findSong(albums, key) {
    var hit = null;
    mapSongs(albums, function (a, s) { if (!hit && songKeyOf(a, s) === key) hit = s; });
    return hit;
  }
  var CHIP_FIELDS = { sections: 1, chips: 1, licks: 1, ssChips: 1 };
  function same(a, b) {
    return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
  }
  /** 3-way merge of one song: take this tab's value only where it differs from what the tab
   *  started from (per chip slot for chip lists, per field otherwise); keep the repo elsewhere. */
  function mergeSong(baseSong, localSong, repoSong) {
    if (!repoSong) return clone(localSong);
    if (!baseSong) return clone(localSong);
    var out = clone(repoSong);
    var keys = {};
    [baseSong, localSong, repoSong].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      var b = baseSong[k], l = localSong[k];
      if (CHIP_FIELDS[k] && (Array.isArray(l) || Array.isArray(b))) {
        var bl = Array.isArray(b) ? b : [], ll = Array.isArray(l) ? l : [];
        var rl = Array.isArray(out[k]) ? out[k] : (out[k] = []);
        var n = Math.max(bl.length, ll.length);
        for (var i = 0; i < n; i++) {
          if (same(bl[i], ll[i])) continue;
          while (rl.length <= i) rl.push(null);
          rl[i] = ll[i] == null ? null : clone(ll[i]);
        }
        return;
      }
      if (same(b, l)) return;
      if (l === undefined) delete out[k];
      else out[k] = clone(l);
    });
    return out;
  }
  /** Overlay this tab's edits for the pending songs onto the repo copy (3-way vs tabBase). */
  function overlayMerged(targetAlbums, localAlbums, keys, baseSnap) {
    Object.keys(keys).forEach(function (key) {
      var local = findSong(localAlbums, key);
      if (!local) return;
      var baseRaw = baseSnap && baseSnap[key];
      var base = (typeof baseRaw === "string" && baseRaw !== "__pending__") ? JSON.parse(baseRaw) : null;
      var done = false;
      (targetAlbums || []).forEach(function (a) {
        (a && a.songs || []).forEach(function (s, i) {
          if (!done && s && s.song && songKeyOf(a, s) === key) { a.songs[i] = mergeSong(base, local, s); done = true; }
        });
      });
      if (done) return;
      var albumName = key.split("|")[0];
      var album = (targetAlbums || []).filter(function (a) { return albumKey(a) === albumName; })[0];
      if (album) (album.songs || (album.songs = [])).push(clone(local));
    });
  }
  function timingKey(t) { return String((t && t.album) || "") + "|" + String((t && t.song) || ""); }

  async function readRepoHead() {
    var prefix = "/repos/" + REPO_OWNER + "/" + REPO_NAME;
    var ref = await github(prefix + "/git/ref/heads/" + REPO_BRANCH);
    var parentSha = ref.object.sha;
    var parent = await github(prefix + "/git/commits/" + parentSha);
    var tree = await github(prefix + "/git/trees/" + parent.tree.sha);
    var entry = (tree.tree || []).filter(function (t) { return t.path === DATA_PATH; })[0];
    var data = null;
    if (entry) {
      var blob = await github(prefix + "/git/blobs/" + entry.sha);
      var bin = atob(String(blob.content || "").replace(/\s+/g, ""));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      data = JSON.parse(new TextDecoder().decode(bytes));
    }
    return { parentSha: parentSha, parent: parent, data: data };
  }

  /** Re-read the repo head, overlay only this tab's pending songs, commit (retrying if the branch moved). */
  async function commitWithRebase(opts) {
    opts = opts || {};
    var prefix = "/repos/" + REPO_OWNER + "/" + REPO_NAME;
    var lastError = null;
    for (var attempt = 0; attempt < 3; attempt++) {
      var head = await readRepoHead();
      var repo = head.data || { version: 1, assets: {}, albums: [], soloMap: { albums: [] }, arrangementMap: { albums: [] }, arrangementTimings: [] };
      if (Number(repo.minClientVersion || 0) > CLIENT_VERSION) {
        throw new Error("This RIFFJAMS tab is out of date. Reload the page before saving.");
      }
      var pend = pendingSongs();
      if (!opts.force && !hasAny(pend)) {
        refreshUntouchedFromRepo(repo);
        return { ok: true, skipped: true, manifest: repo };
      }
      var m = currentMaps();
      var manifest = clone(repo);
      manifest.version = 1;
      manifest.albums = manifest.albums || [];
      manifest.soloMap = manifest.soloMap || { albums: [] };
      manifest.soloMap.albums = manifest.soloMap.albums || [];
      manifest.arrangementMap = manifest.arrangementMap || { albums: [] };
      manifest.arrangementMap.albums = manifest.arrangementMap.albums || [];
      overlayMerged(manifest.albums, m.albums, pend.albums, tabBase && tabBase.albums);
      overlayMerged(manifest.soloMap.albums, m.solo, pend.solo, tabBase && tabBase.solo);
      if (typeof window.purgeRetiredSoloLicksFromAlbums === "function") {
        window.purgeRetiredSoloLicksFromAlbums(manifest.soloMap.albums);
      }
      overlayMerged(manifest.arrangementMap.albums, m.arr, pend.arr, tabBase && tabBase.arr);
      if (Object.keys(pend.arr).length && typeof window.exportArrangementForRepo === "function") {
        var exported = (typeof window.buildArrangementTimings === "function")
          ? (window.buildArrangementTimings({ albums: manifest.arrangementMap.albums }) || [])
          : (window.exportArrangementForRepo().arrangementTimings || []);
        var timings = (manifest.arrangementTimings || []).filter(function (t) { return !pend.arr[timingKey(t)]; });
        exported.forEach(function (t) { if (pend.arr[timingKey(t)]) timings.push(clone(t)); });
        manifest.arrangementTimings = timings;
      }
      manifest.assets = Object.assign({}, repo.assets || {}, opts.addAssets || {});
      (opts.deleteAssets || []).forEach(function (k) { delete manifest.assets[k]; });
      manifest.updatedAt = new Date().toISOString();
      manifest.minClientVersion = Math.max(Number(repo.minClientVersion || 0), CLIENT_VERSION);
      var committedSnap = {
        albums: snapshotOf(m.albums), solo: snapshotOf(m.solo), arr: snapshotOf(m.arr)
      };
      try {
        var treeEntries = [];
        if (opts.imagePath && opts.imageBase64) {
          var imageGitBlob = await github(prefix + "/git/blobs", {
            method: "POST",
            body: JSON.stringify({ content: opts.imageBase64, encoding: "base64" })
          });
          treeEntries.push({ path: opts.imagePath, mode: "100644", type: "blob", sha: imageGitBlob.sha });
        }
        var dataGitBlob = await github(prefix + "/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: textToBase64(JSON.stringify(manifest, null, 2) + "\n"), encoding: "base64" })
        });
        treeEntries.push({ path: DATA_PATH, mode: "100644", type: "blob", sha: dataGitBlob.sha });
        (opts.deletePaths || []).forEach(function (path) {
          if (path && path !== opts.imagePath) treeEntries.push({ path: path, mode: "100644", type: "blob", sha: null });
        });
        var tree = await github(prefix + "/git/trees", {
          method: "POST",
          body: JSON.stringify({ base_tree: head.parent.tree.sha, tree: treeEntries })
        });
        var commit = await github(prefix + "/git/commits", {
          method: "POST",
          body: JSON.stringify({ message: opts.message || "Sync", tree: tree.sha, parents: [head.parentSha] })
        });
        await github(prefix + "/git/refs/heads/" + REPO_BRANCH, {
          method: "PATCH",
          body: JSON.stringify({ sha: commit.sha, force: false })
        });
      } catch (err) {
        lastError = err;
        if (/fast forward|fast-forward|Update is not a fast forward|Reference cannot be updated/i.test(err.message || "")) continue;
        throw err;
      }
      /* Committed: the pending songs as committed become this tab's base; clear carried flags
         for songs that have not changed again while the commit was in flight. */
      var now = currentMaps();
      var nowSnap = { albums: snapshotOf(now.albums), solo: snapshotOf(now.solo), arr: snapshotOf(now.arr) };
      var carried = readPending();
      ["albums", "solo", "arr"].forEach(function (k) {
        Object.keys(pend[k]).forEach(function (key) {
          if (tabBase) tabBase[k][key] = committedSnap[k][key];
          if (nowSnap[k][key] === committedSnap[k][key]) delete carried[k][key];
        });
      });
      writePending(carried);
      sharedData = manifest;
      refreshUntouchedFromRepo(manifest);
      return { ok: true, manifest: manifest };
    }
    throw lastError || new Error("Could not save: the repo kept changing. Try again.");
  }

  /** Songs this tab has not touched take the repo's version (keeps open tabs current). */
  function refreshUntouchedFromRepo(repo) {
    if (!repo || !tabBase) return;
    var changed = false;
    loadingShared = true;
    try {
      var pend = pendingSongs();
      var fresh = buildFreshMaps(repo);
      var m = currentMaps();
      [["albums", fresh.albums, m.albums], ["solo", fresh.solo, m.solo], ["arr", fresh.arr, m.arr]].forEach(function (row) {
        var k = row[0], src = row[1], dst = row[2];
        if (!src) return;
        var srcSnap = snapshotOf(src);
        mapSongs(dst, function (a, s) {
          var key = songKeyOf(a, s);
          if (pend[k][key] || !srcSnap[key] || srcSnap[key] === JSON.stringify(s)) return;
          var idx = a.songs.indexOf(s);
          a.songs[idx] = JSON.parse(srcSnap[key]);
          tabBase[k][key] = srcSnap[key];
          changed = true;
        });
      });
      if (changed) {
        if (typeof window.saveAlbums === "function") window.saveAlbums();
        if (typeof window.saveSoloMap === "function") window.saveSoloMap();
        if (typeof window.saveArrangementMap === "function") window.saveArrangementMap();
      }
    } catch (e) {
      console.warn("RIFFJAMS refresh from repo failed", e);
    } finally {
      loadingShared = false;
    }
    if (changed && document.body.classList.contains("sections-mode") && typeof window.showSections === "function") {
      window.showSections(true);
    }
  }

  /** The repo manifest shaped the way this page shows it (same normalization as a fresh browser). */
  function buildFreshMaps(data) {
    var out = { albums: null, solo: null, arr: null };
    if (Array.isArray(data.albums) && data.albums.length) {
      out.albums = clone(data.albums);
      if (typeof window.ensureAllSongSlots === "function") window.ensureAllSongSlots(out.albums);
    }
    if (data.soloMap && Array.isArray(data.soloMap.albums)) out.solo = clone(data.soloMap.albums);
    if (data.arrangementMap && data.arrangementMap.albums && typeof window.normalizeArrangementMap === "function") {
      out.arr = window.normalizeArrangementMap(clone(data.arrangementMap), window.ALBUMS_DEFAULT || window.ALBUMS).albums;
    }
    [out.albums, out.arr].forEach(function (list) {
      if (!list) return;
      if (typeof window.wireWizardO1Lick === "function") window.wireWizardO1Lick(list);
      if (typeof window.wireNibV2Lick === "function") window.wireNibV2Lick(list);
    });
    return out;
  }

  var arrangementSyncTimer = null;
  var arrangementSyncInFlight = false;
  var arrangementSyncQueued = null;

  async function syncArrangementToRepoNow(opts) {
    opts = opts || {};
    if (!TOKEN) {
      if (!opts.quiet && typeof window.setSaveStatus === "function") {
        window.setSaveStatus(opts.reason === "section-rulers"
          ? "Section rulers saved locally — connect GitHub in chip editor to sync to repo"
          : "Times saved locally — connect GitHub in chip editor to sync to repo");
      }
      return { ok: false, reason: "no-token" };
    }
    if (arrangementSyncInFlight) {
      arrangementSyncQueued = opts;
      return { ok: false, reason: "busy" };
    }
    arrangementSyncInFlight = true;
    try {
      var songLabel = opts.song ? String(opts.song) : "arrangement";
      var isRulers = opts.reason === "section-rulers";
      var isChip = opts.reason === "chip-save" || opts.reason === "chip-delete";
      var msg = isRulers
        ? "Sync song section rulers (" + songLabel + ")"
        : (isChip
          ? "Sync chip map (" + songLabel + ")"
          : "Sync arrangement times (" + songLabel + ")");
      if (!opts.quiet && typeof window.setSaveStatus === "function") {
        window.setSaveStatus(isRulers
          ? "Syncing section rulers to GitHub…"
          : (isChip ? "Syncing chip positions to GitHub…" : "Syncing start/stop times to GitHub…"));
      }
      if (opts.reason === "pending") msg = "Sync unsaved edits (" + songLabel + ")";
      var result = await commitWithRebase({ message: msg });
      var manifest = result.manifest || {};
      if (result.skipped) {
        if (!opts.quiet && typeof window.setSaveStatus === "function") window.setSaveStatus("Already up to date");
        return { ok: true, skipped: true, timings: manifest.arrangementTimings };
      }
      if (!opts.quiet && typeof window.setSaveStatus === "function") {
        if (isRulers) window.setSaveStatus("Section rulers synced to repo");
        else if (isChip) window.setSaveStatus("Chip positions synced to repo");
        else {
          var n = (manifest.arrangementTimings || []).length;
          window.setSaveStatus("Times synced to repo (" + n + " timed song" + (n === 1 ? "" : "s") + ")");
        }
      }
      return { ok: true, timings: manifest.arrangementTimings };
    } catch (error) {
      if (/expired|Connect GitHub|Bad credentials/i.test(error.message || "")) rememberToken("");
      if (!opts.quiet && typeof window.setSaveStatus === "function") {
        window.setSaveStatus(error.message || "Could not sync times to repo");
      }
      console.warn("RIFFJAMS arrangement sync failed", error);
      return { ok: false, error: error };
    } finally {
      arrangementSyncInFlight = false;
      if (arrangementSyncQueued) {
        var next = arrangementSyncQueued;
        arrangementSyncQueued = null;
        syncArrangementToRepoNow(next);
      }
    }
  }

  function scheduleArrangementSync(opts) {
    opts = opts || {};
    if (arrangementSyncTimer) clearTimeout(arrangementSyncTimer);
    arrangementSyncTimer = setTimeout(function () {
      arrangementSyncTimer = null;
      syncArrangementToRepoNow(opts);
    }, opts.immediate ? 0 : 1200);
  }

  window.RIFFJAMS_SYNC_ARRANGEMENT_TIMES = function (opts) {
    scheduleArrangementSync(opts || {});
  };
  window.RIFFJAMS_SYNC_ARRANGEMENT_TIMES_NOW = function (opts) {
    return syncArrangementToRepoNow(opts || { immediate: true });
  };

  function injectEditor() {
    var editor = qs("chipEditor");
    var actions = editor && editor.querySelector(".editor-actions");
    if (!editor || !actions || qs("chipClipboardPaste")) return;
    var block = document.createElement("div");
    block.className = "chip-attachment";
    block.innerHTML =
      '<label>Tab screenshot</label>' +
      '<div class="chip-paste-actions">' +
        '<button type="button" class="chip-paste-button" id="chipClipboardPaste">Paste</button>' +
        '<button type="button" class="chip-file-pick" id="chipImageChoose">Choose file</button>' +
      '</div>' +
      '<div class="chip-image-preview" id="chipImagePreview" hidden>' +
        '<img id="chipTabPreview" alt="Tab screenshot preview" hidden>' +
        '<button type="button" id="chipImageClear" class="chip-image-clear" aria-label="Remove screenshot" hidden>×</button>' +
      '</div>' +
      '<input id="chipImageFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>' +
      '<div class="chip-github-connect" id="chipGithubConnect">' +
        '<span id="chipGithubStatus">GitHub connection required</span>' +
        '<button type="button" id="chipGithubOpen">Connect</button>' +
        '<button type="button" id="chipGithubDisconnect" hidden>Disconnect</button>' +
      '</div>' +
      '<div class="chip-token-panel" id="chipTokenPanel" hidden>' +
        '<input id="chipGithubToken" type="password" autocomplete="off" placeholder="Paste fine-grained GitHub token">' +
        '<button type="button" id="chipTokenSave">Authorize</button>' +
        '<small><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create token</a>, select only RIFFJAMS, and give it Contents: read/write access. The token stays only in this browser.</small>' +
      '</div>' +
      '<button type="button" class="chip-attach-save" id="chipAttachSave">Attach &amp; Save</button>' +
      '<div class="chip-attach-status" id="chipAttachStatus" aria-live="polite"></div>';
    editor.insertBefore(block, actions);

    qs("chipClipboardPaste").onclick = pasteClipboardImage;
    qs("chipImageFile").onchange = function () { if (this.files[0]) acceptImage(this.files[0]); this.value = ""; };
    qs("chipImageChoose").onclick = function () { qs("chipImageFile").click(); };
    qs("chipImageClear").onclick = function (event) { event.stopPropagation(); clearPendingImage(); setMessage(""); };
    qs("chipAttachSave").onclick = attachAndSave;
    qs("chipGithubOpen").onclick = function () { qs("chipTokenPanel").hidden = !qs("chipTokenPanel").hidden; qs("chipGithubToken").focus(); };
    qs("chipGithubDisconnect").onclick = function () { rememberToken(""); setMessage("GitHub disconnected."); };
    qs("chipTokenSave").onclick = async function () {
      var token = (qs("chipGithubToken").value || "").trim();
      if (!token) return;
      try {
        setMessage("Connecting to GitHub…");
        await verifyConnection(token);
        qs("chipGithubToken").value = "";
        qs("chipTokenPanel").hidden = true;
        setMessage("GitHub connected", "success");
      } catch (error) {
        TOKEN = "";
        setMessage(error.message || "Could not connect GitHub.", "error");
      }
    };

    editor.addEventListener("paste", function (event) {
      var items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          event.preventDefault();
          acceptImage(items[i].getAsFile());
          return;
        }
      }
    });
  }

  /** Repo is the source of truth. Local copies only win for songs this browser edited and has
   *  not synced yet (riffjams-pending-sync-v1); everything else comes from riffjams-data.json. */
  async function loadSharedData() {
    loadingShared = true;
    var pend = readPending();
    try {
      var response = await fetch(DATA_PATH + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      var data = await response.json();
      if (!data || data.version !== 1) return;
      sharedData = data;
      window.RIFFJAMS_ASSETS = Object.assign({}, data.assets || {});
      var fresh = buildFreshMaps(data);
      if (fresh.albums) {
        var localAlbums = window.ALBUMS;
        if (typeof window.mergeSongMetaInto === "function") window.mergeSongMetaInto(fresh.albums, localAlbums);
        overlayMerged(fresh.albums, localAlbums, pend.albums, pend.albums);
        window.ALBUMS = fresh.albums;
        window.ensureAllSongSlots(window.ALBUMS);
        window.saveAlbums();
      }
      if (fresh.solo) {
        var nextSolo = clone(data.soloMap);
        nextSolo.albums = fresh.solo;
        overlayMerged(nextSolo.albums, (window.SOLO_MAP && window.SOLO_MAP.albums) || [], pend.solo, pend.solo);
        window.SOLO_MAP = nextSolo;
        window.saveSoloMap();
      }
      if (fresh.arr) {
        sharedData.arrangementMap = data.arrangementMap;
        sharedData.arrangementTimings = data.arrangementTimings || [];
        var nextArr = { albums: fresh.arr };
        overlayMerged(nextArr.albums, (window.ARRANGEMENT_MAP && window.ARRANGEMENT_MAP.albums) || [], pend.arr, pend.arr);
        window.ARRANGEMENT_MAP = nextArr;
        if (typeof window.saveArrangementMap === "function") window.saveArrangementMap();
      }
      /* Base = the repo as loaded; carried-over pending songs show up as changes vs that base. */
      var m = currentMaps();
      tabBase = { albums: snapshotOf(fresh.albums || m.albums), solo: snapshotOf(fresh.solo || m.solo), arr: snapshotOf(fresh.arr || m.arr) };
      ["albums", "solo", "arr"].forEach(function (k) {
        Object.keys(pend[k]).forEach(function (key) {
          var src = k === "albums" ? fresh.albums : (k === "solo" ? fresh.solo : fresh.arr);
          var s = src && findSong(src, key);
          if (s) tabBase[k][key] = (typeof pend[k][key] === "string") ? pend[k][key] : "__pending__";
        });
      });
      if (document.body.classList.contains("sections-mode")) window.showSections(true);
      if (document.body.classList.contains("sheet-mode") && window.currentLetter) window.showSeries(window.currentLetter);
    } catch (e) {
      console.warn("RIFFJAMS shared data could not be loaded", e);
    } finally {
      loadingShared = false;
      if (!tabBase) takeTabBase();
    }
    /* Push edits left unsynced by an earlier session (only those songs). */
    if (TOKEN && hasAny(readPending())) {
      scheduleArrangementSync({ quiet: true, reason: "pending", song: "unsaved edits" });
    }
  }

  /* Remember which songs this tab edits (any save path), so they survive a reload until synced. */
  ["saveAlbums", "saveSoloMap", "saveArrangementMap"].forEach(function (name) {
    var orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function () {
      var r = orig.apply(this, arguments);
      try { recordPending(); } catch (e) {}
      return r;
    };
  });
  /* Another tab's localStorage write is that tab's edit (it syncs it itself): adopt it into this
     tab's base so this tab never re-pushes it. */
  if (typeof window.pullAlbumsFromStorage === "function") {
    var origPull = window.pullAlbumsFromStorage;
    window.pullAlbumsFromStorage = function () {
      var before = tabBase ? changedSongs().albums : {};
      var r = origPull.apply(this, arguments);
      if (r && tabBase) {
        mapSongs(window.ALBUMS, function (a, s) {
          var key = songKeyOf(a, s);
          if (!before[key]) tabBase.albums[key] = JSON.stringify(s);
        });
      }
      return r;
    };
  }

  injectEditor();
  loadStoredToken();
  loadSharedData();

  var originalOpen = window.openChipEditor;
  window.openChipEditor = function (anchor, state) {
    clearPendingImage();
    setMessage("");
    originalOpen(anchor, state);
  };
}());
