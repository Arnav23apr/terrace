/**
 * Terrace floating widget (content script). Injects a draggable liquid-glass
 * broadcast card into any page: live score, win bar, the terrace headcount, and
 * a reaction row wired to the same realtime room as the website. Goals flash the
 * card and raise a desktop notification via the background worker.
 */
(() => {
  if (window.__terraceInjected) return;
  window.__terraceInjected = true;

  const HTTP = "http://localhost:8787";
  const WS = "ws://localhost:8787/ws";
  const ACC = "#5ce1a6";
  const REACTIONS = [
    ["fire", "🔥"], ["goal", "⚽"], ["shock", "😱"],
    ["clap", "👏"], ["laugh", "😂"], ["angry", "🤬"],
  ];
  const GLYPH = Object.fromEntries(REACTIONS);
  const TEAM = { ES:"#e94b3c", AR:"#6bb3e6", GB:"#e8e8ee", DE:"#f2c14e", BR:"#f2d64c", FR:"#5a7fe6", PT:"#e05555", NL:"#f0913c" };
  const tc = (c) => TEAM[c] || "#9aa3b2";
  const FLAGS = { ESP:"\u{1F1EA}\u{1F1F8}", ARG:"\u{1F1E6}\u{1F1F7}", ENG:"\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", GER:"\u{1F1E9}\u{1F1EA}", BRA:"\u{1F1E7}\u{1F1F7}", FRA:"\u{1F1EB}\u{1F1F7}", POR:"\u{1F1F5}\u{1F1F9}", NED:"\u{1F1F3}\u{1F1F1}" };
  const flag = (c) => FLAGS[c] || ((c && c.length === 2) ? String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65, 0x1f1e6 + c.charCodeAt(1) - 65) : "🏳");
  const abbr = (n) => n.slice(0, 3).toUpperCase();

  // ---- shadow host ----
  const host = document.createElement("div");
  host.id = "terrace-host";
  host.style.cssText = "position:fixed;right:22px;bottom:22px;z-index:2147483647;width:308px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;";
  const root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  root.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;font-family:inherit}
      .card{position:relative;overflow:hidden;border-radius:20px;padding:14px;color:#eef0f3;
        background:rgba(18,20,26,0.72);border:1px solid rgba(255,255,255,0.10);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.12),0 24px 60px -28px rgba(0,0,0,0.9);
        backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%)}
      .top{display:flex;align-items:center;justify-content:space-between;cursor:grab;user-select:none}
      .top:active{cursor:grabbing}
      .live{display:inline-flex;align-items:center;gap:6px;font:600 11px ui-monospace,monospace;letter-spacing:.06em;color:${ACC}}
      .dot{width:6px;height:6px;border-radius:50%;background:${ACC};animation:pulse 1.4s ease-in-out infinite}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
      .btns{display:flex;gap:4px}
      .ic{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:rgba(255,255,255,.06);color:#cfd3da;border:none;cursor:pointer;font-size:13px;line-height:1}
      .ic:hover{background:rgba(255,255,255,.12)}
      .teams{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
      .t{display:flex;flex-direction:column;align-items:center;gap:3px;width:74px}
      .t .fl{font-size:26px;line-height:1}
      .t .nm{font:600 12px inherit}
      .sc{font:600 30px ui-monospace,monospace;font-variant-numeric:tabular-nums}
      .sc i{color:rgba(255,255,255,.28);font-style:normal;margin:0 4px}
      .bar{display:flex;height:6px;gap:2px;border-radius:999px;overflow:hidden;margin-top:12px}
      .bar>div{height:100%}
      .foot{display:flex;align-items:center;justify-content:space-between;margin-top:11px;font:500 11px ui-monospace,monospace;color:rgba(255,255,255,.5)}
      .rx{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:11px}
      .rx button{aspect-ratio:1;border:none;border-radius:11px;background:rgba(255,255,255,.05);font-size:17px;cursor:pointer;transition:transform .12s,background .15s}
      .rx button:hover{background:rgba(255,255,255,.11)}
      .rx button:active{transform:scale(.85)}
      .floats{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .fly{position:absolute;bottom:64px;font-size:20px;animation:fly 2.2s cubic-bezier(.22,1,.36,1) forwards}
      @keyframes fly{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:translateY(-6px) scale(1.1)}100%{transform:translateY(-150px) scale(1);opacity:0}}
      .goal{position:absolute;inset:0;display:grid;place-items:center;opacity:0;transition:opacity .25s}
      .goal.on{opacity:1}
      .goal b{font:900 44px inherit;letter-spacing:-.02em}
      .mini{width:52px;height:52px;border-radius:16px;cursor:pointer;display:grid;place-items:center;color:#0a0b0e;background:${ACC};box-shadow:0 10px 30px -8px rgba(92,225,166,.6);border:none}
      .hidden{display:none}
    </style>
    <div class="card" id="card">
      <div class="floats" id="floats"></div>
      <div class="goal" id="goal"><b id="goalTxt"></b></div>
      <div class="top" id="drag">
        <span class="live"><span class="dot" id="dot"></span><span id="min">LIVE</span></span>
        <div class="btns">
          <button class="ic" id="collapse" title="Minimise">&#8211;</button>
          <button class="ic" id="close" title="Close">&#215;</button>
        </div>
      </div>
      <div class="teams">
        <div class="t"><span class="fl" id="hf"></span><span class="nm" id="hn"></span></div>
        <div class="sc"><span id="hs">0</span><i>:</i><span id="as">0</span></div>
        <div class="t"><span class="fl" id="af"></span><span class="nm" id="an"></span></div>
      </div>
      <div class="bar" id="bar"></div>
      <div class="foot"><span id="pred"></span><span style="color:${ACC}" id="watch"></span></div>
      <div class="rx" id="rx"></div>
    </div>
    <button class="mini hidden" id="mini" title="Terrace">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6"/></svg>
    </button>`;

  const $ = (id) => root.getElementById(id);
  // reaction buttons
  $("rx").innerHTML = REACTIONS.map(([id, g]) => `<button data-r="${id}">${g}</button>`).join("");

  let ws, match, keyN = 1;
  const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

  function render() {
    if (!match) return;
    $("min").textContent = match.status === "ft" ? "FT" : match.status === "live" ? `${match.minute}'` : "SOON";
    $("dot").style.display = match.status === "live" ? "" : "none";
    $("hf").textContent = flag(match.homeCode); $("af").textContent = flag(match.awayCode);
    $("hn").textContent = abbr(match.home); $("an").textContent = abbr(match.away);
    $("hs").textContent = match.score[0]; $("as").textContent = match.score[1];
    const [h, d, a] = match.prob;
    $("bar").innerHTML =
      `<div style="width:${h}%;background:${tc(match.homeCode)}"></div>` +
      `<div style="width:${d}%;background:rgba(255,255,255,.18)"></div>` +
      `<div style="width:${a}%;background:${tc(match.awayCode)}"></div>`;
    $("pred").textContent = `${match.predictors.toLocaleString()} predicting`;
    $("watch").textContent = `${match.watching} on the terrace`;
  }
  function fly(glyph) {
    const s = document.createElement("span");
    s.className = "fly"; s.textContent = glyph; s.style.left = (8 + Math.random() * 80) + "%";
    $("floats").appendChild(s);
    setTimeout(() => s.remove(), 2200);
  }
  function goalFlash(ev) {
    const col = ev.team === 2 ? tc(match.awayCode) : tc(match.homeCode);
    $("goalTxt").textContent = "GOAL"; $("goalTxt").style.color = col;
    $("goal").style.background = `radial-gradient(120% 90% at 50% 50%, ${col}22, rgba(10,11,14,.82) 70%)`;
    $("goal").classList.add("on");
    for (let i = 0; i < 8; i++) setTimeout(() => fly("⚽"), i * 90);
    setTimeout(() => $("goal").classList.remove("on"), 2600);
    chrome.runtime.sendMessage({ type: "notify", title: `GOAL — ${match.home} ${match.score[0]}-${match.score[1]} ${match.away}`, body: ev.text });
  }

  function connect() {
    ws = new WebSocket(WS);
    ws.onopen = () => { send({ t: "hello", name: "widget" }); pickAndJoin(); };
    ws.onclose = () => setTimeout(connect, 1500);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "matches") { if (!match) { const live = m.matches.find((x) => x.status === "live") || m.matches[0]; if (live) joinMatch(live.id); } }
      else if (m.t === "match") { match = m.match; render(); }
      else if (m.t === "react") { fly(GLYPH[m.emoji] || "🔥"); }
      else if (m.t === "event") { if (match && m.matchId === match.id) { match = m.match; render(); if (m.event.type === "goal") goalFlash(m.event); if (m.event.type === "red") chrome.runtime.sendMessage({ type: "notify", title: "RED CARD", body: m.event.text }); } }
    };
  }
  let joined = null;
  function joinMatch(id) { joined = id; send({ t: "join", room: `match-${id}`, matchId: id, side: -1 }); }
  function pickAndJoin() { if (joined) joinMatch(joined); }

  // reactions
  $("rx").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const id = b.dataset.r; send({ t: "react", emoji: id }); fly(GLYPH[id]);
  });

  // collapse / close
  $("collapse").onclick = () => { $("card").classList.add("hidden"); $("mini").classList.remove("hidden"); };
  $("mini").onclick = () => { $("mini").classList.add("hidden"); $("card").classList.remove("hidden"); };
  $("close").onclick = () => host.remove();

  // drag
  let dragging = false, sx, sy, ox, oy;
  $("drag").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ic")) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
    $("drag").setPointerCapture(e.pointerId);
  });
  $("drag").addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
    host.style.left = nx + "px"; host.style.top = ny + "px"; host.style.right = "auto"; host.style.bottom = "auto";
  });
  $("drag").addEventListener("pointerup", () => { dragging = false; });

  connect();
})();
