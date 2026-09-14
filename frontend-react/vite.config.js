import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    // Development proxy: all /api requests are forwarded to the running
    // Express backend at http://localhost:5000.
    // The /api path prefix is preserved exactly — no rewrite.
    // This means /api/v1/health in the React app hits
    // http://localhost:5000/api/v1/health on the backend.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // No rewrite — /api path is kept intact so Express receives
        // the full /api/v1/... path it expects.
      },
    },
  },

  build: {
    // Explicit output directory.
    // Default is already 'dist' (relative to this file → frontend-react/dist/).
    // Stated explicitly so the intent is unambiguous:
    // this build NEVER overwrites the existing frontend/ directory.
    outDir: 'dist',
    emptyOutDir: true,
  },
})

