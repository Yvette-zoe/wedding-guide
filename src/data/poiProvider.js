/**
 * 高德 POI / 导航扩展预留接口（本阶段不请求网络、不保存 Key）
 * 后续接入时，将 API 结果映射为 places.js 中的统一点位模型即可。
 */
import { apiUrl } from './apiBase'
import { getStoredInviteCode } from './inviteCode'
import { createPlace } from './places'

const COZE_PLACE_TYPES = ['hotel', 'attraction', 'restaurant']
const PLACE_TYPE_LABELS = {
  hotel: '入住酒店',
  attraction: '推荐景点',
  restaurant: '推荐餐厅',
}

function parseNestedJson(value, depth = 0) {
  if (depth > 5 || typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return value
  try {
    return parseNestedJson(JSON.parse(text), depth + 1)
  } catch {
    return value
  }
}

function looksLikePlaceRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  const fields = record.fields && typeof record.fields === 'object' ? record.fields : record
  return Boolean(fields.name || fields.latitude || fields.longitude)
}

/** 从扣子工作流的多层 data/output/records 结构中提取记录数组 */
function extractRecords(payload) {
  const queue = [payload]
  const visited = new Set()

  while (queue.length) {
    const current = parseNestedJson(queue.shift())
    if (current === null || current === undefined) continue
    if (typeof current !== 'object') continue
    if (visited.has(current)) continue
    visited.add(current)

    if (Array.isArray(current)) {
      if (current.length === 0 || current.some(looksLikePlaceRecord)) {
        return current
      }
      queue.push(...current)
      continue
    }

    const preferredKeys = ['records', 'items', 'output', 'result', 'data']
    preferredKeys.forEach((key) => {
      if (current[key] !== undefined) queue.push(current[key])
    })
    Object.entries(current).forEach(([key, value]) => {
      if (!preferredKeys.includes(key)) queue.push(value)
    })
  }

  return []
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** 将扣子三张地点表的记录转换为地图统一点位模型 */
export function mapCozeRecordToPlace(record, placeType, index = 0) {
  const fields = record?.fields && typeof record.fields === 'object' ? record.fields : record
  if (!fields || typeof fields !== 'object') return null

  const name = String(fields.name || '').trim()
  const longitude = toFiniteNumber(fields.longitude)
  const latitude = toFiniteNumber(fields.latitude)
  if (!name || longitude === null || latitude === null) return null

  let details = ''
  let time = ''
  let description = ''

  if (placeType === 'hotel') {
    details = '婚礼宾客入住酒店'
  } else if (placeType === 'attraction') {
    details = [fields.attraction_type, fields.ticket_price && `门票：${fields.ticket_price}`]
      .filter(Boolean)
      .join(' · ')
    time = fields.open_time || ''
    // 扣子景点表新增「简介 introduction」字段
    description = String(fields.introduction || '').trim()
  } else if (placeType === 'restaurant') {
    details = [fields.cuisine, fields.per_capita_price && `人均：${fields.per_capita_price}`]
      .filter(Boolean)
      .join(' · ')
    time = fields.business_hours || ''
    description = fields.recommended_dishes
      ? `推荐菜：${fields.recommended_dishes}`
      : ''
  }

  const recordId = record.id || record.record_id || record.uuid || `${longitude}-${latitude}-${index}`
  return createPlace({
    id: `coze-${placeType}-${recordId}`,
    placeType,
    type: PLACE_TYPE_LABELS[placeType],
    title: name,
    name,
    coordinates: [longitude, latitude],
    address: fields.address || '',
    details,
    time,
    description,
  })
}

async function loadCozePlaceType(placeType) {
  const response = await fetch(`${apiUrl('/api/places')}?type=${encodeURIComponent(placeType)}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.message || `${PLACE_TYPE_LABELS[placeType]}加载失败`)
  }

  return extractRecords(payload.workflow)
    .map((record, index) => mapCozeRecordToPlace(record, placeType, index))
    .filter(Boolean)
}

/**
 * 并行加载入住酒店、推荐景点、推荐餐厅。
 * 单类请求失败时保留另外两类数据，并将失败类型交给页面做降级处理。
 */
export async function loadCozePlaces() {
  const results = await Promise.allSettled(
    COZE_PLACE_TYPES.map((placeType) => loadCozePlaceType(placeType)),
  )
  const places = []
  const failedTypes = []

  results.forEach((result, index) => {
    const placeType = COZE_PLACE_TYPES[index]
    if (result.status === 'fulfilled') {
      places.push(...result.value)
    } else {
      failedTypes.push(placeType)
      console.error(`${PLACE_TYPE_LABELS[placeType]}加载失败：`, result.reason)
    }
  })

  return { places, failedTypes }
}

/**
 * 将高德导航 URI 所需参数拼成可跳转链接（后续阶段使用）
 * @param {{ name: string, coordinates: [number, number] }} place
 */
export function buildAmapNavigationUrl(place) {
  if (!place?.coordinates?.length) return ''
  const [lng, lat] = place.coordinates
  const name = encodeURIComponent(place.navigation?.name || place.name || place.title || '目的地')
  return `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car&coordinate=gaode&callnative=1`
}

/**
 * 将高德 POI 搜索结果条目转换为统一点位模型
 * @param {object} amapPoi
 */
export function mapAmapPoiToPlace(amapPoi) {
  const location = String(amapPoi.location || '').split(',')
  const lng = Number(location[0])
  const lat = Number(location[1])
  return createPlace({
    id: `poi-${amapPoi.id || `${lng}-${lat}`}`,
    placeType: 'poi',
    type: amapPoi.type || '周边推荐',
    title: amapPoi.name,
    name: amapPoi.name,
    coordinates: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null,
    address: amapPoi.address || amapPoi.pname + amapPoi.cityname + amapPoi.adname,
    details: amapPoi.type || '',
    time: amapPoi.business?.opentime || '',
    description: amapPoi.business?.tel ? `电话：${amapPoi.business.tel}` : '',
  })
}

/**
 * 预留：按关键词搜索周边 POI
 * 正式环境应通过后端代理请求高德 Web 服务 API，避免 Key 暴露。
 */
export async function searchNearbyPois(_options = {}) {
  // 本阶段返回空列表，不发起请求
  return []
}

/**
 * 预留：加载选定的酒店/景点 POI，供地图 series 追加
 */
export async function loadSelectedPois(_ids = []) {
  return []
}

/** 驾车时长缓存 */
const drivingDurationCache = new Map()

/**
 * 调用高德路径规划 API 计算驾车时长
 * @param {[number, number]} origin 起点 [lng, lat]
 * @param {[number, number]} destination 终点 [lng, lat]
 * @returns {Promise<string>} 如 "约 25 分钟"
 */
export async function loadDrivingDuration(origin, destination) {
  const cacheKey = `${origin.join(',')}-${destination.join(',')}`
  if (drivingDurationCache.has(cacheKey)) {
    return drivingDurationCache.get(cacheKey)
  }

  const params = new URLSearchParams({
    origin: origin.join(','),
    destination: destination.join(','),
  })
  const inviteCode = getStoredInviteCode()
  if (inviteCode) params.set('code', inviteCode)

  const response = await fetch(`${apiUrl('/api/driving')}?${params.toString()}`)
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || '路径规划请求失败')
  }

  const seconds = Number(data?.route?.paths?.[0]?.duration || 0)
  const minutes = Math.round(seconds / 60)
  const text = minutes > 0 ? `约 ${minutes} 分钟` : '暂无数据'
  drivingDurationCache.set(cacheKey, text)
  return text
}
