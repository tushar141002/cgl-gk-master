import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the same build works at a domain root and under
  // a GitHub Pages project path such as /cgl-gk-master/.
  base: "./",
})
