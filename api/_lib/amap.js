/**
 * 高德 Web 服务 API 调用逻辑（驾车路径规划）
 * 供 vite.config.js 的本地开发中间件与 api/driving.js 的 Vercel Function 共用。
 */
export class AmapApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'AmapApiError'
    this.statusCode = statusCode
  }
}

/**
 * 查询两点间驾车路径规划结果
 * @param {{ key: string, origin: string, destination: string }} options origin/destination 格式："lng,lat"
 * @returns {Promise<object>} 高德驾车路径规划原始返回体
 */
export async function fetchDriving({ key, origin, destination }) {
  if (!key) {
    throw new AmapApiError('缺少 AMAP_KEY，请在环境变量中配置', 503)
  }
  if (!origin || !destination) {
    throw new AmapApiError('缺少 origin 或 destination 参数', 400)
  }

  const amapUrl = `https://restapi.amap.com/v3/direction/driving?key=${key}&origin=${origin}&destination=${destination}`
  const amapResponse = await fetch(amapUrl)
  return amapResponse.json()
}
