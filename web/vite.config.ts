import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Bypass proxy for browser navigation requests — serve the SPA instead.
// Without this, refreshing on /tools, /knowledge, /settings, etc. would
// proxy to the backend and return JSON instead of index.html.
function spaBypass(req: { method?: string; headers: Record<string, string | string[] | undefined> }) {
  if (req.method === 'GET' && typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html')) {
    return '/index.html'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: path.resolve(__dirname, '../server/public'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/auth':        'http://localhost:3000',
      '/projects':    { target: 'http://localhost:3000', bypass: spaBypass },
      '/agents':      { target: 'http://localhost:3000', bypass: spaBypass },
      '/brains':      'http://localhost:3000',
      '/tasks':       'http://localhost:3000',
      '/sessions':    { target: 'http://localhost:3000', bypass: spaBypass },
      '/connections': 'http://localhost:3000',
      '/specs':       'http://localhost:3000',
      '/github':      'http://localhost:3000',
      '/health':      'http://localhost:3000',
      '/departments': 'http://localhost:3000',
      '/events':      'http://localhost:3000',
      '/shifts':      'http://localhost:3000',
      // These paths are both React routes and API prefixes — use bypass to
      // serve index.html for browser navigation, proxy for API calls.
      '/employees':   { target: 'http://localhost:3000', bypass: spaBypass },
      '/knowledge':   { target: 'http://localhost:3000', bypass: spaBypass },
      '/settings':    { target: 'http://localhost:3000', bypass: spaBypass },
      '/tools':       { target: 'http://localhost:3000', bypass: spaBypass },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
