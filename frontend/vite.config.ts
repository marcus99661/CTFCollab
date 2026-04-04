import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // Mirrors the nginx /yjs/ block for local dev (npm run dev:full)
      "/yjs": {
        target: "ws://localhost:4444",
        ws: true,
        rewrite: (path) => path.replace(/^\/yjs/, ""),
      },
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/auth": { target: "http://localhost:3000", changeOrigin: true },
      "/replication": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  plugins: [react(), tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: true }, // enables SW in dev
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: "CTFCollab",
        short_name: "Koostöö",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0f19",
        theme_color: "#0b0f19",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ],
})
