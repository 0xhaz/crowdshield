import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Layout tokens from banking-main; brand and risk tiers from techstacks §11.
// Risk colours are never the only cue: every use pairs them with a label and an icon.
const config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        fill: { 1: "rgba(255, 255, 255, 0.10)" },
        brand: { DEFAULT: "#0B4FD9", dark: "#08399E", light: "#EAF1FF" },
        risk: {
          critical: { DEFAULT: "#B42318", bg: "#FEF3F2", border: "#FECDCA", solid: "#D92D20" },
          high: { DEFAULT: "#B93815", bg: "#FFF4ED", border: "#FDD3BA", solid: "#EC4A0A" },
          caution: { DEFAULT: "#93370D", bg: "#FFFAEB", border: "#FEDF89", solid: "#DC9F00" },
          low: { DEFAULT: "#5E5A3F", bg: "#F8F7F1", border: "#E2DFC9", solid: "#A8A27A" },
          none: { DEFAULT: "#475467", bg: "#F9FAFB", border: "#EAECF0", solid: "#98A2B3" },
          info: { DEFAULT: "#175CD3", bg: "#EFF8FF", border: "#B2DDFF", solid: "#2E90FA" },
        },
        indigo: { 500: "#6172F3", 700: "#3538CD" },
        success: {
          25: "#F6FEF9",
          50: "#ECFDF3",
          100: "#D1FADF",
          600: "#039855",
          700: "#027A48",
          900: "#054F31",
        },
        pink: {
          25: "#FEF6FB",
          100: "#FCE7F6",
          500: "#EE46BC",
          600: "#DD2590",
          700: "#C11574",
          900: "#851651",
        },
        blue: {
          25: "#F5FAFF",
          100: "#D1E9FF",
          500: "#2E90FA",
          600: "#1570EF",
          700: "#175CD3",
          900: "#194185",
        },
        sky: { 1: "#F3F9FF" },
        black: { 1: "#00214F", 2: "#344054" },
        gray: {
          25: "#FCFCFD",
          50: "#F9FAFB",
          100: "#F2F4F7",
          200: "#EAECF0",
          300: "#D0D5DD",
          500: "#667085",
          600: "#475467",
          700: "#344054",
          900: "#101828",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(90deg, #0B4FD9 0%, #3B82F6 100%)",
        "brand-dark-gradient": "linear-gradient(135deg, #08399E 0%, #0B4FD9 60%, #3B82F6 100%)",
        "gradient-mesh": "url('/icons/gradient-mesh.svg')",
      },
      boxShadow: {
        form: "0px 1px 2px 0px rgba(16, 24, 40, 0.05)",
        chart: "0px 1px 3px 0px rgba(16, 24, 40, 0.10), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)",
        profile:
          "0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)",
        creditCard: "8px 10px 16px 0px rgba(0, 0, 0, 0.05)",
      },
      fontFamily: {
        sans: ["var(--font-noto)", "system-ui", "sans-serif"],
        noto: "var(--font-noto)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;

export default config;
