import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If deploying to GitHub Pages at https://<username>.github.io/<repo>/
// set base to "/<repo-name>/", e.g.: base: "/daily-office/"
// If deploying to a custom domain or the root, leave base as "./"
export default defineConfig({
  plugins: [react()],
  base: "./",
});
