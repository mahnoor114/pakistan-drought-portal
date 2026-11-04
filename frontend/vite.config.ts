import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API runs on :8050; in production FastAPI serves the built app.
const API = "http://127.0.0.1:8050";
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": API, "/docs": API, "/openapi.json": API } },
});
