/**
 * 婚礼助手对话 API 客户端
 */

/**
 * 发送多轮对话请求
 * @param {Array<{ role: 'user' | 'assistant', content: string }>} messages
 * @returns {Promise<{ reply: string, card: object|null, focusPlaceIds: string[] }>}
 */
export async function sendChatMessage(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.message || '对话请求失败')
  }

  return {
    reply: data.reply || '',
    card: data.card || null,
    focusPlaceIds: data.focusPlaceIds || [],
  }
}
