/**
 * 预生成距离矩阵查询：命中则跳过高德实时调用
 * 数据由 scripts/generate-distance-matrix.js 生成
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const matrixPath = join(dirname(fileURLToPath(import.meta.url)), 'distance-matrix.json')

function loadMatrix() {
  try {
    return JSON.parse(readFileSync(matrixPath, 'utf8'))
  } catch {
    return { generated_at: null, route_count: 0, routes: [], origin_default: null }
  }
}

const matrix = loadMatrix()

function coordKey(coords) {
  if (!coords?.length) return ''
  return `${Number(coords[0]).toFixed(5)},${Number(coords[1]).toFixed(5)}`
}

function routeKey(originCoords, destCoords, mode) {
  return `${coordKey(originCoords)}|${coordKey(destCoords)}|${mode}`
}

const routeIndex = new Map()
for (const route of matrix.routes || []) {
  if (!route?.origin || !route?.destination || !route?.mode) continue
  routeIndex.set(routeKey(route.origin, route.destination, route.mode), route)
}

/** 矩阵元信息（生成时间、条数） */
export function getDistanceMatrixMeta() {
  return {
    generated_at: matrix.generated_at || null,
    route_count: matrix.route_count || routeIndex.size,
    origin_default: matrix.origin_default || null,
  }
}

/**
 * 按坐标查询预生成路线
 * @returns {null | { distance_m, distance_km, duration_s, duration_min, distance_text, duration_text, mode, status, from_cache }}
 */
export function lookupStaticDistance(originCoords, destCoords, mode = 'driving') {
  const hit = routeIndex.get(routeKey(originCoords, destCoords, mode))
  if (!hit) return null

  return {
    distance_m: hit.distance_m,
    distance_km: hit.distance_km,
    duration_s: hit.duration_s,
    duration_min: hit.duration_min,
    distance_text: hit.distance_text,
    duration_text: hit.duration_text,
    mode: hit.mode,
    status: 'ok',
    info: '',
    from_cache: true,
    origin_name: hit.origin_name,
    destination_name: hit.destination_name,
  }
}

/** 供兜底页/前端使用的精简列表（默认驾车，酒店出发） */
export function listHotelDrivingRoutes() {
  const hotelId = matrix.origin_default?.id
  return (matrix.routes || []).filter(
    (route) => route.mode === 'driving' && (!hotelId || route.origin_id === hotelId),
  )
}
