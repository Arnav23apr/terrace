"use client";

import { motion } from "framer-motion";
import { flag, teamColor } from "@/lib/flags";
import type { MatchState } from "@/lib/types";

export function LiveBadge({ minute, added, half, status }: Pick<MatchState, "minute" | "added" | "half" | "status">) {
  if (status === "ft") return <span className="font-mono text-[11px] tracking-wider text-white/50">FULL TIME</span>;
  if (status === "upcoming") return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-acc">
      <span className="live-dot h-1.5 w-1.5 rounded-full bg-acc" />
      {minute}{added ? `+${added}` : ""}&apos;
    </span>
  );
}

export function Flag({ code, className = "" }: { code: string; className?: string }) {
  return <span className={`leading-none ${className}`} aria-hidden>{flag(code)}</span>;
}

/** Deterministic initial-avatar — no generic egg icons. */
export function Avatar({ name, size = 26 }: { name: string; size?: number }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="inline-grid place-items-center rounded-full font-semibold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `hsl(${hue} 55% 62%)` }}
    >
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** 3-way win-probability bar with animated widths. */
export function WinBar({ match, showLabels = true }: { match: MatchState; showLabels?: boolean }) {
  const [h, d, a] = match.prob;
  const ch = teamColor(match.homeCode);
  const ca = teamColor(match.awayCode);
  const seg = (w: number, color: string, key: string) => (
    <motion.div
      key={key}
      className="h-full first:rounded-l-full last:rounded-r-full"
      style={{ background: color }}
      animate={{ width: `${w}%` }}
      transition={{ type: "spring", stiffness: 120, damping: 22 }}
    />
  );
  return (
    <div className="w-full">
      {showLabels && (
        <div className="mb-2 flex items-center justify-between font-mono text-[12px]">
          <span style={{ color: ch }} className="font-semibold">{h.toFixed(0)}%</span>
          <span className="text-white/55">DRAW {d.toFixed(0)}%</span>
          <span style={{ color: ca }} className="font-semibold">{a.toFixed(0)}%</span>
        </div>
      )}
      <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
        {seg(h, ch, "h")}
        {seg(d, "rgba(255,255,255,0.18)", "d")}
        {seg(a, ca, "a")}
      </div>
    </div>
  );
}

export function fmtKickoff(sec: number): string {
  if (sec <= 30) return "now";
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d`;
}
