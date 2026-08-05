import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages 子路径部署时由 Actions 注入，例如 /wedding-guide/
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    host: true,
    watch: {
      // Windows 下部分 GeoJSON 会被占用导致 EBUSY，改用轮询避免服务崩溃
      usePolling: true,
      interval: 1000,
    },
  },
})
