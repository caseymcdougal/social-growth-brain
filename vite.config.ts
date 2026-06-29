import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const apiProxy = {
  "/api": "http://127.0.0.1:4174"
};

const preactAliases = {
  react: "preact/compat",
  "react-dom": "preact/compat",
  "react-dom/client": "preact/compat/client",
  "react/jsx-runtime": "preact/jsx-runtime"
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: mode === "test" ? {} : preactAliases
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: apiProxy
  },
  preview: {
    host: "127.0.0.1",
    port: 5175,
    proxy: apiProxy
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: []
  }
}));
