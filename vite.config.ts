import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: set base to your repo path (case-sensitive)
const repoBase = "/Schegen-Appointment-Checker/"; // <- EXACT repo name from the URL

export default defineConfig({
  base: repoBase,
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
  },
});
