/** FIFA trigram → emoji flag. England is a GB subdivision (tag-sequence flag),
 *  so codes need an explicit map rather than the ISO regional-indicator trick. */
const FLAG: Record<string, string> = {
  ESP: "\u{1F1EA}\u{1F1F8}", ARG: "\u{1F1E6}\u{1F1F7}",
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  GER: "\u{1F1E9}\u{1F1EA}", BRA: "\u{1F1E7}\u{1F1F7}", FRA: "\u{1F1EB}\u{1F1F7}",
  POR: "\u{1F1F5}\u{1F1F9}", NED: "\u{1F1F3}\u{1F1F1}",
};

export function flag(code: string): string {
  if (FLAG[code]) return FLAG[code];
  // fallback for any legacy 2-letter code
  if (code && code.length === 2) {
    const A = 0x1f1e6;
    return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
  }
  return "\u{1F3F3}";
}

/** Team accent colours for rivalry / bars (kept muted, one per side). */
const TEAM_COLOR: Record<string, string> = {
  ESP: "#e94b3c", ARG: "#6bb3e6", ENG: "#e8e8ee", GER: "#f2c14e",
  BRA: "#f2d64c", FRA: "#5a7fe6", POR: "#e05555", NED: "#f0913c",
};
export function teamColor(code: string): string {
  return TEAM_COLOR[code] ?? "#9aa3b2";
}
