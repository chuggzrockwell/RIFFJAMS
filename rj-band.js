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
      /* The UYI II copy of this one is a broken 3-second file; the Greatest Hits copy is the full track. */
      ["You Could Be Mine", "YCBM-", "Greatest Hits/07 You Could be Mine.mp3"]
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
  /* YouTube fallback: official album uploads (Guns N' Roses - Topic / GunsNRosesVEVO, from YouTube
     Music's album track lists). Each one's length matches the music file to within 2 s, so chip
     timings carry over. Dead Flowers / Wild Horses have no matching official upload. */
  var GNR_YT = {
    "Welcome to the Jungle": "o1tj2zJ2Wvg",
    "It's So Easy": "FMbl1ntpIXQ",
    "Nightrain": "VMDljoM5JFI",
    "Out Ta Get Me": "gORKiQ0h1ZA",
    "Mr. Brownstone": "27rKrR424cA",
    "Paradise City": "Rbm6GXllBiw",
    "My Michelle": "scmvAg_S97k",
    "Think About You": "UPlP54CS0eo",
    "Sweet Child O' Mine": "1w7OgIMMRc4",
    "You're Crazy": "e3EQ0xP50u0",
    "Anything Goes": "c8H8a5Bab6o",
    "Rocket Queen": "YxW9iekNSek",
    "Reckless Life": "G4CfGsBz9aY",
    "Nice Boys": "3MYQA85Vx7s",
    "Move to the City": "BGdtq9mB7Xk",
    "Mama Kin": "Wa-SmFQCstE",
    "Patience": "ErvgV4P6Fzc",
    "Used to Love Her": "FDIvIb06abI",
    "You're Crazy (Acoustic)": "OIduTH7NYA8",
    "One in a Million": "kgIRClKD4RI",
    "Right Next Door to Hell": "4cQg8k3Znvw",
    "Dust N' Bones": "2yFm2EkjLN4",
    "Live and Let Die": "6D9vAItORgE",
    "Don't Cry": "zRIbf6JqkNc",
    "Perfect Crime": "e-mMVVqE9UI",
    "You Ain't the First": "XYb4MFHjU3E",
    "Bad Obsession": "-3tFB6k64js",
    "Back Off Bitch": "U0VCUzZMReU",
    "Double Talkin' Jive": "tbzQX1fEHXA",
    "November Rain": "8SbUC-UaAxE",
    "The Garden": "s20h7uJ8CCI",
    "Garden of Eden": "LuhLVl5qf2A",
    "Don't Damn Me": "_EOrZ5JMgfk",
    "Bad Apples": "D9cqJfwESV0",
    "Dead Horse": "u8X76NRiQLQ",
    "Coma": "vyV6Lw6t-O4",
    "Civil War": "-ucDiz3GYrg",
    "14 Years": "fBYsbYyYmNs",
    "Yesterdays": "NDOPlpH6NZM",
    "Knockin' on Heaven's Door": "k04tX2fvh0o",
    "Get in the Ring": "LnQ_zhVWhH8",
    "Shotgun Blues": "s2k9qaOdsGU",
    "Breakdown": "bpkd4aF2_FE",
    "Pretty Tied Up": "PAQIchLSYmk",
    "Locomotive": "T43HujTS8Uo",
    "So Fine": "i-pvfV0pBWE",
    "Estranged": "dpmAY059TTY",
    "You Could Be Mine": "6Sp1bLrBAuQ",
    "Chinese Democracy": "FfIZr38DLSg",
    "Shackler's Revenge": "IyF1GhEaSPo",
    "Better": "tVKtLfFD8Po",
    "Street of Dreams": "Fm-KLUZM-Tg",
    "If the World": "uPVmq3VZFaA",
    "There Was a Time": "bAZO90z52Rg",
    "Catcher in the Rye": "4PNNzSNtihI",
    "Scraped": "L3IA-EDQgsU",
    "Riad N' the Bedouins": "ln6g0s58j9o",
    "Sorry": "BPKHZtggOOw",
    "I.R.S.": "7kPHj6QrLbU",
    "Madagascar": "VWiX-MKTUTY",
    "This I Love": "aOkiG53ituQ",
    "Prostitute": "QELsjWL5WeU",
    "Ain't It Fun": "emRAZ9S86Us"
  };
  /* Direct Songsterr tabs (E Standard version where one exists). Songs not listed fall back to a search. */
  var GNR_TABS = {
    "Welcome to the Jungle": "https://www.songsterr.com/a/wsa/guns-n-roses-welcome-to-the-jungle-e-standard-tab-s2722673",
    "It's So Easy": "https://www.songsterr.com/a/wsa/guns-n-roses-its-so-easy-tab-s37033",
    "Nightrain": "https://www.songsterr.com/a/wsa/guns-n-roses-nightrain-e-standard-tab-s5148893",
    "Out Ta Get Me": "https://www.songsterr.com/a/wsa/guns-n-roses-out-ta-get-me-tab-s8510",
    "Mr. Brownstone": "https://www.songsterr.com/a/wsa/guns-n-roses-mr-brownstone-tab-s336",
    "Paradise City": "https://www.songsterr.com/a/wsa/guns-n-roses-paradise-city-e-standard-tab-s4358730",
    "My Michelle": "https://www.songsterr.com/a/wsa/guns-n-roses-my-michelle-tab-s8273",
    "Think About You": "https://www.songsterr.com/a/wsa/guns-n-roses-think-about-you-e-tuning-tab-s509564",
    "Sweet Child O' Mine": "https://www.songsterr.com/a/wsa/guns-n-roses-sweet-child-o-mine-e-standard-tuning-tab-s5922016",
    "You're Crazy": "https://www.songsterr.com/a/wsa/guns-n-roses-youre-crazy-tab-s7989",
    "Anything Goes": "https://www.songsterr.com/a/wsa/guns-n-roses-anything-goes-tab-s8432",
    "Rocket Queen": "https://www.songsterr.com/a/wsa/guns-n-roses-rocket-queen-tab-s527",
    "Reckless Life": "https://www.songsterr.com/a/wsa/guns-n-roses-reckless-life-tab-s8490",
    "Nice Boys": "https://www.songsterr.com/a/wsa/guns-n-roses-nice-boys-tab-s8254",
    "Move to the City": "https://www.songsterr.com/a/wsa/guns-n-roses-move-to-the-city-tab-s7995",
    "Mama Kin": "https://www.songsterr.com/a/wsa/guns-n-roses-mama-kin-tab-s8300",
    "Patience": "https://www.songsterr.com/a/wsa/guns-n-roses-patience-tab-s172",
    "Used to Love Her": "https://www.songsterr.com/a/wsa/guns-n-roses-used-to-love-her-tab-s8409",
    "You're Crazy (Acoustic)": "https://www.songsterr.com/a/wsa/guns-n-roses-youre-crazy-acoustic-tab-s194774",
    "One in a Million": "https://www.songsterr.com/a/wsa/guns-n-roses-one-in-a-million-tab-s23733",
    "Right Next Door to Hell": "https://www.songsterr.com/a/wsa/guns-n-roses-right-next-door-to-hell-tab-s8349",
    "Dust N' Bones": "https://www.songsterr.com/a/wsa/guns-n-roses-dust-n-bones-tab-s8021",
    "Live and Let Die": "https://www.songsterr.com/a/wsa/guns-n-roses-live-and-let-die-tab-s22292",
    "Don't Cry": "https://www.songsterr.com/a/wsa/guns-n-roses-dont-cry-e-standard-tab-s2578773",
    "Perfect Crime": "https://www.songsterr.com/a/wsa/guns-n-roses-perfect-crime-tab-s36999",
    "You Ain't the First": "https://www.songsterr.com/a/wsa/guns-n-roses-you-aint-the-first-tab-s37031",
    "Bad Obsession": "https://www.songsterr.com/a/wsa/guns-n-roses-bad-obsession-tab-s8266",
    "Back Off Bitch": "https://www.songsterr.com/a/wsa/guns-n-roses-back-off-bitch-tab-s8447",
    "Double Talkin' Jive": "https://www.songsterr.com/a/wsa/guns-n-roses-double-talkin-jive-tab-s8190",
    "November Rain": "https://www.songsterr.com/a/wsa/guns-n-roses-november-rain-e-standard-and-7-string-standard-tab-s2922948",
    "The Garden": "https://www.songsterr.com/a/wsa/guns-n-roses-the-garden-tab-s25163",
    "Garden of Eden": "https://www.songsterr.com/a/wsa/guns-n-roses-garden-of-eden-tab-s8568",
    "Don't Damn Me": "https://www.songsterr.com/a/wsa/guns-n-roses-dont-damn-me-solo-tab-s8096",
    "Bad Apples": "https://www.songsterr.com/a/wsa/guns-n-roses-bad-apples-tab-s23222",
    "Dead Horse": "https://www.songsterr.com/a/wsa/guns-n-roses-dead-horse-tab-s8315",
    "Coma": "https://www.songsterr.com/a/wsa/guns-n-roses-coma-tab-s8381",
    "Civil War": "https://www.songsterr.com/a/wsa/guns-n-roses-civil-war-e-standard-tab-s4057847",
    "14 Years": "https://www.songsterr.com/a/wsa/guns-n-roses-14-years-tab-s8435",
    "Yesterdays": "https://www.songsterr.com/a/wsa/guns-n-roses-yesterdays-solo-tab-s8174",
    "Knockin' on Heaven's Door": "https://www.songsterr.com/a/wsa/guns-n-roses-knockin-on-heavens-door-standard-tuned-tab-tab-s395315",
    "Get in the Ring": "https://www.songsterr.com/a/wsa/guns-n-roses-get-in-the-ring-tab-s8186",
    "Shotgun Blues": "https://www.songsterr.com/a/wsa/guns-n-roses-shotgun-blues-tab-s8239",
    "Breakdown": "https://www.songsterr.com/a/wsa/guns-n-roses-breakdown-tab-s36995",
    "Pretty Tied Up": "https://www.songsterr.com/a/wsa/guns-n-roses-pretty-tied-up-tab-s37017",
    "Locomotive": "https://www.songsterr.com/a/wsa/guns-n-roses-locomotive-complicity-tab-s36996",
    "So Fine": "https://www.songsterr.com/a/wsa/guns-n-roses-so-fine-solo-tab-s23322",
    "Estranged": "https://www.songsterr.com/a/wsa/guns-n-roses-estranged-e-standard-tab-s5405730",
    "You Could Be Mine": "https://www.songsterr.com/a/wsa/guns-n-roses-you-could-be-mine-standard-tuning-tab-s535294",
    "Chinese Democracy": "https://www.songsterr.com/a/wsa/guns-n-roses-chinese-democracy-tab-s23165",
    "Shackler's Revenge": "https://www.songsterr.com/a/wsa/guns-n-roses-shacklers-revenge-tab-s37014",
    "Better": "https://www.songsterr.com/a/wsa/guns-n-roses-better-tab-s23225",
    "Street of Dreams": "https://www.songsterr.com/a/wsa/guns-n-roses-street-of-dreams-tab-s37035",
    "If the World": "https://www.songsterr.com/a/wsa/guns-n-roses-if-the-world-tab-s70664",
    "There Was a Time": "https://www.songsterr.com/a/wsa/guns-n-roses-there-was-a-time-tab-s37037",
    "Catcher in the Rye": "https://www.songsterr.com/a/wsa/guns-n-roses-catcher-in-the-rye-v2-tab-s1469290",
    "Scraped": "https://www.songsterr.com/a/wsa/guns-n-roses-scraped-tab-s603158",
    "Riad N' the Bedouins": "https://www.songsterr.com/a/wsa/guns-n-roses-riad-n-the-bedouins-tab-s442999",
    "Sorry": "https://www.songsterr.com/a/wsa/guns-n-roses-sorry-tab-s407804",
    "I.R.S.": "https://www.songsterr.com/a/wsa/guns-n-roses-irs-tab-s37028",
    "Madagascar": "https://www.songsterr.com/a/wsa/guns-n-roses-madagascar-tab-s37003",
    "This I Love": "https://www.songsterr.com/a/wsa/guns-n-roses-this-i-love-tab-s37025",
    "Prostitute": "https://www.songsterr.com/a/wsa/guns-n-roses-prostitute-tab-s70637",
    "Ain't It Fun": "https://www.songsterr.com/a/wsa/guns-n-roses-aint-it-fun-solo-tab-s23221",
    "Wild Horses": "https://www.songsterr.com/a/wsa/guns-n-roses-wild-horses-tab-s6951134"
  };
  var GNR = { albums: [], prefixes: {}, audio: {}, local: {}, yt: GNR_YT, songsterr: {} };
  GNR_RAW.forEach(function (a) {
    GNR.albums.push({ name: a.name, cover: a.cover, font: a.font, songs: a.songs });
    a._files.forEach(function (s) {
      GNR.prefixes[s[0]] = s[1];
      GNR.local[s[0]] = "local:" + s[2];
      /* Direct tab (E Standard version where one exists); otherwise a search for the E Standard version. */
      GNR.songsterr[s[0]] = GNR_TABS[s[0]] || "https://www.songsterr.com/?pattern=" +
        encodeURIComponent("guns n roses " + s[0].replace(/\s*\(.*\)\s*$/, "") + " e standard");
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
  /* Direct Songsterr tabs (main studio version). Songs not listed fall back to a search. */
  var LZ_TABS = {
    "Good Times Bad Times": "https://www.songsterr.com/a/wsa/led-zeppelin-good-times-bad-times-tab-s346",
    "Babe I'm Gonna Leave You": "https://www.songsterr.com/a/wsa/led-zeppelin-babe-im-gonna-leave-you-tab-s6732",
    "You Shook Me": "https://www.songsterr.com/a/wsa/led-zeppelin-you-shook-me-tab-s7326",
    "Dazed and Confused": "https://www.songsterr.com/a/wsa/led-zeppelin-dazed-and-confused-tab-s11497",
    "Black Mountain Side": "https://www.songsterr.com/a/wsa/led-zeppelin-black-mountain-side-tab-s11874",
    "Communication Breakdown": "https://www.songsterr.com/a/wsa/led-zeppelin-communication-breakdown-tab-s208",
    "How Many More Times": "https://www.songsterr.com/a/wsa/led-zeppelin-how-many-more-times-tab-s11789",
    "Whole Lotta Love": "https://www.songsterr.com/a/wsa/led-zeppelin-whole-lotta-love-tab-s449",
    "What Is and What Should Never Be": "https://www.songsterr.com/a/wsa/led-zeppelin-what-is-and-what-should-never-be-tab-s11998",
    "The Lemon Song": "https://www.songsterr.com/a/wsa/led-zeppelin-the-lemon-song-tab-s1395",
    "Thank You": "https://www.songsterr.com/a/wsa/led-zeppelin-thank-you-tab-s22715",
    "Heartbreaker": "https://www.songsterr.com/a/wsa/led-zeppelin-heartbreaker-tab-s352",
    "Living Loving Maid (She's Just a Woman)": "https://www.songsterr.com/a/wsa/led-zeppelin-living-loving-maid-tab-s72789",
    "Ramble On": "https://www.songsterr.com/a/wsa/led-zeppelin-ramble-on-tab-s22711",
    "Moby Dick": "https://www.songsterr.com/a/wsa/led-zeppelin-moby-dick-tab-s11830",
    "Bring It On Home": "https://www.songsterr.com/a/wsa/led-zeppelin-bring-it-on-home-tab-s18646",
    "Immigrant Song": "https://www.songsterr.com/a/wsa/led-zeppelin-immigrant-song-tab-s568",
    "Friends": "https://www.songsterr.com/a/wsa/led-zeppelin-friends-tab-s11802",
    "Celebration Day": "https://www.songsterr.com/a/wsa/led-zeppelin-celebration-day-tab-s22690",
    "Since I've Been Loving You": "https://www.songsterr.com/a/wsa/led-zeppelin-since-ive-been-loving-you-solo-tab-s1396",
    "Out on the Tiles": "https://www.songsterr.com/a/wsa/led-zeppelin-out-on-the-tiles-tab-s11849",
    "Tangerine": "https://www.songsterr.com/a/wsa/led-zeppelin-tangerine-solo-tab-s22712",
    "That's the Way": "https://www.songsterr.com/a/wsa/led-zeppelin-thats-the-way-tab-s22602",
    "Hats Off to (Roy) Harper": "https://www.songsterr.com/a/wsa/led-zeppelin-hats-off-to-roy-harper-tab-s22695",
    "Black Dog": "https://www.songsterr.com/a/wsa/led-zeppelin-black-dog-tab-s363",
    "Rock and Roll": "https://www.songsterr.com/a/wsa/led-zeppelin-rock-and-roll-tab-s11537",
    "The Battle of Evermore": "https://www.songsterr.com/a/wsa/led-zeppelin-the-battle-of-evermore-tab-s11811",
    "Stairway to Heaven": "https://www.songsterr.com/a/wsa/led-zeppelin-stairway-to-heaven-solo-tab-s27",
    "Misty Mountain Hop": "https://www.songsterr.com/a/wsa/led-zeppelin-misty-mountain-hop-tab-s22700",
    "Four Sticks": "https://www.songsterr.com/a/wsa/led-zeppelin-four-sticks-tab-s22694",
    "Going to California": "https://www.songsterr.com/a/wsa/led-zeppelin-going-to-california-tab-s154",
    "When the Levee Breaks": "https://www.songsterr.com/a/wsa/led-zeppelin-when-the-levee-breaks-tab-s11512",
    "The Song Remains the Same": "https://www.songsterr.com/a/wsa/led-zeppelin-the-song-remains-the-same-tab-s23802",
    "The Rain Song": "https://www.songsterr.com/a/wsa/led-zeppelin-the-rain-song-tab-s11951",
    "Over the Hills and Far Away": "https://www.songsterr.com/a/wsa/led-zeppelin-over-the-hills-and-far-away-tab-s11714",
    "The Crunge": "https://www.songsterr.com/a/wsa/led-zeppelin-the-crunge-tab-s22716",
    "Dancing Days": "https://www.songsterr.com/a/wsa/led-zeppelin-dancing-days-tab-s11459",
    "D'yer Mak'er": "https://www.songsterr.com/a/wsa/led-zeppelin-dyer-maker-tab-s23204",
    "No Quarter": "https://www.songsterr.com/a/wsa/led-zeppelin-no-quarter-tab-s22701",
    "The Ocean": "https://www.songsterr.com/a/wsa/led-zeppelin-the-ocean-tab-s11909",
    "Houses of the Holy": "https://www.songsterr.com/a/wsa/led-zeppelin-houses-of-the-holy-tab-s22697",
    "Trampled Under Foot": "https://www.songsterr.com/a/wsa/led-zeppelin-trampled-under-foot-tab-s11859",
    "Kashmir": "https://www.songsterr.com/a/wsa/led-zeppelin-kashmir-e-standard-tab-s6093465",
    "In the Light": "https://www.songsterr.com/a/wsa/led-zeppelin-in-the-light-tab-s27722",
    "Down by the Seaside": "https://www.songsterr.com/a/wsa/led-zeppelin-down-by-the-seaside-solo-tab-s11962",
    "Ten Years Gone": "https://www.songsterr.com/a/wsa/led-zeppelin-ten-years-gone-tab-s22714",
    "Night Flight": "https://www.songsterr.com/a/wsa/led-zeppelin-night-flight-tab-s22702",
    "The Wanton Song": "https://www.songsterr.com/a/wsa/led-zeppelin-the-wanton-song-tab-s22717",
    "Boogie with Stu": "https://www.songsterr.com/a/wsa/led-zeppelin-boogie-with-stu-tab-s41409",
    "Black Country Woman": "https://www.songsterr.com/a/wsa/led-zeppelin-black-country-woman-tab-s11475",
    "Sick Again": "https://www.songsterr.com/a/wsa/led-zeppelin-sick-again-tab-s11465",
    "Achilles Last Stand": "https://www.songsterr.com/a/wsa/led-zeppelin-achilles-last-stand-solo-tab-s11731",
    "Nobody's Fault but Mine": "https://www.songsterr.com/a/wsa/led-zeppelin-nobodys-fault-but-mine-tab-s11780",
    "In the Evening": "https://www.songsterr.com/a/wsa/led-zeppelin-in-the-evening-tab-s36155",
    "South Bound Saurez": "https://www.songsterr.com/a/wsa/led-zeppelin-south-bound-saurez-tab-s11921",
    "Fool in the Rain": "https://www.songsterr.com/a/wsa/led-zeppelin-fool-in-the-rain-tab-s22692",
    "Hot Dog": "https://www.songsterr.com/a/wsa/led-zeppelin-hot-dog-tab-s11590",
    "Carouselambra": "https://www.songsterr.com/a/wsa/led-zeppelin-carouselambra-tab-s41419",
    "All My Love": "https://www.songsterr.com/a/wsa/led-zeppelin-all-my-love-tab-s41089",
    "I'm Gonna Crawl": "https://www.songsterr.com/a/wsa/led-zeppelin-im-gonna-crawl-tab-s22698",
    "We're Gonna Groove": "https://www.songsterr.com/a/wsa/led-zeppelin-were-gonna-groove-tab-s41410",
    "Poor Tom": "https://www.songsterr.com/a/wsa/led-zeppelin-poor-tom-tab-s11522",
    "Walter's Walk": "https://www.songsterr.com/a/wsa/led-zeppelin-walters-walk-tab-s12042",
    "Ozone Baby": "https://www.songsterr.com/a/wsa/led-zeppelin-ozone-baby-tab-s11870",
    "Darlene": "https://www.songsterr.com/a/wsa/led-zeppelin-darlene-tab-s11646",
    "Bonzo's Montreux": "https://www.songsterr.com/a/wsa/led-zeppelin-bonzos-montreux-tab-s92499",
    "Wearing and Tearing": "https://www.songsterr.com/a/wsa/led-zeppelin-wearing-and-tearing-tab-s11526"
  };
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
      LZ.songsterr[s[0]] = LZ_TABS[s[0]] || "https://www.songsterr.com/?pattern=" +
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
      localAudio: GNR.local, ytAudio: GNR.yt,   /* files first, official YouTube uploads as fallback */
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
  var DB = "rj-band-audio-folder-" + band.id;   /* one saved music folder per band */
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
      bannerEl.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:99999;" +
        "background:#111;color:#fff;border:2px solid #7030a0;border-radius:10px;padding:10px 14px;" +
        "font:600 14px/1.35 Montserrat,'Segoe UI',sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);" +
        "display:flex;gap:12px;align-items:center;max-width:min(520px,45vw)";
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
  if (!band.ytAudio) {   /* files only (no YouTube table for this band) */
    window.YT = { Player: LocalPlayer, PlayerState: PS, loaded: 1, __rjLocal: true };
    return;
  }
  /* ---------- Your files first, YouTube as the fallback ----------
     Starts on the YouTube table (official album uploads) and checks, right away, whether this
     browser already has the music folder with permission. If so, and no player exists yet, it
     switches to your files. A page keeps one source until reload, so a player is never swapped
     mid-song. With no folder, a one-time bar offers to use the files (then reloads). */
  var mode = "";
  function fillAudio(map) {
    Object.keys(band.audio).forEach(function (k) { delete band.audio[k]; });
    Object.keys(map).forEach(function (k) { band.audio[k] = map[k]; });
  }
  function rebuildPlaylist() {
    try { if (window.smPlaylist && window.smPlaylist.length && typeof window.smBuildPlaylist === "function") window.smBuildPlaylist(); } catch (e) {}
  }
  function useLocal() {
    mode = "local";
    fillAudio(band.localAudio);
    window.YT = { Player: LocalPlayer, PlayerState: PS, loaded: 1, __rjLocal: true };
    rebuildPlaylist();
  }
  function useYouTube() { mode = "youtube"; fillAudio(band.ytAudio); rebuildPlaylist(); }
  window.rjAudioMode = function () { return mode; };

  var OFFER_KEY = NS + "rj-audio-offer-dismissed";
  function offerFiles(hasSaved) {
    if (!window.showDirectoryPicker) return;   // other browsers / phones: YouTube only, no nagging
    if (!hasSaved) { try { if (_get.call(localStorage, OFFER_KEY)) return; } catch (e) {} }
    var shown = false;
    function show() {
      if (shown || mode !== "youtube") return;
      shown = true;
      if (hasSaved) showBanner("Playing from YouTube. Use your " + band.name + " music files instead?", "Use my files", allowFolder);
      else showBanner("Playing from YouTube. Got the " + band.name + " music files on this computer? Choose the folder to play them instead (exact album timing).", "Choose folder", pickFolder);
    }
    /* Show it when you start using the player, not on the home screen. */
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.closest && t.closest("#smPlayer, .sm-player, #boardPlayer, .board-player, #sections")) show();
    }, true);
  }
  function dismissOffer() { try { _set.call(localStorage, OFFER_KEY, "1"); } catch (e) {} }

  /* Once you choose or allow the folder from YouTube mode, reload so the page starts on your files. */
  var _pick = pickFolder, _allow = allowFolder;
  pickFolder = async function () {
    if (mode !== "youtube") return _pick();
    if (!window.showDirectoryPicker) return _pick();
    try {
      var h = await window.showDirectoryPicker({ id: "rj-" + band.id + "-audio", mode: "read" });
      try { await idb("readwrite", function (st) { return st.put(h, "root"); }); } catch (e) {}
      location.reload();
    } catch (e) { /* cancelled */ }
  };
  allowFolder = async function () {
    if (mode !== "youtube") return _allow();
    try { if (await ensureRoot(true)) { location.reload(); return; } } catch (e) {}
    pickFolder();
  };
  window.rjChooseAudioFolder = function () { return pickFolder(); };
  var _hide = hideBanner;
  hideBanner = function () { if (mode === "youtube") dismissOffer(); _hide(); };

  if (qs && qs.get("audio")) useLocal();
  else {
    useYouTube();
    ensureRoot(false).then(function (root) {
      var busy = (window.YT && !window.YT.__rjLocal) || window.smYtPlayer || window.boardYtPlayer;
      if (root && !busy) { useLocal(); return; }
      offerFiles(!!rootHandle);
    }).catch(function () { offerFiles(false); });
  }
})();
