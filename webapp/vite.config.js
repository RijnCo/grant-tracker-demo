import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `vite build` → dist/ served by app.py (the real app).
// `vite build --mode demo` → ../docs/ for GitHub Pages: relative asset paths,
// and the bundled data snapshot (data.js) loaded before the app.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    base: demo ? './' : '/',
    plugins: [
      react(),
      demo && {
        name: 'inject-demo-data',
        transformIndexHtml(html) {
          return html.replace('</head>', '  <script src="./data.js"></script>\n  </head>')
        },
      },
    ].filter(Boolean),
    server: {
      proxy: {
        '/api': 'http://localhost:8765',
        '/uploads': 'http://localhost:8765',
      },
    },
    build: {
      outDir: demo ? '../docs' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 900,
    },
  }
})
