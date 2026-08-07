/**
 * Vercel Serverless Function：/api/driving
 * 生产环境入口，逻辑与 vite.config.js 中的本地开发中间件共用 api/_lib/amap.js，
 * 避免同一逻辑维护两份。
 */
import { fetchDriving } from './_lib/amap.js'

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'GET') {
    response.status(405).json({ message: '仅支持 GET 请求' })
    return
  }

  try {
    const { origin, destination } = request.query
    const key = process.env.AMAP_KEY
    const body = await fetchDriving({ key, origin, destination })
    response.status(200).json(body)
  } catch (error) {
    response.status(error.statusCode || 500).json({ message: error.message || '路径规划代理失败' })
  }
}
