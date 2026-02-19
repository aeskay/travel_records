import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  optimizeDeps: {
    exclude: ['lucide-react'],
  },

  plugins: [
    react(),

    // ── COOP/COEP headers ────────────────────────────────────────────────────
    // Required for SharedArrayBuffer (used internally by WASM/Whisper workers)
    // and for correct module worker behaviour in some Chromium builds.
    {
      name: 'configure-response-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      },
      // Also apply to preview server
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      },
    },

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: '7147 Travels',
        short_name: 'Sections',
        description: 'Manage highway section information offline',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
      // ── PWA also needs these headers in production ──────────────────────────
      // Add the following to your hosting config (Firebase Hosting example):
      //
      // firebase.json → hosting.headers:
      // {
      //   "source": "/**",
      //   "headers": [
      //     { "key": "Cross-Origin-Opener-Policy",   "value": "same-origin" },
      //     { "key": "Cross-Origin-Embedder-Policy",  "value": "require-corp" }
      //   ]
      // }
      //
      // Without these in production, the worker may fail silently on Chrome Android.
    }),
  ],
})
