/**
 * 婚礼助手访问控制：邀请码校验
 * 若未配置 WEDDING_INVITE_CODE，则跳过校验（便于本地开发）
 */

export class AuthError extends Error {
  constructor(message, statusCode = 403) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

/** 是否已启用邀请码（生产环境应配置 WEDDING_INVITE_CODE） */
export function isInviteCodeRequired(env) {
  return Boolean(String(env?.WEDDING_INVITE_CODE || '').trim())
}

/**
 * 校验邀请码
 * @returns {{ valid: boolean, required: boolean, message?: string }}
 */
export function verifyInviteCode(code, env) {
  const expected = String(env?.WEDDING_INVITE_CODE || '').trim()
  if (!expected) {
    return { valid: true, required: false }
  }

  const provided = String(code || '').trim()
  if (!provided) {
    return {
      valid: false,
      required: true,
      message: '缺少邀请码，请使用新人分享的完整链接',
    }
  }

  if (provided !== expected) {
    return {
      valid: false,
      required: true,
      message: '邀请码无效，请使用新人分享的完整链接',
    }
  }

  return { valid: true, required: true }
}

/** 校验失败时抛出 AuthError */
export function assertInviteCode(code, env) {
  const result = verifyInviteCode(code, env)
  if (!result.valid) {
    throw new AuthError(result.message)
  }
  return result
}
