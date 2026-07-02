import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['iOS >= 13', 'Safari >= 13', 'defaults', 'not IE 11'],
      modernPolyfills: true,
    }),
  ],
  build: {
    target: 'es2018',
  },
})
