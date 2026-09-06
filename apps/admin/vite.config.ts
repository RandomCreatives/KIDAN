import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin console is a separate operator surface. In development it proxies
// /api to the local API (same as the Mini App); in production Vercel rewrites
// /api/* to the deployed API and everything else to index.html.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
    allowedHosts: true,
  },
});
