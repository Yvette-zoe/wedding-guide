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

/**
 * 默认入住酒店（本地兜底数据，字段与扣子 hotels 表记录一致）
 * 用于扣子 hotels 表加载失败/未返回数据时，保证地图与"交通枢纽→酒店驾车时长"功能不受影响。
 */
export const defaultHotel = createPlace({
  id: 'default-hotel',
  placeType: 'hotel',
  type: '入住酒店',
  title: '利川时代开元名都大酒店(滨江北路店)',
  name: '利川时代开元名都大酒店(滨江北路店)',
  coordinates: [108.953625, 30.285167],
  address: '湖北省恩施土家族苗族自治州利川市都亭街道滨江北路99号(清江半岛旁)',
  details: '婚礼宾客入住酒店',
})

/** 交通枢纽：利川站、恩施站、许家坪机场、重庆北站、江北机场 */
export const transportHubs = [
  createPlace({
    id: 'lichuan-station',
    placeType: 'transport',
    type: '火车站',
    title: '利川站',
    name: '利川站',
    coordinates: [108.9364, 30.2936],
    address: '湖北省利川市南环大道',
    details: '沪汉蓉高铁（宜万铁路）经停站',
  }),
  createPlace({
    id: 'enshi-station',
    placeType: 'transport',
    type: '火车站',
    title: '恩施站',
    name: '恩施站',
    coordinates: [109.4790, 30.2720],
    address: '湖北省恩施市金桂大道',
    details: '恩施州主要铁路客运站',
  }),
  createPlace({
    id: 'xujiaping-airport',
    placeType: 'transport',
    type: '机场',
    title: '恩施许家坪机场',
    name: '许家坪机场',
    coordinates: [109.4850, 30.3200],
    address: '湖北省恩施市许家坪路',
    details: '恩施州民用机场，可中转武汉、重庆等地',
  }),
  createPlace({
    id: 'chongqing-north-station',
    placeType: 'transport',
    type: '火车站',
    title: '重庆北站',
    name: '重庆北站',
    coordinates: [106.55, 29.61],
    address: '重庆市渝北区龙头寺',
    details: '西南地区铁路枢纽，可换乘高铁至利川方向',
  }),
  createPlace({
    id: 'jiangbei-airport',
    placeType: 'transport',
    type: '机场',
    title: '重庆江北国际机场',
    name: '江北机场',
    coordinates: [106.66, 29.72],
    address: '重庆市渝北区两路街道',
    details: '重庆主要民用机场，国内外航线丰富',
  }),
]

export const mapPlaces = [weddingVenue, ...attractionList, defaultHotel, ...transportHubs]

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
