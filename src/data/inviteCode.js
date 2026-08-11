/**
 * 婚礼邀请码：从链接读取、本地缓存、服务端校验
 */
import { apiUrl } from './apiBase'

const STORAGE_KEY = 'wedding_invite_code'

/** 从 URL ?code= 同步邀请码到 localStorage，并清理地址栏参数 */
export function syncInviteCodeFromUrl() {
  if (typeof window === 'undefined') return ''

  const params = new URLSearchParams(window.location.search)
  const codeFromUrl = params.get('code')?.trim()

  if (codeFromUrl) {
    localStorage.setItem(STORAGE_KEY, codeFromUrl)
    params.delete('code')
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
    return codeFromUrl
  }

  return getStoredInviteCode()
}

/** 读取已缓存的邀请码 */
export function getStoredInviteCode() {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY)?.trim() || ''
}

/**
 * 向服务端校验邀请码
 * @returns {Promise<{ valid: boolean, required: boolean, message?: string }>}
 */
export async function verifyInviteCodeWithServer(code = getStoredInviteCode()) {
  const params = new URLSearchParams()
  if (code) params.set('code', code)

  const response = await fetch(apiUrl(`/api/verify-code?${params.toString()}`))
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || '邀请码校验失败')
  }

  return data
}
