import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  base: "/EDH101/",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
