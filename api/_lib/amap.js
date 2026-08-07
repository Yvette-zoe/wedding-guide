/**
 * 高德 Web 服务 API 调用逻辑（驾车/步行路径规划、批量距离）
 * 供 vite.config.js 的本地开发中间件与 api/*.js 的 Vercel Function 共用。
 */
export class AmapApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'AmapApiError'
    this.statusCode = statusCode
  }
}

function ensureKey(key) {
  if (!key) {
    throw new AmapApiError('缺少 AMAP_KEY，请在环境变量中配置', 503)
  }
}

/**
 * 查询两点间驾车路径规划结果
 * @param {{ key: string, origin: string, destination: string }} options origin/destination 格式："lng,lat"
 */
export async function fetchDriving({ key, origin, destination }) {
  ensureKey(key)
  if (!origin || !destination) {
    throw new AmapApiError('缺少 origin 或 destination 参数', 400)
  }

  const amapUrl = `https://restapi.amap.com/v3/direction/driving?key=${key}&origin=${origin}&destination=${destination}`
  const amapResponse = await fetch(amapUrl)
  return amapResponse.json()
}

/**
 * 查询两点间步行路径规划结果
 */
export async function fetchWalking({ key, origin, destination }) {
  ensureKey(key)
  if (!origin || !destination) {
    throw new AmapApiError('缺少 origin 或 destination 参数', 400)
  }

  const amapUrl = `https://restapi.amap.com/v3/direction/walking?key=${key}&origin=${origin}&destination=${destination}`
  const amapResponse = await fetch(amapUrl)
  return amapResponse.json()
}

/**
 * 批量距离测量（1 个起点 × 多个终点）
 * @param {number} type 0=直线 1=驾车 3=步行
 */
export async function fetchDistanceBatch({ key, origin, destinations, type = 1 }) {
  ensureKey(key)
  if (!origin || !destinations?.length) {
    throw new AmapApiError('缺少 origin 或 destinations 参数', 400)
  }

  const destination = destinations.join('|')
  const amapUrl = `https://restapi.amap.com/v3/distance?key=${key}&origins=${origin}&destination=${destination}&type=${type}`
  const amapResponse = await fetch(amapUrl)
  return amapResponse.json()
}

/** 从驾车/步行路径规划结果中提取距离与时长 */
export function parseRouteResult(data, mode = 'driving') {
  const path = mode === 'walking'
    ? data?.route?.paths?.[0]
    : data?.route?.paths?.[0]

  const distanceM = Number(path?.distance || 0)
  const durationS = Number(path?.duration || 0)
  const distanceKm = distanceM > 0 ? Math.round((distanceM / 1000) * 10) / 10 : 0
  const durationMin = durationS > 0 ? Math.max(1, Math.round(durationS / 60)) : 0

  return {
    distance_m: distanceM,
    distance_km: distanceKm,
    duration_s: durationS,
    duration_min: durationMin,
    distance_text: distanceKm > 0 ? `约 ${distanceKm} 公里` : '暂无数据',
    duration_text: durationMin > 0 ? `约 ${durationMin} 分钟` : '暂无数据',
    mode,
    status: data?.status === '1' ? 'ok' : 'error',
    info: data?.info || '',
  }
}

/** 从批量距离 API 单条结果提取距离与时长 */
export function parseDistanceResult(result, mode = 'walking') {
  const distanceM = Number(result?.distance || 0)
  const durationS = Number(result?.duration || 0)
  const distanceKm = distanceM > 0 ? Math.round((distanceM / 1000) * 10) / 10 : 0
  const durationMin = durationS > 0 ? Math.max(1, Math.round(durationS / 60)) : 0

  return {
    distance_m: distanceM,
    distance_km: distanceKm,
    duration_s: durationS,
    duration_min: durationMin,
    distance_text: distanceKm > 0 ? `约 ${distanceKm} 公里` : '暂无数据',
    duration_text: durationMin > 0 ? `约 ${durationMin} 分钟` : '暂无数据',
    mode,
  }
}

/** 经纬度 Haversine 直线距离（米），用于粗筛候选点 */
export function haversineMeters(a, b) {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const r = 6371000
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}
