/**
 * 预生成距离矩阵：本地调高德，写入 public/data 与 api/_lib
 * 用法：node scripts/generate-distance-matrix.js
 * 依赖 .env.local 中的 AMAP_KEY（可选 COZE_* 拉餐厅）
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchDriving, fetchWalking, parseRouteResult } from '../api/_lib/amap.js'
import { loadPlacesCatalog } from '../api/_lib/placesCatalog.js'
import {
  defaultHotel,
  weddingVenue,
  staticAttractions,
  transportHubs,
} from '../api/_lib/staticPlaces.js'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const DELAY_MS = 250
const MAX_RESTAURANTS = 10
/** 步行矩阵仅覆盖近郊点，避免远距离步行无意义 */
const WALKING_MAX_STRAIGHT_M = 8000

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const env = {}
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function coordsToAmap(coords) {
  return `${coords[0]},${coords[1]}`
}

function haversineMeters(a, b) {
  const [lng1, lat1] = a
  const [lng2, lat2] = b
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const r = 6371000
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

function uniqueById(places) {
  const map = new Map()
  for (const place of places) {
    if (!place?.id || !place.coordinates?.length) continue
    if (!map.has(place.id)) map.set(place.id, place)
  }
  return [...map.values()]
}

/** 按坐标去重，优先保留静态点（id 更短/稳定） */
function uniqueByCoordinates(places) {
  const map = new Map()
  for (const place of places) {
    if (!place?.coordinates?.length) continue
    const key = place.coordinates.map((n) => Number(n).toFixed(5)).join(',')
    const existing = map.get(key)
    if (!existing || String(place.id).length < String(existing.id).length) {
      map.set(key, place)
    }
  }
  return [...map.values()]
}

async function fetchRoute(key, origin, destination, mode) {
  const originStr = coordsToAmap(origin.coordinates)
  const destStr = coordsToAmap(destination.coordinates)
  const data = mode === 'walking'
    ? await fetchWalking({ key, origin: originStr, destination: destStr })
    : await fetchDriving({ key, origin: originStr, destination: destStr })
  const parsed = parseRouteResult(data, mode)
  if (parsed.status !== 'ok') {
    throw new Error(parsed.info || `${mode} 路径规划失败`)
  }
  return {
    origin_id: origin.id,
    origin_name: origin.name,
    destination_id: destination.id,
    destination_name: destination.name,
    origin: origin.coordinates,
    destination: destination.coordinates,
    distance_m: parsed.distance_m,
    distance_km: parsed.distance_km,
    duration_s: parsed.duration_s,
    duration_min: parsed.duration_min,
    distance_text: parsed.distance_text,
    duration_text: parsed.duration_text,
    mode,
    source: 'amap',
  }
}

async function main() {
  const env = {
    ...loadEnvFile(join(rootDir, '.env.local')),
    ...process.env,
  }
  const key = env.AMAP_KEY
  if (!key) {
    console.error('缺少 AMAP_KEY，请在 .env.local 配置')
    process.exit(1)
  }

  const catalog = await loadPlacesCatalog(env)
  const hotel = catalog.defaultHotel || defaultHotel

  // 固定核心点 + 静态景点 + 交通枢纽 + 扣子景点/餐厅
  const cozeAttractions = catalog.places.filter((p) => p.placeType === 'attraction')
  const cozeRestaurants = catalog.places
    .filter((p) => p.placeType === 'restaurant')
    .slice(0, MAX_RESTAURANTS)

  const destinations = uniqueByCoordinates(uniqueById([
    weddingVenue,
    ...transportHubs.filter((p) => ['lichuan-station', 'enshi-station', 'xujiaping-airport'].includes(p.id)),
    ...staticAttractions,
    ...cozeAttractions,
    ...cozeRestaurants,
  ])).filter((p) => p.id !== hotel.id)

  console.log(`起点：${hotel.name}`)
  console.log(`终点数：${destinations.length}（含餐厅 ${cozeRestaurants.length}）`)

  const routes = []
  const errors = []

  for (const dest of destinations) {
    // 驾车：酒店 ↔ 目的地（双向，供行程规划返程命中）
    for (const [from, to] of [[hotel, dest], [dest, hotel]]) {
      try {
        const route = await fetchRoute(key, from, to, 'driving')
        routes.push(route)
        console.log(`✓ driving ${from.name} → ${to.name}: ${route.duration_text}, ${route.distance_text}`)
      } catch (error) {
        errors.push({ from: from.name, to: to.name, mode: 'driving', error: error.message })
        console.warn(`✗ driving ${from.name} → ${to.name}: ${error.message}`)
      }
      await sleep(DELAY_MS)
    }

    // 步行：仅直线距离较近的点
    const straight = haversineMeters(hotel.coordinates, dest.coordinates)
    if (straight <= WALKING_MAX_STRAIGHT_M) {
      for (const [from, to] of [[hotel, dest], [dest, hotel]]) {
        try {
          const route = await fetchRoute(key, from, to, 'walking')
          routes.push(route)
          console.log(`✓ walking ${from.name} → ${to.name}: ${route.duration_text}`)
        } catch (error) {
          errors.push({ from: from.name, to: to.name, mode: 'walking', error: error.message })
          console.warn(`✗ walking ${from.name} → ${to.name}: ${error.message}`)
        }
        await sleep(DELAY_MS)
      }
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    origin_default: {
      id: hotel.id,
      name: hotel.name,
      coordinates: hotel.coordinates,
    },
    route_count: routes.length,
    routes,
    errors,
  }

  const publicPath = join(rootDir, 'public', 'data', 'distance-matrix.json')
  const apiPath = join(rootDir, 'api', '_lib', 'distance-matrix.json')
  mkdirSync(dirname(publicPath), { recursive: true })
  const json = `${JSON.stringify(payload, null, 2)}\n`
  writeFileSync(publicPath, json, 'utf8')
  writeFileSync(apiPath, json, 'utf8')

  console.log(`\n已写入 ${routes.length} 条路线：`)
  console.log(`- ${publicPath}`)
  console.log(`- ${apiPath}`)
  if (errors.length) console.log(`失败 ${errors.length} 条，见 JSON.errors`)

  const hotelToStation = routes.find(
    (r) => r.mode === 'driving'
      && r.origin_id === hotel.id
      && (r.destination_id === 'lichuan-station' || r.destination_name.includes('利川站')),
  )
  if (hotelToStation) {
    console.log(`\n验收参考：酒店→利川站 驾车 ${hotelToStation.duration_text} / ${hotelToStation.distance_text}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
