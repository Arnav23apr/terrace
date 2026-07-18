"use client";

import { motion } from "framer-motion";

/**
 * Per-character spring reveal. Characters are grouped inside nowrap word
 * wrappers so lines can only break BETWEEN words (inline-block chars would
 * otherwise wrap mid-word on narrow screens). Screen readers get one plain
 * text node; every animated glyph is aria-hidden.
 */
export default function KineticText({
  text,
  className = "",
  delay = 0,
  stagger = 0.028,
  as = "span",
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: "span" | "h1" | "h2";
}) {
  const Tag = (motion[as] ?? motion.span) as typeof motion.span;
  const words = text.split(" ");
  let charIndex = 0;

  return (
    <Tag className={className} style={{ display: /\bblock\b/.test(className) ? "block" : "inline-block" }}>
      <span className="sr-only">{text}</span>
      {words.map((word, wi) => (
        <span key={wi} aria-hidden style={{ display: "inline-block", whiteSpace: "nowrap", verticalAlign: "top" }}>
          {Array.from(word).map((c) => {
            const i = charIndex++;
            return (
              <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top" }}>
                <motion.span
                  style={{ display: "inline-block", willChange: "transform" }}
                  initial={{ y: "110%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 26, delay: delay + i * stagger }}
                >
                  {c}
                </motion.span>
              </span>
            );
          })}
          {wi < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
