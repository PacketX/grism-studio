import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GRISM Manager's own pages: `npm run build:manager` -> dist-manager/, which the
// manager serves at its root. The device's Studio is the other build
// (vite.config.js -> dist/); nothing of this one goes into it.
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist-manager",
    emptyOutDir: true,
    rollupOptions: { input: "manager.html" },
  },
})
