import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, requests to /api are forwarded to the API server (npm run server),
// so the browser only ever talks to one address and there's no CORS setup to manage.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
