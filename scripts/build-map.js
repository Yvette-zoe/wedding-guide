/**
 * 组合恩施区县 + 利川乡镇 + 重庆行政区 GeoJSON，生成 public/maps/wedding_map.json
 * 使用方式：
 * 1. 将恩施区县数据放在 public/maps/enshi_counties.json
 * 2. （可选）从 geojson.hxkj.vip 下载利川乡镇边界，保存为 public/maps/lichuan_townships.json
 * 3. （可选）重庆城区/郊县边界：public/maps/chongqing_urban.json、chongqing_suburban.json
 * 4. 运行：node scripts/build-map.js
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import union from '@turf/union'
import { featureCollection } from '@turf/helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mapsDir = path.resolve(__dirname, '../public/maps')
const enshiPath = path.join(mapsDir, 'enshi_counties.json')
const townshipsPath = path.join(mapsDir, 'lichuan_townships.json')
const lichuanCityPath = path.join(mapsDir, 'lichuan.json')
const chongqingUrbanPath = path.join(mapsDir, 'chongqing_urban.json')
const chongqingSuburbanPath = path.join(mapsDir, 'chongqing_suburban.json')
const outPath = path.join(mapsDir, 'wedding_map.json')

function loadJson(filePath) {
  // 兼容带 UTF-8 BOM 的 GeoJSON（如 Desktop 导出的文件）
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  return JSON.parse(raw)
}

/** 统一地图标签简称 */
function getDisplayName(name, regionLevel) {
  if (!name) return ''

  if (regionLevel === 'lichuan-township') {
    return name
      .replace(/生态综合开发区$/, '')
      .replace(/(街道|镇|乡)$/, '')
  }

  // 忠县为专名，简称仍为「忠县」
  if (name === '忠县') return '忠县'

  return name
    .replace(/土家族苗族自治县$/, '')
    .replace(/苗族土家族自治县$/, '')
    .replace(/土家族自治县$/, '')
    .replace(/自治县$/, '')
    .replace(/新区$/, '')
    .replace(/(市|县|区)$/, '')
}

function normalizeFeature(feature, regionLevel) {
  const fullName = feature.properties?.name || ''
  const displayName = getDisplayName(fullName, regionLevel)
  return {
    type: 'Feature',
    properties: {
      ...feature.properties,
      fullName,
      name: displayName,
      regionLevel,
      displayName,
    },
    geometry: feature.geometry,
  }
}

/** 由乡镇面合并生成与乡镇数据一致的市界 */
function buildCityOutlineFromTownships(townshipFeatures) {
  const turfFeatures = townshipFeatures.map((feature) => ({
    type: 'Feature',
    properties: {},
    geometry: feature.geometry,
  }))
  const merged = union(featureCollection(turfFeatures))
  if (!merged?.geometry) return null
  return merged.geometry
}

if (!fs.existsSync(enshiPath)) {
  console.error('缺少 public/maps/enshi_counties.json')
  process.exit(1)
}

const enshi = loadJson(enshiPath)
const hasTownships = fs.existsSync(townshipsPath)
let features = []

if (hasTownships) {
  const townships = loadJson(townshipsPath)
  // 去掉完整利川市面，改用乡镇面，避免重叠
  features = enshi.features
    .filter((feature) => !String(feature.properties?.name || '').includes('利川'))
    .map((feature) => normalizeFeature(feature, 'enshi'))

  const townshipFeatures = (townships.features || [townships]).map((feature) =>
    normalizeFeature(feature, 'lichuan-township'),
  )

  // 市界由乡镇 union 生成，避免 lichuan.json 与乡镇数据坐标不一致
  const cityGeometry = buildCityOutlineFromTownships(townshipFeatures)
  if (cityGeometry) {
    features.push(normalizeFeature({
      type: 'Feature',
      properties: { name: '利川市', adcode: 422802 },
      geometry: cityGeometry,
    }, 'lichuan-city'))
    console.log('已用乡镇 union 生成利川市界')
  } else if (fs.existsSync(lichuanCityPath)) {
    const lichuanCity = loadJson(lichuanCityPath)
    const cityFeatures = lichuanCity.features || [lichuanCity]
    features = features.concat(
      cityFeatures.map((feature) => normalizeFeature(feature, 'lichuan-city')),
    )
    console.log('乡镇 union 失败，回退使用 lichuan.json')
  }

  features = features.concat(townshipFeatures)
  console.log(`已合并：恩施周边 ${features.filter((f) => f.properties.regionLevel === 'enshi').length} + 利川市界 ${features.filter((f) => f.properties.regionLevel === 'lichuan-city').length} + 利川乡镇 ${townshipFeatures.length}`)
} else {
  features = enshi.features.map((feature) => {
    const isLichuan = String(feature.properties?.name || '').includes('利川')
    return normalizeFeature(feature, isLichuan ? 'lichuan' : 'enshi')
  })
  console.log('未找到 lichuan_townships.json，使用恩施区县图并突出利川市。')
  console.log('后续可将乡镇 GeoJSON 保存为 public/maps/lichuan_townships.json 后重新运行本脚本。')
}

if (fs.existsSync(chongqingUrbanPath)) {
  const chongqingUrban = loadJson(chongqingUrbanPath)
  const urbanFeatures = (chongqingUrban.features || [chongqingUrban]).map((feature) =>
    normalizeFeature(feature, 'chongqing-urban'),
  )
  features = features.concat(urbanFeatures)
  console.log(`已合并重庆城区 ${urbanFeatures.length} 个区`)
}

if (fs.existsSync(chongqingSuburbanPath)) {
  const chongqingSuburban = loadJson(chongqingSuburbanPath)
  const suburbanFeatures = (chongqingSuburban.features || [chongqingSuburban]).map((feature) =>
    normalizeFeature(feature, 'chongqing-suburban'),
  )
  features = features.concat(suburbanFeatures)
  console.log(`已合并重庆郊县 ${suburbanFeatures.length} 个县`)
}

const output = { type: 'FeatureCollection', features }
fs.writeFileSync(outPath, JSON.stringify(output))
console.log(`已生成 ${outPath}，要素数 ${features.length}`)
