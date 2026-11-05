import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Output goes to dist/ — load that folder as the unpacked extension.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
