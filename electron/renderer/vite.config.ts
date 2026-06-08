import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@pilot/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Serve static assets (KayKit models, Spine, etc.) from web/public
  publicDir: path.resolve(__dirname, '../../web/public'),
  server: {
    port: 5174,
    proxy: {
      '/auth':        { target: 'http://localhost:3000', changeOrigin: true },
      '/agents':      { target: 'http://localhost:3000', changeOrigin: true },
      '/projects':    { target: 'http://localhost:3000', changeOrigin: true },
      '/sessions':    { target: 'http://localhost:3000', changeOrigin: true },
      '/tasks':       { target: 'http://localhost:3000', changeOrigin: true },
      '/connections': { target: 'http://localhost:3000', changeOrigin: true },
      '/brains':      { target: 'http://localhost:3000', changeOrigin: true },
      '/specs':       { target: 'http://localhost:3000', changeOrigin: true },
      '/departments': { target: 'http://localhost:3000', changeOrigin: true },
      '/shifts':      { target: 'http://localhost:3000', changeOrigin: true },
      '/events':      { target: 'http://localhost:3000', changeOrigin: true },
      '/github':      { target: 'http://localhost:3000', changeOrigin: true },
      '/health':      { target: 'http://localhost:3000', changeOrigin: true },
      '/me':          { target: 'http://localhost:3000', changeOrigin: true },
      '/settings':    { target: 'http://localhost:3000', changeOrigin: true },
      '/tools':       { target: 'http://localhost:3000', changeOrigin: true },
      '/knowledge':   { target: 'http://localhost:3000', changeOrigin: true },
      '/admin':       { target: 'http://localhost:3000', changeOrigin: true },
      '/kaykit':      { target: 'http://localhost:3000', changeOrigin: true },
      '/ws':          { target: 'ws://localhost:3000',   ws: true },
    },
  },
})
