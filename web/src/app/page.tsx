"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTerrace } from "@/lib/useTerrace";
import { getSession, signIn, signOut, shortPk, type SolSession } from "@/lib/solauth";
import { WinBar, LiveBadge, Flag, fmtKickoff } from "@/components/ui";
import { teamColor } from "@/lib/flags";
import ShinyPill from "@/components/fx/ShinyPill";
import KineticText from "@/components/fx/KineticText";
import CountUp from "@/components/fx/CountUp";
import Marquee from "@/components/fx/Marquee";
import type { MatchState } from "@/lib/types";

/**
 * Hub, composed as a broadcast: title sequence, then the match IS the hero
 * (full-width broadcast stage), a lower-third ticker, and the day's fixtures
 * as a TV rundown list.
 */
export default function Hub() {
  const { matches, connected } = useTerrace();
  const [sol, setSol] = useState<SolSession | null>(null);
  useEffect(() => { setSol(getSession()); }, []);
  const live = matches.filter((m) => m.status === "live");
  const featured = live[0] ?? matches[0];
  const rest = matches.filter((m) => m.id !== featured?.id);

  return (
    <main className="mx-auto max-w-[1180px] px-5 pb-28">
      {/* channel bar */}
      <header className="sticky top-0 z-40 -mx-5 mb-6 flex items-center justify-between px-5 py-4 backdrop-blur-xl"
        style={{ background: "rgba(10,11,14,0.6)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-acc text-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16M6 20V9l6-4 6 4v11M9 20v-6h6v6" /></svg>
          </span>
          <span className="font-display text-[19px] uppercase tracking-[0.04em]">Terrace</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-white/60">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-acc" : "bg-white/30"}`} />
            {connected ? <><CountUp value={live.length} format={false} />&nbsp;live</> : "connecting"}
          </span>
          {sol ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-acc/40 bg-acc/10 px-3 py-1.5 text-[11px] text-acc transition hover:border-acc/70"
              title="Signed in with Solana — click to sign out"
              onClick={() => { signOut(); setSol(null); }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-acc" />{shortPk(sol.pubkey)}
            </button>
          ) : (
            <button
              className="rounded-full bg-white px-3.5 py-1.5 text-[11px] font-semibold text-ink transition active:scale-[0.97]"
              onClick={() => signIn().then(setSol).catch((e) => alert(e.message))}
            >
              Sign in with Solana
            </button>
          )}
        </div>
      </header>

      {/* title sequence */}
      <section className="pt-8 text-center">
        <div className="mb-5 flex justify-center">
          <ShinyPill
            text="WORLD CUP 2026 · WATCH-ALONG"
            textColor="rgba(255,255,255,0.58)"
            shineColor="#5ce1a6"
            speed={3.2}
            style={{ fontSize: 11, letterSpacing: "0.22em", fontFamily: "var(--font-geist-mono)", fontWeight: 500 }}
          />
        </div>
        <h1 className="font-display text-5xl uppercase leading-[0.95] tracking-[0.01em] md:text-8xl">
          <KineticText text="Watch it with" className="block" delay={0.05} />
          <KineticText text="the whole terrace" className="block text-acc" delay={0.22} />
        </h1>
        <p className="mx-auto mt-5 max-w-[54ch] text-[15px] leading-relaxed text-white/55">
          Every match, live. React together, call the next goal, pick a side and out-sing the other end. Results land proof-verified from the on-chain feed.
        </p>
      </section>

      {/* broadcast stage */}
      {featured ? <BroadcastStage m={featured} /> : <div className="glass mt-10 h-80 animate-pulse rounded-[28px]" />}

      {/* lower-third ticker */}
      {matches.length > 0 && (
        <div className="mt-5 rounded-full border border-white/[0.07] bg-white/[0.02] py-2.5">
          <Marquee speed={30}>
            {matches.map((m) => (
              <span key={m.id} className="mx-6 inline-flex items-center gap-2 font-mono text-[12px] text-white/55">
                <span className={`h-1.5 w-1.5 rounded-full ${m.status === "live" ? "live-dot bg-acc" : "bg-white/25"}`} />
                <Flag code={m.homeCode} className="text-[15px]" />
                <span className="font-semibold text-white/80">{m.homeCode}</span>
                <span className="tabular-nums text-white">{m.score[0]}-{m.score[1]}</span>
                <span className="font-semibold text-white/80">{m.awayCode}</span>
                <Flag code={m.awayCode} className="text-[15px]" />
                <span className="text-acc/80">{m.status === "live" ? `${Math.floor(m.minute)}'` : m.status === "ft" ? "FT" : fmtKickoff(m.kickoffInSec)}</span>
              </span>
            ))}
          </Marquee>
        </div>
      )}

      {/* rundown */}
      <div className="mb-3 mt-14 flex items-baseline justify-between">
        <h2 className="font-display text-2xl uppercase tracking-[0.02em]">Today&apos;s matches</h2>
        <span className="font-mono text-[11px] text-white/55">{rest.length} more fixture{rest.length === 1 ? "" : "s"}</span>
      </div>
      {matches.length === 0 ? (
        <div className="glass overflow-hidden rounded-[22px]">
          {[0, 1, 2].map((i) => <div key={i} className={`h-16 animate-pulse bg-white/[0.02] ${i < 2 ? "border-b border-white/[0.06]" : ""}`} />)}
        </div>
      ) : (
        <motion.div
          className="glass overflow-hidden rounded-[22px]"
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        >
          {rest.map((m, i) => <FixtureRow key={m.id} m={m} last={i === rest.length - 1} />)}
        </motion.div>
      )}

      <footer className="mt-20 border-t border-white/[0.07] pt-6 font-mono text-[11px] text-white/50">
        Terrace · results verified on-chain from the TxLINE feed · live data simulated for preview
      </footer>
    </main>
  );
}

function BroadcastStage({ m }: { m: MatchState }) {
  const liveNow = m.status === "live";
  return (
    <motion.section
      className="glass relative mt-10 overflow-hidden rounded-[28px] p-7 md:p-10"
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 90, damping: 18 }}
    >
      {/* score-bug rule in team colours */}
      {liveNow && (
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${teamColor(m.homeCode)}, ${teamColor(m.awayCode)})` }} />
      )}
      <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.16em] text-white/60">
        <span>{m.group} · {m.venue}</span>
        <LiveBadge {...m} />
      </div>

      <div className="mt-9 grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-8">
        <StageTeam name={m.home} code={m.homeCode} />
        <div className="text-center">
          <div className="font-mono text-6xl font-semibold tabular-nums md:text-8xl">
            {m.score[0]}<span className="mx-2 text-white/25">:</span>{m.score[1]}
          </div>
          <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">
            {m.status === "live" ? "in play" : m.status === "ft" ? "full time" : "kicks off soon"}
          </div>
        </div>
        <StageTeam name={m.away} code={m.awayCode} />
      </div>

      <div className="mt-10"><WinBar match={m} /></div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <span className="font-mono text-[11px] text-white/60">
          <CountUp value={m.predictors} /> predicting
          {m.watching > 0 && <> · <span className="text-acc"><CountUp value={m.watching} /> on the terrace</span></>}
        </span>
        <Link href={`/match/${m.id}`} className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-[14px] font-semibold text-ink transition active:scale-[0.98]">
          Enter the terrace
        </Link>
      </div>
    </motion.section>
  );
}

function StageTeam({ name, code }: { name: string; code: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <Flag code={code} className="text-5xl md:text-6xl" />
      <span className="text-[16px] font-semibold tracking-tight md:text-lg">{name}</span>
    </div>
  );
}

function FixtureRow({ m, last }: { m: MatchState; last?: boolean }) {
  const liveNow = m.status === "live";
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
      <Link
        href={`/match/${m.id}`}
        className={`relative flex items-center gap-4 px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] ${last ? "" : "border-b border-white/[0.06]"}`}
      >
        {liveNow && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: `linear-gradient(180deg, ${teamColor(m.homeCode)}, ${teamColor(m.awayCode)})` }} />
        )}
        <span className="hidden w-20 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/55 sm:block">{m.group}</span>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
          <span className="hidden truncate text-[14.5px] font-semibold tracking-tight sm:inline">{m.home}</span>
          <span className="font-mono text-[13px] font-semibold sm:hidden">{m.homeCode}</span>
          <Flag code={m.homeCode} className="text-[20px]" />
        </div>
        <div className="w-[86px] shrink-0 text-center font-mono tabular-nums">
          {m.status === "upcoming"
            ? <span className="text-[11px] text-white/55">{fmtKickoff(m.kickoffInSec) === "now" ? "kicking off" : `in ${fmtKickoff(m.kickoffInSec)}`}</span>
            : <span className="text-[16px] font-semibold">{m.score[0]}<span className="text-white/30"> – </span>{m.score[1]}</span>}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Flag code={m.awayCode} className="text-[20px]" />
          <span className="hidden truncate text-[14.5px] font-semibold tracking-tight sm:inline">{m.away}</span>
          <span className="font-mono text-[13px] font-semibold sm:hidden">{m.awayCode}</span>
        </div>
        <div className="hidden w-44 shrink-0 items-center justify-end gap-3 font-mono text-[10.5px] text-white/55 md:flex">
          <span><CountUp value={m.predictors} /> predicting</span>
          {liveNow ? <LiveBadge {...m} /> : m.status === "ft" ? <span>FT</span> : null}
        </div>
      </Link>
    </motion.div>
  );
}
