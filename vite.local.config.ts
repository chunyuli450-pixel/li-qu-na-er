import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  base: isGitHubPages ? "/li-qu-na-er/" : "/",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173 },
  build: { outDir: "dist-local" },
});
