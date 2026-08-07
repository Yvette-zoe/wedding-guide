/**
 * 从 OpenStreetMap Overpass 拉取图面范围内水系（清江及支流）
 * 范围：利川 bbox 29.71,108.36,30.66,109.31
 * 运行：node scripts/fetch-rivers.js
 * 输出：public/maps/lichuan_rivers.json
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mapsDir = path.resolve(__dirname, '../public/maps')
const outPath = path.join(mapsDir, 'lichuan_rivers.json')

// 南,西,北,东（利川核心区域，含清江及主要支流）
const BBOX = '29.95,108.45,30.65,109.20'

const query = `
[out:json][timeout:180];
(
  way["waterway"~"^(river|stream)$"](${BBOX});
  relation["waterway"~"^(river|stream)$"](${BBOX});
);
out geom;
`

async function main() {
  console.log('请求 Overpass API…')
  // 国内可访问的 Overpass 镜像
  const url = 'https://overpass.kumi.systems/api/interpreter'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'wedding-map-demo/1.0 (lichuan rivers fetch)',
    },
    body: 'data=' + encodeURIComponent(query),
  })
  if (!res.ok) {
    console.error('Overpass 请求失败', res.status, await res.text())
    process.exit(1)
  }
  const data = await res.json()
  const elements = data.elements || []

  const features = []
  for (const el of elements) {
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const coords = el.geometry.map((p) => [p.lon, p.lat])
      if (coords.length < 2) continue
      features.push({
        type: 'Feature',
        properties: {
          name: el.tags?.name || '',
          waterway: el.tags?.waterway || '',
          osm_id: el.id,
        },
        geometry: { type: 'LineString', coordinates: coords },
      })
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const lines = el.members
        .filter((m) => m.type === 'way' && Array.isArray(m.geometry))
        .map((m) => m.geometry.map((p) => [p.lon, p.lat]))
        .filter((c) => c.length >= 2)
      if (!lines.length) continue
      features.push({
        type: 'Feature',
        properties: {
          name: el.tags?.name || '',
          waterway: el.tags?.waterway || '',
          osm_id: el.id,
        },
        geometry: { type: 'MultiLineString', coordinates: lines },
      })
    }
  }

  const geojson = { type: 'FeatureCollection', features }
  fs.writeFileSync(outPath, JSON.stringify(geojson))
  const named = features.filter((f) => f.properties.name).length
  console.log(`已生成 ${outPath}，水系要素 ${features.length} 条（含名称 ${named} 条）`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
