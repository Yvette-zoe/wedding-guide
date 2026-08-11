/**
 * 静态兜底数据：助手 API 不可用时仍可展示的婚礼/行程/距离/穿衣信息
 * 气候文案与 api/_lib/weather.js 的 climate_reference 保持一致
 */
import distanceMatrix from '../../public/data/distance-matrix.json'
import { defaultHotel, weddingVenue } from './places'

export const CHAT_FAIL_THRESHOLD = 3
export const CHAT_TIMEOUT_MS = 15000

/** 婚礼核心信息 */
export const FALLBACK_WEDDING = {
  dateLabel: '2026.08.23',
  ceremonyTime: '10:38',
  banquetTime: '12:08',
  venueName: weddingVenue.title,
  venueAddress: weddingVenue.address,
  venueCoordinates: weddingVenue.coordinates,
  hotelName: defaultHotel.name,
  hotelAddress: defaultHotel.address,
  hotelCoordinates: defaultHotel.coordinates,
  note: '仪式：草坪 / 用餐：一层天空之城宴会厅',
}

/** 预置行程（文字版，不依赖 AI） */
export const FALLBACK_ITINERARIES = [
  {
    id: 'half_day',
    title: '半日游（约 4 小时）',
    summary: '推荐近郊：腾龙洞或龙船水乡（从酒店出发、返回酒店）',
    steps: [
      '09:00 酒店出发',
      '约 20 分钟车程抵达腾龙洞 / 龙船水乡',
      '游览约 2–2.5 小时',
      '返回酒店（预留缓冲）',
      '※ 苏马荡、鱼木寨路程较远，不适合半日往返',
    ],
  },
  {
    id: 'two_day',
    title: '两日游',
    summary: 'D1 近郊腾龙洞 · D2 谋道镇（苏马荡 / 鱼木寨）',
    steps: [
      '第一天：酒店 → 腾龙洞 → 返回酒店',
      '第二天：酒店 → 苏马荡 → 鱼木寨 → 返回酒店',
      '※ 山区路程较长，建议尽早出发并留意返程时间',
    ],
  },
]

/** 利川 8 月下旬气候参考（非预报） */
export const FALLBACK_CLIMATE = {
  sourceLabel: '气候参考（非预报）',
  dayweather: '多云间晴，午后可能有阵雨',
  nightweather: '多云',
  daytemp: '28',
  nighttemp: '19',
  tips: [
    '山区昼夜温差较大，建议带轻薄外套',
    '午后可能有雷阵雨，建议携带折叠伞',
    '景点多步行，穿舒适防滑运动鞋',
    '备一件防晒衣，山区紫外线较强',
  ],
  note: '以上为利川 8 月下旬气候特征参考，非实时预报，请以临近婚礼时的预报为准',
}

/** 兜底距离表优先展示的目的地 id / 名称关键词 */
const DISTANCE_PRIORITY = [
  { id: 'venue', nameIncludes: ['婚宴场地'] },
  { id: 'lichuan-station', nameIncludes: ['利川站'] },
  { id: 'tenglongdong', nameIncludes: ['腾龙洞'] },
  { id: '龙船水乡', nameIncludes: ['龙船水乡'] },
  { id: 'sumadang', nameIncludes: ['苏马荡'] },
  { id: 'yumuzhai', nameIncludes: ['鱼木寨'] },
  { id: 'enshi-station', nameIncludes: ['恩施站'] },
]

function matchPriority(route, priority) {
  if (priority.id && route.destination_id === priority.id) return true
  const name = route.destination_name || ''
  return priority.nameIncludes.some((keyword) => name.includes(keyword))
}

/**
 * 从距离矩阵提取「酒店出发 · 驾车」精简表
 * @returns {Array<{ name: string, duration_text: string, distance_text: string, destination: number[] }>}
 */
export function getFallbackDistanceRows() {
  const hotelCoords = FALLBACK_WEDDING.hotelCoordinates
  const hotelKey = hotelCoords.map((n) => Number(n).toFixed(5)).join(',')
  const drivingFromHotel = (distanceMatrix.routes || []).filter((route) => {
    if (route.mode !== 'driving') return false
    const originKey = (route.origin || []).map((n) => Number(n).toFixed(5)).join(',')
    return originKey === hotelKey
  })

  const rows = []
  const used = new Set()

  for (const priority of DISTANCE_PRIORITY) {
    const hit = drivingFromHotel.find((route) => matchPriority(route, priority))
    if (!hit || used.has(hit.destination_name)) continue
    used.add(hit.destination_name)
    rows.push({
      name: hit.destination_name,
      duration_text: hit.duration_text,
      distance_text: hit.distance_text,
      destination: hit.destination,
    })
  }

  return rows
}

/** 构建高德导航 URI（兜底页一键导航） */
export function buildFallbackNavUrl(name, coordinates) {
  if (!coordinates?.length) return ''
  const [lng, lat] = coordinates
  return `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}&mode=car&coordinate=gaode&callnative=1`
}
