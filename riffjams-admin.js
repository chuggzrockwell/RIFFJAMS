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
    var empty = qs("chipPasteEmpty");
    if (empty) empty.hidden = false;
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
      var empty = qs("chipPasteEmpty");
      if (empty) empty.hidden = true;
      var clear = qs("chipImageClear");
      if (clear) clear.hidden = false;
      setMessage("Screenshot ready", "success");
    } catch (error) {
      setMessage(error.message || "Could not use that screenshot.", "error");
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
    if (window.soloMode) {
      var soloSong = nextSolo && nextSolo.albums && nextSolo.albums[state.ai] && nextSolo.albums[state.ai].songs[state.si];
      if (!soloSong) throw new Error("The selected song could not be found.");
      while ((soloSong.licks || (soloSong.licks = [])).length <= state.ci) soloSong.licks.push(null);
      soloSong.licks[state.ci] = entry;
    } else {
      var song = nextAlbums[state.ai] && nextAlbums[state.ai].songs[state.si];
      if (!song) throw new Error("The selected song could not be found.");
      while ((song.sections || (song.sections = [])).length <= state.ci) song.sections.push(null);
      song.sections[state.ci] = entry;
    }
    return { albums: nextAlbums, soloMap: nextSolo };
  }

  async function commitAttachment(imageBlob, imagePath, manifest, message) {
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
    var tree = await github(prefix + "/git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: parent.tree.sha,
        tree: [
          { path: imagePath, mode: "100644", type: "blob", sha: imageGitBlob.sha },
          { path: DATA_PATH, mode: "100644", type: "blob", sha: dataGitBlob.sha }
        ]
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
      nextAssets[draft.lick] = imagePath;
      var manifest = {
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: nextAssets,
        albums: next.albums,
        soloMap: next.soloMap
      };
      button.disabled = true;
      button.textContent = "Attaching…";
      setMessage("Saving screenshot and chip to GitHub…");
      await commitAttachment(pendingImage, imagePath, manifest, "Attach " + draft.lick + " tab");
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

  function injectEditor() {
    var editor = qs("chipEditor");
    var actions = editor && editor.querySelector(".editor-actions");
    if (!editor || !actions || qs("chipPasteZone")) return;
    var block = document.createElement("div");
    block.className = "chip-attachment";
    block.innerHTML =
      '<label>Tab screenshot</label>' +
      '<div class="chip-paste-zone" id="chipPasteZone" tabindex="0" role="button" aria-label="Paste or choose a tab screenshot">' +
        '<span id="chipPasteEmpty"><strong>Paste screenshot</strong><small>Ctrl+V, drop, or click to choose</small></span>' +
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

    var zone = qs("chipPasteZone");
    zone.onclick = function (event) { if (!event.target.closest("#chipImageClear")) qs("chipImageFile").click(); };
    zone.ondragover = function (event) { event.preventDefault(); zone.classList.add("dragging"); };
    zone.ondragleave = function () { zone.classList.remove("dragging"); };
    zone.ondrop = function (event) {
      event.preventDefault(); zone.classList.remove("dragging");
      if (event.dataTransfer.files[0]) acceptImage(event.dataTransfer.files[0]);
    };
    qs("chipImageFile").onchange = function () { if (this.files[0]) acceptImage(this.files[0]); this.value = ""; };
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

  async function loadSharedData() {
    try {
      var response = await fetch(DATA_PATH + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) return;
      var data = await response.json();
      if (!data || data.version !== 1) return;
      sharedData = data;
      window.RIFFJAMS_ASSETS = Object.assign({}, data.assets || {});
      if (Array.isArray(data.albums) && data.albums.length) {
        window.ALBUMS = clone(data.albums);
        window.ensureAllSongSlots(window.ALBUMS);
        window.saveAlbums();
      }
      if (data.soloMap && Array.isArray(data.soloMap.albums)) {
        window.SOLO_MAP = clone(data.soloMap);
        window.saveSoloMap();
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

  var originalOpen = window.openChipEditor;
  window.openChipEditor = function (anchor, state) {
    clearPendingImage();
    setMessage("");
    originalOpen(anchor, state);
  };
}());
