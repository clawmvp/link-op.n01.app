import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        link: {
          DEFAULT: "#375bd2", // Chainlink blue
          light: "#5c7cfa",
        },
        ink: {
          100: "#e6ecf5",
          200: "#c7d2e3",
          300: "#a3b1c9",
          400: "#8494b0",
          500: "#5f6f8f",
          600: "#4a5a7a",
          700: "#1f2b47",
          800: "#161f36",
          850: "#111827",
          900: "#0d1220",
          950: "#0a0e1a",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
