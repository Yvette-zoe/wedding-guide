/**
 * 高德 POI / 导航扩展预留接口（本阶段不请求网络、不保存 Key）
 * 后续接入时，将 API 结果映射为 places.js 中的统一点位模型即可。
 */
import { createPlace } from './places'

/**
 * 将高德导航 URI 所需参数拼成可跳转链接（后续阶段使用）
 * @param {{ name: string, coordinates: [number, number] }} place
 */
export function buildAmapNavigationUrl(place) {
  if (!place?.coordinates?.length) return ''
  const [lng, lat] = place.coordinates
  const name = encodeURIComponent(place.navigation?.name || place.name || place.title || '目的地')
  return `https://uri.amap.com/navigation?to=${lng},${lat},${name}&mode=car&coordinate=gaode&callnative=1`
}

/**
 * 将高德 POI 搜索结果条目转换为统一点位模型
 * @param {object} amapPoi
 */
export function mapAmapPoiToPlace(amapPoi) {
  const location = String(amapPoi.location || '').split(',')
  const lng = Number(location[0])
  const lat = Number(location[1])
  return createPlace({
    id: `poi-${amapPoi.id || `${lng}-${lat}`}`,
    placeType: 'poi',
    type: amapPoi.type || '周边推荐',
    title: amapPoi.name,
    name: amapPoi.name,
    coordinates: Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null,
    address: amapPoi.address || amapPoi.pname + amapPoi.cityname + amapPoi.adname,
    details: amapPoi.type || '',
    time: amapPoi.business?.opentime || '',
    description: amapPoi.business?.tel ? `电话：${amapPoi.business.tel}` : '',
  })
}

/**
 * 预留：按关键词搜索周边 POI
 * 正式环境应通过后端代理请求高德 Web 服务 API，避免 Key 暴露。
 */
export async function searchNearbyPois(_options = {}) {
  // 本阶段返回空列表，不发起请求
  return []
}

/**
 * 预留：加载选定的酒店/景点 POI，供地图 series 追加
 */
export async function loadSelectedPois(_ids = []) {
  return []
}
