"use client";

import { motion } from "framer-motion";

/**
 * Presence as a slowly-rotating ring of watcher chips around a centre label.
 * The ring rotates; each chip counter-rotates so initials stay upright.
 * Coverflow/mesh idea from Originkit, recast for a live crowd.
 */
function hue(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function AvatarOrbit({
  names,
  centerTop,
  centerSub,
  size = 210,
}: {
  names: string[];
  centerTop: string;
  centerSub: string;
  size?: number;
}) {
  const ring = names.slice(0, 12);
  const R = size / 2 - 20;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 44, ease: "linear", repeat: Infinity }}
      >
        {ring.map((n, i) => {
          const ang = (i / Math.max(ring.length, 1)) * Math.PI * 2;
          const x = Math.cos(ang) * R;
          const y = Math.sin(ang) * R;
          return (
            <motion.div
              key={i}
              className="absolute grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold"
              style={{
                left: "50%", top: "50%",
                x: x - 16, y: y - 16,
                background: `hsl(${hue(n)} 45% 22%)`,
                color: `hsl(${hue(n)} 70% 78%)`,
                border: "1px solid rgba(255,255,255,0.12)",
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 44, ease: "linear", repeat: Infinity }}
            >
              {n.slice(0, 2).toUpperCase()}
            </motion.div>
          );
        })}
      </motion.div>

      {/* centre */}
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-white">{centerTop}</div>
          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{centerSub}</div>
        </div>
      </div>
    </div>
  );
}
