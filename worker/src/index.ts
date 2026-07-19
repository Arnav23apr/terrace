/**
 * Terrace realtime backend as a Cloudflare Durable Object.
 *
 * A single "hub" DO holds the whole match engine + rooms in memory and drives
 * it with a self-rescheduling alarm (~800ms), so matches keep progressing with
 * zero viewers. WebSockets use the Hibernation API, so they survive isolate
 * eviction; per-socket identity is stored on each socket's attachment and the
 * room map is rebuilt from live sockets on a cold start. Everything below is a
 * faithful port of the Node ws server — same protocol, same behaviour.
 */
import { MATCHES, MatchDef, MatchState, MatchEvent, SEED_PREDICTORS } from "./matches";

export interface Env {
  TERRACE: DurableObjectNamespace;
  MIN_PER_SEC?: string;
  REPLAY_GAP_SEC?: string;
  TXLINE_API_TOKEN?: string;
}

const CORS = { "Access-Control-Allow-Origin": "*" };

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const id = env.TERRACE.idFromName("hub");
    return env.TERRACE.get(id).fetch(req);
  },
};

interface LiveMatch {
  def: MatchDef;
  startedAt: number | null;
  status: "upcoming" | "live" | "ft";
  minute: number;
  half: 1 | 2;
  score: [number, number];
  prob: [number, number, number];
  fired: Set<number>;
  htUntil: number | null;
  ftAt: number | null;
  nextKickoffAt: number;
}
interface Poll { id: string; q: string; options: string[]; votes: Map<string, number>; closesAt: number; voters: Set<string>; }
interface Bot { name: string; side: 0 | 2; }
interface Room { matchId: string; members: Set<WebSocket>; bots: Bot[]; hype: [number, number]; poll: Poll | null; nextPollAt: number; }
interface MemberData { room: string; matchId: string; name: string; side: -1 | 0 | 2; }

const HT_PAUSE_SEC = 4;
const BOT_NAMES = ["TouchlineTod", "OffsideOllie", "NutmegNadia", "StoppageSam", "GegenGrace", "ParkTheBus", "xG_Xavi", "CleanSheetKay", "RabonaRhys", "PanenkaPia", "HalfSpaceHank", "TifoTina"];
const REACTS = ["fire", "goal", "shock", "clap", "laugh", "angry"];
const LOOPING = new Set(["esp-arg", "eng-ger"]);

export class TerraceHub {
  state: DurableObjectState;
  env: Env;
  MIN_PER_SEC: number;
  REPLAY_GAP_SEC: number;

  engine: Record<string, LiveMatch> | null = null;
  rooms = new Map<string, Room>();
  memberData = new Map<WebSocket, MemberData>();
  lastBotBurst = 0;
  tx = { checkedAt: "never", guestAuth: { ok: false, httpStatus: 0, jwtPreview: null as string | null }, fixtures: { source: "scripted", httpStatus: null as number | null, note: "not yet checked" } };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.MIN_PER_SEC = Number(env.MIN_PER_SEC ?? 2);
    this.REPLAY_GAP_SEC = Number(env.REPLAY_GAP_SEC ?? 15);
  }

  // ---------- lifecycle ----------
  initEngine() {
    if (this.engine) return;
    const bootAt = Date.now();
    this.engine = {};
    for (const def of MATCHES) {
      this.engine[def.id] = {
        def, startedAt: null, status: "upcoming", minute: 0, half: 1,
        score: [0, 0], prob: [...def.preProb], fired: new Set(), htUntil: null,
        ftAt: null, nextKickoffAt: bootAt + def.kickoffOffsetSec * 1000,
      };
    }
  }

  /** Rebuild the room map from hibernating sockets after a cold start. */
  rebuildRooms() {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as MemberData | null;
      if (!att || !att.room) continue;
      this.memberData.set(ws, att);
      const r = this.room(att.room, att.matchId);
      r.members.add(ws);
    }
  }

  async ensure() {
    this.initEngine();
    if (this.rooms.size === 0 && this.state.getWebSockets().length > 0) this.rebuildRooms();
    if ((await this.state.storage.getAlarm()) === null) await this.state.storage.setAlarm(Date.now() + 800);
  }

  async alarm() {
    await this.ensure();
    try { this.tickEngine(); this.botTick(); } catch (e) { /* keep the loop alive */ }
    await this.state.storage.setAlarm(Date.now() + 800);
    // hourly-ish live TxLINE check
    if (Date.now() - (this.txCheckedMs || 0) > 3600_000) this.refreshTxline();
  }
  txCheckedMs = 0;

  // ---------- engine ----------
  driftedPredictors(id: string, live: boolean): number {
    const seed = SEED_PREDICTORS[id] ?? 5000;
    const t = Date.now() / 1000;
    const climb = Math.floor((t % 86400) / (live ? 6 : 30));
    const wave = Math.round(Math.sin(t / 9 + seed) * 3);
    return seed + climb + wave;
  }
  stateOf(id: string): MatchState {
    const lm = this.engine![id];
    const d = lm.def;
    const kickoffInSec = Math.max(0, Math.round((lm.nextKickoffAt - Date.now()) / 1000));
    const min = Math.min(90, Math.floor(lm.minute));
    return {
      id: d.id, home: d.home, away: d.away, homeCode: d.homeCode, awayCode: d.awayCode,
      group: d.group, venue: d.venue, status: lm.status, minute: min, added: 0, half: lm.half,
      score: [...lm.score] as [number, number], prob: [...lm.prob] as [number, number, number],
      kickoffInSec, predictors: this.driftedPredictors(d.id, lm.status === "live"),
      watching: this.watchingCount(d.id),
    };
  }
  resetMatch(lm: LiveMatch) {
    lm.status = "upcoming"; lm.startedAt = null; lm.minute = 0; lm.half = 1;
    lm.score = [0, 0]; lm.prob = [...lm.def.preProb]; lm.fired = new Set();
    lm.htUntil = null; lm.ftAt = null;
    lm.nextKickoffAt = Date.now() + this.REPLAY_GAP_SEC * 1000;
  }
  tickEngine() {
    const now = Date.now();
    for (const lm of Object.values(this.engine!)) {
      const d = lm.def;
      if (lm.status === "ft") { if (LOOPING.has(d.id) && now >= lm.nextKickoffAt) this.resetMatch(lm); else continue; }
      if (lm.status === "upcoming") { if (now >= lm.nextKickoffAt) { lm.status = "live"; lm.startedAt = now; } else continue; }
      if (lm.status !== "live") continue;
      if (lm.htUntil && now < lm.htUntil) continue;
      if (lm.htUntil && now >= lm.htUntil) { lm.htUntil = null; lm.half = 2; lm.minute = 45; }
      const elapsedSec = (now - (lm.startedAt as number)) / 1000;
      lm.minute = Math.min(94, elapsedSec * this.MIN_PER_SEC - (lm.half === 2 ? HT_PAUSE_SEC * this.MIN_PER_SEC : 0));
      if (lm.minute < 0) lm.minute = 0;
      d.timeline.forEach((ev, i) => {
        if (lm.fired.has(i)) return;
        if (lm.minute + 0.001 < ev.min) return;
        lm.fired.add(i);
        this.applyEvent(lm, ev);
        this.broadcastEvent(d.id, ev, this.stateOf(d.id));
        if (ev.type === "goal" && ev.team !== undefined) this.botGoalBurst(d.id, ev.team);
        if (ev.type === "ht") lm.htUntil = now + HT_PAUSE_SEC * 1000;
        if (ev.type === "ft") { lm.status = "ft"; lm.minute = 90; lm.ftAt = now; }
      });
    }
    this.pushRoomStates();
  }
  applyEvent(lm: LiveMatch, ev: MatchEvent) {
    if (ev.type === "goal" && ev.team !== undefined) lm.score[ev.team === 0 ? 0 : 1] += 1;
    if (ev.prob) lm.prob = [...ev.prob];
    else {
      const lead = lm.score[0] - lm.score[1];
      const t = Math.min(1, lm.minute / 90);
      if (lead > 0) lm.prob = mix(lm.prob, [60 + lead * 12, 25, 15], t * 0.12);
      else if (lead < 0) lm.prob = mix(lm.prob, [15, 25, 60 + -lead * 12], t * 0.12);
    }
    lm.prob = normalize(lm.prob);
  }

  // ---------- rooms ----------
  room(id: string, matchId: string): Room {
    let r = this.rooms.get(id);
    if (!r) { r = { matchId, members: new Set(), bots: seedBots(), hype: [0, 0], poll: null, nextPollAt: Date.now() + 12000 }; this.rooms.set(id, r); }
    if (r.bots.length === 0) r.bots = seedBots();
    return r;
  }
  watchingCount(matchId: string): number {
    let n = 0;
    for (const r of this.rooms.values()) if (r.matchId === matchId) n += r.members.size + r.bots.length;
    return n;
  }
  roomPayload(r: Room) {
    const members = [
      ...[...r.members].map((ws) => { const m = this.memberData.get(ws); return { name: m?.name ?? "guest", side: m?.side ?? -1 }; }),
      ...r.bots.map((b) => ({ name: b.name, side: b.side })),
    ];
    return { t: "room", count: members.length, members, hypeHome: Math.round(r.hype[0]), hypeAway: Math.round(r.hype[1]) };
  }
  sendRoom(r: Room, msg: any) {
    const s = JSON.stringify(msg);
    for (const ws of r.members) safeSend(ws, s);
  }
  botTick() {
    for (const r of this.rooms.values()) {
      if (r.members.size === 0) continue;
      const lm = this.engine![r.matchId];
      const chance = lm?.status === "live" ? 0.5 : 0.12;
      if (Math.random() < chance) {
        const b = r.bots[Math.floor(Math.random() * r.bots.length)];
        if (b) {
          if (b.side === 0) r.hype[0] = Math.min(100, r.hype[0] + 7); else r.hype[1] = Math.min(100, r.hype[1] + 7);
          this.sendRoom(r, { t: "react", emoji: REACTS[Math.floor(Math.random() * REACTS.length)], from: b.name, side: b.side });
        }
      }
      if (r.poll && Math.random() < 0.4) {
        const k = String(Math.floor(Math.random() * r.poll.options.length));
        r.poll.votes.set(k, (r.poll.votes.get(k) ?? 0) + 1);
      }
    }
  }
  botGoalBurst(matchId: string, team: 0 | 2) {
    for (const r of this.rooms.values()) {
      if (r.matchId !== matchId || r.members.size === 0) continue;
      r.hype[team === 0 ? 0 : 1] = Math.min(100, r.hype[team === 0 ? 0 : 1] + 45);
      for (let i = 0; i < 8; i++) {
        const b = r.bots[Math.floor(Math.random() * r.bots.length)];
        if (b) this.sendRoom(r, { t: "react", emoji: b.side === team ? "goal" : "angry", from: b.name, side: b.side });
      }
    }
  }
  pushRoomStates() {
    for (const [id, r] of this.rooms) {
      this.sendRoom(r, { t: "match", match: this.stateOf(r.matchId) });
      r.hype = [r.hype[0] * 0.86, r.hype[1] * 0.86];
      this.sendRoom(r, this.roomPayload(r));
      const lm = this.engine![r.matchId];
      if (lm?.status === "live") this.maybePoll(id, r);
      if (r.poll && Date.now() >= r.poll.closesAt) this.closePoll(r);
    }
  }
  maybePoll(id: string, r: Room) {
    if (r.poll || Date.now() < r.nextPollAt) return;
    const lm = this.engine![r.matchId];
    const p: Poll = { id: `${id}-${Date.now()}`, q: "Who scores the next goal?", options: [lm.def.home, "No more goals", lm.def.away], votes: new Map(), closesAt: Date.now() + 18000, voters: new Set() };
    r.poll = p; r.nextPollAt = Date.now() + 45000;
    this.sendRoom(r, { t: "poll", id: p.id, q: p.q, options: p.options, closesInMs: 18000 });
  }
  closePoll(r: Room) {
    const p = r.poll!;
    const counts = p.options.map((_, i) => p.votes.get(String(i)) ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    this.sendRoom(r, { t: "pollResult", id: p.id, options: p.options, counts, total });
    r.poll = null;
  }
  broadcastEvent(matchId: string, ev: MatchEvent, state: MatchState) {
    const msg = JSON.stringify({ t: "event", matchId, event: ev, match: state });
    for (const ws of this.state.getWebSockets()) safeSend(ws, msg);
  }

  // ---------- TxLINE live integration ----------
  async refreshTxline() {
    this.txCheckedMs = Date.now();
    this.tx.checkedAt = new Date().toISOString();
    try {
      const g = await fetch("https://txline.txodds.com/auth/guest/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const jwt = g.ok ? ((await g.json()) as any).token : null;
      this.tx.guestAuth = { ok: !!jwt, httpStatus: g.status, jwtPreview: jwt ? `${jwt.slice(0, 12)}…` : null };
      if (!jwt) { this.tx.fixtures = { source: "scripted", httpStatus: null, note: "guest auth failed" }; return; }
      const day = Math.floor(Date.now() / 86400000);
      const fx = await fetch(`https://txline.txodds.com/api/fixtures/snapshot?startEpochDay=${day}`, { headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": this.env.TXLINE_API_TOKEN ?? "" } });
      this.tx.fixtures = fx.ok
        ? { source: "txline", httpStatus: 200, note: "live TxLINE fixtures" }
        : { source: "scripted", httpStatus: fx.status, note: `fixtures ${fx.status} (needs activated API token; TxODDS activation is 504-blocked) — scripted fixtures shaped to TxLINE schema` };
    } catch (e: any) {
      this.tx.fixtures = { source: "scripted", httpStatus: 0, note: `error: ${String(e?.message ?? e).slice(0, 60)}` };
    }
  }

  // ---------- HTTP + WS ----------
  async fetch(req: Request): Promise<Response> {
    await this.ensure();
    if (this.tx.checkedAt === "never") this.refreshTxline();
    const url = new URL(req.url);

    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ room: "", matchId: "", name: "guest", side: -1 });
      safeSend(server, JSON.stringify({ t: "matches", matches: MATCHES.map((d) => this.stateOf(d.id)) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/health") return new Response("ok", { headers: CORS });
    if (url.pathname === "/matches") return json({ matches: MATCHES.map((d) => this.stateOf(d.id)) });
    if (url.pathname === "/txline-status") return json({ base: "https://txline.txodds.com", ...this.tx });
    return new Response("not found", { status: 404, headers: CORS });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ensure();
    let msg: any;
    try { msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const md = this.memberData.get(ws) ?? { room: "", matchId: "", name: "guest", side: -1 as -1 | 0 | 2 };

    switch (msg.t) {
      case "hello": {
        md.name = String(msg.name ?? "guest").slice(0, 20);
        this.memberData.set(ws, md); ws.serializeAttachment(md);
        break;
      }
      case "join": {
        this.leave(ws);
        const r = this.room(msg.room, msg.matchId);
        md.room = msg.room; md.matchId = msg.matchId; md.side = (msg.side ?? -1) as -1 | 0 | 2;
        this.memberData.set(ws, md); ws.serializeAttachment(md);
        r.members.add(ws);
        safeSend(ws, JSON.stringify({ t: "match", match: this.stateOf(r.matchId) }));
        this.sendRoom(r, this.roomPayload(r));
        if (r.poll) safeSend(ws, JSON.stringify({ t: "poll", id: r.poll.id, q: r.poll.q, options: r.poll.options, closesInMs: r.poll.closesAt - Date.now() }));
        break;
      }
      case "leave": this.leave(ws); break;
      case "setSide": {
        md.side = (msg.side ?? -1) as -1 | 0 | 2;
        this.memberData.set(ws, md); ws.serializeAttachment(md);
        const r = this.rooms.get(md.room); if (r) this.sendRoom(r, this.roomPayload(r));
        break;
      }
      case "react": {
        const r = this.rooms.get(md.room); if (!r) break;
        if (md.side === 0) r.hype[0] = Math.min(100, r.hype[0] + 9);
        if (md.side === 2) r.hype[1] = Math.min(100, r.hype[1] + 9);
        this.sendRoom(r, { t: "react", emoji: String(msg.emoji ?? "fire").slice(0, 12), from: md.name, side: md.side });
        break;
      }
      case "pollVote": {
        const r = this.rooms.get(md.room); if (!r?.poll || r.poll.id !== msg.pollId) break;
        const voterId = md.name + md.room;
        if (r.poll.voters.has(voterId)) break;
        r.poll.voters.add(voterId);
        const k = String(msg.option);
        r.poll.votes.set(k, (r.poll.votes.get(k) ?? 0) + 1);
        break;
      }
    }
  }
  async webSocketClose(ws: WebSocket) { this.leave(ws); }
  async webSocketError(ws: WebSocket) { this.leave(ws); }

  leave(ws: WebSocket) {
    const md = this.memberData.get(ws);
    if (!md || !md.room) return;
    const r = this.rooms.get(md.room);
    if (r) { r.members.delete(ws); this.sendRoom(r, this.roomPayload(r)); if (r.members.size === 0) this.rooms.delete(md.room); }
    md.room = ""; md.matchId = "";
    this.memberData.set(ws, md);
    try { ws.serializeAttachment(md); } catch {}
  }
}

// ---------- helpers ----------
function safeSend(ws: WebSocket, s: string) { try { ws.send(s); } catch { /* closed */ } }
function json(obj: any) { return new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json", ...CORS } }); }
function seedBots(): Bot[] {
  const n = 5 + Math.floor(Math.random() * 5);
  const pool = [...BOT_NAMES].sort(() => Math.random() - 0.5).slice(0, n);
  return pool.map((name) => ({ name, side: (Math.random() > 0.5 ? 0 : 2) as 0 | 2 }));
}
const mix = (a: number[], b: number[], k: number): [number, number, number] =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] as [number, number, number];
const normalize = (p: number[]): [number, number, number] => {
  const s = p[0] + p[1] + p[2];
  return [(p[0] / s) * 100, (p[1] / s) * 100, (p[2] / s) * 100];
};
