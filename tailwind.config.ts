import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#060607",
          900: "#0B0C0E",
          850: "#121316",
          800: "#191B20",
          700: "#24272E",
          600: "#363A45",
          500: "#555A6B",
          400: "#8E95A5",
          300: "#C2C7D0",
          200: "#E5E7EB",
          100: "#F9FAFB",
        },
        rcb: {
          red: "#E10600",
          "red-hover": "#FF1E27",
          "red-dark": "#8A0000",
          "red-glow": "rgba(225, 6, 0, 0.25)",
          gold: "#E5A93C",
          "gold-light": "#FFC107",
          "gold-dark": "#9E6E1A",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
