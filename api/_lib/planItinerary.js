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

/** 半日游单程驾车上限（分钟），超过视为远郊不适合半日往返 */
const HALF_DAY_MAX_ONE_WAY_MIN = 50

const FAR_ATTRACTION_IDS = new Set(['sumadang', 'yumuzhai'])

function isFarAttraction(attraction) {
  if (FAR_ATTRACTION_IDS.has(attraction?.id)) return true
  const text = `${attraction?.name || ''}${attraction?.title || ''}${attraction?.address || ''}`
  return /苏马荡|鱼木寨|谋道/.test(text)
}

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

/** 计算单景点往返时间与总耗时 */
async function evaluateAttractionRoundTrip({ attraction, origin, destination, getRoute }) {
  const go = await getRoute(origin.coordinates, attraction.coordinates, 'driving')
  const back = destination?.coordinates && destination.id !== origin.id
    ? await getRoute(attraction.coordinates, destination.coordinates, 'driving')
    : await getRoute(attraction.coordinates, origin.coordinates, 'driving')
  const play = parsePlayMinutes(attraction.details)
  const total = go.duration_min + play + BUFFER_MIN + back.duration_min
  return { attraction, go, back, play, total }
}

/** 判断半日游是否可行（远郊 + 单程时长 + 总预算） */
function getHalfDayInfeasibleReasons(evaluation, remainingBudget) {
  const { attraction, go, back, total } = evaluation
  const reasons = []

  if (isFarAttraction(attraction)) {
    reasons.push(`「${attraction.name}」位于远郊（谋道镇一线），不适合半日往返`)
  }
  if (go.duration_min > HALF_DAY_MAX_ONE_WAY_MIN || back.duration_min > HALF_DAY_MAX_ONE_WAY_MIN) {
    reasons.push(
      `单程驾车 ${go.duration_text}（去）/ ${back.duration_text}（返），超过半日游建议的单程 ${HALF_DAY_MAX_ONE_WAY_MIN} 分钟`,
    )
  }
  if (total > remainingBudget) {
    reasons.push(`往返加游览约 ${total} 分钟，超出半日可用 ${remainingBudget} 分钟`)
  }

  return reasons
}

/** 从用户问题中识别被点名的景点（取最长匹配，避免歧义） */
export function findAttractionMentionedInText(text, places) {
  const input = String(text || '')
  const attractions = places.filter((p) => p.placeType === 'attraction')
  let best = null
  let bestLen = 0

  for (const attraction of attractions) {
    const names = [attraction.name, attraction.title, ...(attraction.aliases || [])]
      .filter((name) => name && name.length >= 2)
    for (const name of names) {
      if (input.includes(name) && name.length > bestLen) {
        best = attraction
        bestLen = name.length
      }
    }
  }

  return best
}

/** 半日游 + 点名具体景点 → 返回该景点对象，否则 null */
export function detectHalfDayNamedAttractionQuery(text, places) {
  if (detectTripType(text) !== 'half_day') return null
  return findAttractionMentionedInText(text, places)
}

/** 在半日游候选里找可替代的近郊景点 */
async function findHalfDayAlternative({ origin, destination, places, getRoute, remainingBudget, excludeId }) {
  const attractions = places.filter((p) => p.placeType === 'attraction' && p.coordinates?.length === 2)
  const evaluations = []

  for (const attraction of attractions) {
    if (attraction.id === excludeId || isFarAttraction(attraction)) continue
    const evaluation = await evaluateAttractionRoundTrip({ attraction, origin, destination, getRoute })
    if (evaluation.go.duration_min > HALF_DAY_MAX_ONE_WAY_MIN) continue
    if (evaluation.back.duration_min > HALF_DAY_MAX_ONE_WAY_MIN) continue
    if (evaluation.total <= remainingBudget) evaluations.push(evaluation)
  }

  evaluations.sort((a, b) => a.total - b.total)
  return evaluations[0]?.attraction || null
}

/** 组装单景点半日游时间轴 */
function buildSingleAttractionSteps({
  origin,
  destination,
  attraction,
  go,
  back,
  play,
  startTime = DEFAULT_START,
}) {
  const steps = [step(startTime, `从${origin.name}出发`, { place_id: origin.id, type: 'start' })]
  let timeCursor = startTime

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

  return {
    steps,
    placeIds: [origin.id, attraction.id, destination?.id || origin.id],
  }
}

/**
 * 半日游 + 点名景点：明确回答「可以/不行」及原因（基于高德真实车程）
 */
export async function checkHalfDayNamedAttraction({
  text,
  places,
  getRoute,
  defaultHotel,
  origin_name: originName,
  destination_name: destinationName,
  start_time: startTime,
}) {
  const attraction = detectHalfDayNamedAttractionQuery(text, places)
  if (!attraction?.coordinates) return null

  const label = TRIP_LABEL.half_day
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

  let remaining = TRIP_BUDGET_MIN.half_day
  if (destination?.coordinates && destination.id !== origin.id) {
    const toDest = await getRoute(origin.coordinates, destination.coordinates, 'driving')
    const returnLegMin = toDest.duration_min + getTransportReserve(destination)
    remaining -= returnLegMin
    if (returnLegMin > 0) {
      assumptions.push(`已预留返回${destination.name}车程 ${toDest.duration_text} + 候车/值机缓冲`)
    }
  }

  const evaluation = await evaluateAttractionRoundTrip({
    attraction,
    origin,
    destination,
    getRoute,
  })
  const reasons = getHalfDayInfeasibleReasons(evaluation, remaining)

  if (reasons.length) {
    const alternative = await findHalfDayAlternative({
      origin,
      destination,
      places,
      getRoute,
      remainingBudget: remaining,
      excludeId: attraction.id,
    })

    const suggestion = alternative
      ? `建议将「${attraction.name}」安排为一日游或两日游；半日游更推荐「${alternative.name}」等近郊景点`
      : `建议将「${attraction.name}」安排为一日游或两日游，或选择腾龙洞等城区近郊景点`

    return buildItineraryResult({
      feasible: false,
      tripType: 'half_day',
      label,
      origin,
      destination,
      assumptions,
      steps: [],
      placeIds: [origin.id, attraction.id],
      summary: `不行，半日游不适合去「${attraction.name}」。${reasons.join('；')}`,
      suggestion,
      target_attraction_name: attraction.name,
    })
  }

  const { steps, placeIds } = buildSingleAttractionSteps({
    origin,
    destination,
    attraction,
    go: evaluation.go,
    back: evaluation.back,
    play: evaluation.play,
    startTime: startTime || DEFAULT_START,
  })

  return buildItineraryResult({
    feasible: true,
    tripType: 'half_day',
    label,
    origin,
    destination,
    assumptions,
    steps,
    placeIds,
    summary: `可以，半日游来得及去「${attraction.name}」（往返加游览约 ${evaluation.total} 分钟）`,
    target_attraction_name: attraction.name,
  })
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
    return evaluateAttractionRoundTrip({ attraction, origin, destination, getRoute })
  }

  /** 半日/一日：选最优单点或双点组合 */
  async function planSingleDay(maxStops, tripTypeForPlan, remainingBudget) {
    const evaluations = await Promise.all(attractions.map(evaluateSingle))
    evaluations.sort((a, b) => a.total - b.total)

    /** 半日游仅保留近郊：单程 ≤50 分钟，且排除苏马荡/鱼木寨等远郊点 */
    const candidates = tripTypeForPlan === 'half_day'
      ? evaluations.filter(
          (item) =>
            !isFarAttraction(item.attraction)
            && item.go.duration_min <= HALF_DAY_MAX_ONE_WAY_MIN
            && item.back.duration_min <= HALF_DAY_MAX_ONE_WAY_MIN,
        )
      : evaluations

    // 尝试两个景点串联（仅一日游且 maxStops>=2）
    if (maxStops >= 2 && tripTypeForPlan !== 'half_day') {
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
          if (total <= remainingBudget && (!bestPair || total < bestPair.total)) {
            bestPair = { a, b, leg1, mid, playA, playB, back, total }
          }
        }
      }
      if (bestPair) {
        return { type: 'pair', ...bestPair }
      }
    }

    const best = candidates.find((item) => item.total <= remainingBudget)
    if (best) return { type: 'single', ...best }

    const nearestNear = candidates[0]
    const nearestAny = evaluations[0]
    const oneDayPick = evaluations.find((item) => item.total <= TRIP_BUDGET_MIN.one_day && !isFarAttraction(item.attraction))

    let reason = `在${label}时间预算内，暂无合适近郊景点。`
    if (nearestNear) {
      reason = `近郊景点「${nearestNear.attraction.name}」往返约需 ${nearestNear.total} 分钟，超出${label}可用 ${remainingBudget} 分钟`
    } else if (nearestAny && isFarAttraction(nearestAny.attraction)) {
      reason = `「${nearestAny.attraction.name}」位于远郊，单程驾车约 ${nearestAny.go.duration_text}，不适合半日游`
    }

    return {
      type: 'infeasible',
      nearest: nearestNear || nearestAny,
      reason,
      suggestion: tripTypeForPlan === 'half_day'
        ? (oneDayPick
            ? `半日游更推荐「${nearestNear?.attraction.name || oneDayPick.attraction.name || '腾龙洞'}」；苏马荡/鱼木寨等远郊景点建议安排一日游或两日游`
            : '建议升级为一日游或两日游，或选择腾龙洞等城区近郊景点')
        : (nearestNear
            ? `可考虑改为游览「${nearestNear.attraction.name}」，或升级为更长行程`
            : '建议缩短行程或选择更近景点'),
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
    planResult = await planSingleDay(maxStops, tripType, remaining)
  }

  // 组装单日出游步骤
  if (planResult.type === 'single') {
    const { attraction, go, back, play } = planResult
    const built = buildSingleAttractionSteps({
      origin,
      destination,
      attraction,
      go,
      back,
      play,
      startTime: timeCursor,
    })
    steps.push(...built.steps.slice(1))
    placeIds.push(...built.placeIds.slice(1))

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
    suggestion: planResult.suggestion
      || (nearest
        ? `可考虑改为游览「${nearest.attraction.name}」，或升级为一日游/两日游`
        : '建议缩短行程或选择更近景点'),
  })
}

/** 从用户输入识别行程类型 */
export function detectTripType(text) {
  const input = String(text || '')
  if (/两日游|2\s*日|两天|二日/.test(input)) return 'two_day'
  if (/一日游|1\s*日|一天|全日/.test(input)) return 'one_day'
  if (/半日|半天|半日游/.test(input)) return 'half_day'
  return null
}

/**
 * 是否为「泛化行程规划」请求（未点名具体景点）
 * 这类请求应直接走 plan_itinerary，避免 LLM 自行编造行程
 * @param {string} text
 * @param {Array} [places] 地点列表，用于判断是否点名景点
 */
export function isGenericTripPlanning(text, places = []) {
  const input = String(text || '')
  const tripType = detectTripType(input)
  if (!tripType) return null
  // 半日游且点名具体景点时，由 checkHalfDayNamedAttraction 专门处理
  if (tripType === 'half_day' && findAttractionMentionedInText(input, places)) return null
  if (/规划|安排|推荐|怎么玩|行程|去哪|介绍一下/.test(input) || /(半日|一日|两)日游/.test(input)) {
    return tripType
  }
  return null
}

/** 根据 plan_itinerary 结果生成可直接展示给宾客的回复文案 */
export function formatItineraryReply(result) {
  if (result?.error) return result.error

  const assumptionLines = (result.assumptions || []).map((item) => `※ ${item}`)
  if (!result.feasible) {
    return [result.summary, result.suggestion, ...assumptionLines].filter(Boolean).join('\n\n')
  }

  // 点名景点的半日游可行性问答：summary 已是「可以/不行」结论，不再套「已为您规划」
  if (result.target_attraction_name) {
    const stepLines = (result.steps || []).map((item) => `${item.time}  ${item.label}`)
    return [result.summary, ...assumptionLines, ...(stepLines.length ? ['', ...stepLines] : [])].filter(Boolean).join('\n')
  }

  const header = `已为您规划${result.label}：${result.summary}`
  if (result.days?.length) {
    return [header, ...assumptionLines, '详细分日安排见下方行程卡。'].filter(Boolean).join('\n\n')
  }

  const stepLines = (result.steps || []).map((item) => `${item.time}  ${item.label}`)
  return [header, ...assumptionLines, '', ...stepLines].filter(Boolean).join('\n')
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
  let title
  if (result.target_attraction_name && !result.feasible) {
    title = `半日游不适合去${result.target_attraction_name}`
  } else if (result.target_attraction_name && result.feasible) {
    title = `半日游可以去${result.target_attraction_name}`
  } else {
    title = result.feasible
      ? `利川${result.label}推荐`
      : `${result.label}暂不可行`
  }

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
