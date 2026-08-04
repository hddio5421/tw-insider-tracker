import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: {
      input: 'dev.html'
    }
  },
  server: {
    port: 5566,
    strictPort: true,
  },
})
