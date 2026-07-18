"use client";

import type { ReactNode } from "react";

/**
 * Seamless infinite ticker. Duplicates its children once and translates the
 * track by -50% on a CSS loop, so there is no gap or jump. Pauses on hover.
 */
export default function Marquee({
  children,
  speed = 34,
  className = "",
  reverse = false,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`mq group relative overflow-hidden ${className}`}
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
      }}
    >
      <div className="mq-track flex w-max shrink-0 items-center" style={{ animationDuration: `${speed}s`, animationDirection: reverse ? "reverse" : "normal" }}>
        {children}
        {children}
      </div>
      <style jsx>{`
        .mq-track { animation-name: mq-scroll; animation-timing-function: linear; animation-iteration-count: infinite; }
        .mq:hover .mq-track { animation-play-state: paused; }
        @keyframes mq-scroll { to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .mq-track { animation: none; } }
      `}</style>
    </div>
  );
}
