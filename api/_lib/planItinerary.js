/**
 * 确定性行程规划：基于高德真实车程 + 景点建议游玩时长做时间预算校验
 */
import { resolvePlaceByName } from './placesCatalog.js'

const TRIP_BUDGET_MIN = {
  half_day: 240,
  one_day: 480,
  two_day: 960,
}

const TRIP_LABEL = {
  half_day: '半日游',
  one_day: '一日游',
  two_day: '两日游',
}

const BUFFER_MIN = 30
const DEFAULT_START = '09:00'
const DEFAULT_PLAY_MIN = 120

/** 终点为交通枢纽时，需预留的候车/值机时间（分钟） */
const TRANSPORT_RESERVE = {
  transport: 40,
  default: 40,
}

function parsePlayMinutes(details) {
  const match = String(details || '').match(/(\d+(?:\.\d+)?)\s*小时/)
  if (match) return Math.round(parseFloat(match[1]) * 60)
  return DEFAULT_PLAY_MIN
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function getTransportReserve(place) {
  if (place?.placeType !== 'transport') return 0
  if (/机场|航空/.test(`${place.name}${place.type}`)) return 90
  return TRANSPORT_RESERVE.transport
}

/** 构建单条时间轴步骤 */
function step(time, label, extra = {}) {
  return { time, label, ...extra }
}

/**
 * 规划行程
 * @param {{ trip_type, origin_name?, destination_name?, start_time?, places, getRoute, defaultHotel }} options
 */
export async function planItinerary({
  trip_type: tripType,
  origin_name: originName,
  destination_name: destinationName,
  start_time: startTime,
  places,
  getRoute,
  defaultHotel,
}) {
  const budget = TRIP_BUDGET_MIN[tripType] || TRIP_BUDGET_MIN.one_day
  const label = TRIP_LABEL[tripType] || '一日游'
  const assumptions = []

  const origin = resolvePlaceByName(originName || '酒店', places) || defaultHotel
  const destination = destinationName
    ? resolvePlaceByName(destinationName, places)
    : defaultHotel

  if (!origin?.coordinates) {
    return { feasible: false, error: `未找到起点「${originName || '酒店'}」` }
  }

  if (!originName) assumptions.push(`起点默认：${origin.name}`)
  if (!destinationName) assumptions.push(`终点默认：${destination.name}`)
  else if (destinationName && destination?.name) assumptions.push(`终点：${destination.name}`)

  const attractions = places.filter((p) => p.placeType === 'attraction' && p.coordinates?.length === 2)
  if (!attractions.length) {
    return { feasible: false, error: '暂无可规划景点数据' }
  }

  let timeCursor = startTime || DEFAULT_START
  const steps = []
  const placeIds = [origin.id]

  // 若终点是交通枢纽，先从总预算扣除「返回终点 + 候车/值机」
  let remaining = budget
  let returnLegMin = 0
  if (destination?.coordinates && destination.id !== origin.id) {
    const toDest = await getRoute(origin.coordinates, destination.coordinates, 'driving')
    returnLegMin = toDest.duration_min + getTransportReserve(destination)
    remaining -= returnLegMin
    if (returnLegMin > 0) {
      assumptions.push(`已预留返回${destination.name}车程 ${toDest.duration_text} + 候车/值机缓冲`)
    }
  }

  steps.push(step(timeCursor, `从${origin.name}出发`, { place_id: origin.id, type: 'start' }))

  /** 计算单景点往返是否可行 */
  async function evaluateSingle(attraction) {
    const go = await getRoute(origin.coordinates, attraction.coordinates, 'driving')
    const back = destination?.coordinates && destination.id !== origin.id
      ? await getRoute(attraction.coordinates, destination.coordinates, 'driving')
      : await getRoute(attraction.coordinates, origin.coordinates, 'driving')
    const play = parsePlayMinutes(attraction.details)
    const total = go.duration_min + play + BUFFER_MIN + back.duration_min
    return { attraction, go, back, play, total, totalWithReturn: total }
  }

  /** 半日/一日：选最优单点或双点组合 */
  async function planSingleDay(maxStops) {
    const evaluations = await Promise.all(attractions.map(evaluateSingle))
    evaluations.sort((a, b) => a.total - b.total)

    // 尝试两个景点串联（仅一日游且 maxStops>=2）
    if (maxStops >= 2) {
      let bestPair = null
      for (let i = 0; i < evaluations.length; i += 1) {
        for (let j = 0; j < evaluations.length; j += 1) {
          if (i === j) continue
          const a = evaluations[i].attraction
          const b = evaluations[j].attraction
          const leg1 = await getRoute(origin.coordinates, a.coordinates, 'driving')
          const mid = await getRoute(a.coordinates, b.coordinates, 'driving')
          const playA = parsePlayMinutes(a.details)
          const playB = parsePlayMinutes(b.details)
          const back = destination?.coordinates && destination.id !== origin.id
            ? await getRoute(b.coordinates, destination.coordinates, 'driving')
            : await getRoute(b.coordinates, origin.coordinates, 'driving')
          const total = leg1.duration_min + playA + BUFFER_MIN + mid.duration_min + playB + BUFFER_MIN + back.duration_min
          if (total <= remaining && (!bestPair || total < bestPair.total)) {
            bestPair = { a, b, leg1, mid, playA, playB, back, total }
          }
        }
      }
      if (bestPair) {
        return { type: 'pair', ...bestPair }
      }
    }

    const best = evaluations.find((item) => item.total <= remaining)
    if (best) return { type: 'single', ...best }

    const nearest = evaluations[0]
    return {
      type: 'infeasible',
      nearest,
      reason: `最近候选「${nearest.attraction.name}」往返约需 ${nearest.total} 分钟，超出${label}可用 ${remaining} 分钟`,
    }
  }

  /** 两日游：D1 近郊（腾龙洞），D2 谋道镇（苏马荡+鱼木寨） */
  async function planTwoDay() {
    const dayBudget = Math.floor(budget / 2)
    const tenglong = attractions.find((a) => a.id === 'tenglongdong' || a.name.includes('腾龙洞'))
    const sumadang = attractions.find((a) => a.id === 'sumadang' || a.name.includes('苏马荡'))
    const yumuzhai = attractions.find((a) => a.id === 'yumuzhai' || a.name.includes('鱼木寨'))

    const days = []

    // 第一天
    if (tenglong) {
      const ev = await evaluateSingle(tenglong)
      const day1Steps = [step('09:00', `从${origin.name}出发`, { place_id: origin.id })]
      let t = '09:00'
      t = addMinutes(t, ev.go.duration_min)
      day1Steps.push(step(t, `抵达${tenglong.name}（${ev.go.duration_text}）`, {
        place_id: tenglong.id,
        duration_text: ev.go.duration_text,
      }))
      t = addMinutes(t, ev.play)
      day1Steps.push(step(t, `结束游览${tenglong.name}（建议 ${Math.round(ev.play / 60 * 10) / 10} 小时）`, {
        place_id: tenglong.id,
      }))
      t = addMinutes(t, BUFFER_MIN + ev.back.duration_min)
      const endName = destination?.id !== origin.id ? destination.name : origin.name
      day1Steps.push(step(t, `返回${endName}（${ev.back.duration_text}）`, {
        place_id: destination?.id || origin.id,
        duration_text: ev.back.duration_text,
      }))
      days.push({
        day: 1,
        title: '第一天 · 城区近郊',
        feasible: ev.total <= dayBudget,
        steps: day1Steps,
        place_ids: [origin.id, tenglong.id, destination?.id || origin.id],
        note: ev.total <= dayBudget ? '' : `当天行程约 ${ev.total} 分钟，略超半日强度，建议精简或提早出发`,
      })
    }

    // 第二天
    const day2Attractions = [sumadang, yumuzhai].filter(Boolean)
    if (day2Attractions.length) {
      const day2Steps = [step('09:00', `从${origin.name}出发`, { place_id: origin.id })]
      let t = '09:00'
      const day2Ids = [origin.id]

      for (let i = 0; i < day2Attractions.length; i += 1) {
        const attr = day2Attractions[i]
        const fromCoords = i === 0 ? origin.coordinates : day2Attractions[i - 1].coordinates
        const leg = await getRoute(fromCoords, attr.coordinates, 'driving')
        t = addMinutes(t, leg.duration_min)
        day2Steps.push(step(t, `抵达${attr.name}（${leg.duration_text}）`, {
          place_id: attr.id,
          duration_text: leg.duration_text,
        }))
        const play = parsePlayMinutes(attr.details)
        t = addMinutes(t, play)
        day2Steps.push(step(t, `游览${attr.name}`, { place_id: attr.id }))
        day2Ids.push(attr.id)
        if (i < day2Attractions.length - 1) t = addMinutes(t, BUFFER_MIN)
      }

      const last = day2Attractions[day2Attractions.length - 1]
      const back = destination?.coordinates && destination.id !== origin.id
        ? await getRoute(last.coordinates, destination.coordinates, 'driving')
        : await getRoute(last.coordinates, origin.coordinates, 'driving')
      t = addMinutes(t, BUFFER_MIN + back.duration_min)
      day2Steps.push(step(t, `返回${destination?.name || origin.name}`, {
        place_id: destination?.id || origin.id,
        duration_text: back.duration_text,
      }))
      day2Ids.push(destination?.id || origin.id)

      days.push({
        day: 2,
        title: '第二天 · 谋道镇一线',
        feasible: true,
        steps: day2Steps,
        place_ids: day2Ids,
        note: '山区路程较长，建议尽早出发并留意返程时间',
      })
    }

    return { type: 'two_day', days }
  }

  let planResult
  if (tripType === 'two_day') {
    planResult = await planTwoDay()
  } else {
    const maxStops = tripType === 'half_day' ? 1 : 2
    planResult = await planSingleDay(maxStops)
  }

  // 组装单日出游步骤
  if (planResult.type === 'single') {
    const { attraction, go, back, play } = planResult
    timeCursor = addMinutes(timeCursor, go.duration_min)
    steps.push(step(timeCursor, `抵达${attraction.name}（${go.duration_text}）`, {
      place_id: attraction.id,
      duration_text: go.duration_text,
    }))
    timeCursor = addMinutes(timeCursor, play)
    steps.push(step(timeCursor, `游览${attraction.name}（建议 ${Math.round(play / 60 * 10) / 10} 小时）`, {
      place_id: attraction.id,
    }))
    timeCursor = addMinutes(timeCursor, BUFFER_MIN + back.duration_min)
    const endLabel = destination?.id !== origin.id ? destination.name : origin.name
    steps.push(step(timeCursor, `抵达${endLabel}（${back.duration_text}）`, {
      place_id: destination?.id || origin.id,
      duration_text: back.duration_text,
    }))
    placeIds.push(attraction.id, destination?.id || origin.id)

    return buildItineraryResult({
      feasible: true,
      tripType,
      label,
      origin,
      destination,
      assumptions,
      steps,
      placeIds,
      summary: `${label}推荐：${attraction.name}，含往返车程与游览时间`,
    })
  }

  if (planResult.type === 'pair') {
    const { a, b, leg1, mid, playA, playB, back } = planResult
    timeCursor = addMinutes(timeCursor, leg1.duration_min)
    steps.push(step(timeCursor, `抵达${a.name}`, { place_id: a.id, duration_text: leg1.duration_text }))
    timeCursor = addMinutes(timeCursor, playA + BUFFER_MIN + mid.duration_min)
    steps.push(step(timeCursor, `抵达${b.name}`, { place_id: b.id, duration_text: mid.duration_text }))
    timeCursor = addMinutes(timeCursor, playB + BUFFER_MIN + back.duration_min)
    steps.push(step(timeCursor, `返回${destination?.name || origin.name}`, {
      place_id: destination?.id || origin.id,
      duration_text: back.duration_text,
    }))
    placeIds.push(a.id, b.id, destination?.id || origin.id)

    return buildItineraryResult({
      feasible: true,
      tripType,
      label,
      origin,
      destination,
      assumptions,
      steps,
      placeIds,
      summary: `${label}推荐：${a.name} + ${b.name}`,
    })
  }

  if (planResult.type === 'two_day') {
    const allIds = planResult.days.flatMap((d) => d.place_ids)
    return buildItineraryResult({
      feasible: planResult.days.every((d) => d.feasible !== false),
      tripType,
      label,
      origin,
      destination,
      assumptions,
      days: planResult.days,
      placeIds: [...new Set(allIds)],
      summary: '两日游：第一天近郊腾龙洞，第二天谋道镇（苏马荡/鱼木寨）',
    })
  }

  // 不可行
  const nearest = planResult.nearest
  return buildItineraryResult({
    feasible: false,
    tripType,
    label,
    origin,
    destination,
    assumptions,
    steps: [],
    placeIds: [origin.id],
    summary: planResult.reason,
    suggestion: nearest
      ? `可考虑改为游览「${nearest.attraction.name}」，或升级为一日游/两日游`
      : '建议缩短行程或选择更近景点',
  })
}

function buildItineraryResult(payload) {
  return {
    ...payload,
    origin_name: payload.origin?.name,
    destination_name: payload.destination?.name,
    trip_type: payload.tripType,
  }
}

export function buildItineraryCard(result) {
  const title = result.feasible
    ? `利川${result.label}推荐`
    : `${result.label}暂不可行`

  return {
    card_type: 'itinerary',
    title,
    feasible: result.feasible,
    trip_type: result.trip_type,
    origin_name: result.origin_name,
    destination_name: result.destination_name,
    assumptions: result.assumptions || [],
    summary: result.summary,
    suggestion: result.suggestion,
    steps: result.steps || [],
    days: result.days || null,
  }
}
