import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // Relative assets allow the same build to work at:
  // username.github.io/repository-name/
  // or at a custom domain.
  base: "./",
});
