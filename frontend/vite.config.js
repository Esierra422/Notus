import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase'
          if (id.includes('agora-rtc')) return 'vendor-agora'
          if (id.includes('quill') || id.includes('y-quill') || id.includes('/yjs/') || id.includes('y-webrtc'))
            return 'vendor-editor'
          if (id.includes('jspdf') || id.includes('docx')) return 'vendor-export'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router'))
            return 'vendor-react'
          if (id.includes('node_modules/react/')) return 'vendor-react'
          return undefined
        },
      },
    },
  },
})
