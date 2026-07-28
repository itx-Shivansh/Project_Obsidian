import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        "background-secondary": "#111111",
        foreground: "#e8e8e8",
        "foreground-muted": "#a1a1aa",
        accent: {
          DEFAULT: "#7c3aed",
          hover: "#8b5cf6",
          foreground: "#ffffff",
        },
        border: "#27272a",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse-slow 4s ease-in-out infinite",
      },
      keyframes: {
        "pulse-slow": {
          "0%, 100%": { opacity: "1", filter: "drop-shadow(0 0 25px rgba(168,85,247,0.6))" },
          "50%": { opacity: "0.85", filter: "drop-shadow(0 0 40px rgba(168,85,247,0.9))" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
