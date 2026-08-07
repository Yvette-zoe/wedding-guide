/**
 * 服务端地点目录：静态点位 + 扣子数据库，支持按名称解析
 */
import { fetchCozePlaces } from './coze.js'
import {
  defaultHotel,
  staticAttractions,
  staticPlaces,
  transportHubs,
  weddingVenue,
} from './staticPlaces.js'

const PLACE_TYPE_LABELS = {
  hotel: '入住酒店',
  attraction: '推荐景点',
  restaurant: '推荐餐厅',
}

let catalogCache = null
let catalogLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

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
      if (current.length === 0 || current.some(looksLikePlaceRecord)) return current
      queue.push(...current)
      continue
    }

    const preferredKeys = ['records', 'items', 'output', 'result', 'data']
    preferredKeys.forEach((key) => {
      if (current[key] !== undefined) queue.push(current[key])
    })
  }

  return []
}

function mapCozeRecordToPlace(record, placeType, index = 0) {
  const fields = record?.fields && typeof record.fields === 'object' ? record.fields : record
  if (!fields || typeof fields !== 'object') return null

  const name = String(fields.name || '').trim()
  const longitude = Number(fields.longitude)
  const latitude = Number(fields.latitude)
  if (!name || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

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
  } else if (placeType === 'restaurant') {
    details = [fields.cuisine, fields.per_capita_price && `人均：${fields.per_capita_price}`]
      .filter(Boolean)
      .join(' · ')
    time = fields.business_hours || ''
    description = fields.recommended_dishes ? `推荐菜：${fields.recommended_dishes}` : ''
  }

  const recordId = record.id || record.record_id || record.uuid || `${longitude}-${latitude}-${index}`
  return {
    id: `coze-${placeType}-${recordId}`,
    placeType,
    type: PLACE_TYPE_LABELS[placeType],
    title: name,
    name,
    aliases: [],
    coordinates: [longitude, latitude],
    address: fields.address || '',
    details,
    time,
    description,
  }
}

async function loadCozePlacesMerged(env) {
  const types = ['hotel', 'attraction', 'restaurant']
  const token = env.COZE_PAT
  const workflowId = env.COZE_WF_LIST_PLACES || '7671226620824371235'
  const results = await Promise.allSettled(
    types.map((placeType) => fetchCozePlaces(placeType, { token, workflowId })),
  )

  const places = []
  const failedTypes = []

  results.forEach((result, index) => {
    const placeType = types[index]
    if (result.status === 'fulfilled') {
      extractRecords(result.value.workflow)
        .map((record, i) => mapCozeRecordToPlace(record, placeType, i))
        .filter(Boolean)
        .forEach((place) => places.push(place))
    } else {
      failedTypes.push(placeType)
    }
  })

  return { places, failedTypes }
}

/** 加载完整地点目录（带 5 分钟内存缓存） */
export async function loadPlacesCatalog(env) {
  const now = Date.now()
  if (catalogCache && now - catalogLoadedAt < CACHE_TTL_MS) {
    return catalogCache
  }

  let cozePlaces = []
  let failedTypes = []
  try {
    const result = await loadCozePlacesMerged(env)
    cozePlaces = result.places
    failedTypes = result.failedTypes
  } catch {
    failedTypes = ['hotel', 'attraction', 'restaurant']
  }

  const fallbackAttractions = failedTypes.includes('attraction') ? staticAttractions : []
  const fallbackHotels = failedTypes.includes('hotel') ? [defaultHotel] : []

  const places = [
    weddingVenue,
    ...fallbackAttractions,
    ...cozePlaces,
    ...fallbackHotels,
    ...transportHubs,
  ]

  // 按 id 去重
  const seen = new Set()
  const uniquePlaces = places.filter((place) => {
    if (seen.has(place.id)) return false
    seen.add(place.id)
    return true
  })

  catalogCache = { places: uniquePlaces, defaultHotel: uniquePlaces.find((p) => p.placeType === 'hotel') || defaultHotel }
  catalogLoadedAt = now
  return catalogCache
}

function normalizeText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')
}

/** 按名称/别名解析地点，支持模糊匹配 */
export function resolvePlaceByName(name, places) {
  const query = normalizeText(name)
  if (!query) return null

  // 默认别名
  if (['酒店', '入住酒店', '默认酒店'].includes(name?.trim?.() || query)) {
    return places.find((p) => p.placeType === 'hotel') || defaultHotel
  }

  // 精确匹配
  for (const place of places) {
    const candidates = [place.name, place.title, ...(place.aliases || [])]
    if (candidates.some((c) => normalizeText(c) === query)) return place
  }

  // 包含匹配
  let best = null
  let bestScore = 0
  for (const place of places) {
    const candidates = [place.name, place.title, ...(place.aliases || [])]
    for (const candidate of candidates) {
      const normalized = normalizeText(candidate)
      if (!normalized) continue
      if (normalized.includes(query) || query.includes(normalized)) {
        const score = Math.min(normalized.length, query.length)
        if (score > bestScore) {
          bestScore = score
          best = place
        }
      }
    }
  }

  return best
}

/** 生成写入 system prompt 的地点摘要（不含经纬度） */
export function buildPlacesSummary(places) {
  const lines = places.map((place) => {
    const parts = [`- ${place.name}（${place.type}）`]
    if (place.address) parts.push(`地址：${place.address}`)
    if (place.time) parts.push(`时间：${place.time}`)
    if (place.details) parts.push(place.details)
    return parts.join('；')
  })
  return lines.join('\n')
}
