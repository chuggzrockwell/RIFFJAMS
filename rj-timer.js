/* RIFFJAMS practice timer (the clock top right): play / pause / edit / reset, resets daily at 5 am.
   Shared by RIFFJAMS (index.html) and the Loop Station (looper/). State lives in localStorage, so
   every RIFFJAMS page shows the same running time. A page can give it a spot with
   <div data-rj-timer></div>; otherwise it floats top right. */
(function () {
  var css = [
    '#rjTimer { position: fixed; top: 8px; right: 8px; z-index: 99999; display: flex; align-items: center; gap: 6px;',
    '  background: #fff; color: #7030a0; border-radius: 8px; padding: 4px 8px; box-shadow: 0 2px 8px rgba(0,0,0,.45);',
    '  font-family: "Vol4 Title", sans-serif; user-select: none; }',
    '#rjTimer.inline { position: static; box-shadow: none; }',
    '#rjTimer .rjt-time { font-size: 22px; line-height: 1; letter-spacing: 1px; min-width: 76px; text-align: center; }',
    '#rjTimer button { border: 0; background: #7030a0; color: #fff; width: 26px; height: 26px; border-radius: 6px; cursor: pointer;',
    '  font-size: 13px; line-height: 1; padding: 0; display: flex; align-items: center; justify-content: center; }',
    '#rjTimer button.off { opacity: .35; }',
    '#rjTimer .rjt-input { font: inherit; font-size: 20px; line-height: 1; width: 92px; text-align: center; color: #7030a0; border: 1px solid #7030a0; border-radius: 4px; padding: 1px 2px; background: #fff; }',
    '#rjTimer.running .rjt-time { animation: none; }',
    '@media (max-width: 600px) { #rjTimer { top: 4px; right: 4px; padding: 3px 6px; } #rjTimer .rjt-time { font-size: 18px; min-width: 64px; } #rjTimer .rjt-input { font-size: 16px; width: 76px; } #rjTimer button { width: 22px; height: 22px; } }'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'rjTimer';
  box.setAttribute('aria-label', 'Practice timer');
  box.innerHTML =
    '<span class="rjt-time" id="rjtTime">0:00:00</span>' +
    '<button type="button" id="rjtPlay" title="Play" aria-label="Play">&#9654;</button>' +
    '<button type="button" id="rjtPause" class="off" title="Pause" aria-label="Pause">&#10074;&#10074;</button>' +
    '<button type="button" id="rjtEdit" title="Edit time" aria-label="Edit time">&#9998;</button>' +
    '<button type="button" id="rjtReset" title="Reset to 0:00:00" aria-label="Reset time">&#8634;</button>';
  var slot = document.querySelector('[data-rj-timer]');
  if (slot) { box.className = 'inline'; slot.appendChild(box); } else document.body.appendChild(box);

  var KEY = "riffjams_timer_v1", RESET_HOUR = 5, st = { ms: 0, since: null, resetAt: Date.now() };
  try { var s = JSON.parse(localStorage.getItem(KEY)); if (s) st = s; } catch (e) {}
  var t = document.getElementById("rjtTime"), pl = document.getElementById("rjtPlay"), pa = document.getElementById("rjtPause"),
      ed = document.getElementById("rjtEdit"), rs = document.getElementById("rjtReset"), inp = null;
  function cur() { return st.ms + (st.since ? Date.now() - st.since : 0); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function fmt(ms) {
    var sec = Math.floor(ms / 1000), m = Math.floor(sec / 60);
    return Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2) + ":" + ("0" + (sec % 60)).slice(-2);
  }
  function lastBoundary() { var d = new Date(); d.setHours(RESET_HOUR, 0, 0, 0); if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); return d.getTime(); }
  function reset() { st = { ms: 0, since: null, resetAt: Date.now() }; save(); }
  function draw() {
    if (!st.resetAt) { st.resetAt = Date.now(); save(); }
    else if (st.resetAt < lastBoundary()) reset();
    t.textContent = fmt(cur());
    pl.classList.toggle("off", !!st.since); pa.classList.toggle("off", !st.since);
  }
  function parse(v) {
    var p = String(v).trim().split(/[:.\s]+/), sec = 0;
    if (!p.length || p.length > 3) return null;
    for (var i = 0; i < p.length; i++) { if (!/^\d+$/.test(p[i])) return null; sec = sec * 60 + parseInt(p[i], 10); }
    return sec * 1000;
  }
  function endEdit(commit) {
    if (!inp) return;
    var ms = commit ? parse(inp.value) : null, el = inp; inp = null;
    if (ms !== null) { st.ms = ms; if (st.since) st.since = Date.now(); save(); }
    el.remove(); t.style.display = ""; draw();
  }
  pl.addEventListener("click", function () { if (!st.since) { st.since = Date.now(); save(); draw(); } });
  pa.addEventListener("click", function () { if (st.since) { st.ms = cur(); st.since = null; save(); draw(); } });
  ed.addEventListener("click", function () {
    if (inp) { endEdit(true); return; }
    inp = document.createElement("input");
    inp.type = "text"; inp.className = "rjt-input"; inp.value = fmt(cur()); inp.setAttribute("aria-label", "Time (H:MM:SS)");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") endEdit(true); else if (e.key === "Escape") endEdit(false); });
    inp.addEventListener("blur", function () { setTimeout(function () { endEdit(true); }, 150); });
    t.style.display = "none"; box.insertBefore(inp, t); inp.focus(); inp.select();
  });
  rs.addEventListener("click", function () { if (inp) endEdit(false); reset(); draw(); });
  window.addEventListener("storage", function (e) { if (e.key === KEY) { try { st = JSON.parse(e.newValue) || { ms: 0, since: null, resetAt: Date.now() }; } catch (x) {} draw(); } });
  setInterval(draw, 1000); draw();
})();
