/** @type {import('tailwindcss').Config} */
// Uses Tailwind's default palette (slate / indigo / emerald / rose / amber / sky / violet).
// Colour roles: indigo = brand & primary actions, rose = vulnerabilities & failures,
// emerald = passed / verified only, amber = pending / inconclusive.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      fontSize: { "2xs": ["11px", "16px"] },
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px -6px rgb(15 23 42 / 0.08)",
        lift: "0 2px 4px rgb(15 23 42 / 0.05), 0 12px 32px -10px rgb(15 23 42 / 0.18)",
        brand: "0 6px 20px -6px rgb(79 70 229 / 0.55)",
      },
      keyframes: {
        "page-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "scale(.96)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-right": { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
        progress: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(250%)" } },
        "trace-flow": { to: { strokeDashoffset: "-48" } },
        "soft-pulse": { "0%,100%": { boxShadow: "0 0 0 0 rgb(79 70 229 / 0.35)" }, "50%": { boxShadow: "0 0 0 6px rgb(79 70 229 / 0)" } },
      },
      animation: {
        "page-in": "page-in 380ms cubic-bezier(.2,.7,.2,1) both",
        "fade-in": "fade-in 300ms ease-out both",
        "pop-in": "pop-in 220ms cubic-bezier(.2,.7,.2,1) both",
        "slide-in-right": "slide-in-right 260ms cubic-bezier(.2,.7,.2,1) both",
        shimmer: "shimmer 1.6s linear infinite",
        progress: "progress 1.1s ease-in-out infinite",
        "trace-flow": "trace-flow 1.6s linear infinite",
        "soft-pulse": "soft-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
