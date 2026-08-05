/**
 * 组合恩施区县 + 可选利川乡镇 GeoJSON，生成 public/maps/wedding_map.json
 * 使用方式：
 * 1. 将恩施区县数据放在 public/maps/enshi_counties.json
 * 2. （可选）从 geojson.hxkj.vip 下载利川乡镇边界，保存为 public/maps/lichuan_townships.json
 * 3. 运行：node scripts/build-map.js
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
const outPath = path.join(mapsDir, 'wedding_map.json')

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function getDisplayName(name, regionLevel) {
  if (regionLevel === 'lichuan-township') {
    return name.replace(/(街道|镇|乡)$/, '')
  }
  return name
    .replace(/土家族苗族自治县$/, '')
    .replace(/(市|县)$/, '')
}

function normalizeFeature(feature, regionLevel) {
  const name = feature.properties?.name || ''
  return {
    type: 'Feature',
    properties: {
      ...feature.properties,
      regionLevel,
      displayName: getDisplayName(name, regionLevel),
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

const output = { type: 'FeatureCollection', features }
fs.writeFileSync(outPath, JSON.stringify(output))
console.log(`已生成 ${outPath}，要素数 ${features.length}`)
