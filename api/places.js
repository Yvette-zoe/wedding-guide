/**
 * Vercel Serverless Function：/api/places
 * 生产环境入口，逻辑与 vite.config.js 中的本地开发中间件共用 api/_lib/coze.js，
 * 避免同一逻辑维护两份。
 * handlePlacesRequest 同时供 CloudBase HTTP 云函数复用。
 */
import { CozeApiError, fetchCozePlaces, isValidPlaceType } from './_lib/coze.js'
import { getSnapshotPlaces } from './_lib/cozePlacesSnapshot.js'

/**
 * 查询指定类型地点（扣子工作流）
 * 扣子鉴权或超时失败时，改返回完整地点快照，避免页面只剩本地三个景点。
 * @param {{ type?: string }} query
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export async function handlePlacesRequest(query, env) {
  const placeType = query?.type
  if (!isValidPlaceType(placeType)) {
    throw new CozeApiError('type 必须是 hotel、attraction 或 restaurant', 400)
  }

  const token = env.COZE_PAT
  const workflowId = env.COZE_WF_LIST_PLACES || '7671226620824371235'
  try {
    return await fetchCozePlaces(placeType, { token, workflowId })
  } catch (error) {
    const places = getSnapshotPlaces(placeType)
    if (!places.length) throw error
    return { placeType, places, source: 'snapshot' }
  }
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'GET') {
    response.status(405).json({ message: '仅支持 GET 请求' })
    return
  }

  try {
    const result = await handlePlacesRequest(request.query, process.env)
    response.status(200).json(result)
  } catch (error) {
    response.status(error.statusCode || 500).json({
      message: error.message || '代理请求失败',
      code: error.code,
    })
  }
}
