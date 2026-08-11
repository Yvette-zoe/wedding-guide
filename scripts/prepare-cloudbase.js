/**
 * 部署 CloudBase 前，将 api/ 同步到云函数目录，避免业务逻辑维护两份。
 * 同步产物不入库（见 .gitignore）。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceApi = join(rootDir, 'api')
const targetRoot = join(rootDir, 'cloudfunctions', 'wedding-api')
const targetApi = join(targetRoot, 'api')

if (!existsSync(sourceApi)) {
  console.error('未找到 api/ 目录，无法同步')
  process.exit(1)
}

if (!existsSync(targetRoot)) {
  mkdirSync(targetRoot, { recursive: true })
}

rmSync(targetApi, { recursive: true, force: true })
cpSync(sourceApi, targetApi, { recursive: true })

console.log('已同步 api/ → cloudfunctions/wedding-api/api/')
