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

  async function commitAttachment(imageBlob, imagePath, manifest, message, deletePaths) {
    var prefix = "/repos/" + REPO_OWNER + "/" + REPO_NAME;
    var ref = await github(prefix + "/git/ref/heads/" + REPO_BRANCH);
    var parentSha = ref.object.sha;
    var parent = await github(prefix + "/git/commits/" + parentSha);
    var imageBase64 = arrayBufferToBase64(await imageBlob.arrayBuffer());
    var imageGitBlob = await github(prefix + "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: imageBase64, encoding: "base64" })
    });
    var dataGitBlob = await github(prefix + "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: textToBase64(JSON.stringify(manifest, null, 2) + "\n"), encoding: "base64" })
    });
    var treeEntries = [
      { path: imagePath, mode: "100644", type: "blob", sha: imageGitBlob.sha },
      { path: DATA_PATH, mode: "100644", type: "blob", sha: dataGitBlob.sha }
    ];
    (deletePaths || []).forEach(function (path) {
      if (path && path !== imagePath) treeEntries.push({ path: path, mode: "100644", type: "blob", sha: null });
    });
    var tree = await github(prefix + "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: treeEntries
      })
    });
    var commit = await github(prefix + "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: message, tree: tree.sha, parents: [parentSha] })
    });
    await github(prefix + "/git/refs/heads/" + REPO_BRANCH, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return commit;
  }

  async function attachAndSave() {
    var button = qs("chipAttachSave");
    try {
      if (!pendingImage) throw new Error("Paste or choose a screenshot first.");
      if (!TOKEN) throw new Error("Connect GitHub first.");
      var draft = readDraft();
      var next = buildNextState(draft);
      var imagePath = IMAGE_DIR + "/" + draft.lick + ".png";
      var nextAssets = Object.assign({}, sharedData.assets || {}, window.RIFFJAMS_ASSETS || {});
      var deletePaths = [];
      if (next.previousLick && next.previousLick !== draft.lick && !tabIsStillLinked(next.albums, next.soloMap, next.previousLick)) {
        var previousPath = nextAssets[next.previousLick] || "";
        if (previousPath.indexOf(IMAGE_DIR + "/") === 0) deletePaths.push(previousPath);
        delete nextAssets[next.previousLick];
      }
      nextAssets[draft.lick] = imagePath;
      var arrPack = (typeof window.exportArrangementForRepo === "function")
        ? window.exportArrangementForRepo()
        : { arrangementMap: sharedData.arrangementMap || null, arrangementTimings: sharedData.arrangementTimings || [] };
      var manifest = {
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: nextAssets,
        albums: next.albums,
        soloMap: next.soloMap,
        arrangementMap: arrPack.arrangementMap || null,
        arrangementTimings: arrPack.arrangementTimings || []
      };
      button.disabled = true;
      button.textContent = "Attaching…";
      setMessage("Saving screenshot and chip to GitHub…");
      await commitAttachment(pendingImage, imagePath, manifest, "Attach " + draft.lick + " tab", deletePaths);
      sharedData = manifest;
      window.RIFFJAMS_ASSETS = nextAssets;
      window.ALBUMS = next.albums;
      window.SOLO_MAP = next.soloMap;
      window.saveAlbums();
      window.saveSoloMap();
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


  async function commitManifestOnly(manifest, message) {
    var prefix = "/repos/" + REPO_OWNER + "/" + REPO_NAME;
    var ref = await github(prefix + "/git/ref/heads/" + REPO_BRANCH);
    var parentSha = ref.object.sha;
    var parent = await github(prefix + "/git/commits/" + parentSha);
    var dataGitBlob = await github(prefix + "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: textToBase64(JSON.stringify(manifest, null, 2) + "\n"), encoding: "base64" })
    });
    var tree = await github(prefix + "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [{ path: DATA_PATH, mode: "100644", type: "blob", sha: dataGitBlob.sha }]
      })
    });
    var commit = await github(prefix + "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message: message, tree: tree.sha, parents: [parentSha] })
    });
    await github(prefix + "/git/refs/heads/" + REPO_BRANCH, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return commit;
  }

  var arrangementSyncTimer = null;
  var arrangementSyncInFlight = false;
  var arrangementSyncQueued = null;

  function buildManifestWithArrangement() {
    var arrPack = (typeof window.exportArrangementForRepo === "function")
      ? window.exportArrangementForRepo()
      : { arrangementMap: null, arrangementTimings: [] };
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      assets: Object.assign({}, sharedData.assets || {}, window.RIFFJAMS_ASSETS || {}),
      albums: clone(window.ALBUMS || sharedData.albums || []),
      soloMap: clone(window.SOLO_MAP || sharedData.soloMap || { albums: [] }),
      arrangementMap: arrPack.arrangementMap || null,
      arrangementTimings: arrPack.arrangementTimings || []
    };
  }

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
      var manifest = buildManifestWithArrangement();
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
      await commitManifestOnly(manifest, msg);
      sharedData = manifest;
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

  /** Prefer local chip rows that already store an explicit position (pair[3]), so a refresh
   *  of riffjams-data.json does not wipe chip-editor saves that have not been pushed yet. */
  function mergeChipsPreferLocalPos(remoteAlbums, localAlbums, field) {
    if (!Array.isArray(remoteAlbums) || !remoteAlbums.length) return localAlbums || remoteAlbums;
    if (!Array.isArray(localAlbums) || !localAlbums.length) return remoteAlbums;
    var localBySong = {};
    localAlbums.forEach(function (a) {
      (a.songs || []).forEach(function (s) {
        if (s && s.song) localBySong[s.song] = s;
      });
    });
    remoteAlbums.forEach(function (a) {
      (a.songs || []).forEach(function (s) {
        if (!s || !s.song) return;
        var loc = localBySong[s.song];
        if (!loc) return;
        var localField = loc[field] || [];
        var remoteField = s[field] || (s[field] = []);
        var byCode = {};
        localField.forEach(function (p) {
          if (p && p[0]) byCode[String(p[0])] = p;
        });
        remoteField.forEach(function (p, i) {
          if (!p || !p[0]) return;
          var lp = byCode[String(p[0])];
          if (!lp) return;
          if (lp.length > 3) remoteField[i] = clone(lp);
        });
        /* Also keep local-only chips that only exist locally with an explicit pos */
        localField.forEach(function (lp, i) {
          if (!lp || !lp[0] || lp.length <= 3) return;
          var code = String(lp[0]);
          var found = remoteField.some(function (p) { return p && String(p[0]) === code; });
          if (!found) {
            if (i < remoteField.length && !remoteField[i]) remoteField[i] = clone(lp);
            else remoteField.push(clone(lp));
          }
        });
      });
    });
    return remoteAlbums;
  }

  async function loadSharedData() {
    try {
      var response = await fetch(DATA_PATH + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      var data = await response.json();
      if (!data || data.version !== 1) return;
      sharedData = data;
      window.RIFFJAMS_ASSETS = Object.assign({}, data.assets || {});
      if (Array.isArray(data.albums) && data.albums.length) {
        var localAlbums = window.ALBUMS;
        var nextAlbums = clone(data.albums);
        if (typeof window.mergeSongMetaInto === "function") {
          window.mergeSongMetaInto(nextAlbums, localAlbums);
        }
        mergeChipsPreferLocalPos(nextAlbums, localAlbums, "sections");
        window.ALBUMS = nextAlbums;
        window.ensureAllSongSlots(window.ALBUMS);
        window.saveAlbums();
      }
      if (data.soloMap && Array.isArray(data.soloMap.albums)) {
        var localSolo = window.SOLO_MAP;
        var nextSolo = clone(data.soloMap);
        if (nextSolo && nextSolo.albums) {
          mergeChipsPreferLocalPos(nextSolo.albums, (localSolo && localSolo.albums) || [], "licks");
        }
        window.SOLO_MAP = nextSolo;
        window.saveSoloMap();
      }
      if (data.arrangementMap && data.arrangementMap.albums) {
        sharedData.arrangementMap = data.arrangementMap;
        sharedData.arrangementTimings = data.arrangementTimings || [];
        try {
          var localRaw = localStorage.getItem("lick-arrangement-map-v1");
          var localEmpty = !localRaw || localRaw === "null";
          if (localEmpty && typeof window.normalizeArrangementMap === "function") {
            window.ARRANGEMENT_MAP = window.normalizeArrangementMap(clone(data.arrangementMap), window.ALBUMS_DEFAULT || window.ALBUMS);
            if (typeof window.saveArrangementMap === "function") window.saveArrangementMap();
          }
        } catch (eArrHydrate) {}
      }
      if (document.body.classList.contains("sections-mode")) window.showSections(true);
      if (document.body.classList.contains("sheet-mode") && window.currentLetter) window.showSeries(window.currentLetter);
    } catch (e) {
      console.warn("RIFFJAMS shared data could not be loaded", e);
    }
  }

  injectEditor();
  loadStoredToken();
  loadSharedData();
  /* After local arrangement loads, push start/implied-stop times to the repo when GitHub is connected */
  setTimeout(function () {
    if (TOKEN && typeof window.exportArrangementForRepo === "function") {
      var pack = window.exportArrangementForRepo();
      if (pack && pack.arrangementTimings && pack.arrangementTimings.length) {
        scheduleArrangementSync({ quiet: true, reason: "startup", song: "startup" });
      }
    }
  }, 2500);

  var originalOpen = window.openChipEditor;
  window.openChipEditor = function (anchor, state) {
    clearPendingImage();
    setMessage("");
    originalOpen(anchor, state);
  };
}());
