/* RIFFJAMS Tracker (opened from the artist page, ./#tracker).
   - Practice time: a month calendar of the stopwatch time for each day (rj-timer.js keeps the
     daily totals in localStorage "riffjams_timer_days_v1").
   - Songs played: every song of a band down the side (album by album, like Arrangement mode),
     90 days across; a day the song was played shows that album's cover. Plays are written by the
     Song Map player through rjTrackerNotePlay() into "riffjams_plays_v1".
   Both keys are shared by every band (see SHARED in rj-band.js). A day runs 5 am to 5 am, the
   same as the stopwatch reset. */
(function () {
  var DAYS_KEY = "riffjams_timer_days_v1", PLAYS_KEY = "riffjams_plays_v1", RESET_HOUR = 5, SPAN = 90;

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  /* Practice day of a moment: before 5 am still counts as the day before. */
  function dayKey(ts) { return keyOf(new Date((ts || Date.now()) - RESET_HOUR * 3600000)); }
  function fromKey(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } }

  function bandId() { return (window.RJ_BAND && window.RJ_BAND.id) || "sabbath"; }

  /* Called by the Song Map player when a song starts playing. */
  window.rjTrackerNotePlay = function (album, song, band) {
    if (!song) return;
    var k = (band || bandId()) + "|" + (album || "") + "|" + song, today = dayKey();
    try {
      var all = read(PLAYS_KEY), list = all[k] || [];
      if (list[list.length - 1] === today) return;
      if (list.indexOf(today) < 0) { list.push(today); list.sort(); }
      all[k] = list;
      localStorage.setItem(PLAYS_KEY, JSON.stringify(all));
    } catch (e) {}
  };

  var sec = document.getElementById("tracker");
  if (!sec) return;

  var css = [
    '#tracker { color: #f3f3f1; font-family: Montserrat, "Segoe UI", sans-serif; }',
    '#tracker .trk-head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 0 0 14px 4px; }',
    '#tracker h1 { font-family: "Vol4 Title", Impact, sans-serif; font-weight: 400; font-size: 2rem; letter-spacing: .04em; margin: 0; }',
    '#tracker .trk-tabs, #tracker .trk-bands { display: inline-flex; border: 2px solid #7030a0; border-radius: 999px; overflow: hidden; }',
    '#tracker .trk-tabs button, #tracker .trk-bands button { border: 0; background: none; color: inherit; padding: 6px 14px; font: 600 14px/1.2 Montserrat, "Segoe UI", sans-serif; cursor: pointer; }',
    '#tracker .trk-tabs button.on, #tracker .trk-bands button.on { background: #7030a0; color: #fff; }',
    '#tracker .trk-bands button { font-family: "Vol4 Title", Impact, sans-serif; font-weight: 400; font-size: 16px; letter-spacing: .03em; }',
    '#tracker td.c-day.ed { cursor: pointer; }',
    '#tracker td.c-day.ed:hover { box-shadow: inset 0 0 0 2px rgba(243,226,181,.55); }',
    '#tracker .trk-nav { display: flex; align-items: center; gap: 10px; margin: 0 0 10px 4px; flex-wrap: wrap; }',
    '#tracker .trk-nav button { border: 1px solid #555; background: #1b1c20; color: #f3f3f1; border-radius: 8px; padding: 4px 12px; font-size: 16px; cursor: pointer; }',
    '#tracker .trk-nav button:disabled { opacity: .35; cursor: default; }',
    '#tracker .trk-label { font-weight: 700; font-size: 18px; min-width: 190px; text-align: center; }',
    '#tracker .trk-sum { color: #bbb; font-size: 14px; }',
    '#tracker .trk-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; max-width: 900px; }',
    '#tracker .trk-dow { text-align: center; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: .08em; }',
    '#tracker .trk-day { min-height: 74px; border-radius: 10px; background: #1b1c20; padding: 6px 8px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }',
    '#tracker .trk-day.out { visibility: hidden; }',
    '#tracker .trk-day.today { outline: 2px solid #f3e2b5; }',
    '#tracker .trk-day .n { font-size: 12px; color: #aaa; }',
    '#tracker .trk-day .t { font-family: "Vol4 Title", Impact, sans-serif; font-size: 22px; text-align: right; }',
    '#tracker .trk-day.zero .t { color: #555; font-size: 16px; }',
    '#tracker .trk-day.ed { cursor: pointer; }',
    '#tracker .trk-day.ed:hover { box-shadow: inset 0 0 0 2px rgba(243,226,181,.55); }',
    '#tracker .trk-day input { width: 100%; box-sizing: border-box; font: 600 16px/1.2 Montserrat, "Segoe UI", sans-serif; text-align: right; color: #111; background: #fff; border: 0; border-radius: 6px; padding: 3px 6px; }',
    '#tracker .trk-hint { color: #888; font-size: 12px; margin: 8px 4px 0; }',
    '#tracker .trk-grid-wrap { overflow: auto; max-height: calc(100vh - 170px); border-radius: 10px; background: #15161a; }',
    '#tracker table { border-collapse: separate; border-spacing: 0; font-size: 13px; }',
    '#tracker th, #tracker td { padding: 0; height: 30px; }',
    '#tracker thead th { position: sticky; top: 0; z-index: 3; background: #15161a; font-weight: 600; color: #aaa; font-size: 11px; }',
    '#tracker thead tr.m th { top: 0; height: 18px; text-align: left; color: #f3e2b5; white-space: nowrap; overflow: visible; }',
    '#tracker thead tr.d th { top: 18px; }',
    '#tracker .c-song, #tracker .c-last { position: sticky; z-index: 2; background: #15161a; white-space: nowrap; }',
    '#tracker .c-song { left: 0; min-width: 230px; max-width: 230px; overflow: hidden; text-overflow: ellipsis; padding: 0 8px; text-align: left; }',
    '#tracker .c-last { left: 246px; min-width: 86px; padding: 0 8px; color: #aaa; font-size: 12px; text-align: left; border-right: 1px solid #333; }',
    '#tracker thead .c-song, #tracker thead .c-last { z-index: 4; }',
    '#tracker td.c-day, #tracker th.c-day { min-width: 30px; max-width: 30px; text-align: center; }',
    '#tracker th.c-day.wk { color: #ddd; }',
    '#tracker th.c-day.today, #tracker td.c-day.today { background: rgba(243,226,181,.08); }',
    '#tracker td.c-day { border-bottom: 1px solid #222; }',
    '#tracker td.c-day img { width: 26px; height: 26px; border-radius: 4px; display: block; margin: 0 auto; object-fit: cover; box-shadow: 0 0 0 1px rgba(255,255,255,.55); }',
    '#tracker tr.alb td { height: 34px; background: #202127; }',
    '#tracker tr.alb .c-song { background: #202127; font-weight: 700; font-size: 14px; }',
    '#tracker tr.alb .c-song img { width: 26px; height: 26px; border-radius: 3px; vertical-align: middle; margin-right: 8px; object-fit: cover; }',
    '#tracker tr.alb .c-last { background: #202127; }',
    '#tracker tr.song:hover td { background-color: #1d1e24; }',
    '#tracker .trk-empty { color: #999; margin: 10px 4px; font-size: 14px; }',
    '@media (max-width: 560px) { #tracker .c-song { min-width: 150px; max-width: 150px; } #tracker .c-last { left: 166px; min-width: 64px; } #tracker .trk-day { min-height: 54px; padding: 4px; } #tracker .trk-day .t { font-size: 15px; } }'
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var view = "time", month = null, endOffset = 0, band = "sabbath", editing = false;

  function fmtHM(ms) { var m = Math.round(ms / 60000); return Math.floor(m / 60) + ":" + pad(m % 60); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function bands() {
    var B = window.RJ_BANDS || {}, out = [];
    ["sabbath", "gnr", "zeppelin"].forEach(function (id) {
      var b = B[id]; if (!b) return;
      var albums = b.albums;
      if (id === "sabbath" || !albums) albums = (id === bandId() && window.ALBUMS) ? window.ALBUMS : (id === "sabbath" ? window.ALBUMS_DEFAULT : null);
      if (albums) out.push({ id: id, name: b.name, albums: albums });
    });
    return out;
  }

  function shell() {
    sec.innerHTML =
      '<div class="trk-head"><a class="back" href="./" id="trkBack">Artists</a><h1>Tracker</h1>' +
      '<span class="trk-tabs"><button type="button" data-v="time">Practice time</button><button type="button" data-v="songs">Songs played</button></span></div>' +
      '<div id="trkBody"></div>';
    sec.querySelector(".trk-tabs").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return; view = b.getAttribute("data-v"); render();
    };
  }

  /* "1:30" = 1 h 30 min, "45" = 45 min, "1:30:15" = with seconds; empty = 0. */
  function parseTime(v) {
    v = String(v).trim();
    if (!v) return 0;
    var p = v.split(/[:.\s]+/);
    if (p.length > 3 || p.some(function (x) { return !/^\d+$/.test(x); })) return null;
    p = p.map(Number);
    if (p.length === 1) return p[0] * 60000;
    if (p.length === 2) return (p[0] * 60 + p[1]) * 60000;
    return ((p[0] * 60 + p[1]) * 60 + p[2]) * 1000;
  }
  function editDay(cell, today) {
    var k = cell.getAttribute("data-k"), ms = +cell.getAttribute("data-ms") || 0, t = cell.querySelector(".t"), done = false;
    var inp = document.createElement("input");
    inp.type = "text"; inp.value = fmtHM(ms); inp.setAttribute("aria-label", "Time for " + k + " (H:MM)");
    t.replaceWith(inp); editing = true; inp.focus(); inp.select();
    function finish(commit) {
      if (done) return; done = true; editing = false;
      var v = commit ? parseTime(inp.value) : null;
      if (v !== null && v !== ms) {
        if (k === today && window.rjTimerSet) window.rjTimerSet(v);   /* the stopwatch keeps today's total */
        else {
          try {
            var h = read(DAYS_KEY);
            if (v) h[k] = v; else delete h[k];
            localStorage.setItem(DAYS_KEY, JSON.stringify(h));
          } catch (e) {}
        }
      }
      render();
    }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") finish(true); else if (e.key === "Escape") finish(false); });
    inp.addEventListener("blur", function () { finish(true); });
  }

  function renderTime(body) {
    var today = dayKey(), t = fromKey(today);
    if (!month) month = new Date(t.getFullYear(), t.getMonth(), 1);
    var days = read(DAYS_KEY), y = month.getFullYear(), mo = month.getMonth();
    var first = new Date(y, mo, 1), n = new Date(y, mo + 1, 0).getDate(), lead = (first.getDay() + 6) % 7, total = 0, active = 0;
    var cells = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(function (d) { return '<div class="trk-dow">' + d + '</div>'; });
    for (var i = 0; i < lead; i++) cells.push('<div class="trk-day out"></div>');
    for (var d = 1; d <= n; d++) {
      var k = y + "-" + pad(mo + 1) + "-" + pad(d), ms = days[k] || 0;
      total += ms; if (ms >= 60000) active++;
      var a = Math.min(1, ms / (2 * 3600000)), bg = ms >= 60000 ? ' style="background: rgba(112,48,160,' + (0.25 + 0.75 * a).toFixed(2) + ')"' : "";
      var canEdit = k <= today;
      cells.push('<div class="trk-day' + (ms < 60000 ? " zero" : "") + (k === today ? " today" : "") + (canEdit ? " ed" : "") + '"' + bg +
        (canEdit ? ' data-k="' + k + '" data-ms="' + ms + '"' : "") +
        ' title="' + esc(fmtHM(ms) + " on " + MONTHS[mo] + " " + d + (canEdit ? " · click to edit" : "")) + '"><span class="n">' + d + '</span><span class="t">' + (ms >= 60000 ? fmtHM(ms) : "–") + '</span></div>');
    }
    var isNow = y === t.getFullYear() && mo === t.getMonth();
    body.innerHTML =
      '<div class="trk-nav"><button type="button" id="trkPrev" aria-label="Previous month">&#8249;</button>' +
      '<span class="trk-label">' + MONTHS[mo] + " " + y + '</span>' +
      '<button type="button" id="trkNext" aria-label="Next month"' + (isNow ? " disabled" : "") + '>&#8250;</button>' +
      '<span class="trk-sum">' + fmtHM(total) + ' total · ' + active + ' day' + (active === 1 ? "" : "s") + ' practised</span></div>' +
      '<div class="trk-cal">' + cells.join("") + '</div>' +
      '<p class="trk-hint">Click a day to change its time (H:MM). Today\'s time also sets the stopwatch.</p>';
    body.querySelector(".trk-cal").onclick = function (e) {
      var cell = e.target.closest(".trk-day.ed");
      if (cell && !cell.querySelector("input")) editDay(cell, today);
    };
    body.querySelector("#trkPrev").onclick = function () { month = new Date(y, mo - 1, 1); render(); };
    body.querySelector("#trkNext").onclick = function () { if (!isNow) { month = new Date(y, mo + 1, 1); render(); } };
  }

  function ago(k, today) {
    if (!k) return "Never";
    var n = Math.round((fromKey(today) - fromKey(k)) / 86400000);
    return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n + " days ago";
  }

  function renderSongs(body) {
    var list = bands(), today = dayKey(), plays = read(PLAYS_KEY);
    if (!list.some(function (b) { return b.id === band; })) band = list.length ? list[0].id : band;
    var B = list.filter(function (b) { return b.id === band; })[0];
    var end = fromKey(today); end.setDate(end.getDate() - endOffset * SPAN);
    var cols = [];
    for (var i = SPAN - 1; i >= 0; i--) { var d = new Date(end); d.setDate(end.getDate() - i); cols.push(d); }
    var colKeys = cols.map(keyOf);
    var head = '<div class="trk-nav"><span class="trk-bands">' + list.map(function (b) {
      return '<button type="button" data-b="' + b.id + '"' + (b.id === band ? ' class="on"' : "") + '>' + esc(b.name) + '</button>';
    }).join("") + '</span>' +
      '<button type="button" id="trkOlder" aria-label="Older 90 days">&#8249;</button>' +
      '<span class="trk-label">' + MON3[cols[0].getMonth()] + " " + cols[0].getDate() + " – " + MON3[end.getMonth()] + " " + end.getDate() + ", " + end.getFullYear() + '</span>' +
      '<button type="button" id="trkNewer" aria-label="Newer 90 days"' + (endOffset === 0 ? " disabled" : "") + '>&#8250;</button></div>';
    if (!B) { body.innerHTML = head + '<p class="trk-empty">No songs.</p>'; return; }
    var mRow = '<tr class="m"><th class="c-song"></th><th class="c-last"></th>', dRow = '<tr class="d"><th class="c-song">Song</th><th class="c-last">Last played</th>';
    cols.forEach(function (d, i) {
      mRow += '<th class="c-day">' + (i === 0 || d.getDate() === 1 ? MON3[d.getMonth()] : "") + '</th>';
      dRow += '<th class="c-day' + (d.getDay() === 1 ? " wk" : "") + (colKeys[i] === today ? " today" : "") + '">' + d.getDate() + '</th>';
    });
    var rows = "", any = false;
    B.albums.forEach(function (a) {
      var cover = a.cover || "";
      rows += '<tr class="alb"><td class="c-song">' + (cover ? '<img src="' + esc(cover) + '" alt="">' : "") + esc(a.name) + '</td><td class="c-last"></td><td colspan="' + SPAN + '"></td></tr>';
      (a.songs || []).forEach(function (s) {
        var p = plays[B.id + "|" + a.name + "|" + s.song] || [], set = {};
        p.forEach(function (k) { set[k] = 1; });
        if (p.length) any = true;
        rows += '<tr class="song" data-key="' + esc(B.id + "|" + a.name + "|" + s.song) + '"><td class="c-song" title="' + esc(s.song) + '">' + esc(s.song) + '</td><td class="c-last">' + ago(p[p.length - 1], today) + '</td>';
        colKeys.forEach(function (k) {
          rows += '<td class="c-day' + (k === today ? " today" : "") + (k <= today ? ' ed" data-k="' + k : "") + '">' + (set[k] ? '<img src="' + esc(cover) + '" alt="Played" title="' + esc(s.song + " · " + k) + '">' : "") + '</td>';
        });
        rows += '</tr>';
      });
    });
    body.innerHTML = head + (any ? "" : '<p class="trk-empty">No plays recorded for ' + esc(B.name) + ' yet. Songs show up here once you play them in the Song Map player.</p>') +
      '<p class="trk-hint" style="margin: 0 4px 8px">Click a day to add or remove a play.</p><div class="trk-grid-wrap"><table><thead>' + mRow + '</tr>' + dRow + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    body.querySelector(".trk-bands").onclick = function (e) { var b = e.target.closest("button"); if (b) { band = b.getAttribute("data-b"); render(); } };
    body.querySelector("#trkOlder").onclick = function () { endOffset++; render(); };
    body.querySelector("#trkNewer").onclick = function () { if (endOffset > 0) { endOffset--; render(); } };
    /* Click a day to add or remove a play of that song. */
    body.querySelector("tbody").onclick = function (e) {
      var td = e.target.closest("td.c-day.ed"), tr = td && td.parentElement;
      if (!td || !tr.getAttribute("data-key")) return;
      var key = tr.getAttribute("data-key"), k = td.getAttribute("data-k"), left = wrapEl.scrollLeft, top = wrapEl.scrollTop;
      try {
        var all = read(PLAYS_KEY), list = all[key] || [], i = list.indexOf(k);
        if (i >= 0) list.splice(i, 1); else { list.push(k); list.sort(); }
        if (list.length) all[key] = list; else delete all[key];
        localStorage.setItem(PLAYS_KEY, JSON.stringify(all));
      } catch (err) {}
      render();
      var w = sec.querySelector(".trk-grid-wrap"); if (w) { w.scrollLeft = left; w.scrollTop = top; }
    };
    var wrapEl = body.querySelector(".trk-grid-wrap"); wrapEl.scrollLeft = wrapEl.scrollWidth;
  }

  function render() {
    if (!sec.firstChild) shell();
    sec.querySelectorAll(".trk-tabs button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === view); });
    var body = document.getElementById("trkBody");
    if (view === "songs") renderSongs(body); else renderTime(body);
  }

  window.rjShowTracker = function () {
    ["artists", "home", "sections", "series"].forEach(function (id) { var el = document.getElementById(id); if (el) el.className = "hidden"; });
    document.body.className = "home-mode";
    sec.className = "";
    render();
  };
  window.addEventListener("storage", function (e) {
    if (sec.className !== "hidden" && !editing && (e.key === DAYS_KEY || e.key === PLAYS_KEY)) render();
  });
  setInterval(function () { if (sec.className !== "hidden" && view === "time" && !editing && !document.hidden) render(); }, 60000);
  /* ./#tracker opens it (from the artist page card); leaving the hash goes back to the artists. */
  function route() {
    var hasBand = false;
    try { hasBand = !!new URLSearchParams(location.search).get("band"); } catch (e) {}
    if (hasBand) return;
    if (location.hash === "#tracker") window.rjShowTracker();
    else if (sec.className !== "hidden" && !location.hash) {
      sec.className = "hidden";
      var a = document.getElementById("artists"); if (a) a.className = "";
      var h = document.getElementById("home"); if (h) h.className = "hidden";
    }
  }
  window.addEventListener("hashchange", route);
  route();
})();
