/**
 * Vercel Serverless Function：/api/chat
 * DeepSeek 多轮对话 + 工具调用（路程查询、可达地点、地点列表）
 */
import { assertInviteCode, AuthError } from './_lib/auth.js'
import { runChat, ChatApiError } from './_lib/deepseek.js'

export async function handleChatRequest(body, env) {
  assertInviteCode(body?.invite_code, env)

  if (!body?.messages) {
    throw new ChatApiError('缺少 messages 参数', 400)
  }
  return runChat({ messages: body.messages, env })
}

export { AuthError }

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'POST') {
    response.status(405).json({ message: '仅支持 POST 请求' })
    return
  }

  try {
    let body = request.body
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }

    const result = await handleChatRequest(body, process.env)
    response.status(200).json(result)
  } catch (error) {
    const status = error.statusCode || 500
    response.status(status).json({
      message: error.message || '对话请求失败',
    })
  }
}
