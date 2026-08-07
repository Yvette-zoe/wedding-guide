/**
 * DeepSeek Chat Completions 调用（含工具循环）
 */
import { buildPlacesSummary, loadPlacesCatalog } from './placesCatalog.js'
import {
  buildSystemPrompt,
  CHAT_TOOLS,
  createToolContext,
  executeTool,
} from './tools.js'

const MAX_TOOL_ROUNDS = 6

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

  const apiMessages = [
    { role: 'system', content: buildSystemPrompt(placesSummary) },
    ...messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  let lastCard = null
  let focusPlaceIds = []
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
        reply: message.content || '',
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

      const { result, card, focusPlaceIds: ids } = await executeTool(fn.name, args, ctx)
      if (card) lastCard = card
      if (ids?.length) focusPlaceIds = ids

      apiMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  throw new ChatApiError('对话工具调用次数过多，请简化问题后重试', 504)
}
