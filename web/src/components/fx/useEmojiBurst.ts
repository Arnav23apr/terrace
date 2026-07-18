"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Adapted from Originkit "emojiburst" (real source via MCP). Their component
 * ships its own styled button; here the physics core (gravity integration,
 * up-biased spray, spin, fade, button nudge) is reshaped as a hook so it can
 * drive the room's existing reaction tiles. Particles live on a lazily-created
 * fixed full-viewport layer so they fly up and out of the card freely.
 */

interface P {
  el: HTMLSpanElement;
  x: number; y: number;
  vx: number; vy: number;
  rot: number; vrot: number;
  size: number; life: number;
}

export function useEmojiBurst() {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);
  const last = useRef(0);

  const ensureLayer = () => {
    if (layerRef.current) return layerRef.current;
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
    d.setAttribute("aria-hidden", "true");
    document.body.appendChild(d);
    layerRef.current = d;
    return d;
  };

  const step = useCallback((ts: number) => {
    if (!last.current) last.current = ts;
    // dt in 60fps frame units, capped so a background tab doesn't teleport
    const dt = Math.min((ts - last.current) / (1000 / 60), 3);
    last.current = ts;
    const H = window.innerHeight, W = window.innerWidth;
    const arr = parts.current;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.vy += 0.55 * dt; // gravity
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > H + p.size * 3 || p.x < -p.size * 3 || p.x > W + p.size * 3) {
        p.el.remove(); arr.splice(i, 1); continue;
      }
      const fade = p.life < 22 ? Math.max(0, p.life / 22) : 1;
      p.el.style.opacity = String(fade);
      p.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.rot}deg)`;
    }
    if (arr.length) raf.current = requestAnimationFrame(step);
    else { raf.current = 0; last.current = 0; }
  }, []);

  const burstFrom = useCallback((el: HTMLElement, glyph: string, count = 12) => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = ensureLayer();
    const r = el.getBoundingClientRect();
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;

    // the nudge: quick shake of the tapped tile
    el.animate?.(
      [
        { transform: "translate(0px, 0px) rotate(0deg)" },
        { transform: "translate(2px, -1.5px) rotate(-2.5deg)" },
        { transform: "translate(-2px, 1px) rotate(2.5deg)" },
        { transform: "translate(1px, 0px) rotate(-1deg)" },
        { transform: "translate(0px, 0px) rotate(0deg)" },
      ],
      { duration: 260, easing: "cubic-bezier(.36,.07,.19,.97)" }
    );

    const arr = parts.current;
    const MAX = 140;
    const size = 22;
    for (let k = 0; k < count; k++) {
      if (arr.length >= MAX) break;
      const s = document.createElement("span");
      s.textContent = glyph;
      s.style.cssText = `position:absolute;left:0;top:0;font-size:${size}px;line-height:1;will-change:transform,opacity;pointer-events:none;user-select:none`;
      s.setAttribute("aria-hidden", "true");
      layer.appendChild(s);
      // angle biased straight up with random left/right spread
      const ang = ((-90 + (Math.random() * 2 - 1) * 55) * Math.PI) / 180;
      const speed = 11 * (0.65 + Math.random() * 0.8);
      arr.push({
        el: s,
        x: ox - size / 2, y: oy - size / 2,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        rot: Math.random() * 360, vrot: (Math.random() * 2 - 1) * 14,
        size, life: 170,
      });
    }
    if (!raf.current) { last.current = 0; raf.current = requestAnimationFrame(step); }
  }, [step]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    parts.current.forEach((p) => p.el.remove());
    parts.current = [];
    layerRef.current?.remove();
    layerRef.current = null;
  }, []);

  return burstFrom;
}
