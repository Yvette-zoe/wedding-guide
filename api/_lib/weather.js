/**
 * 天气查询与穿衣建议（预报 / 气候参考双模式）
 */
import { fetchWeather } from './weatherApi.js'
import { resolvePlaceByName } from './placesCatalog.js'

export const WEDDING_DATE = '2026-08-23'
const FORECAST_MAX_DAYS = 3

/** 利川 8 月下旬气候参考（非预报，距婚礼 >3 天时使用） */
const LICHUAN_CLIMATE = {
  city: '利川市',
  adcode: '422802',
  dayweather: '多云间晴，午后可能有阵雨',
  nightweather: '多云',
  daytemp: '28',
  nighttemp: '19',
  wind: '微风',
  tips: [
    '山区昼夜温差较大，建议带轻薄外套',
    '午后可能有雷阵雨，建议携带折叠伞',
    '景点多步行，穿舒适防滑运动鞋',
    '备一件防晒衣，山区紫外线较强',
  ],
  note: '以上为利川 8 月下旬气候特征参考，非实时预报，请以临近婚礼时的预报为准',
}

/** 恩施城区气候参考（恩施站/机场等） */
const ENSHI_CLIMATE = {
  ...LICHUAN_CLIMATE,
  city: '恩施市',
  adcode: '422801',
  note: '以上为恩施 8 月下旬气候特征参考，非实时预报，请以临近婚礼时的预报为准',
}

function parseDateOnly(text) {
  const match = String(text || '').match(/(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(fromDate, toDate) {
  const a = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())
  const b = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/** 根据地点名称解析高德 adcode */
export function resolveAdcodeForPlace(place) {
  const text = `${place?.name || ''}${place?.title || ''}${place?.address || ''}`
  if (/恩施|许家坪/.test(text) && !/利川/.test(text)) {
    return { adcode: '422801', city: '恩施市', climate: ENSHI_CLIMATE }
  }
  return { adcode: '422802', city: '利川市', climate: LICHUAN_CLIMATE }
}

function buildWeatherTips(cast, climate) {
  const tips = []
  const dayWeather = cast?.dayweather || climate.dayweather
  const dayTemp = Number(cast?.daytemp ?? climate.daytemp)
  const nightTemp = Number(cast?.nighttemp ?? climate.nighttemp)

  if (/雨|雷|阵雨/.test(dayWeather)) {
    tips.push('可能有降雨，建议携带折叠伞或轻便雨衣')
  }
  if (dayTemp >= 30) tips.push('白天偏热，注意防暑补水，穿透气衣物')
  if (nightTemp <= 20 || dayTemp - nightTemp >= 8) {
    tips.push('昼夜温差较大，建议带轻薄外套')
  }
  if (dayTemp >= 24) tips.push('紫外线较强，建议防晒')
  tips.push('山区景点步行较多，穿舒适防滑鞋')

  return [...new Set(tips)].slice(0, 5)
}

/**
 * 查询指定地点在指定日期的天气
 * @param {{ placeName: string, date?: string, places: array, env: object }} options
 */
export async function queryWeather({ placeName, date, places, env }) {
  const place = resolvePlaceByName(placeName, places)
  const displayName = place?.name || placeName || '利川'
  const { adcode, city, climate } = resolveAdcodeForPlace(place || { name: placeName, address: placeName })

  const today = new Date()
  const targetDate = parseDateOnly(date || WEDDING_DATE) || parseDateOnly(WEDDING_DATE)
  const targetDateStr = formatDate(targetDate)
  const daysUntil = daysBetween(today, targetDate)

  // 超出高德预报窗口（约 3 天）→ 气候参考
  if (daysUntil > FORECAST_MAX_DAYS || daysUntil < 0) {
    return {
      place_name: displayName,
      city,
      date: targetDateStr,
      source_type: 'climate_reference',
      source_label: '气候参考（非预报）',
      dayweather: climate.dayweather,
      nightweather: climate.nightweather,
      daytemp: climate.daytemp,
      nighttemp: climate.nighttemp,
      tips: climate.tips,
      note: climate.note,
      days_until: daysUntil,
    }
  }

  const data = await fetchWeather({
    key: env.AMAP_KEY,
    city: adcode,
    extensions: 'all',
  })

  if (data?.status !== '1') {
    return {
      place_name: displayName,
      city,
      date: targetDateStr,
      source_type: 'climate_reference',
      source_label: '气候参考（非预报）',
      dayweather: climate.dayweather,
      nightweather: climate.nightweather,
      daytemp: climate.daytemp,
      nighttemp: climate.nighttemp,
      tips: climate.tips,
      note: `天气接口暂不可用，以下为气候参考：${climate.note}`,
      days_until: daysUntil,
    }
  }

  const casts = data?.forecasts?.[0]?.casts || []
  const reporttime = data?.forecasts?.[0]?.reporttime || data?.lives?.[0]?.reporttime || ''
  let cast = casts.find((item) => item.date === targetDateStr)

  // 今天且 casts 无匹配时，尝试实况
  if (!cast && daysUntil === 0 && data?.lives?.[0]) {
    const live = data.lives[0]
    return {
      place_name: displayName,
      city: live.city || city,
      date: targetDateStr,
      source_type: 'forecast',
      source_label: reporttime ? `高德实况（更新于 ${reporttime}）` : '高德实况',
      dayweather: live.weather,
      nightweather: live.weather,
      daytemp: live.temperature,
      nighttemp: live.temperature,
      wind: `${live.winddirection || ''}风 ${live.windpower || ''}级`,
      humidity: live.humidity,
      tips: buildWeatherTips({ dayweather: live.weather, daytemp: live.temperature, nighttemp: live.temperature }, climate),
      days_until: daysUntil,
    }
  }

  if (!cast && casts.length) {
    // 取最近一天的预报
    cast = daysUntil <= 1 ? casts[0] : casts[Math.min(daysUntil, casts.length - 1)]
  }

  if (!cast) {
    return {
      place_name: displayName,
      city,
      date: targetDateStr,
      source_type: 'climate_reference',
      source_label: '气候参考（非预报）',
      dayweather: climate.dayweather,
      nightweather: climate.nightweather,
      daytemp: climate.daytemp,
      nighttemp: climate.nighttemp,
      tips: climate.tips,
      note: climate.note,
      days_until: daysUntil,
    }
  }

  return {
    place_name: displayName,
    city,
    date: cast.date || targetDateStr,
    week: cast.week,
    source_type: 'forecast',
    source_label: reporttime ? `高德预报（更新于 ${reporttime}）` : '高德预报',
    dayweather: cast.dayweather,
    nightweather: cast.nightweather,
    daytemp: cast.daytemp,
    nighttemp: cast.nighttemp,
    wind: `${cast.daywind || ''}风 ${cast.daypower || ''}级`,
    tips: buildWeatherTips(cast, climate),
    days_until: daysUntil,
  }
}

export function buildWeatherCard(weather) {
  return {
    card_type: 'weather',
    title: `${weather.place_name}天气`,
    ...weather,
    temp_text: `${weather.nighttemp}–${weather.daytemp}℃`,
  }
}
