import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, '../server/public'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/auth':     'http://localhost:3000',
      '/projects': 'http://localhost:3000',
      '/agents':   'http://localhost:3000',
      '/tasks':    'http://localhost:3000',
      '/sessions': 'http://localhost:3000',
      '/settings': 'http://localhost:3000',
      '/connections': 'http://localhost:3000',
      '/specs':       'http://localhost:3000',
      '/github':   'http://localhost:3000',
      '/health':   'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
