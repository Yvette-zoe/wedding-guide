/**
 * Vercel Serverless Function：/api/verify-code
 * 校验宾客邀请码是否有效（前端启动时调用）
 */
import { verifyInviteCode } from './_lib/auth.js'

/**
 * @param {{ code?: string }} query
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export async function handleVerifyCodeRequest(query, env) {
  const result = verifyInviteCode(query?.code, env)
  return {
    valid: result.valid,
    required: result.required,
    ...(result.message ? { message: result.message } : {}),
  }
}

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'GET') {
    response.status(405).json({ message: '仅支持 GET 请求' })
    return
  }

  try {
    const result = await handleVerifyCodeRequest(request.query, process.env)
    response.status(200).json(result)
  } catch (error) {
    response.status(error.statusCode || 500).json({
      message: error.message || '邀请码校验失败',
    })
  }
}
