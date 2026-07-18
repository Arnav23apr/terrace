/**
 * Terrace realtime server.
 *
 * HTTP:
 *   GET /health           → ok
 *   GET /matches          → current match states (for initial page render)
 * WebSocket (same port, path /ws):
 *   client→server: hello | join | leave | react | setSide | pollVote
 *   server→client: matches | match | room | react | event | poll | pollResult
 *
 * A single engine advances every live match on an accelerated clock, emits its
 * scripted events, evolves win probability, runs "who scores next" polls, and
 * decays per-side rivalry hype from incoming reactions.
 */
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { MATCHES, MatchDef, MatchState, MatchEvent, SEED_PREDICTORS } from "./matches";

const PORT = Number(process.env.PORT ?? 8787);
const MIN_PER_SEC = Number(process.env.MIN_PER_SEC ?? 1); // 1 match-minute per real second
const HT_PAUSE_SEC = 4;

// ---------- match engine ----------
interface LiveMatch {
  def: MatchDef;
  startedAt: number | null; // ms when kickoff happened
  status: "upcoming" | "live" | "ft";
  minute: number;
  half: 1 | 2;
  score: [number, number];
  prob: [number, number, number];
  fired: Set<number>; // event indices already emitted
  htUntil: number | null;
  ftAt: number | null;
  nextKickoffAt: number; // absolute ms of the (re)kickoff
}

const REPLAY_GAP_SEC = Number(process.env.REPLAY_GAP_SEC ?? 20); // pause between looped replays
const LOOP = (process.env.LOOP ?? "true") !== "false";

const engine: Record<string, LiveMatch> = {};
const bootAt = Date.now();
for (const def of MATCHES) {
  engine[def.id] = {
    def, startedAt: null, status: "upcoming", minute: 0, half: 1,
    score: [0, 0], prob: [...def.preProb], fired: new Set(), htUntil: null,
    ftAt: null, nextKickoffAt: bootAt + def.kickoffOffsetSec * 1000,
  };
}
/** Only the two "live demo" games loop; the 3h/6h fixtures stay upcoming. */
const LOOPING = new Set(["esp-arg", "eng-ger"]);
function resetMatch(lm: LiveMatch) {
  lm.status = "upcoming"; lm.startedAt = null; lm.minute = 0; lm.half = 1;
  lm.score = [0, 0]; lm.prob = [...lm.def.preProb]; lm.fired = new Set();
  lm.htUntil = null; lm.ftAt = null;
  lm.nextKickoffAt = Date.now() + REPLAY_GAP_SEC * 1000;
}

/**
 * Social proof that breathes: a slow deterministic climb (people join as the
 * match goes on, faster while live) plus a small wave so the number ticks
 * rather than sitting frozen next to genuinely live counters.
 */
function driftedPredictors(id: string, live: boolean): number {
  const seed = SEED_PREDICTORS[id] ?? 5000;
  const t = Date.now() / 1000;
  const climb = Math.floor((t % 86400) / (live ? 6 : 30));
  const wave = Math.round(Math.sin(t / 9 + seed) * 3);
  return seed + climb + wave;
}

function stateOf(id: string): MatchState {
  const lm = engine[id];
  const d = lm.def;
  const kickoffInSec = Math.max(0, Math.round((lm.nextKickoffAt - Date.now()) / 1000));
  const min = Math.min(90, Math.floor(lm.minute));
  const added = lm.minute > 90 ? Math.floor(lm.minute - 90) : lm.minute > 45 && lm.minute < 46 ? 0 : 0;
  return {
    id: d.id, home: d.home, away: d.away, homeCode: d.homeCode, awayCode: d.awayCode,
    group: d.group, venue: d.venue, status: lm.status, minute: min, added, half: lm.half,
    score: [...lm.score] as [number, number], prob: [...lm.prob] as [number, number, number],
    kickoffInSec, predictors: driftedPredictors(d.id, lm.status === "live"),
    watching: watchingCount(d.id),
  };
}

function tickEngine() {
  const now = Date.now();
  for (const lm of Object.values(engine)) {
    const d = lm.def;

    if (lm.status === "ft") {
      if (LOOP && LOOPING.has(d.id) && now >= lm.nextKickoffAt) resetMatch(lm);
      else continue;
    }
    if (lm.status === "upcoming") {
      if (now >= lm.nextKickoffAt) { lm.status = "live"; lm.startedAt = now; }
      else continue;
    }
    if (lm.status !== "live") continue;
    if (lm.htUntil && now < lm.htUntil) continue;
    if (lm.htUntil && now >= lm.htUntil) { lm.htUntil = null; lm.half = 2; lm.minute = 45; }

    // advance clock
    const elapsedSec = (now - (lm.startedAt as number)) / 1000;
    // account for HT pause already consumed
    lm.minute = Math.min(94, elapsedSec * MIN_PER_SEC - (lm.half === 2 ? HT_PAUSE_SEC * MIN_PER_SEC : 0));
    if (lm.minute < 0) lm.minute = 0;

    // fire due events
    d.timeline.forEach((ev, i) => {
      if (lm.fired.has(i)) return;
      if (lm.minute + 0.001 < ev.min) return;
      lm.fired.add(i);
      applyEvent(lm, ev);
      broadcastEvent(d.id, ev, stateOf(d.id));
      if (ev.type === "goal" && ev.team !== undefined) botGoalBurst(d.id, ev.team);
      if (ev.type === "ht") { lm.htUntil = now + HT_PAUSE_SEC * 1000; }
      if (ev.type === "ft") { lm.status = "ft"; lm.minute = 90; lm.ftAt = now; }
    });
  }
  // push state to everyone in each room + a lightweight matches list
  pushRoomStates();
}

function applyEvent(lm: LiveMatch, ev: MatchEvent) {
  if (ev.type === "goal" && ev.team !== undefined) {
    lm.score[ev.team === 0 ? 0 : 1] += 1;
  }
  if (ev.prob) lm.prob = [...ev.prob];
  else {
    // gentle drift toward certainty as time runs down when scoreline is settled
    const lead = lm.score[0] - lm.score[1];
    const t = Math.min(1, lm.minute / 90);
    if (lead > 0) lm.prob = mix(lm.prob, [60 + lead * 12, 25, 15], t * 0.12);
    else if (lead < 0) lm.prob = mix(lm.prob, [15, 25, 60 + -lead * 12], t * 0.12);
  }
  lm.prob = normalize(lm.prob);
}
const mix = (a: number[], b: number[], k: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] as [number, number, number];
const normalize = (p: number[]): [number, number, number] => {
  const s = p[0] + p[1] + p[2];
  return [(p[0] / s) * 100, (p[1] / s) * 100, (p[2] / s) * 100];
};

// ---------- rooms ----------
interface Member { ws: WebSocket; name: string; side: -1 | 0 | 2; }
interface Poll { id: string; q: string; options: string[]; votes: Map<string, number>; closesAt: number; voters: Set<WebSocket>; }
interface Bot { name: string; side: 0 | 2; }
interface Room {
  matchId: string;
  members: Set<Member>;
  bots: Bot[];
  hype: [number, number]; // [home, away] decaying
  poll: Poll | null;
  nextPollAt: number;
}
const BOT_NAMES = ["TouchlineTod", "OffsideOllie", "NutmegNadia", "StoppageSam", "GegenGrace", "ParkTheBus", "xG_Xavi", "CleanSheetKay", "RabonaRhys", "PanenkaPia", "HalfSpaceHank", "TifoTina"];
const REACTS = ["fire", "goal", "shock", "clap", "laugh", "angry"];
function seedBots(): Bot[] {
  const n = 5 + Math.floor(Math.random() * 5);
  const pool = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, n);
  return pool.map((name) => ({ name, side: (Math.random() > 0.5 ? 0 : 2) as 0 | 2 }));
}
const rooms = new Map<string, Room>();
const memberOf = new Map<WebSocket, { room: string; member: Member }>();

function room(id: string, matchId: string): Room {
  let r = rooms.get(id);
  if (!r) { r = { matchId, members: new Set(), bots: [], hype: [0, 0], poll: null, nextPollAt: Date.now() + 12000 }; rooms.set(id, r); }
  if (r.bots.length === 0) r.bots = seedBots();
  return r;
}
function watchingCount(matchId: string): number {
  let n = 0;
  for (const r of rooms.values()) if (r.matchId === matchId) n += r.members.size + r.bots.length;
  return n;
}
function roomPayload(r: Room) {
  const members = [
    ...[...r.members].map((m) => ({ name: m.name, side: m.side })),
    ...r.bots.map((b) => ({ name: b.name, side: b.side })),
  ];
  return { t: "room", count: members.length, members, hypeHome: Math.round(r.hype[0]), hypeAway: Math.round(r.hype[1]) };
}

/** Ambient crowd: bots react so a solo viewer still feels a packed terrace. */
function botTick() {
  for (const r of rooms.values()) {
    if (r.members.size === 0) continue;
    const lm = engine[r.matchId];
    const live = lm?.status === "live";
    const chance = live ? 0.5 : 0.12;
    if (Math.random() < chance) {
      const b = r.bots[Math.floor(Math.random() * r.bots.length)];
      if (!b) continue;
      if (b.side === 0) r.hype[0] = Math.min(100, r.hype[0] + 7);
      else r.hype[1] = Math.min(100, r.hype[1] + 7);
      sendRoom(r, { t: "react", emoji: REACTS[Math.floor(Math.random() * REACTS.length)], from: b.name, side: b.side });
    }
    // occasional bot poll votes so results look real
    if (r.poll && Math.random() < 0.4) {
      const k = String(Math.floor(Math.random() * r.poll.options.length));
      r.poll.votes.set(k, (r.poll.votes.get(k) ?? 0) + 1);
    }
  }
}
function botGoalBurst(matchId: string, team: 0 | 2) {
  for (const r of rooms.values()) {
    if (r.matchId !== matchId || r.members.size === 0) continue;
    r.hype[team === 0 ? 0 : 1] = Math.min(100, r.hype[team === 0 ? 0 : 1] + 45);
    let i = 0;
    const iv = setInterval(() => {
      const b = r.bots[Math.floor(Math.random() * r.bots.length)];
      if (b) sendRoom(r, { t: "react", emoji: b.side === team ? "goal" : "angry", from: b.name, side: b.side });
      if (++i >= 8) clearInterval(iv);
    }, 180);
  }
}
function sendRoom(r: Room, msg: any) {
  const s = JSON.stringify(msg);
  for (const m of r.members) if (m.ws.readyState === WebSocket.OPEN) m.ws.send(s);
}

function pushRoomStates() {
  for (const [id, r] of rooms) {
    const state = stateOf(r.matchId);
    sendRoom(r, { t: "match", match: state });
    // hype decay
    r.hype = [r.hype[0] * 0.86, r.hype[1] * 0.86];
    sendRoom(r, roomPayload(r));
    // auto polls during live play
    const lm = engine[r.matchId];
    if (lm?.status === "live") maybePoll(id, r);
    if (r.poll && Date.now() >= r.poll.closesAt) closePoll(r);
  }
}

function maybePoll(id: string, r: Room) {
  if (r.poll || Date.now() < r.nextPollAt) return;
  const lm = engine[r.matchId];
  const p: Poll = {
    id: `${id}-${Date.now()}`,
    q: "Who scores the next goal?",
    options: [lm.def.home, "No more goals", lm.def.away],
    votes: new Map(), closesAt: Date.now() + 18000, voters: new Set(),
  };
  r.poll = p;
  r.nextPollAt = Date.now() + 45000;
  sendRoom(r, { t: "poll", id: p.id, q: p.q, options: p.options, closesInMs: 18000 });
}
function closePoll(r: Room) {
  const p = r.poll!;
  const counts = p.options.map((_, i) => p.votes.get(String(i)) ? p.votes.get(String(i))! : 0);
  const total = counts.reduce((a, b) => a + b, 0);
  sendRoom(r, { t: "pollResult", id: p.id, options: p.options, counts, total });
  r.poll = null;
}

// ---------- broadcast helpers ----------
const allSockets = new Set<WebSocket>();
function broadcastEvent(matchId: string, ev: MatchEvent, state: MatchState) {
  const msg = JSON.stringify({ t: "event", matchId, event: ev, match: state });
  for (const ws of allSockets) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
}

// ---------- http + ws ----------
const httpServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/health") { res.end("ok"); return; }
  if (req.url === "/matches") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ matches: MATCHES.map((d) => stateOf(d.id)) }));
    return;
  }
  res.statusCode = 404; res.end("not found");
});

const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", (ws) => {
  allSockets.add(ws);
  ws.send(JSON.stringify({ t: "matches", matches: MATCHES.map((d) => stateOf(d.id)) }));
  let name = "guest";

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.t) {
      case "hello": name = String(msg.name ?? "guest").slice(0, 20); break;
      case "join": {
        leave(ws);
        const r = room(msg.room, msg.matchId);
        const member: Member = { ws, name, side: (msg.side ?? -1) as -1 | 0 | 2 };
        r.members.add(member);
        memberOf.set(ws, { room: msg.room, member });
        ws.send(JSON.stringify({ t: "match", match: stateOf(r.matchId) }));
        sendRoom(r, roomPayload(r));
        if (r.poll) ws.send(JSON.stringify({ t: "poll", id: r.poll.id, q: r.poll.q, options: r.poll.options, closesInMs: r.poll.closesAt - Date.now() }));
        break;
      }
      case "leave": leave(ws); break;
      case "setSide": {
        const e = memberOf.get(ws); if (!e) break;
        e.member.side = (msg.side ?? -1) as -1 | 0 | 2;
        const r = rooms.get(e.room); if (r) sendRoom(r, roomPayload(r));
        break;
      }
      case "react": {
        const e = memberOf.get(ws); if (!e) break;
        const r = rooms.get(e.room); if (!r) break;
        const side = e.member.side;
        if (side === 0) r.hype[0] = Math.min(100, r.hype[0] + 9);
        if (side === 2) r.hype[1] = Math.min(100, r.hype[1] + 9);
        sendRoom(r, { t: "react", emoji: String(msg.emoji ?? "fire").slice(0, 12), from: e.member.name, side });
        break;
      }
      case "pollVote": {
        const e = memberOf.get(ws); if (!e) break;
        const r = rooms.get(e.room); if (!r?.poll || r.poll.id !== msg.pollId) break;
        if (r.poll.voters.has(ws)) break;
        r.poll.voters.add(ws);
        const k = String(msg.option);
        r.poll.votes.set(k, (r.poll.votes.get(k) ?? 0) + 1);
        break;
      }
    }
  });

  ws.on("close", () => { leave(ws); allSockets.delete(ws); });
});

function leave(ws: WebSocket) {
  const e = memberOf.get(ws);
  if (!e) return;
  const r = rooms.get(e.room);
  if (r) { r.members.delete(e.member); sendRoom(r, roomPayload(r)); if (r.members.size === 0) rooms.delete(e.room); }
  memberOf.delete(ws);
}

setInterval(tickEngine, 700);
setInterval(botTick, 900);
httpServer.listen(PORT, () => console.log(`terrace server on :${PORT} (ws /ws) · ${MIN_PER_SEC} match-min/sec`));
