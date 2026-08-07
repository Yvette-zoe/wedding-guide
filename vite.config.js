import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fetchCozePlaces } from './api/_lib/coze.js'
import { fetchDriving } from './api/_lib/amap.js'

/**
 * 本地开发用中间件：与 api/driving.js（Vercel Function，生产环境入口）
 * 共用 api/_lib/amap.js 的请求逻辑，避免同一逻辑维护两份。
 */
function amapDrivingProxy({ key }) {
  return {
    name: 'amap-driving-proxy',
    configureServer(server) {
      server.middlewares.use('/api/driving', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')

        try {
          if (request.method !== 'GET') {
            response.statusCode = 405
            response.end(JSON.stringify({ message: '仅支持 GET 请求' }))
            return
          }

          const requestUrl = new URL(request.url, 'http://localhost')
          const origin = requestUrl.searchParams.get('origin')
          const destination = requestUrl.searchParams.get('destination')
          const body = await fetchDriving({ key, origin, destination })

          response.statusCode = 200
          response.end(JSON.stringify(body))
        } catch (error) {
          response.statusCode = error.statusCode || 500
          response.end(JSON.stringify({ message: error.message || '路径规划代理失败' }))
        }
      })
    },
  }
}

/**
 * 本地开发用中间件：与 api/places.js（Vercel Function，生产环境入口）
 * 共用 api/_lib/coze.js 的请求逻辑，避免同一逻辑维护两份。
 */
function cozePlacesProxy({ token, workflowId }) {
  return {
    name: 'coze-places-proxy',
    configureServer(server) {
      server.middlewares.use('/api/places', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')

        try {
          if (request.method !== 'GET') {
            response.statusCode = 405
            response.end(JSON.stringify({ message: '仅支持 GET 请求' }))
            return
          }

          const requestUrl = new URL(request.url, 'http://localhost')
          const placeType = requestUrl.searchParams.get('type')
          const result = await fetchCozePlaces(placeType, { token, workflowId })

          response.statusCode = 200
          response.end(JSON.stringify(result))
        } catch (error) {
          response.statusCode = error.statusCode || 500
          response.end(JSON.stringify({
            message: error.message || '代理请求失败',
            code: error.code,
          }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // GitHub Pages 子路径部署时由 Actions 注入，例如 /wedding-guide/
    base: env.VITE_BASE || '/',
    plugins: [
      react(),
      cozePlacesProxy({
        token: env.COZE_PAT,
        workflowId: env.COZE_WF_LIST_PLACES || '7671226620824371235',
      }),
      amapDrivingProxy({
        key: env.AMAP_KEY,
      }),
    ],
    server: {
      host: true,
      watch: {
        // Windows 下部分 GeoJSON 会被占用导致 EBUSY，改用轮询避免服务崩溃
        usePolling: true,
        interval: 1000,
      },
    },
  }
})
