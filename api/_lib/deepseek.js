/**
 * DeepSeek Chat Completions 调用（含工具循环）
 */
import {
  buildItineraryCard,
  checkHalfDayNamedAttraction,
  formatItineraryReply,
  isGenericTripPlanning,
} from './planItinerary.js'
import { buildPlacesSummary, loadPlacesCatalog } from './placesCatalog.js'
import {
  buildSystemPrompt,
  CHAT_TOOLS,
  createToolContext,
  executeTool,
} from './tools.js'

const MAX_TOOL_ROUNDS = 8

export class ChatApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.name = 'ChatApiError'
    this.statusCode = statusCode
  }
}

async function callDeepSeek({ apiKey, model, messages, tools }) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 2048,
      temperature: 0.6,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ChatApiError(
      data?.error?.message || data?.message || `DeepSeek 请求失败（${response.status}）`,
      response.status >= 500 ? 502 : 400,
    )
  }

  return data
}

/**
 * 运行多轮对话（含工具调用循环）
 * @param {{ messages: Array<{role:string, content:string}>, env: object }} options
 */
export async function runChat({ messages, env }) {
  const apiKey = env.DEEPSEEK_API_KEY
  const model = env.DEEPSEEK_MODEL || 'deepseek-v4-flash'

  if (!apiKey) {
    throw new ChatApiError('缺少 DEEPSEEK_API_KEY，请在环境变量中配置', 503)
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ChatApiError('messages 不能为空', 400)
  }

  const catalog = await loadPlacesCatalog(env)
  const ctx = await createToolContext(env)
  const placesSummary = buildPlacesSummary(catalog.places)

  const userMessages = messages.filter((m) => m.role === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || ''

  /** 半日游 + 点名景点（如「半日游能去苏马荡吗」）→ 明确回答可行性与原因 */
  const namedHalfDay = await checkHalfDayNamedAttraction({
    text: lastUserMessage,
    places: ctx.places,
    getRoute: ctx.getRoute,
    defaultHotel: ctx.defaultHotel,
  })
  if (namedHalfDay && !namedHalfDay.error) {
    return {
      reply: formatItineraryReply(namedHalfDay),
      card: buildItineraryCard(namedHalfDay),
      focusPlaceIds: namedHalfDay.placeIds || [],
    }
  }

  /** 泛化行程规划（如「帮我规划半日游」）直接走工具，避免 LLM 自行推荐苏马荡等远郊 */
  const genericTripType = isGenericTripPlanning(lastUserMessage, ctx.places)
  if (genericTripType) {
    const toolOut = await executeTool('plan_itinerary', { trip_type: genericTripType }, ctx)
    return {
      reply: toolOut.itineraryReply || toolOut.result?.error || '行程规划失败，请稍后重试',
      card: toolOut.card,
      focusPlaceIds: toolOut.focusPlaceIds || [],
    }
  }

  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(placesSummary) },
    ...messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  let lastCard = null
  let focusPlaceIds = []
  let itineraryReply = null
  let round = 0

  while (round < MAX_TOOL_ROUNDS) {
    round += 1
    const data = await callDeepSeek({
      apiKey,
      model,
      messages: apiMessages,
      tools: CHAT_TOOLS,
    })

    const choice = data.choices?.[0]
    const message = choice?.message
    if (!message) {
      throw new ChatApiError('DeepSeek 返回了空响应', 502)
    }

    apiMessages.push(message)

    const toolCalls = message.tool_calls
    if (!toolCalls?.length) {
      return {
        reply: itineraryReply || message.content || '',
        card: lastCard,
        focusPlaceIds,
      }
    }

    for (const toolCall of toolCalls) {
      const fn = toolCall.function
      let args = {}
      try {
        args = JSON.parse(fn.arguments || '{}')
      } catch {
        args = {}
      }

      const { result, card, focusPlaceIds: ids, itineraryReply: planReply } = await executeTool(fn.name, args, ctx)
      if (card) lastCard = card
      if (ids?.length) focusPlaceIds = ids
      if (fn.name === 'plan_itinerary' && planReply) itineraryReply = planReply

      apiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  throw new ChatApiError('对话工具调用次数过多，请简化问题后重试', 504)
}
