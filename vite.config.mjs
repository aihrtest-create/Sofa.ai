import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Project Pages are hosted below the repository name, not at the domain root.
  base: process.env.BASE_PATH || "/",
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
