import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { kidanCspPolicy } from "./src/lib/csp";

function cspHeader(): Plugin {
  return {
    name: "kidan-csp-header",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Content-Security-Policy", kidanCspPolicy("development"));
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Content-Security-Policy", kidanCspPolicy("production"));
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cspHeader()],
  server: {
    host: "0.0.0.0",
    port: 5173,
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
    port: 4173,
    allowedHosts: true,
  },
});

