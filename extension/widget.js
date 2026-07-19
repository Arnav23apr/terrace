/**
 * Terrace floating widget (content script). Injects a draggable liquid-glass
 * mini-broadcast into any page, wired to the same realtime room as the website:
 * live score + win bar, minute, latest commentary, the "who's louder" rivalry
 * bar, live headcount, mid-match polls you can vote in, and a reaction row.
 * Goals flash the card and raise a desktop notification. "Open full room"
 * jumps to the site.
 */
(() => {
  if (window.__terraceInjected) return;
  window.__terraceInjected = true;

  const WS = "ws://localhost:8787/ws";
  const SITE = "http://localhost:3000";
  const ACC = "#5ce1a6";
  const REACTIONS = [
    ["fire", "🔥"], ["goal", "⚽"], ["shock", "😱"],
    ["clap", "👏"], ["laugh", "😂"], ["angry", "🤬"],
  ];
  const GLYPH = Object.fromEntries(REACTIONS);
  const TEAM = { ESP:"#e94b3c", ARG:"#6bb3e6", ENG:"#e8e8ee", GER:"#f2c14e", BRA:"#f2d64c", FRA:"#5a7fe6", POR:"#e05555", NED:"#f0913c" };
  const tc = (c) => TEAM[c] || "#9aa3b2";
  const FLAGS = { ESP:"\u{1F1EA}\u{1F1F8}", ARG:"\u{1F1E6}\u{1F1F7}", ENG:"\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}", GER:"\u{1F1E9}\u{1F1EA}", BRA:"\u{1F1E7}\u{1F1F7}", FRA:"\u{1F1EB}\u{1F1F7}", POR:"\u{1F1F5}\u{1F1F9}", NED:"\u{1F1F3}\u{1F1F1}" };
  const flag = (c) => FLAGS[c] || "🏳";
  const abbr = (n) => n.slice(0, 3).toUpperCase();
  const notify = (title, body) => { try { chrome?.runtime?.sendMessage?.({ type: "notify", title, body }); } catch {} };

  const host = document.createElement("div");
  host.id = "terrace-host";
  host.style.cssText = "position:fixed;right:22px;bottom:22px;z-index:2147483647;width:318px;height:auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;";
  const root = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  root.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;font-family:inherit}
      .wrap{position:relative;width:100%;height:100%}
      .rsz{position:absolute;z-index:5}
      .rsz.n{top:-4px;left:8px;right:8px;height:8px;cursor:ns-resize}
      .rsz.s{bottom:-4px;left:8px;right:8px;height:8px;cursor:ns-resize}
      .rsz.e{right:-4px;top:8px;bottom:8px;width:8px;cursor:ew-resize}
      .rsz.w{left:-4px;top:8px;bottom:8px;width:8px;cursor:ew-resize}
      .rsz.ne{top:-5px;right:-5px;width:14px;height:14px;cursor:nesw-resize}
      .rsz.nw{top:-5px;left:-5px;width:14px;height:14px;cursor:nwse-resize}
      .rsz.se{bottom:-5px;right:-5px;width:14px;height:14px;cursor:nwse-resize}
      .rsz.sw{bottom:-5px;left:-5px;width:14px;height:14px;cursor:nesw-resize}
      .card{position:relative;overflow-y:auto;overflow-x:hidden;height:100%;border-radius:20px;padding:14px;color:#eef0f3;
        background:rgba(18,20,26,0.80);border:1px solid rgba(255,255,255,0.10);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.12),0 24px 60px -28px rgba(0,0,0,0.9);
        backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%)}
      .top{display:flex;align-items:center;justify-content:space-between;cursor:grab;user-select:none}
      .top:active{cursor:grabbing}
      .live{display:inline-flex;align-items:center;gap:6px;font:600 11px ui-monospace,monospace;letter-spacing:.06em;color:${ACC}}
      .venue{font:500 9.5px ui-monospace,monospace;color:rgba(255,255,255,.4);margin-left:6px}
      .dot{width:6px;height:6px;border-radius:50%;background:${ACC};animation:pulse 1.4s ease-in-out infinite}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
      .btns{display:flex;gap:4px;align-items:center}
      .ic{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:rgba(255,255,255,.06);color:#cfd3da;border:none;cursor:pointer;font-size:13px;line-height:1;text-decoration:none}
      .ic:hover{background:rgba(255,255,255,.14)}
      .ic.open{width:auto;padding:0 8px;font:600 10px ui-monospace,monospace;color:${ACC}}
      .teams{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
      .t{display:flex;flex-direction:column;align-items:center;gap:3px;width:74px}
      .t .fl{font-size:26px;line-height:1}
      .t .nm{font:600 12px inherit}
      .sc{font:600 30px ui-monospace,monospace;font-variant-numeric:tabular-nums}
      .sc i{color:rgba(255,255,255,.28);font-style:normal;margin:0 4px}
      .bar{display:flex;height:6px;gap:2px;border-radius:999px;overflow:hidden;margin-top:12px}
      .bar>div{height:100%}
      .barpct{display:flex;justify-content:space-between;margin-top:5px;font:600 9.5px ui-monospace,monospace}
      .comm{margin-top:11px;font:500 11.5px inherit;line-height:1.35;color:rgba(255,255,255,.82);
        min-height:16px;border-left:2px solid rgba(255,255,255,.14);padding-left:8px;transition:opacity .2s}
      .riv{margin-top:11px}
      .riv-h{display:flex;justify-content:space-between;font:600 9.5px ui-monospace,monospace;color:rgba(255,255,255,.45);margin-bottom:4px}
      .riv-bar{position:relative;height:16px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.05);display:flex}
      .riv-bar>div{height:100%;transition:width .4s cubic-bezier(.22,1,.36,1)}
      .poll{margin-top:11px;padding:10px;border-radius:12px;border:1px solid ${ACC}66;background:${ACC}12}
      .poll-q{font:600 11.5px inherit;margin-bottom:7px}
      .poll button{display:block;width:100%;text-align:left;margin-bottom:4px;padding:6px 9px;border-radius:8px;
        border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#eef0f3;font:500 11px inherit;cursor:pointer}
      .poll button:hover{border-color:rgba(255,255,255,.25)}
      .poll button.picked{border-color:${ACC};background:${ACC}22;color:${ACC}}
      .poll-res{height:5px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden;margin-top:2px}
      .poll-res>div{height:100%;background:${ACC}}
      .foot{display:flex;align-items:center;justify-content:space-between;margin-top:11px;font:500 11px ui-monospace,monospace;color:rgba(255,255,255,.5)}
      .rx{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin-top:11px}
      .rx button{aspect-ratio:1;border:none;border-radius:11px;background:rgba(255,255,255,.05);font-size:17px;cursor:pointer;transition:transform .12s,background .15s}
      .rx button:hover{background:rgba(255,255,255,.11)}
      .rx button:active{transform:scale(.8)}
      .floats{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .fly{position:absolute;bottom:64px;font-size:20px;animation:fly 2.2s cubic-bezier(.22,1,.36,1) forwards}
      @keyframes fly{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:translateY(-6px) scale(1.1)}100%{transform:translateY(-160px) scale(1);opacity:0}}
      .goal{position:absolute;inset:0;display:grid;place-items:center;opacity:0;transition:opacity .25s;pointer-events:none}
      .goal.on{opacity:1}
      .goal b{font:900 40px inherit;letter-spacing:-.02em;text-align:center}
      .goal small{display:block;font:600 13px ui-monospace,monospace;color:#fff;margin-top:2px}
      .mini{width:52px;height:52px;border-radius:16px;cursor:pointer;display:grid;place-items:center;color:#0a0b0e;background:${ACC};box-shadow:0 10px 30px -8px rgba(92,225,166,.6);border:none}
      .hidden{display:none}
      .card::-webkit-scrollbar{width:6px}
      .card::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:99px}
    </style>
    <div class="wrap" id="wrap">
    <div class="card" id="card">
      <div class="floats" id="floats"></div>
      <div class="goal" id="goal"><b id="goalTxt"></b></div>
      <div class="top" id="drag">
        <span class="live"><span class="dot" id="dot"></span><span id="min">LIVE</span><span class="venue" id="venue"></span></span>
        <div class="btns">
          <button class="ic open" id="open" title="Open the full room">room ↗</button>
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
      <div class="barpct" id="barpct"></div>
      <div class="comm" id="comm">The room lights up as the match unfolds.</div>
      <div class="riv" id="rivWrap">
        <div class="riv-h"><span id="rivH">—</span><span>WHO'S LOUDER</span><span id="rivA">—</span></div>
        <div class="riv-bar"><div id="rivHb" style="width:50%;background:#e94b3c"></div><div id="rivAb" style="width:50%;background:#6bb3e6"></div></div>
      </div>
      <div class="poll hidden" id="poll"></div>
      <div class="foot"><span id="pred"></span><span style="color:${ACC}" id="watch"></span></div>
      <div class="rx" id="rx"></div>
    </div>
    <div class="rsz n" data-d="n"></div><div class="rsz s" data-d="s"></div>
    <div class="rsz e" data-d="e"></div><div class="rsz w" data-d="w"></div>
    <div class="rsz ne" data-d="ne"></div><div class="rsz nw" data-d="nw"></div>
    <div class="rsz se" data-d="se"></div><div class="rsz sw" data-d="sw"></div>
    </div>
    <button class="mini hidden" id="mini" title="Terrace">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6"/></svg>
    </button>`;

  const $ = (id) => root.getElementById(id);
  $("rx").innerHTML = REACTIONS.map(([id, g]) => `<button data-r="${id}">${g}</button>`).join("");

  let ws, match, room, poll = null, voted = null, joined = null;
  const send = (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m));

  function render() {
    if (!match) return;
    $("min").textContent = match.status === "ft" ? "FT" : match.status === "live" ? `${match.minute}'` : "SOON";
    $("dot").style.display = match.status === "live" ? "" : "none";
    $("venue").textContent = match.venue || "";
    $("hf").textContent = flag(match.homeCode); $("af").textContent = flag(match.awayCode);
    $("hn").textContent = abbr(match.home); $("an").textContent = abbr(match.away);
    $("hs").textContent = match.score[0]; $("as").textContent = match.score[1];
    const [h, d, a] = match.prob;
    $("bar").innerHTML =
      `<div style="width:${h}%;background:${tc(match.homeCode)}"></div>` +
      `<div style="width:${d}%;background:rgba(255,255,255,.18)"></div>` +
      `<div style="width:${a}%;background:${tc(match.awayCode)}"></div>`;
    $("barpct").innerHTML =
      `<span style="color:${tc(match.homeCode)}">${h.toFixed(0)}%</span>` +
      `<span style="color:rgba(255,255,255,.4)">DRAW ${d.toFixed(0)}%</span>` +
      `<span style="color:${tc(match.awayCode)}">${a.toFixed(0)}%</span>`;
    $("pred").textContent = `${match.predictors.toLocaleString()} predicting`;
    $("watch").textContent = `${(room ? room.count : match.watching)} watching`;
  }

  function renderRivalry() {
    if (!room || !match) return;
    const tot = room.hypeHome + room.hypeAway;
    const hs = tot > 0 ? (room.hypeHome / tot) * 100 : 50;
    $("rivHb").style.width = hs + "%"; $("rivHb").style.background = tc(match.homeCode);
    $("rivAb").style.width = (100 - hs) + "%"; $("rivAb").style.background = tc(match.awayCode);
    $("rivH").textContent = match.homeCode; $("rivA").textContent = match.awayCode;
  }

  function showPoll() {
    if (!poll) { $("poll").classList.add("hidden"); return; }
    $("poll").classList.remove("hidden");
    $("poll").innerHTML = `<div class="poll-q">${poll.q}</div>` +
      poll.options.map((o, i) => `<button data-o="${i}" class="${voted === i ? "picked" : ""}">${o}</button>`).join("");
  }
  function showResult(r) {
    $("poll").classList.remove("hidden");
    $("poll").innerHTML = `<div class="poll-q">The room called</div>` +
      r.options.map((o, i) => {
        const pct = r.total ? (r.counts[i] / r.total) * 100 : 0;
        return `<div style="font:500 10.5px inherit;display:flex;justify-content:space-between;margin-bottom:2px"><span>${o}</span><span style="color:rgba(255,255,255,.5)">${pct.toFixed(0)}%</span></div><div class="poll-res"><div style="width:${pct}%"></div></div>`;
      }).join("");
    setTimeout(() => { $("poll").classList.add("hidden"); }, 7000);
  }

  function fly(glyph) {
    const s = document.createElement("span");
    s.className = "fly"; s.textContent = glyph; s.style.left = (8 + Math.random() * 80) + "%";
    $("floats").appendChild(s);
    setTimeout(() => s.remove(), 2200);
  }
  function goalFlash(ev) {
    const col = ev.team === 2 ? tc(match.awayCode) : tc(match.homeCode);
    $("goalTxt").innerHTML = `GOAL<small>${match.score[0]} : ${match.score[1]}</small>`;
    $("goalTxt").style.color = col;
    $("goal").style.background = `radial-gradient(120% 90% at 50% 50%, ${col}22, rgba(10,11,14,.9) 70%)`;
    $("goal").classList.add("on");
    for (let i = 0; i < 10; i++) setTimeout(() => fly("⚽"), i * 80);
    setTimeout(() => $("goal").classList.remove("on"), 2800);
    notify(`GOAL — ${match.home} ${match.score[0]}-${match.score[1]} ${match.away}`, ev.text);
  }

  function connect() {
    ws = new WebSocket(WS);
    ws.onopen = () => { send({ t: "hello", name: "widget" }); if (joined) joinMatch(joined); };
    ws.onclose = () => setTimeout(connect, 1500);
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "matches") { if (!match) { const live = m.matches.find((x) => x.status === "live") || m.matches[0]; if (live) joinMatch(live.id); } }
      else if (m.t === "match") { match = m.match; render(); }
      else if (m.t === "room") { room = m; render(); renderRivalry(); }
      else if (m.t === "react") { fly(GLYPH[m.emoji] || "🔥"); }
      else if (m.t === "poll") { poll = m; voted = null; showPoll(); }
      else if (m.t === "pollResult") { poll = null; showResult(m); }
      else if (m.t === "event") {
        if (match && m.matchId === match.id) {
          match = m.match; render();
          if (m.event.text) { $("comm").style.opacity = "0"; setTimeout(() => { $("comm").textContent = m.event.text; $("comm").style.opacity = "1"; }, 150); }
          if (m.event.type === "goal") goalFlash(m.event);
          if (m.event.type === "red") notify("RED CARD", m.event.text);
        }
      }
    };
  }
  function joinMatch(id) { joined = id; send({ t: "join", room: `match-${id}`, matchId: id, side: -1 }); }

  $("rx").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    send({ t: "react", emoji: b.dataset.r }); fly(GLYPH[b.dataset.r]);
  });
  $("poll").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-o]"); if (!b || voted !== null || !poll) return;
    voted = Number(b.dataset.o); send({ t: "pollVote", pollId: poll.id, option: voted }); showPoll();
  });
  $("open").addEventListener("click", () => { if (match) window.open(`${SITE}/match/${match.id}`, "_blank"); });

  // pin the current on-screen box to left/top so drag + resize are absolute
  function anchor() {
    const r = host.getBoundingClientRect();
    host.style.left = r.left + "px"; host.style.top = r.top + "px";
    host.style.right = "auto"; host.style.bottom = "auto";
    return r;
  }

  // collapse / expand — remember the resized size, restore it on expand
  let saved = null;
  $("collapse").onclick = () => {
    saved = { w: host.style.width, h: host.style.height };
    $("wrap").classList.add("hidden"); $("mini").classList.remove("hidden");
    host.style.width = "auto"; host.style.height = "auto";
  };
  $("mini").onclick = () => {
    $("mini").classList.add("hidden"); $("wrap").classList.remove("hidden");
    if (saved) { host.style.width = saved.w || "318px"; host.style.height = saved.h || "auto"; }
  };
  $("close").onclick = () => host.remove();

  // drag from the header
  let dragging = false, sx, sy, ox, oy;
  $("drag").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ic")) return;
    dragging = true; sx = e.clientX; sy = e.clientY;
    const r = anchor(); ox = r.left; oy = r.top;
    $("drag").setPointerCapture(e.pointerId);
  });
  $("drag").addEventListener("pointermove", (e) => {
    if (!dragging) return;
    host.style.left = (ox + e.clientX - sx) + "px"; host.style.top = (oy + e.clientY - sy) + "px";
  });
  $("drag").addEventListener("pointerup", () => { dragging = false; });

  // resize from any edge / corner
  const MINW = 240, MAXW = 620, MINH = 210, MAXH = Math.round(innerHeight * 0.9);
  let rz = null;
  root.querySelectorAll(".rsz").forEach((h) => {
    h.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = anchor();
      rz = { d: h.dataset.d, sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, w: r.width, h: r.height };
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener("pointermove", (e) => {
      if (!rz) return;
      const dx = e.clientX - rz.sx, dy = e.clientY - rz.sy;
      let { x, y, w, h: ht } = rz;
      if (rz.d.includes("e")) w = rz.w + dx;
      if (rz.d.includes("w")) { w = rz.w - dx; x = rz.x + dx; }
      if (rz.d.includes("s")) ht = rz.h + dy;
      if (rz.d.includes("n")) { ht = rz.h - dy; y = rz.y + dy; }
      // clamp, and keep the opposite edge fixed when shrinking from left/top
      if (w < MINW) { if (rz.d.includes("w")) x = rz.x + (rz.w - MINW); w = MINW; }
      if (w > MAXW) { if (rz.d.includes("w")) x = rz.x + (rz.w - MAXW); w = MAXW; }
      if (ht < MINH) { if (rz.d.includes("n")) y = rz.y + (rz.h - MINH); ht = MINH; }
      if (ht > MAXH) { if (rz.d.includes("n")) y = rz.y + (rz.h - MAXH); ht = MAXH; }
      host.style.width = w + "px"; host.style.height = ht + "px";
      host.style.left = x + "px"; host.style.top = y + "px";
    });
    h.addEventListener("pointerup", (e) => { rz = null; h.releasePointerCapture?.(e.pointerId); });
  });

  connect();
})();
