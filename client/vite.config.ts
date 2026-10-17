import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // Keep server persistence out of Vite's workspace file serving as well as builds.
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/server/data/**", "**/*.{sqlite,sqlite3,db}", "**/*.{sqlite,sqlite3,db}-*"] },
    port: 5173,
    strictPort: true
  }
});