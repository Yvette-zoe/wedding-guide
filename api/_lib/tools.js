/**
 * DeepSeek 对话工具定义与执行逻辑
 */
import {
  fetchDistanceBatch,
  fetchDriving,
  fetchWalking,
  haversineMeters,
  parseDistanceResult,
  parseRouteResult,
} from './amap.js'
import { loadPlacesCatalog, resolvePlaceByName } from './placesCatalog.js'
import { buildItineraryCard, formatItineraryReply, planItinerary } from './planItinerary.js'
import { buildWeatherCard, queryWeather } from './weather.js'

/** OpenAI 兼容格式的工具定义 */
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_places',
      description: '查询婚礼助手数据库中的地点（酒店、景点、餐厅、交通枢纽、婚宴场地）。返回名称、地址、营业时间等，不含距离。',
      parameters: {
        type: 'object',
        properties: {
          place_type: {
            type: 'string',
            enum: ['hotel', 'attraction', 'restaurant', 'transport', 'venue', 'all'],
            description: '地点类型；all 表示不限类型',
          },
          keyword: {
            type: 'string',
            description: '可选，按名称/地址关键词筛选',
          },
        },
        required: ['place_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_route',
      description: '查询两个地点之间的实际路程和时长。距离和时长必须来自此工具，不可自行估算。',
      parameters: {
        type: 'object',
        properties: {
          origin_name: { type: 'string', description: '起点名称，如"酒店"、"利川站"' },
          destination_name: { type: 'string', description: '终点名称' },
          mode: {
            type: 'string',
            enum: ['driving', 'walking'],
            description: '交通方式：driving=驾车，walking=步行',
          },
        },
        required: ['origin_name', 'destination_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reachable_places',
      description: '从某起点出发，在指定时长内可达的地点列表（如步行30分钟内的餐厅）。',
      parameters: {
        type: 'object',
        properties: {
          origin_name: { type: 'string', description: '起点名称，默认"酒店"' },
          max_minutes: { type: 'number', description: '最大可达时长（分钟）' },
          mode: {
            type: 'string',
            enum: ['driving', 'walking'],
            description: '出行方式',
          },
          category: {
            type: 'string',
            enum: ['restaurant', 'attraction', 'hotel', 'all'],
            description: '筛选地点类型',
          },
        },
        required: ['max_minutes', 'category'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_itinerary',
      description: '规划半日游/一日游/两日游行程。会校验真实车程与游玩时长是否来得及，不可行时会明确说明原因。起点/终点未说明时默认酒店。',
      parameters: {
        type: 'object',
        properties: {
          trip_type: {
            type: 'string',
            enum: ['half_day', 'one_day', 'two_day'],
            description: 'half_day=约4小时，one_day=约8小时，two_day=约16小时',
          },
          origin_name: { type: 'string', description: '起点名称，默认酒店' },
          destination_name: { type: 'string', description: '终点名称，默认返回酒店；若需赶高铁/飞机可设为利川站/恩施站等' },
          start_time: { type: 'string', description: '出发时间，格式 HH:mm，默认 09:00' },
        },
        required: ['trip_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定地点在指定日期的天气与穿衣建议。距查询日超过3天时返回气候参考（非预报），必须向宾客说明。',
      parameters: {
        type: 'object',
        properties: {
          place_name: { type: 'string', description: '地点名称，如"利川"、"腾龙洞"、"酒店"' },
          date: { type: 'string', description: '日期 YYYY-MM-DD，默认婚礼日 2026-08-23' },
        },
        required: ['place_name'],
      },
    },
  },
]

function coordsToAmap(coords) {
  return `${coords[0]},${coords[1]}`
}

/** 创建工具执行上下文 */
export async function createToolContext(env) {
  const catalog = await loadPlacesCatalog(env)
  const routeCache = new Map()

  async function getRoute(originCoords, destCoords, mode = 'driving') {
    const cacheKey = `${originCoords.join(',')}-${destCoords.join(',')}-${mode}`
    if (routeCache.has(cacheKey)) return routeCache.get(cacheKey)

    const origin = coordsToAmap(originCoords)
    const destination = coordsToAmap(destCoords)
    const key = env.AMAP_KEY

    const data = mode === 'walking'
      ? await fetchWalking({ key, origin, destination })
      : await fetchDriving({ key, origin, destination })

    const result = parseRouteResult(data, mode)
    routeCache.set(cacheKey, result)
    return result
  }

  return {
    places: catalog.places,
    defaultHotel: catalog.defaultHotel,
    amapKey: env.AMAP_KEY,
    env,
    getRoute,
  }
}

function filterPlaces(places, placeType, keyword) {
  let filtered = places
  if (placeType && placeType !== 'all') {
    filtered = filtered.filter((p) => p.placeType === placeType)
  }
  if (keyword) {
    const q = keyword.trim()
    filtered = filtered.filter(
      (p) => p.name.includes(q) || p.title.includes(q) || p.address.includes(q),
    )
  }
  return filtered
}

function placeToSummary(place) {
  return {
    id: place.id,
    name: place.name,
    place_type: place.placeType,
    type: place.type,
    address: place.address,
    details: place.details,
    time: place.time,
    description: place.description,
  }
}

/** 执行单个工具调用，返回 { result, card } */
export async function executeTool(name, args, ctx) {
  if (name === 'get_places') {
    const places = filterPlaces(ctx.places, args.place_type, args.keyword)
    const items = places.map(placeToSummary)
    return {
      result: { count: items.length, places: items },
      card: items.length
        ? {
            card_type: 'place_list',
            title: args.keyword ? `「${args.keyword}」相关地点` : '地点列表',
            items: items.map((item) => ({
              ...item,
              place_id: item.id,
            })),
          }
        : null,
      focusPlaceIds: items.slice(0, 5).map((item) => item.id),
    }
  }

  if (name === 'get_route') {
    const origin = resolvePlaceByName(args.origin_name, ctx.places)
    const destination = resolvePlaceByName(args.destination_name, ctx.places)
    const mode = args.mode === 'walking' ? 'walking' : 'driving'

    if (!origin?.coordinates) {
      return { result: { error: `未找到起点「${args.origin_name}」` }, card: null, focusPlaceIds: [] }
    }
    if (!destination?.coordinates) {
      return { result: { error: `未找到终点「${args.destination_name}」` }, card: null, focusPlaceIds: [] }
    }

    const route = await ctx.getRoute(origin.coordinates, destination.coordinates, mode)
    const modeLabel = mode === 'walking' ? '步行' : '驾车'

    return {
      result: {
        origin_name: origin.name,
        destination_name: destination.name,
        origin_id: origin.id,
        destination_id: destination.id,
        mode,
        ...route,
      },
      card: {
        card_type: 'route',
        title: `${modeLabel}路程`,
        origin_name: origin.name,
        destination_name: destination.name,
        origin_id: origin.id,
        destination_id: destination.id,
        mode,
        mode_label: modeLabel,
        distance_text: route.distance_text,
        duration_text: route.duration_text,
        distance_km: route.distance_km,
        duration_min: route.duration_min,
      },
      focusPlaceIds: [origin.id, destination.id],
    }
  }

  if (name === 'get_reachable_places') {
    const originName = args.origin_name || '酒店'
    const origin = resolvePlaceByName(originName, ctx.places) || ctx.defaultHotel
    const mode = args.mode === 'driving' ? 'driving' : 'walking'
    const maxMinutes = Number(args.max_minutes) || 30
    const category = args.category || 'restaurant'

    if (!origin?.coordinates) {
      return { result: { error: `未找到起点「${originName}」` }, card: null, focusPlaceIds: [] }
    }

    let candidates = ctx.places.filter(
      (p) => p.coordinates?.length === 2 && p.id !== origin.id,
    )
    if (category !== 'all') {
      candidates = candidates.filter((p) => p.placeType === category)
    }

    // 直线距离粗筛：步行约 5km/h，驾车约 40km/h
    const speedKmH = mode === 'walking' ? 5 : 40
    const maxStraightKm = (speedKmH * maxMinutes) / 60 * 1.5
    candidates = candidates
      .map((place) => ({
        place,
        straight_m: haversineMeters(origin.coordinates, place.coordinates),
      }))
      .filter(({ straight_m }) => straight_m <= maxStraightKm * 1000)
      .sort((a, b) => a.straight_m - b.straight_m)
      .slice(0, 30)

    if (candidates.length === 0) {
      return {
        result: { count: 0, places: [], message: `${maxMinutes} 分钟内暂无可达地点` },
        card: {
          card_type: 'place_list',
          title: `${origin.name} ${mode === 'walking' ? '步行' : '驾车'} ${maxMinutes} 分钟内可达`,
          items: [],
          empty_text: '暂无符合条件的地点',
        },
        focusPlaceIds: [origin.id],
      }
    }

    const distanceType = mode === 'walking' ? 3 : 1
    const originStr = coordsToAmap(origin.coordinates)
    const destStrs = candidates.map(({ place }) => coordsToAmap(place.coordinates))

    const batchData = await fetchDistanceBatch({
      key: ctx.amapKey,
      origin: originStr,
      destinations: destStrs,
      type: distanceType,
    })

    const results = batchData?.results || []
    const reachable = []

    candidates.forEach(({ place }, index) => {
      const parsed = parseDistanceResult(results[index], mode)
      if (parsed.duration_min <= maxMinutes) {
        reachable.push({
          ...placeToSummary(place),
          place_id: place.id,
          duration_min: parsed.duration_min,
          duration_text: parsed.duration_text,
          distance_text: parsed.distance_text,
          mode,
        })
      }
    })

    reachable.sort((a, b) => a.duration_min - b.duration_min)

    const modeLabel = mode === 'walking' ? '步行' : '驾车'
    const categoryLabel =
      category === 'restaurant' ? '餐厅'
        : category === 'attraction' ? '景点'
          : category === 'hotel' ? '酒店' : '地点'

    return {
      result: {
        origin_name: origin.name,
        max_minutes: maxMinutes,
        mode,
        category,
        count: reachable.length,
        places: reachable,
      },
      card: {
        card_type: 'place_list',
        title: `从${origin.name}${modeLabel}${maxMinutes}分钟内可达的${categoryLabel}`,
        subtitle: `共 ${reachable.length} 个`,
        items: reachable,
      },
      focusPlaceIds: [origin.id, ...reachable.slice(0, 3).map((p) => p.place_id)],
    }
  }

  if (name === 'plan_itinerary') {
    const result = await planItinerary({
      trip_type: args.trip_type,
      origin_name: args.origin_name,
      destination_name: args.destination_name,
      start_time: args.start_time,
      places: ctx.places,
      getRoute: ctx.getRoute,
      defaultHotel: ctx.defaultHotel,
    })

    if (result.error) {
      return { result: { error: result.error }, card: null, focusPlaceIds: [] }
    }

    const card = buildItineraryCard(result)
    return {
      result: {
        feasible: result.feasible,
        trip_type: result.trip_type,
        label: result.label,
        origin_name: result.origin_name,
        destination_name: result.destination_name,
        assumptions: result.assumptions,
        summary: result.summary,
        suggestion: result.suggestion,
        steps: result.steps,
        days: result.days,
      },
      card,
      focusPlaceIds: result.placeIds || [],
      itineraryReply: formatItineraryReply(result),
    }
  }

  if (name === 'get_weather') {
    const weather = await queryWeather({
      placeName: args.place_name,
      date: args.date,
      places: ctx.places,
      env: ctx.env,
    })
    return {
      result: weather,
      card: buildWeatherCard(weather),
      focusPlaceIds: [],
    }
  }

  return { result: { error: `未知工具：${name}` }, card: null, focusPlaceIds: [] }
}

export function buildSystemPrompt(placesSummary) {
  return `你是「婚礼指南」智能助手，帮助宾客规划利川/恩施婚礼期间的出行与游玩。

## 婚礼信息
- 婚礼日期：2026年8月23日（仪式 10:38，宴席 12:08）
- 默认起点/终点：利川时代开元名都大酒店（滨江北路店）；若宾客未说明，可假设从酒店出发、返回酒店，并在回复中注明「已默认从酒店出发」
- 若宾客未确定起点或终点，每次只追问一个问题

## 硬性规则
1. 所有距离、时长必须调用 get_route、get_reachable_places 或 plan_itinerary 获取，禁止自行估算或编造
2. 天气必须调用 get_weather；若返回 source_type=climate_reference，必须在回复中明确写「气候参考，非预报」
3. 只回答与本次婚礼、利川/恩施出行相关的问题；其他话题礼貌拒绝
4. 回复使用简洁中文，适合手机阅读；必要时用分点列表
5. 规划半日/一日/两日游时必须调用 plan_itinerary，禁止自行编写时间表或推荐未经工具校验的景点；半日游不得推荐苏马荡、鱼木寨等远郊景点
6. 若 plan_itinerary 返回 feasible=false，如实告知并给出 suggestion
7. 若宾客未确定起点或终点，每次只追问一个问题；可用默认值但须在回复中注明
8. 结构化查询结果会单独展示在「查询记录」中，回复正文勿写「见下方卡片/行程卡」等表述；概要说明即可，详情由界面按钮跳转查看

## 已知地点（名称与基本信息，不含坐标）
${placesSummary}

## 工具使用提示
- 问「A 到 B 多远/多久」→ get_route
- 问「附近/步行 X 分钟有什么好吃的」→ get_reachable_places，category=restaurant，mode=walking
- 问有哪些景点/餐厅/酒店 → get_places
- 问半日游/一日游/两日游怎么安排 → plan_itinerary
- 问「半日游能去某景点吗」→ 会由系统直接校验该景点是否来得及；你只需补充说明，勿与工具结论矛盾
- 问天气/穿什么 → get_weather（婚礼日默认 2026-08-23）`
}
