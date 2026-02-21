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
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          next();
        });
      },
      // Also apply to preview server
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          next();
        });
      },
    },

    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['ttu-logo.svg'],
      manifest: {
        name: 'TechMRT Travels',
        short_name: 'TechMRT Trips',
        description: 'Manage highway section information offline',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'ttu-logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
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
