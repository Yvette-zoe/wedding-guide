/**
 * 婚礼助手对话 API 客户端
 */
import { apiUrl } from './apiBase'
import { getStoredInviteCode } from './inviteCode'
import { CHAT_TIMEOUT_MS } from './staticFallback'

export class ChatClientError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, timeout?: boolean }} [meta]
   */
  constructor(message, meta = {}) {
    super(message)
    this.name = 'ChatClientError'
    this.status = meta.status ?? 0
    this.timeout = Boolean(meta.timeout)
    // 超时 / 网络错误 / 5xx 视为服务故障，计入简易模式阈值；403 邀请码不算
    this.isServiceFailure = this.timeout || this.status === 0 || this.status >= 500
  }
}

/**
 * 发送多轮对话请求
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} messages
 * @param {{ inviteCode?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ reply: string, card: object|null, focusPlaceIds: string[] }>}
 */
export async function sendChatMessage(messages, options = {}) {
  const invite_code = options.inviteCode ?? getStoredInviteCode()
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, invite_code }),
      signal: controller.signal,
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new ChatClientError(data.message || '对话请求失败', { status: response.status })
    }

    return {
      reply: data.reply || '',
      card: data.card || null,
      focusPlaceIds: data.focusPlaceIds || [],
    }
  } catch (error) {
    if (error instanceof ChatClientError) throw error
    if (error?.name === 'AbortError') {
      throw new ChatClientError('助手响应超时，请稍后再试', { timeout: true, status: 0 })
    }
    throw new ChatClientError(error?.message || '网络异常，对话请求失败', { status: 0 })
  } finally {
    clearTimeout(timer)
  }
}
