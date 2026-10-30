/**
 * 扣子地点库的完整快照。
 * 线上 COZE_PAT 失效（4100）时，/api/places 用这份数据，避免退回本地 3 个景点。
 * 数据与 2026-09-02 扣子库一致：酒店 2、景点 9、餐厅 9。
 */
import snapshot from './cozePlacesSnapshot.json' with { type: 'json' }

/** @param {string} [placeType] hotel | attraction | restaurant，不传则返回全部 */
export function getSnapshotPlaces(placeType) {
  if (!placeType) return snapshot
  return snapshot.filter((place) => place.placeType === placeType)
}
