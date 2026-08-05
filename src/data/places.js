/**
 * 固定点位数据（GCJ-02 / 高德坐标系）
 * coordinates 格式：[经度, 纬度]（来自高德坐标拾取）
 */

/** 统一点位模型，后续高德 POI 也映射到此结构 */
export function createPlace(partial) {
  return {
    id: partial.id,
    name: partial.name || partial.title,
    title: partial.title || partial.name,
    type: partial.type || '推荐景点',
    placeType: partial.placeType || 'attraction',
    coordinates: partial.coordinates,
    address: partial.address || '',
    details: partial.details || '',
    time: partial.time || '',
    description: partial.description || '',
    // 后续可直接用于高德导航：name + coordinates
    navigation: partial.navigation || {
      name: partial.title || partial.name,
      coordinates: partial.coordinates,
    },
  }
}

export const weddingVenue = createPlace({
  id: 'venue',
  placeType: 'venue',
  type: '婚礼仪式',
  title: '婚宴场地',
  name: '婚宴场地',
  coordinates: [108.88805, 30.283543],
  address: '湖北省利川市柏施宴会艺术中心',
  details: '仪式：草坪 / 用餐：一层天空之城宴会厅',
  time: '2026.08.23  仪式：10:00 / 用餐：12:00',
  description: '我们期待与您在这个美好的夏日相见。',
})

export const attractions = {
  腾龙洞: createPlace({
    id: 'tenglongdong',
    placeType: 'attraction',
    type: '推荐景点',
    title: '腾龙洞风景区',
    name: '腾龙洞',
    coordinates: [108.99141, 30.333284],
    address: '湖北省恩施州利川市腾龙大道 1 号',
    details: '建议游玩 2.5 小时',
    time: '08:30–17:30（15:50 停止入园）',
    description: '亚洲最大溶洞，感受喀斯特奇观与激光秀、土家歌舞。',
  }),
  苏马荡: createPlace({
    id: 'sumadang',
    placeType: 'attraction',
    type: '推荐景点',
    title: '苏马荡景区',
    name: '苏马荡',
    coordinates: [108.718592, 30.473482],
    address: '湖北省恩施州利川市谋道镇',
    details: '建议游玩 2.5 小时',
    time: '09:00–17:00',
    description: '高山避暑、森林步道与云海观景，适合轻松漫游。',
  }),
  鱼木寨: createPlace({
    id: 'yumuzhai',
    placeType: 'attraction',
    type: '推荐景点',
    title: '鱼木寨',
    name: '鱼木寨',
    coordinates: [108.646215, 30.517546],
    address: '湖北省恩施州利川市谋道镇',
    details: '建议游玩 3 小时',
    time: '08:30–17:00',
    description: '千年古寨藏在群山之间，石刻、古道与土家风情相映。',
  }),
}

export const attractionList = Object.values(attractions)

export const mapPlaces = [weddingVenue, ...attractionList]

export const itinerary = {
  id: 'itinerary',
  type: '行程推荐',
  title: '利川一日游计划',
  name: '利川一日游计划',
  placeType: 'itinerary',
  coordinates: null,
  address: '为婚礼前后的轻旅行准备',
  details: '腾龙洞风景区（利川） · 建议游玩 2.5 小时\n苏马荡景区（利川） · 建议游玩 2.5 小时',
  time: '腾龙洞：08:30–17:30（15:50 停止入园）\n苏马荡：09:00–17:00（17:00 停止入园）',
  description: '腾龙洞：亚洲最大溶洞、喀斯特奇观 + 激光秀 / 土家歌舞。\n苏马荡：高山避暑、森林步道、云海观景。',
  navigation: null,
}

/** 根据 id 查找固定点位 */
export function findPlaceById(id) {
  return mapPlaces.find((place) => place.id === id) || null
}
