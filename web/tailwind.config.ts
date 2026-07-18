import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0a0b0e", 900: "#101217", 800: "#161922", 700: "#1e2230" },
        acc: { DEFAULT: "#5ce1a6", ink: "#0a0b0e" }, // controlled electric pitch-green
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)","system-ui","sans-serif"],
        mono: ["var(--font-geist-mono)","ui-monospace","monospace"],
        display: ["var(--font-tanker)","var(--font-geist-sans)","sans-serif"],
      },
      boxShadow: { glass: "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px -30px rgba(0,0,0,0.9)" },
    },
  },
  plugins: [],
} satisfies Config;
