/**
 * 扣子工作流调用逻辑（与地点类型无关的公共部分）
 * 供 vite.config.js 的本地开发中间件与 api/places.js 的 Vercel Function 共用，
 * 避免同一逻辑维护两份。
 */
const PLACE_TYPES = new Set(['hotel', 'attraction', 'restaurant'])

export class CozeApiError extends Error {
  constructor(message, statusCode = 500, extra = {}) {
    super(message)
    this.name = 'CozeApiError'
    this.statusCode = statusCode
    Object.assign(this, extra)
  }
}

export function isValidPlaceType(placeType) {
  return PLACE_TYPES.has(placeType)
}

/**
 * 调用扣子工作流查询指定类型的地点数据
 * @param {string} placeType hotel | attraction | restaurant
 * @param {{ token: string, workflowId: string }} options
 * @returns {Promise<{ placeType: string, workflow: object }>}
 */
export async function fetchCozePlaces(placeType, { token, workflowId }) {
  if (!token) {
    throw new CozeApiError('缺少 COZE_PAT，请在环境变量中配置', 503)
  }
  if (!isValidPlaceType(placeType)) {
    throw new CozeApiError('type 必须是 hotel、attraction 或 restaurant', 400)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  let cozeResponse
  try {
    cozeResponse = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: { place_type: placeType },
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new CozeApiError('扣子请求超时', 504)
    }
    throw new CozeApiError(error.message || '代理请求失败', 500)
  } finally {
    clearTimeout(timeout)
  }

  const bodyText = await cozeResponse.text()
  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    body = { message: bodyText || '扣子返回了无法解析的响应' }
  }

  if (!cozeResponse.ok || (body.code !== undefined && body.code !== 0)) {
    throw new CozeApiError(
      body.msg || body.message || `扣子请求失败（${cozeResponse.status}）`,
      502,
      { code: body.code },
    )
  }

  return { placeType, workflow: body }
}
