import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API runs on :8000; the dev server proxies /api so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
