/**
 * API 基址：Vercel/本地默认同域（空字符串）；CloudBase 静态托管需指向 service.tcloudbase.com
 */
export function getApiBase() {
  const base = import.meta.env.VITE_API_BASE || ''
  return String(base).replace(/\/$/, '')
}

/** 拼接 /api/xxx 完整 URL */
export function apiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${getApiBase()}${normalized}`
}
