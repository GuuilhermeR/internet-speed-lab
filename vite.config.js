import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleSpeedApi } from './server/speed-api.js'

const speedApiPlugin = () => ({
  name: 'speed-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      handleSpeedApi(req, res, next)
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), speedApiPlugin()],
})
