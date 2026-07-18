"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

/**
 * Animated integer that eases toward its value and re-runs whenever the
 * value changes (so a live counter ticks). Formats with thousands commas.
 */
export default function CountUp({
  value,
  className = "",
  duration = 1.1,
  format = true,
}: {
  value: number;
  className?: string;
  duration?: number;
  format?: boolean;
}) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(value); prev.current = value; return; }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return <span className={className}>{format ? display.toLocaleString() : display}</span>;
}
