/**
 * Vercel Serverless Function：/api/places
 * 生产环境入口，逻辑与 vite.config.js 中的本地开发中间件共用 api/_lib/coze.js，
 * 避免同一逻辑维护两份。
 */
import { fetchCozePlaces } from './_lib/coze.js'

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'GET') {
    response.status(405).json({ message: '仅支持 GET 请求' })
    return
  }

  try {
    const placeType = request.query.type
    const token = process.env.COZE_PAT
    const workflowId = process.env.COZE_WF_LIST_PLACES || '7671226620824371235'
    const result = await fetchCozePlaces(placeType, { token, workflowId })
    response.status(200).json(result)
  } catch (error) {
    response.status(error.statusCode || 500).json({
      message: error.message || '代理请求失败',
      code: error.code,
    })
  }
}
