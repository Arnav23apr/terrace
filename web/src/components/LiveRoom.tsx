"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useTerrace } from "@/lib/useTerrace";
import { WinBar, LiveBadge, Flag } from "@/components/ui";
import { REACTIONS, type MatchEvent, type Poll, type PollResult } from "@/lib/types";
import { teamColor } from "@/lib/flags";
import { getSession, shortPk } from "@/lib/solauth";
import CountUp from "@/components/fx/CountUp";
import AvatarOrbit from "@/components/fx/AvatarOrbit";
import { useEmojiBurst } from "@/components/fx/useEmojiBurst";

const HANDLES = ["TouchlineTod", "OffsideOllie", "NutmegNadia", "StoppageSam", "GegenGrace", "ParkerTheBus", "xG_Xavi", "CleanSheetKay", "RabonaRhys", "PanenkaPia"];
function myHandle(): string {
  if (typeof window === "undefined") return "You";
  const sol = getSession();
  if (sol) return shortPk(sol.pubkey);
  let h = localStorage.getItem("terrace-handle");
  if (!h) { h = HANDLES[Math.floor(Math.random() * HANDLES.length)] + Math.floor(Math.random() * 90 + 10); localStorage.setItem("terrace-handle", h); }
  return h;
}

interface Float { key: number; glyph: string; x: number; side: number; }
interface TickerItem extends MatchEvent { key: number; }

export function LiveRoom({ matchId, roomId }: { matchId: string; roomId: string }) {
  const [floats, setFloats] = useState<Float[]>([]);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [goal, setGoal] = useState<{ team: number; player?: string; text: string; score: [number, number] } | null>(null);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [voted, setVoted] = useState<number | null>(null);
  const [result, setResult] = useState<PollResult | null>(null);
  const [side, setSideState] = useState<number>(-1);
  const [scorePop, setScorePop] = useState(false);
  const keyRef = useRef(1);
  const name = useMemo(myHandle, []);
  const burstFrom = useEmojiBurst();

  // Spoiler Shield: streams run 20-60s behind the data feed, so fans get
  // scored on by their second screen. Buffer match state + events by a
  // user-set delay so Terrace celebrates WITH the TV, not before it.
  const [shield, setShield] = useState(0);
  const shieldRef = useRef(0);
  shieldRef.current = shield;
  const matchBuf = useRef<{ at: number; m: NonNullable<ReturnType<typeof useTerrace>["match"]> }[]>([]);
  const [shownMatch, setShownMatch] = useState<typeof matchBuf.current[number]["m"] | null>(null);
  useEffect(() => {
    const iv = setInterval(() => {
      if (shieldRef.current === 0) return;
      const cut = Date.now() - shieldRef.current * 1000;
      const buf = matchBuf.current;
      let pick = null;
      for (const e of buf) { if (e.at <= cut) pick = e.m; else break; }
      if (pick) setShownMatch(pick);
      while (buf.length > 2 && buf[0].at <= cut) buf.shift();
    }, 400);
    return () => clearInterval(iv);
  }, []);

  const spawnBurst = (glyph: string, n: number, forcedSide?: number) => {
    const add: Float[] = Array.from({ length: n }, () => ({
      key: keyRef.current++, glyph, x: 8 + Math.random() * 84, side: forcedSide ?? Math.random() > 0.5 ? 2 : 0,
    }));
    setFloats((f) => [...f.slice(-40), ...add]);
    add.forEach((a) => setTimeout(() => setFloats((f) => f.filter((x) => x.key !== a.key)), 2400));
  };

  const handleEvent = (e: any) => {
      // only this room's match belongs on this timeline (events broadcast globally)
      if (e.matchId !== matchId) return;
      const { event } = e;
      setTicker((t) => [{ ...event, key: keyRef.current++ }, ...t].slice(0, 7));
      if (event.type === "goal") {
        setGoal({ team: event.team ?? 0, player: event.player, text: event.text, score: e.match.score });
        setScorePop(true); setTimeout(() => setScorePop(false), 700);
        spawnBurst("⚽", 14, event.team);
        setTimeout(() => setGoal(null), 3600);
      }
  };

  const terrace = useTerrace({
    onReact: (r) => spawnBurst(glyphFor(r.emoji), 1, r.side),
    onEvent: (e) => {
      const d = shieldRef.current;
      if (d > 0) setTimeout(() => handleEvent(e), d * 1000);
      else handleEvent(e);
    },
    onPoll: (p) => { setPoll(p); setVoted(null); setResult(null); },
    onPollResult: (r) => { setResult(r); setPoll(null); setTimeout(() => setResult(null), 7000); },
  });
  const { match, room, join, react, setSide, vote } = terrace;
  useEffect(() => { if (match) matchBuf.current.push({ at: Date.now(), m: match }); }, [match]);

  useEffect(() => { join(roomId, matchId, name, -1); }, [join, roomId, matchId, name]);

  const chooseSide = (s: number) => { setSideState(s); setSide(s); };

  if (!match) {
    return <div className="mx-auto max-w-[1180px] px-5 py-20"><div className="glass h-80 animate-pulse rounded-[28px]" /></div>;
  }

  const view = shield > 0 && shownMatch ? shownMatch : match;
  const ch = teamColor(match.homeCode);
  const ca = teamColor(match.awayCode);
  const hype = room ? room.hypeHome + room.hypeAway : 0;
  const homeShare = hype > 0 ? (room!.hypeHome / hype) * 100 : 50;

  return (
    <main className="mx-auto max-w-[1180px] px-5 pb-28">
      <header className="sticky top-0 z-40 -mx-5 mb-6 flex items-center justify-between px-5 py-4 backdrop-blur-xl"
        style={{ background: "rgba(10,11,14,0.6)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <Link href="/" className="inline-flex items-center gap-2 font-display text-[16px] uppercase tracking-[0.04em] text-white/70 transition hover:text-white">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          Terrace
        </Link>
        <span className="font-mono text-[11px] text-white/60">{match.group} · {match.venue}</span>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-104px)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* LEFT: broadcast */}
        <div className="flex min-h-0 flex-col gap-5">
          <div className="glass relative overflow-hidden rounded-[28px] p-7">
            {/* broadcast score-bug: team-colour rule across the top */}
            {view.status === "live" && (
              <span aria-hidden className="absolute inset-x-0 top-0 z-[16] h-[3px]" style={{ background: `linear-gradient(90deg, ${ch}, ${ca})` }} />
            )}
            {/* floating reactions */}
            <div className="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
              {floats.map((f) => (
                <span key={f.key} className="react-fly absolute bottom-16 text-[26px]" style={{ left: `${f.x}%` }}>{f.glyph}</span>
              ))}
            </div>

            <div className="relative z-10 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">{view.status === "upcoming" ? "Kicks off soon" : "Live"}</span>
              <LiveBadge {...view} />
            </div>

            <div className="relative z-10 mt-7 flex items-center justify-between">
              <Team name={match.home} code={match.homeCode} />
              <motion.div className="px-4 text-center" animate={scorePop ? { scale: [1, 1.18, 1] } : {}} transition={{ duration: 0.6 }}>
                <div className="font-mono text-6xl font-semibold tabular-nums">{view.score[0]}<span className="mx-1.5 text-white/25">:</span>{view.score[1]}</div>
                <div className="mt-1 font-mono text-[11px] text-white/55">{view.status === "live" ? "in play" : view.status === "ft" ? "full time" : ""}</div>
              </motion.div>
              <Team name={match.away} code={match.awayCode} right />
            </div>

            <div className="relative z-10 mt-8"><WinBar match={view} /></div>

            <div className="relative z-10 mt-6 flex items-center justify-between font-mono text-[11px] text-white/60">
              <span><CountUp value={view.predictors} /> predicting</span>
              <span className="inline-flex items-center gap-1.5 text-acc"><span className="live-dot h-1.5 w-1.5 rounded-full bg-acc" /><CountUp value={view.watching} />&nbsp;on the terrace</span>
            </div>

            {/* goal explosion */}
            <AnimatePresence>
              {goal && (
                <motion.div
                  className="absolute inset-0 z-20 grid place-items-center rounded-[28px]"
                  style={{ background: `radial-gradient(120% 90% at 50% 50%, ${goal.team === 2 ? ca : ch}22, rgba(10,11,14,0.94) 70%)` }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {/* the takeover carries the NEW score — the moment it changed is
                      exactly when it must stay readable */}
                  <div className="text-center">
                    <motion.div className="font-display text-6xl uppercase tracking-[0.02em] md:text-8xl" style={{ color: goal.team === 2 ? ca : ch }}
                      initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 15 }}>
                      Goal
                    </motion.div>
                    <motion.div className="mt-3 font-mono text-4xl font-semibold tabular-nums text-white md:text-5xl"
                      initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12, type: "spring", stiffness: 200, damping: 20 }}>
                      {goal.score[0]}<span className="mx-2 text-white/50">:</span>{goal.score[1]}
                    </motion.div>
                    <motion.p className="mt-2 text-[15px] font-medium text-white/85" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                      {goal.player}
                    </motion.p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* broadcast timeline */}
          <div className="glass flex min-h-0 flex-1 flex-col rounded-[22px] p-5">
            <div className="mb-4 flex shrink-0 items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Timeline</p>
              <div className="flex items-center gap-3 font-mono text-[10px] text-white/55">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ch }} />{match.homeCode}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ca }} />{match.awayCode}</span>
              </div>
            </div>
            {ticker.length === 0 ? (
              <p className="grid flex-1 place-items-center text-center text-[13px] text-white/50">The timeline lights up<br />as the match unfolds.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {/* rail wraps the list so it only spans real content, not the empty box */}
                <div className="relative">
                  <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-white/[0.09]" />
                  <ul>
                    <AnimatePresence initial={false}>
                      {ticker.map((e) => <TimelineRow key={e.key} e={e} ch={ch} ca={ca} />)}
                    </AnimatePresence>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: watch party */}
        <div className="flex min-h-0 flex-col gap-5">
          {/* presence + side */}
          <div className="glass rounded-[22px] p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">On the terrace</p>
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-acc"><span className="live-dot h-1.5 w-1.5 rounded-full bg-acc" /> live</span>
            </div>
            <div className="mt-2">
              <AvatarOrbit
                size={148}
                names={(room?.members ?? [{ name, side }]).map((m) => m.name)}
                centerTop={String(room?.count ?? 1)}
                centerSub="watching"
              />
            </div>

            {side === -1 ? (
              <div className="mt-4">
                <p className="mb-2 text-[13px] text-white/55">Pick your end. Your reactions fuel that side.</p>
                <div className="grid grid-cols-2 gap-2">
                  <SideBtn onClick={() => chooseSide(0)} color={ch}><Flag code={match.homeCode} className="text-lg" /> {match.home}</SideBtn>
                  <SideBtn onClick={() => chooseSide(2)} color={ca}><Flag code={match.awayCode} className="text-lg" /> {match.away}</SideBtn>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-white/60">You&apos;re with <span className="font-semibold" style={{ color: side === 0 ? ch : ca }}>{side === 0 ? match.home : match.away}</span>. <button className="underline hover:text-white/70" onClick={() => chooseSide(-1)}>switch</button></p>
            )}
          </div>

          {/* rivalry tug of war */}
          <div className="glass rounded-[22px] p-5">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">Who&apos;s louder</p>
            {/* the scarf: each end's colours knitted in, pulled toward the louder side */}
            <div className="scarf w-full bg-white/[0.05]">
              <motion.div className="absolute inset-y-0 left-0" style={{ background: ch }} animate={{ width: `${homeShare}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
              <motion.div className="absolute inset-y-0 right-0" style={{ background: ca }} animate={{ width: `${100 - homeShare}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} />
              <div className="absolute inset-0 z-10 flex items-center justify-between px-3 font-display text-[15px] uppercase tracking-[0.06em] text-ink/85">
                <span>{match.homeCode}</span><span>{match.awayCode}</span>
              </div>
            </div>
            <div className="scarf-fringe"><span /><span /></div>
          </div>

          {/* live poll (fills the middle; placeholder keeps the column intentional) */}
          <div className="flex min-h-0 flex-1 flex-col justify-end">
          <AnimatePresence mode="wait">
            {!poll && !result && (
              <motion.div key="wait" className="glass-2 flex items-center justify-center gap-2.5 rounded-full px-5 py-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-acc/70" />
                <p className="text-[12.5px] text-white/55">A poll drops mid-match · react to fuel your end</p>
              </motion.div>
            )}
            {poll && (
              <motion.div key="poll" className="glass acc-glow rounded-[22px] p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}>
                <p className="mb-3 text-[15px] font-semibold tracking-tight">{poll.q}</p>
                <div className="grid grid-cols-1 gap-2">
                  {poll.options.map((o, i) => (
                    <button key={i} disabled={voted !== null} onClick={() => { setVoted(i); vote(poll.id, i); }}
                      className={`rounded-full border px-4 py-2.5 text-left text-[13.5px] font-medium transition active:scale-[0.98] ${voted === i ? "border-acc bg-acc/15 text-acc" : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/20"}`}>
                      {o}
                    </button>
                  ))}
                </div>
                <p className="mt-2.5 font-mono text-[10.5px] text-white/50">{voted !== null ? "Locked in — results at the whistle" : "Tap to call it"}</p>
              </motion.div>
            )}
            {result && !poll && (
              <motion.div key="result" className="glass rounded-[22px] p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">The terrace called</p>
                <div className="space-y-2">
                  {result.options.map((o, i) => {
                    const pct = result.total ? (result.counts[i] / result.total) * 100 : 0;
                    return (
                      <div key={i}>
                        <div className="mb-1 flex justify-between text-[12.5px]"><span className="text-white/80">{o}</span><span className="font-mono text-white/50">{pct.toFixed(0)}%</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full bg-acc" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }} /></div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* spoiler shield */}
          <div className="glass-2 flex shrink-0 items-center justify-between gap-3 rounded-full px-4 py-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/55" title="Delay match events so Terrace celebrates with your TV, not before it">
              Spoiler shield
            </span>
            <div className="flex items-center gap-1">
              {[0, 15, 30, 60].map((d) => (
                <button key={d} onClick={() => setShield(d)}
                  className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] transition ${shield === d ? "bg-acc text-ink" : "text-white/55 hover:text-white"}`}>
                  {d === 0 ? "off" : `${d}s`}
                </button>
              ))}
            </div>
          </div>

          {/* reaction bar */}
          <div className="glass mt-auto shrink-0 rounded-[22px] p-4">
            <div className="grid grid-cols-6 gap-2">
              {REACTIONS.map((r) => (
                <motion.button key={r.id} whileTap={{ scale: 0.85 }} aria-label={`React with ${r.id}`}
                  onClick={(e) => { react(r.id); burstFrom(e.currentTarget, r.glyph); spawnBurst(r.glyph, 1, side); }}
                  className="grid aspect-square place-items-center rounded-2xl bg-white/[0.04] text-[24px] transition hover:bg-white/[0.09]">
                  {r.glyph}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Team({ name, code, right = false }: { name: string; code: string; right?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <Flag code={code} className="text-5xl" />
      <span className="text-[16px] font-semibold tracking-tight">{name}</span>
    </div>
  );
}
function SideBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] font-semibold transition hover:border-white/25 active:scale-[0.97]"
      style={{ borderColor: `${color}40` }}>
      {children}
    </button>
  );
}
function TimelineIcon({ type, color }: { type: MatchEvent["type"]; color: string }) {
  if (type === "goal")
    return <span className="grid h-6 w-6 place-items-center rounded-full text-[13px]" style={{ background: `${color}22`, boxShadow: `inset 0 0 0 1.5px ${color}` }}>⚽</span>;
  if (type === "red") return <span className="h-6 w-4 rounded-[3px] bg-[#e94b3c]" />;
  if (type === "yellow") return <span className="h-6 w-4 rounded-[3px] bg-[#f2c14e]" />;
  if (type === "chance") return <span className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.06] text-[10px] text-white/60">!</span>;
  return <span className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.06] text-[9px] font-mono uppercase text-white/50">{type === "ht" ? "HT" : type === "ft" ? "FT" : "•"}</span>;
}

function TimelineRow({ e, ch, ca }: { e: TickerItem; ch: string; ca: string }) {
  const side = e.type === "kickoff" || e.type === "ht" || e.type === "ft" ? -1 : e.team ?? -1;
  const color = side === 2 ? ca : ch;
  const neutral = side === -1;
  const bold = e.type === "goal";

  if (neutral) {
    return (
      <motion.li layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative my-2 flex items-center justify-center">
        <span className="relative z-10 rounded-full bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white/60 ring-1 ring-white/10">{e.text || (e.type === "ht" ? "Half time" : "Full time")}</span>
      </motion.li>
    );
  }
  const content = (
    <div className={`flex-1 ${side === 0 ? "pr-4 text-right" : "pl-4 text-left"}`}>
      <p className={`text-[13.5px] leading-snug ${bold ? "font-semibold text-white" : "text-white/75"}`}>{e.text}</p>
    </div>
  );
  const marker = (
    <div className="relative z-10 flex shrink-0 flex-col items-center gap-1">
      <TimelineIcon type={e.type} color={color} />
      <span className="font-mono text-[10px] text-white/55">{e.min}&apos;</span>
    </div>
  );
  return (
    <motion.li layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="relative flex items-start gap-2 py-2.5">
      {side === 0 ? <>{content}{marker}<div className="flex-1" /></> : <><div className="flex-1" />{marker}{content}</>}
    </motion.li>
  );
}
function glyphFor(id: string): string {
  return REACTIONS.find((r) => r.id === id)?.glyph ?? "🔥";
}
