/* RIFFJAMS band switch. Load FIRST on every RIFFJAMS page (before any other script).

   ?band=gnr      -> Guns N' Roses.
   ?band=zeppelin -> Led Zeppelin.   No param -> Black Sabbath (unchanged).

   For a non-default band this file:
   - gives the band its own saved data: every localStorage/sessionStorage key is stored as
     "<band>:<key>" (except the few in SHARED), storage events are translated back, and
     BroadcastChannel / IndexedDB names get a band suffix, so the two bands never mix;
   - keeps ?band= on RIFFJAMS links and pop-ups (window.open, rjBandUrl);
   - for a band with its own audio files (Guns N' Roses, Led Zeppelin), replaces the YouTube player
     with a local-audio player that plays the songs from the folder you choose once
     (band.audioFolderHint, e.g. Desktop\Guns N' Roses). Same API as YT.Player, so the
     Song Map / Board player, looping, speed and arrangement timing work unchanged. */
(function () {
  "use strict";
  var qs;
  try { qs = new URLSearchParams(location.search); } catch (e) { qs = null; }
  var want = String((qs && qs.get("band")) || "").toLowerCase();

  /* ---------- Guns N' Roses catalogue (songs = what is on the drive, in track order) ---------- */
  function A(name, cover, font, tuning, songs) {
    return { name: name, cover: cover, font: font, songs: songs.map(function (s) {
      var o = { song: s[0], sections: [] };
      if (tuning) o.tuning = tuning;
      return o;
    }), _files: songs };
  }
  var GNR_RAW = [
    A("Appetite for Destruction", "covers/gnr/appetite.jpg?v=1", "font-paranoid", "Eb", [
      ["Welcome to the Jungle", "WTTJ-", "Appetite For Destruction/01 Welcome To The Jungle.m4a"],
      ["It's So Easy", "ISE-", "Appetite For Destruction/02 It's So Easy.m4a"],
      ["Nightrain", "NTR-", "Appetite For Destruction/03 Nightrain.m4a"],
      ["Out Ta Get Me", "OTGM-", "Appetite For Destruction/04 Out Ta Get Me.m4a"],
      ["Mr. Brownstone", "MRB-", "Appetite For Destruction/05 Mr. Brownstone.m4a"],
      ["Paradise City", "PCTY-", "Appetite For Destruction/06 Paradise City.m4a"],
      ["My Michelle", "MYM-", "Appetite For Destruction/07 My Michelle.m4a"],
      ["Think About You", "TAY-", "Appetite For Destruction/08 Think About You.m4a"],
      ["Sweet Child O' Mine", "SCOM-", "Appetite For Destruction/09 Sweet Child O' Mine.m4a"],
      ["You're Crazy", "YC-", "Appetite For Destruction/10 You're Crazy.m4a"],
      ["Anything Goes", "AG-", "Appetite For Destruction/11 Anything Goes.m4a"],
      ["Rocket Queen", "RQ-", "Appetite For Destruction/12 Rocket Queen.m4a"]
    ]),
    A("G N' R Lies", "covers/gnr/lies.jpg?v=1", "font-sbs", "Eb", [
      ["Reckless Life", "RL-", "G N' R Lies/01 Reckless Life.m4a"],
      ["Nice Boys", "NBY-", "G N' R Lies/02 Nice Boys.m4a"],
      ["Move to the City", "MTTC-", "G N' R Lies/03 Move To The City.m4a"],
      ["Mama Kin", "MK-", "G N' R Lies/04 Mama Kin.m4a"],
      ["Patience", "PAT-", "G N' R Lies/05 Patience.m4a"],
      ["Used to Love Her", "UTLH-", "G N' R Lies/06 Used To Love Her.m4a"],
      ["You're Crazy (Acoustic)", "YCA-", "G N' R Lies/07 You're Crazy.m4a"],
      ["One in a Million", "OIAM-", "G N' R Lies/08 One In A Million.m4a"]
    ]),
    A("Use Your Illusion I", "covers/gnr/uyi1.jpg?v=1", "font-vol4", "Eb", [
      ["Right Next Door to Hell", "RNDH-", "Use Your Illusion I/01 Right Next Door To Hell.m4a"],
      ["Dust N' Bones", "DNB-", "Use Your Illusion I/02 Dust N' Bones.m4a"],
      ["Live and Let Die", "LALD-", "Use Your Illusion I/03 Live And Let Die.m4a"],
      ["Don't Cry", "DC-", "Use Your Illusion I/04 Don't Cry (Original).m4a"],
      ["Perfect Crime", "PCR-", "Use Your Illusion I/05 Perfect Crime.m4a"],
      ["You Ain't the First", "YATF-", "Use Your Illusion I/06 You Ain't The First.m4a"],
      ["Bad Obsession", "BO-", "Use Your Illusion I/07 Bad Obsession.m4a"],
      ["Back Off Bitch", "BOB-", "Use Your Illusion I/08 Back Off Bitch.m4a"],
      ["Double Talkin' Jive", "DTJ-", "Use Your Illusion I/09 Double Talkin' Jive.m4a"],
      ["November Rain", "NR-", "Use Your Illusion I/10 November Rain.m4a"],
      ["The Garden", "TG-", "Use Your Illusion I/11 The Garden.m4a"],
      ["Garden of Eden", "GOE-", "Use Your Illusion I/12 Garden Of Eden.m4a"],
      ["Don't Damn Me", "DDM-", "Use Your Illusion I/13 Don't Damn Me.m4a"],
      ["Bad Apples", "BA-", "Use Your Illusion I/14 Bad Apples.m4a"],
      ["Dead Horse", "DH-", "Use Your Illusion I/15 Dead Horse.m4a"],
      ["Coma", "CMA-", "Use Your Illusion I/16 Coma.m4a"]
    ]),
    A("Use Your Illusion II", "covers/gnr/uyi2.jpg?v=1", "font-vol4", "Eb", [
      ["Civil War", "CW-", "Use Your Illusion II/12 Civil War.m4a"],
      ["14 Years", "FTY-", "Use Your Illusion II/2-02 14 Years.m4a"],
      ["Yesterdays", "YD-", "Use Your Illusion II/2-03 Yesterdays.m4a"],
      ["Knockin' on Heaven's Door", "KOHD-", "Use Your Illusion II/2-04 Knockin' On Heaven's Door.m4a"],
      ["Get in the Ring", "GITR-", "Use Your Illusion II/2-05 Get In The Ring.m4a"],
      ["Shotgun Blues", "SGB-", "Use Your Illusion II/2-06 Shotgun Blues.m4a"],
      ["Breakdown", "BRK-", "Use Your Illusion II/2-07 Breakdown.m4a"],
      ["Pretty Tied Up", "PTU-", "Use Your Illusion II/2-08 Pretty Tied Up.m4a"],
      ["Locomotive", "LOCO-", "Use Your Illusion II/2-09 Locomotive.m4a"],
      ["So Fine", "SOF-", "Use Your Illusion II/2-10 So Fine.m4a"],
      ["Estranged", "EST-", "Use Your Illusion II/2-11 Estranged.m4a"],
      ["You Could Be Mine", "YCBM-", "Use Your Illusion II/2-12 You Could Be Mine.m4a"]
    ]),
    A("Chinese Democracy", "covers/gnr/chinese-democracy.jpg?v=1", "font-sabotage", "", [
      ["Chinese Democracy", "CD-", "Chinese Democracy/01 Chinese Democracy.m4a"],
      ["Shackler's Revenge", "SR-", "Chinese Democracy/02 Shackler's Revenge.m4a"],
      ["Better", "BTR-", "Chinese Democracy/03 Better.m4a"],
      ["Street of Dreams", "SOD-", "Chinese Democracy/04 Street Of Dreams.m4a"],
      ["If the World", "ITW-", "Chinese Democracy/05 If The World.m4a"],
      ["There Was a Time", "TWT-", "Chinese Democracy/06 There Was A Time.m4a"],
      ["Catcher in the Rye", "CITR-", "Chinese Democracy/07 Catcher In The Rye.m4a"],
      ["Scraped", "SCR-", "Chinese Democracy/08 Scraped.m4a"],
      ["Riad N' the Bedouins", "RNB-", "Chinese Democracy/09 Riad N' The Bedouins.m4a"],
      ["Sorry", "SRY-", "Chinese Democracy/10 Sorry.m4a"],
      ["I.R.S.", "IRS-", "Chinese Democracy/11 I.R.S..m4a"],
      ["Madagascar", "MAD-", "Chinese Democracy/12 Madagascar.m4a"],
      ["This I Love", "TIL-", "Chinese Democracy/13 This I Love.m4a"],
      ["Prostitute", "PRO-", "Chinese Democracy/14 Prostitute.m4a"]
    ]),
    A("Live & Rarities", "covers/gnr/live.jpg?v=1", "font-te", "", [
      ["Ain't It Fun", "AIF-", "Greatest Hits/12 Ain't It Fun.mp3"],
      ["Dead Flowers", "DF-", "Live/Dead Flowers.mp3"],
      ["Wild Horses", "WH-", "Live/Wild Horses.mp3"]
    ])
  ];
  var GNR = { albums: [], prefixes: {}, audio: {}, songsterr: {} };
  GNR_RAW.forEach(function (a) {
    GNR.albums.push({ name: a.name, cover: a.cover, font: a.font, songs: a.songs });
    a._files.forEach(function (s) {
      GNR.prefixes[s[0]] = s[1];
      GNR.audio[s[0]] = "local:" + s[2];
      GNR.songsterr[s[0]] = "https://www.songsterr.com/?pattern=" +
        encodeURIComponent("guns n roses " + s[0].replace(/\s*\(.*\)\s*$/, ""));
    });
  });

  /* ---------- Led Zeppelin catalogue (album track order; files are in Desktop\Led Zeppelin) ----------
     Remastered files wherever the drive has them: "Remasters (Disc 1/2)" and "The Complete Led Zeppelin
     (Remastered)"; every other song plays from its album folder. Song: [name, prefix, file, tuning?]
     (tuning only where the song isn't in standard tuning). */
  var R1 = "Led Zeppelin Remasters (Disc 1)/", R2 = "Led Zeppelin Remasters (Disc 2)/";
  var LZ_RAW = [
    ["Led Zeppelin I", "covers/zeppelin/lz1.svg?v=1", "font-paranoid", [
      ["Good Times Bad Times", "GTBT-", R1 + "1-03 Good Times Bad Times.m4a"],
      ["Babe I'm Gonna Leave You", "BIGLY-", R1 + "1-02 Babe I'm Gonna Leave You.m4a"],
      ["You Shook Me", "YSM-", "Led Zeppelin I/03 You Shook Me.m4a"],
      ["Dazed and Confused", "DAC-", R1 + "1-04 Dazed and Confused.m4a"],
      ["Your Time Is Gonna Come", "YTIGC-", "Led Zeppelin I/05 Your Time Is Gonna Come.m4a"],
      ["Black Mountain Side", "BMS-", "Led Zeppelin I/06 Black Mountain Side.m4a", "DADGAD"],
      ["Communication Breakdown", "CB-", R1 + "1-01 Communication Breakdown.m4a"],
      ["I Can't Quit You Baby", "ICQYB-", "Led Zeppelin I/08 I Can't Quit You Baby.m4a"],
      ["How Many More Times", "HMMT-", "Led Zeppelin I/09 How Many More Times.m4a"]
    ]],
    ["Led Zeppelin II", "covers/zeppelin/lz2.svg?v=1", "font-sbs", [
      ["Whole Lotta Love", "WLL-", R1 + "1-05 Whole Lotta Love.m4a"],
      ["What Is and What Should Never Be", "WIWSNB-", "Led Zeppelin II/02 What Is And What Should Never Be.m4a"],
      ["The Lemon Song", "TLS-", "Led Zeppelin II/03 The Lemon Song.m4a"],
      ["Thank You", "TY-", "Led Zeppelin II/04 Thank You.m4a"],
      ["Heartbreaker", "HB-", R1 + "1-06 Heartbreaker.m4a"],
      ["Living Loving Maid (She's Just a Woman)", "LLM-", "Led Zeppelin II/06 Living Loving Maid (She's Just A Woman).m4a"],
      ["Ramble On", "RO-", R1 + "1-07 Ramble On.m4a"],
      ["Moby Dick", "MD-", "Led Zeppelin II/08 Moby Dick.m4a"],
      ["Bring It On Home", "BIOH-", "Led Zeppelin II/09 Bring It On Home.m4a"]
    ]],
    ["Led Zeppelin III", "covers/zeppelin/lz3.svg?v=1", "font-vol4", [
      ["Immigrant Song", "IS-", R1 + "1-08 Immigrant Song.m4a"],
      ["Friends", "FR-", "Led Zeppelin III/02 Friends.m4a", "CACGCE"],
      ["Celebration Day", "CDAY-", R1 + "1-09 Celebration Day.m4a"],
      ["Since I've Been Loving You", "SIBLY-", R1 + "1-10 Since I've Been Loving You.m4a"],
      ["Out on the Tiles", "OOTT-", "Led Zeppelin III/05 Out On The Tiles.m4a"],
      ["Gallows Pole", "GP-", "Led Zeppelin III/06 Gallows Pole.m4a"],
      ["Tangerine", "TAN-", "Led Zeppelin III/07 Tangerine.m4a"],
      ["That's the Way", "TTW-", "Led Zeppelin III/08 That's The Way.m4a", "DGDGBD"],
      ["Bron-Y-Aur Stomp", "BYAS-", "Led Zeppelin III/09 Bron-Y-Aur Stomp.m4a", "CFCFAC"],
      ["Hats Off to (Roy) Harper", "HOTRH-", "Led Zeppelin III/10 Hats Off To (Roy) Harper.m4a"]
    ]],
    ["Led Zeppelin IV", "covers/zeppelin/lz4.svg?v=1", "font-mor", [
      ["Black Dog", "BD-", R1 + "1-11 Black Dog.m4a"],
      ["Rock and Roll", "RAR-", R1 + "1-12 Rock And Roll.m4a"],
      ["The Battle of Evermore", "TBOE-", R1 + "1-13 The Battle of Evermore.m4a"],
      ["Stairway to Heaven", "STH-", R1 + "1-15 Stairway To Heaven.m4a"],
      ["Misty Mountain Hop", "MMH-", R1 + "1-14 Misty Mountain Hop.m4a"],
      ["Four Sticks", "FS-", "Led Zeppelin IV/02 Four Sticks.m4a"],
      ["Going to California", "GTC-", "Led Zeppelin IV/03 Going To California.m4a", "DGDGBD"],
      ["When the Levee Breaks", "WTLB-", "Led Zeppelin IV/08 When The Levee Breaks.m4a"]
    ]],
    ["Houses of the Holy", "covers/zeppelin/hoth.svg?v=1", "font-sabotage", [
      ["The Song Remains the Same", "TSRTS-", R2 + "2-01 Song Remains The Same.m4a"],
      ["The Rain Song", "TRS-", R2 + "2-02 The Rain Song.m4a", "DGCDGD"],
      ["Over the Hills and Far Away", "OTHAFA-", "Houses of the Holy/03 Over The Hills And Far Away.m4a"],
      ["The Crunge", "TCR-", "Houses of the Holy/04 The Crunge.m4a"],
      ["Dancing Days", "DD-", "Houses of the Holy/05 Dancing Days.m4a"],
      ["D'yer Mak'er", "DYM-", R2 + "2-03 D'Yer Mak'er.m4a"],
      ["No Quarter", "NQ-", R2 + "2-04 No Quarter.m4a"],
      ["The Ocean", "TO-", "Houses of the Holy/08 The Ocean.m4a"]
    ]],
    ["Physical Graffiti", "covers/zeppelin/pg.svg?v=1", "font-te", [
      ["Houses of the Holy", "HOTH-", R2 + "2-05 Houses Of The Holy.m4a"],
      ["Trampled Under Foot", "TUF-", R2 + "2-07 Trampled Underfoot.m4a"],
      ["Kashmir", "KSH-", R2 + "2-06 Kashmir.m4a", "DADGAD"],
      ["In the Light", "ITL-", "Physical Graffiti [Disc 2]/2-01 In The Light.m4a"],
      ["Bron-Yr-Aur", "BYA-", "Physical Graffiti [Disc 2]/2-02 Bron-Yr-Aur.m4a"],
      ["Down by the Seaside", "DBTS-", "Physical Graffiti [Disc 2]/2-03 Down By The Seaside.m4a"],
      ["Ten Years Gone", "TYG-", "Physical Graffiti [Disc 2]/2-04 Ten Years Gone.m4a"],
      ["Night Flight", "NF-", "Physical Graffiti [Disc 2]/2-05 Night Flight.m4a"],
      ["The Wanton Song", "TWS-", "Physical Graffiti [Disc 2]/2-06 The Wanton Song.m4a"],
      ["Boogie with Stu", "BWSTU-", "Physical Graffiti [Disc 2]/2-07 Boogie With Stu.m4a"],
      ["Black Country Woman", "BCW-", "Physical Graffiti [Disc 2]/2-08 Black Country Woman.m4a"],
      ["Sick Again", "SA-", "Physical Graffiti [Disc 2]/2-09 Sick Again.m4a"]
    ]],
    ["Presence", "covers/zeppelin/presence.svg?v=1", "font-paranoid", [
      ["Achilles Last Stand", "ALS-", R2 + "2-09 Achilles Last Stand.m4a"],
      ["Nobody's Fault but Mine", "NFBM-", R2 + "2-08 Nobody's Fault But Mine.m4a"]
    ]],
    ["In Through the Out Door", "covers/zeppelin/itod.svg?v=1", "font-sbs", [
      ["In the Evening", "ITE-", R2 + "2-11 In The Evening.m4a"],
      ["South Bound Saurez", "SBSZ-", "In Through the Out Door/02 South Bound Saurez.m4a"],
      ["Fool in the Rain", "FITR-", "In Through the Out Door/03 Fool In The Rain.m4a"],
      ["Hot Dog", "HD-", "In Through the Out Door/04 Hot Dog.m4a"],
      ["Carouselambra", "CAR-", "In Through the Out Door/05 Carouselambra.m4a"],
      ["All My Love", "AML-", R2 + "2-10 All My Love.m4a"],
      ["I'm Gonna Crawl", "IGC-", "In Through the Out Door/07 I'm Gonna Crawl.m4a"]
    ]],
    ["Coda", "covers/zeppelin/coda.svg?v=1", "font-vol4", [
      ["We're Gonna Groove", "WGG-", "Coda/01 We're Gonna Groove.m4a"],
      ["Poor Tom", "PT-", "Coda/02 Poor Tom.m4a"],
      ["I Can't Quit You Baby (Coda)", "ICQYBC-", "Coda/03 I Can't Quit You Baby.m4a"],
      ["Walter's Walk", "WW-", "Coda/04 Walter's Walk.m4a"],
      ["Ozone Baby", "OB-", "Coda/05 Ozone Baby.m4a"],
      ["Darlene", "DAR-", "Coda/06 Darlene.m4a"],
      ["Bonzo's Montreux", "BM-", "Coda/07 Bonzo's Montreux.m4a"],
      ["Wearing and Tearing", "WAT-", "Coda/08 Wearing And Tearing.m4a"]
    ]],
    ["Rarities", "covers/zeppelin/rarities.svg?v=1", "font-te", [
      ["Hey Hey What Can I Do", "HHWCID-", "The Complete Led Zeppelin (Remastered)/10-11 Hey Hey What Can I Do (From _The Complete Studio Recordings_).m4a"]
    ]]
  ];
  var LZ = { albums: [], prefixes: {}, audio: {}, songsterr: {} };
  LZ_RAW.forEach(function (a) {
    LZ.albums.push({ name: a[0], cover: a[1], font: a[2], songs: a[3].map(function (s) {
      var o = { song: s[0], sections: [] };
      if (s[3]) o.tuning = s[3];
      return o;
    }) });
    a[3].forEach(function (s) {
      LZ.prefixes[s[0]] = s[1];
      LZ.audio[s[0]] = "local:" + s[2];
      LZ.songsterr[s[0]] = "https://www.songsterr.com/?pattern=" +
        encodeURIComponent("led zeppelin " + s[0].replace(/\s*\(.*\)\s*$/, ""));
    });
  });

  var BANDS = {
    sabbath: { id: "sabbath", name: "Black Sabbath", short: "Sabbath", dataPath: "riffjams-data.json" },
    zeppelin: {
      id: "zeppelin", name: "Led Zeppelin", short: "Zeppelin", dataPath: "zeppelin-data.json",
      tile: "covers/zeppelin/tile.svg?v=1",
      albums: LZ.albums, prefixes: LZ.prefixes, audio: LZ.audio, songsterr: LZ.songsterr,
      llAlbums: LZ.albums.map(function (a) { return a.name; }),
      audioFolderHint: "Desktop\\Led Zeppelin"
    },
    gnr: {
      id: "gnr", name: "Guns N' Roses", short: "GN'R", dataPath: "gnr-data.json",
      albums: GNR.albums, prefixes: GNR.prefixes, audio: GNR.audio, songsterr: GNR.songsterr,
      llAlbums: GNR.albums.map(function (a) { return a.name; }),
      audioFolderHint: "Desktop\\Guns N' Roses"
    }
  };
  var band = BANDS[want] || BANDS.sabbath;
  window.RJ_BANDS = BANDS;
  window.RJ_BAND = band;
  window.rjIsDefaultBand = band.id === "sabbath";

  /** Saved / shared album lists keep the cover they were stored with; this puts the band's
   *  current cover and font back on each album (so new art shows up). Sabbath: no change. */
  window.rjApplyBandCovers = function (list) {
    if (!band.albums || !Array.isArray(list)) return list;
    var by = {};
    band.albums.forEach(function (a) { by[a.name] = a; });
    list.forEach(function (a) {
      var d = a && by[a.name];
      if (d) { a.cover = d.cover; a.font = d.font; }
    });
    return list;
  };

  /** Add ?band= to a RIFFJAMS URL (relative or same-origin). Leaves other sites alone. */
  window.rjBandUrl = function (url, bandId) {
    var id = bandId || band.id;
    try {
      var u = new URL(String(url), location.href);
      if (u.origin !== location.origin) return url;
      if (id === "sabbath") u.searchParams.delete("band"); else u.searchParams.set("band", id);
      return u.href;
    } catch (e) { return url; }
  };
  if (band.id === "sabbath") return;

  /* ---------- Per-band storage ---------- */
  var NS = band.id + ":";
  var SHARED = { "riffjams-github-token": 1, "riffjams_timer_v1": 1 };
  function nsKey(k) { k = String(k); return SHARED[k] ? k : NS + k; }
  var SP = Storage.prototype;
  var _get = SP.getItem, _set = SP.setItem, _rem = SP.removeItem;
  SP.getItem = function (k) { return _get.call(this, nsKey(k)); };
  SP.setItem = function (k, v) { return _set.call(this, nsKey(k), v); };
  SP.removeItem = function (k) { return _rem.call(this, nsKey(k)); };

  var _add = window.addEventListener;
  window.addEventListener = function (type, fn, opts) {
    if (type !== "storage" || typeof fn !== "function") return _add.call(this, type, fn, opts);
    var wrapped = function (ev) {
      var k = ev.key;
      if (k == null || SHARED[k]) return fn.call(this, ev);
      if (k.indexOf(NS) !== 0) return;
      return fn.call(this, {
        type: "storage", key: k.slice(NS.length), newValue: ev.newValue, oldValue: ev.oldValue,
        storageArea: ev.storageArea, url: ev.url, target: ev.target
      });
    };
    return _add.call(this, type, wrapped, opts);
  };

  if (window.BroadcastChannel) {
    var BC = window.BroadcastChannel;
    var BandBC = function (name) { return new BC(String(name) + ":" + band.id); };
    BandBC.prototype = BC.prototype;
    window.BroadcastChannel = BandBC;
  }
  var _idbOpen = null;
  if (window.indexedDB && window.IDBFactory) {
    _idbOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ver) {
      var n = String(name) + "-" + band.id;
      return ver === undefined ? _idbOpen.call(this, n) : _idbOpen.call(this, n, ver);
    };
  }

  /* Keep the band on RIFFJAMS pop-ups (Board / Playboard windows). */
  var _open = window.open;
  window.open = function (url) {
    var args = Array.prototype.slice.call(arguments);
    if (url) args[0] = window.rjBandUrl(url);
    return _open.apply(window, args);
  };
  /* Same-page navigations made from markup links (e.g. the looper's RIFFJAMS logo). */
  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("data-band-link")) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || /^(mailto|javascript):/i.test(href)) return;
    var next = window.rjBandUrl(a.href);
    if (next !== a.href) a.href = next;
  }, true);
  /* Lets other code and CSS tell which band is on. */
  document.documentElement.setAttribute("data-band", band.id);

  if (!band.audio) return;

  /* ---------- Local-audio player (YT.Player-compatible) ---------- */
  var PS = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  var DB = "rj-band-audio-folder";
  function idb(mode, fn) {
    return new Promise(function (res, rej) {
      if (!_idbOpen) { rej(new Error("no IndexedDB")); return; }
      var o = _idbOpen.call(indexedDB, DB, 1);
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
  var rootHandle = null;
  var urlCache = {};
  var waiting = [];   // players waiting for folder access
  var bannerEl = null;

  function showBanner(msg, btnText, onClick) {
    if (!document.body) { document.addEventListener("DOMContentLoaded", function () { showBanner(msg, btnText, onClick); }); return; }
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "rjAudioFolderBanner";
      bannerEl.style.cssText = "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:99999;" +
        "background:#111;color:#fff;border:2px solid #7030a0;border-radius:10px;padding:10px 14px;" +
        "font:600 14px/1.35 Montserrat,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);" +
        "display:flex;gap:12px;align-items:center;max-width:min(640px,calc(100vw - 32px))";
      document.body.appendChild(bannerEl);
    }
    bannerEl.innerHTML = "";
    var t = document.createElement("span"); t.textContent = msg; bannerEl.appendChild(t);
    if (btnText) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = btnText;
      b.style.cssText = "background:#7030a0;color:#fff;border:0;border-radius:6px;padding:7px 12px;font:inherit;cursor:pointer;white-space:nowrap";
      b.onclick = onClick; bannerEl.appendChild(b);
    }
    var x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = "Close";
    x.style.cssText = "background:none;border:0;color:#aaa;font-size:20px;cursor:pointer;padding:0 2px";
    x.onclick = hideBanner; bannerEl.appendChild(x);
    bannerEl.hidden = false;
  }
  function hideBanner() { if (bannerEl) bannerEl.hidden = true; }

  async function fileFor(path) {
    var parts = path.split("/");
    var dir = rootHandle;
    for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    return (await dir.getFileHandle(parts[parts.length - 1])).getFile();
  }
  /** Folder handle with read permission, or null (then the banner asks for it). */
  async function ensureRoot(interactive) {
    if (!rootHandle) { try { rootHandle = await idb("readonly", function (st) { return st.get("root"); }); } catch (e) { rootHandle = null; } }
    if (!rootHandle) return null;
    var q = { mode: "read" };
    var p = await rootHandle.queryPermission(q);
    if (p === "granted") return rootHandle;
    if (interactive) { p = await rootHandle.requestPermission(q); if (p === "granted") return rootHandle; }
    return null;
  }
  function flushWaiting() { var w = waiting.slice(); waiting = []; w.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      showBanner("Playing your own audio files needs Chrome or Edge on a computer.");
      return;
    }
    try {
      var h = await window.showDirectoryPicker({ id: "rj-" + band.id + "-audio", mode: "read" });
      rootHandle = h;
      try { await idb("readwrite", function (st) { return st.put(h, "root"); }); } catch (e) {}
      urlCache = {};
      hideBanner();
      flushWaiting();
    } catch (e) { /* cancelled */ }
  }
  async function allowFolder() {
    try { if (await ensureRoot(true)) { hideBanner(); flushWaiting(); return; } } catch (e) {}
    pickFolder();
  }
  window.rjChooseAudioFolder = pickFolder;
  function askForFolder() {
    (rootHandle ? Promise.resolve(rootHandle) : idb("readonly", function (st) { return st.get("root"); }).catch(function () { return null; }))
      .then(function (h) {
        if (h) { rootHandle = h; showBanner("Allow RIFFJAMS to play your " + band.name + " files (" + (h.name || "folder") + ").", "Allow", allowFolder); }
        else showBanner("Choose your " + band.name + " music folder (" + band.audioFolderHint + ") to play songs here. The audio stays on your computer.", "Choose folder", pickFolder);
      });
  }
  async function resolveUrl(id) {
    if (urlCache[id]) return urlCache[id];
    var path = String(id).replace(/^local:/, "");
    /* ?audio=<url>: play from a server instead of a chosen folder (same layout as the music folder). */
    var base = qs && qs.get("audio");
    if (base) return (urlCache[id] = base.replace(/\/?$/, "/") + path.split("/").map(encodeURIComponent).join("/"));
    var root = await ensureRoot(false);
    if (!root) return null;
    var file;
    try { file = await fileFor(path); }
    catch (e) {
      showBanner("Couldn't find “" + path + "” in " + (root.name || "the chosen folder") + ". Choose the " + band.name + " folder.", "Choose folder", pickFolder);
      throw e;
    }
    urlCache[id] = URL.createObjectURL(file);
    return urlCache[id];
  }
  function titleFor(id) {
    var t = "";
    Object.keys(band.audio).forEach(function (song) { if (band.audio[song] === id) t = song; });
    return t;
  }

  function LocalPlayer(host, opts) {
    var self = this;
    opts = opts || {};
    var ev = opts.events || {};
    var hostEl = typeof host === "string" ? document.getElementById(host) : host;
    var audio = document.createElement("audio");
    audio.preload = "auto";
    try { audio.preservesPitch = true; audio.mozPreservesPitch = true; audio.webkitPreservesPitch = true; } catch (e) {}
    audio.style.display = "none";
    if (hostEl && hostEl.parentNode) { audio.id = hostEl.id; hostEl.parentNode.replaceChild(audio, hostEl); }
    else (document.body || document.documentElement).appendChild(audio);
    var state = PS.UNSTARTED, vid = "", token = 0, wantPlay = false, vol = 100, muted = false;
    function fire(s) {
      if (s === state) return;
      state = s;
      if (typeof ev.onStateChange === "function") { try { ev.onStateChange({ target: self, data: s }); } catch (e) { setTimeout(function () { throw e; }); } }
    }
    audio.addEventListener("playing", function () { fire(PS.PLAYING); });
    audio.addEventListener("pause", function () { if (!audio.ended && state !== PS.CUED) fire(PS.PAUSED); });
    audio.addEventListener("ended", function () { fire(PS.ENDED); });
    audio.addEventListener("waiting", function () { if (wantPlay) fire(PS.BUFFERING); });

    function load(arg, start, play) {
      var id = arg, s = start;
      if (arg && typeof arg === "object") { id = arg.videoId; s = arg.startSeconds; }
      id = String(id || "");
      if (!id) return;
      var my = ++token;
      vid = id;
      wantPlay = !!play;
      try { audio.pause(); } catch (e) {}
      fire(play ? PS.BUFFERING : PS.UNSTARTED);
      function go() {
        resolveUrl(id).then(function (url) {
          if (my !== token) return;
          if (!url) { waiting.push(go); if (wantPlay) askForFolder(); return; }   // only ask once you press play
          if (audio.src !== url) audio.src = url;
          else if (audio.error) audio.load();   // an earlier attempt failed: try again
          var seek = function () { if (s > 0) { try { audio.currentTime = s; } catch (e) {} } };
          if (audio.readyState >= 1) seek(); else audio.addEventListener("loadedmetadata", seek, { once: true });
          if (wantPlay) self.playVideo(); else fire(PS.CUED);
        }).catch(function () {});
      }
      go();
    }
    this.loadVideoById = function (a, s) { load(a, s, true); };
    this.cueVideoById = function (a, s) { load(a, s, false); };
    this.playVideo = function () {
      wantPlay = true;
      if (!audio.src) { if (vid) load(vid, 0, true); return; }
      if (audio.error) audio.load();
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    };
    this.pauseVideo = function () { wantPlay = false; audio.pause(); if (state === PS.BUFFERING) fire(PS.PAUSED); };
    this.stopVideo = function () { wantPlay = false; audio.pause(); try { audio.currentTime = 0; } catch (e) {} fire(PS.CUED); };
    this.seekTo = function (sec) {
      sec = Math.max(0, +sec || 0);
      if (audio.readyState >= 1) { try { audio.currentTime = sec; } catch (e) {} }
      else audio.addEventListener("loadedmetadata", function () { try { audio.currentTime = sec; } catch (e) {} }, { once: true });
    };
    this.getCurrentTime = function () { return audio.currentTime || 0; };
    this.getDuration = function () { var d = audio.duration; return isFinite(d) ? d : 0; };
    this.getPlayerState = function () { return state; };
    this.getVideoData = function () { return { video_id: vid, title: titleFor(vid), author: band.name }; };
    this.getVideoUrl = function () { return ""; };
    this.getPlaybackRate = function () { return audio.playbackRate || 1; };
    this.setPlaybackRate = function (r) { r = +r; if (r > 0) audio.playbackRate = r; };
    this.getAvailablePlaybackRates = function () { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; };
    this.mute = function () { muted = true; audio.muted = true; };
    this.unMute = function () { muted = false; audio.muted = false; };
    this.isMuted = function () { return muted; };
    this.setVolume = function (v) { vol = Math.max(0, Math.min(100, +v || 0)); audio.volume = vol / 100; };
    this.getVolume = function () { return vol; };
    this.getIframe = function () { return audio; };
    this.destroy = function () { token++; try { audio.pause(); audio.removeAttribute("src"); audio.remove(); } catch (e) {} };
    this.addEventListener = function () {};
    var first = opts.videoId;
    setTimeout(function () {
      if (first) self.cueVideoById(first);
      if (typeof ev.onReady === "function") ev.onReady({ target: self });
    }, 0);
  }
  window.YT = { Player: LocalPlayer, PlayerState: PS, loaded: 1, __rjLocal: true };
})();
