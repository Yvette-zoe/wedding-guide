/**
 * CloudBase HTTP 云函数入口：同域提供 /api/chat、/api/places、/api/driving
 * 业务逻辑复用同步进来的 api/（由 scripts/prepare-cloudbase.js 生成）
 */
import express from 'express'
import { handleChatRequest } from './api/chat.js'
import { handlePlacesRequest } from './api/places.js'
import { handleDrivingRequest } from './api/driving.js'
import { handleVerifyCodeRequest } from './api/verify-code.js'

const app = express()
const port = Number(process.env.PORT) || 9000

app.use(express.json({ limit: '1mb' }))

/** 统一 JSON 错误响应 */
function sendError(response, error) {
  const status = error.statusCode || 500
  response.status(status).json({
    message: error.message || '请求失败',
    code: error.code,
  })
}

/**
 * 网关可能透传完整路径 /api/xxx，也可能剥离前缀只剩 /xxx。
 * 两种都挂上，避免路由配置差异导致 404。
 */
function mountApi(method, paths, handler) {
  for (const path of paths) {
    app[method](path, handler)
  }
}

mountApi('get', ['/api/places', '/places'], async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const result = await handlePlacesRequest(request.query, process.env)
    response.status(200).json(result)
  } catch (error) {
    sendError(response, error)
  }
})

mountApi('get', ['/api/driving', '/driving'], async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const body = await handleDrivingRequest(request.query, process.env)
    response.status(200).json(body)
  } catch (error) {
    sendError(response, error)
  }
})

mountApi('get', ['/api/verify-code', '/verify-code'], async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const result = await handleVerifyCodeRequest(request.query, process.env)
    response.status(200).json(result)
  } catch (error) {
    sendError(response, error)
  }
})

mountApi('post', ['/api/chat', '/chat'], async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const result = await handleChatRequest(request.body, process.env)
    response.status(200).json(result)
  } catch (error) {
    sendError(response, error)
  }
})

app.get('/health', (_request, response) => {
  response.status(200).json({ ok: true, service: 'wedding-api' })
})

app.use((request, response) => {
  response.status(404).json({
    message: `未匹配的路径：${request.method} ${request.path}`,
  })
})

app.listen(port, '0.0.0.0', () => {
  console.log(`wedding-api listening on http://0.0.0.0:${port}`)
})
