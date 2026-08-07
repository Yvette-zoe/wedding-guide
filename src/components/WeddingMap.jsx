import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { MapChart, ScatterChart, EffectScatterChart, LinesChart } from 'echarts/charts'
import { GeoComponent, TooltipComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import { mapPlaces, weddingVenue } from '../data/places'

echarts.use([
  MapChart,
  ScatterChart,
  EffectScatterChart,
  LinesChart,
  GeoComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
])

const MAP_NAME = 'wedding-enshi-lichuan'

/** 行政区标签 / 边界分级显示的缩放阈值（与边界档位共用） */
const VIEW_ZOOM = {
  lichuanDetail: 1.5,
  lichuanTownship: 2.0,
}

/** 中等缩放时先显示的利川核心街道 */
const LICHUAN_CORE_NAMES = new Set(['都亭街道', '东城街道'])

const LICHUAN_FILL = '#fdfdfc'
const LICHUAN_BORDER = '#7066a0'
const ENSHI_FILL = '#eef2f5'
const ENSHI_BORDER = '#9995bc'

function registerMap(geoJson) {
  echarts.registerMap(MAP_NAME, geoJson)
}

/** 根据全图要素计算 geo 中心，保证双层 geo 初始投影一致 */
function computeGeoCenter(geoJson) {
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity

  const visit = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lng, lat] = coords
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      return
    }
    coords.forEach(visit)
  }

  for (const feature of geoJson.features || []) {
    if (feature.geometry?.coordinates) {
      visit(feature.geometry.coordinates)
    }
  }

  if (!Number.isFinite(minLng)) {
    return [108.94, 30.30]
  }
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
}

/** 从利川市外轮廓 GeoJSON 提取折线坐标（与 scatter 共用 geoIndex:0，避免双层 geo 错位） */
function extractCityOutlineLines(geoJson) {
  const feature = (geoJson.features || []).find((item) => item.properties?.regionLevel === 'lichuan-city')
  if (!feature?.geometry) return []

  const { geometry } = feature
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates

  // 过滤 union 产生的小块飞地，避免干扰主轮廓
  return polygons
    .filter((polygon) => {
      const ring = polygon[0]
      let minLng = Infinity
      let maxLng = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity
      ring.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      })
      return (maxLng - minLng) > 0.15 && (maxLat - minLat) > 0.15
    })
    .map((polygon) => ({
      coords: polygon[0],
    }))
}

function buildCityOutlineSeries(geoJson, tier) {
  return {
    id: 'lichuan-city-outline',
    name: '利川市界',
    type: 'lines',
    coordinateSystem: 'geo',
    geoIndex: 0,
    zlevel: 4,
    silent: true,
    polyline: true,
    show: tier <= 2,
    lineStyle: {
      color: LICHUAN_BORDER,
      width: 2.5,
      opacity: 1,
    },
    data: extractCityOutlineLines(geoJson),
  }
}

/** 点击点位后的目标缩放（城区酒店/餐厅需更大层级以拉开密集点位） */
const FOCUS_ZOOM = {
  venue: 3.4,
  attraction: 2.8,
  hotel: 40,
  restaurant: 60,
  default: 2.6,
}

/** 达到该缩放后显示城区密集点位（餐厅）标签；150 倍时必显 */
const DENSE_LABEL_ZOOM = 40

/** 河流线宽随缩放增大：远景细、近景粗 */
function getRiverWidth(zoom) {
  if (zoom >= 20) return 8
  if (zoom >= 8) return 4
  if (zoom >= 3) return 1.5
  return 0.5
}

/** 铁路线宽随缩放增大：远景细、近景粗 */
function getRailwayWidth(zoom) {
  if (zoom >= 20) return 6
  if (zoom >= 8) return 4
  if (zoom >= 3) return 2
  return 1
}

function getFocusZoom(place) {
  if (place?.placeType === 'venue') return FOCUS_ZOOM.venue
  if (place?.placeType === 'attraction') return FOCUS_ZOOM.attraction
  if (place?.placeType === 'hotel') return FOCUS_ZOOM.hotel
  if (place?.placeType === 'restaurant') return FOCUS_ZOOM.restaurant
  return FOCUS_ZOOM.default
}

/** 按当前缩放切换餐厅标签：低倍隐藏防遮挡，高倍（含 150）显示 */
function applyDensePlaceLabels(chart, zoom) {
  const showDenseLabels = zoom >= DENSE_LABEL_ZOOM
  chart.setOption({
    series: [{
      id: 'restaurants',
      label: { show: showDenseLabels },
      // 高倍时点位已拉开，关闭重叠隐藏，保证 150 倍能看到标签
      labelLayout: { hideOverlap: !showDenseLabels },
    }, {
      id: 'hotels',
      label: { show: true },
      labelLayout: { hideOverlap: zoom < DENSE_LABEL_ZOOM },
    }],
  }, { lazyUpdate: true })
}

/** 按当前缩放更新河流宽度 */
function applyRiverStyle(chart, zoom) {
  chart.setOption({
    series: [{
      id: 'rivers',
      lineStyle: { width: getRiverWidth(zoom) },
    }],
  }, { lazyUpdate: true })
}

/** 按当前缩放更新铁路宽度 */
function applyRailwayStyle(chart, zoom) {
  chart.setOption({
    series: [{
      id: 'railways',
      lineStyle: { width: getRailwayWidth(zoom) },
    }],
  }, { lazyUpdate: true })
}

function setGeoView(chart, center, zoom, { centered = false } = {}) {
  const tier = getViewTier(zoom)
  const layout = {
    layoutCenter: centered ? ['50%', '50%'] : ['50%', '52%'],
    layoutSize: '98%',
  }
  chart.setOption({
    geo: [{
      center,
      zoom,
      ...layout,
    }],
    series: [{
      id: 'lichuan-city-outline',
      show: tier <= 2,
    }],
  })
  applyDensePlaceLabels(chart, zoom)
  applyRiverStyle(chart, zoom)
  applyRailwayStyle(chart, zoom)
}

function getViewTier(zoom) {
  if (zoom >= VIEW_ZOOM.lichuanTownship) return 3
  if (zoom >= VIEW_ZOOM.lichuanDetail) return 2
  return 1
}

function shouldShowRegionLabel(regionLevel, name, tier) {
  if (regionLevel === 'enshi') return tier >= 1
  if (regionLevel === 'lichuan-city') return false
  if (regionLevel === 'lichuan') return tier >= 2
  if (regionLevel === 'lichuan-township') {
    if (tier >= 3) return true
    if (tier >= 2 && LICHUAN_CORE_NAMES.has(name)) return true
    return false
  }
  return false
}

/** 射线法判断点是否在多边形内 */
function pointInRing(point, ring) {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') {
    return pointInRing(point, geometry.coordinates[0])
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInRing(point, polygon[0]))
  }
  return false
}

function findTownshipAtViewportCenter(chart, container, geoJson) {
  if (!chart || !container || !geoJson?.features) return null
  const rect = container.getBoundingClientRect()
  const pixel = [rect.width / 2, rect.height / 2]
  const coord = chart.convertFromPixel({ geoIndex: 0 }, pixel)
  if (!coord || coord.length < 2) return null

  const townships = geoJson.features.filter((f) => f.properties?.regionLevel === 'lichuan-township')
  for (const feature of townships) {
    if (pointInGeometry(coord, feature.geometry)) {
      return feature.properties?.name || null
    }
  }
  return null
}

function buildTownshipStyle(name, displayName, tier, centerTownshipName, showLabel) {
  if (tier === 1) {
    return {
      name,
      itemStyle: {
        // 远景仅显示市界 union 填充，乡镇面透明避免与市界错位
        areaColor: 'rgba(0,0,0,0)',
        borderColor: 'rgba(0,0,0,0)',
        borderWidth: 0,
      },
      label: { show: false },
    }
  }
  if (tier === 2) {
    return {
      name,
      itemStyle: {
        areaColor: LICHUAN_FILL,
        borderColor: LICHUAN_BORDER,
        borderWidth: 1,
        borderType: 'dashed',
      },
      label: {
        show: showLabel,
        color: '#8279a5',
        fontSize: 11,
        fontWeight: 600,
        formatter: displayName,
      },
    }
  }
  const isCenter = name === centerTownshipName
  return {
    name,
    itemStyle: {
      areaColor: LICHUAN_FILL,
      borderColor: LICHUAN_BORDER,
      borderWidth: isCenter ? 2.5 : 1,
      borderType: isCenter ? 'solid' : 'dashed',
    },
    label: {
      show: showLabel,
      color: isCenter ? '#6b5f94' : '#8279a5',
      fontSize: isCenter ? 12 : 11,
      fontWeight: isCenter ? 700 : 600,
      formatter: displayName,
    },
  }
}

function buildRegionStyles(geoJson, zoom = 1.15, centerTownshipName = null) {
  const tier = getViewTier(zoom)
  return (geoJson.features || []).map((feature) => {
    const level = feature.properties?.regionLevel
    const name = feature.properties?.name
    const displayName = feature.properties?.displayName || name
    const showLabel = shouldShowRegionLabel(level, name, tier)

    if (level === 'lichuan-city') {
      return {
        name,
        itemStyle: {
          areaColor: tier === 1 ? LICHUAN_FILL : 'rgba(253,253,252,0)',
          borderColor: LICHUAN_FILL,
          borderWidth: 0,
        },
        label: { show: false },
        silent: true,
      }
    }

    if (level === 'lichuan-township') {
      return buildTownshipStyle(name, displayName, tier, centerTownshipName, showLabel)
    }

    if (level === 'lichuan') {
      return buildTownshipStyle(name, displayName, tier, centerTownshipName, showLabel)
    }

    return {
      name,
      itemStyle: {
        areaColor: ENSHI_FILL,
        borderColor: ENSHI_BORDER,
        borderWidth: 1,
        borderType: 'dashed',
        opacity: 0.85,
      },
      label: {
        show: showLabel,
        color: '#a6a2b6',
        fontSize: 11,
        formatter: displayName,
      },
    }
  })
}

function applyMapRegions(chart, geoJson, zoom, centerTownshipName = null) {
  const tier = getViewTier(zoom)
  chart.setOption({
    geo: [{
      regions: buildRegionStyles(geoJson, zoom, centerTownshipName),
    }],
    series: [{
      id: 'lichuan-city-outline',
      show: tier <= 2,
    }],
  }, { lazyUpdate: true })
}

function getGeoZoom(chart, fallback = 1.15) {
  return chart.getOption().geo?.[0]?.zoom ?? fallback
}

function updateMapView(chart, container, geoJson, state) {
  const zoom = getGeoZoom(chart, state.zoomRef.current)
  const tier = getViewTier(zoom)
  let centerTownship = state.centerTownshipRef.current

  if (tier === 3) {
    centerTownship = findTownshipAtViewportCenter(chart, container, geoJson) || centerTownship
  } else {
    centerTownship = null
  }

  const changed = tier !== state.tierRef.current
    || (tier === 3 && centerTownship !== state.centerTownshipRef.current)

  if (!changed) return

  state.tierRef.current = tier
  state.zoomRef.current = zoom
  state.centerTownshipRef.current = centerTownship
  applyMapRegions(chart, geoJson, zoom, centerTownship)
}

function toScatterData(places) {
  return places
    .filter((place) => place.coordinates?.length === 2)
    .map((place) => ({
      name: place.name,
      value: [...place.coordinates, 1],
      placeId: place.id,
      placeType: place.placeType,
    }))
}

const WeddingMap = forwardRef(function WeddingMap({ places = mapPlaces, focusPlaceId = null, onSelectPlace }, ref) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const geoJsonRef = useRef(null)
  const zoomRef = useRef(1.15)
  const tierRef = useRef(1)
  const centerTownshipRef = useRef(null)
  const placesRef = useRef(places)
  const onSelectPlaceRef = useRef(onSelectPlace)
  const skipInitialFocusRef = useRef(true)
  const [status, setStatus] = useState('loading')
  const [errorText, setErrorText] = useState('')

  placesRef.current = places
  onSelectPlaceRef.current = onSelectPlace

  useImperativeHandle(ref, () => ({
    focusPlace(place) {
      const chart = chartRef.current
      if (!chart || !place?.coordinates) return
      const zoom = getFocusZoom(place)
      setGeoView(chart, place.coordinates, zoom, { centered: true })
      if (geoJsonRef.current && containerRef.current) {
        updateMapView(chart, containerRef.current, geoJsonRef.current, {
          zoomRef, tierRef, centerTownshipRef,
        })
      }
    },
    getChart() {
      return chartRef.current
    },
  }))

  useEffect(() => {
    let disposed = false
    let chart
    let resizeObserver

    async function init() {
      try {
        setStatus('loading')
        const mapUrl = `${import.meta.env.BASE_URL}maps/wedding_map.json`
        const response = await fetch(mapUrl)
        if (!response.ok) throw new Error('地图数据加载失败')
        const geoJson = await response.json()
        if (disposed || !containerRef.current) return

        // 加载清江及其支流（river 级别，不含细小溪流）
        let rivers = []
        try {
          const riversRes = await fetch(`${import.meta.env.BASE_URL}maps/lichuan_rivers.json`)
          if (riversRes.ok) {
            const riversJson = await riversRes.json()
            rivers = (riversJson.features || [])
              .filter((f) => f.properties?.waterway === 'river')
              .flatMap((f) => {
                if (f.geometry.type === 'LineString') return [{ coords: f.geometry.coordinates, name: f.properties.name }]
                if (f.geometry.type === 'MultiLineString') {
                  return f.geometry.coordinates.map((line) => ({ coords: line, name: f.properties.name }))
                }
                return []
              })
          }
        } catch (riverError) {
          console.warn('水系数据加载失败，继续显示行政区图', riverError)
        }

        // 加载铁路线（重庆北-利川-恩施）
        let railways = []
        try {
          const railwaysRes = await fetch(`${import.meta.env.BASE_URL}maps/railways.json`)
          if (railwaysRes.ok) {
            const railwaysJson = await railwaysRes.json()
            railways = (railwaysJson.features || [])
              .flatMap((f) => {
                if (f.geometry.type === 'LineString') return [{ coords: f.geometry.coordinates, name: f.properties.name }]
                if (f.geometry.type === 'MultiLineString') {
                  return f.geometry.coordinates.map((line) => ({ coords: line, name: f.properties.name }))
                }
                return []
              })
          }
        } catch (railwayError) {
          console.warn('铁路数据加载失败，继续显示其他图层', railwayError)
        }

        registerMap(geoJson)
        geoJsonRef.current = geoJson
        chart = echarts.init(containerRef.current, null, { renderer: 'canvas' })
        chartRef.current = chart

        const initialZoom = 1.15
        const mapCenter = computeGeoCenter(geoJson)
        tierRef.current = getViewTier(initialZoom)
        zoomRef.current = initialZoom
        centerTownshipRef.current = null

        const currentPlaces = placesRef.current
        const venuePlaces = currentPlaces.filter((place) => place.placeType === 'venue')
        const attractionPlaces = currentPlaces.filter((place) => place.placeType === 'attraction' && place.coordinates)
        const hotelPlaces = currentPlaces.filter((place) => place.placeType === 'hotel' && place.coordinates)
        const restaurantPlaces = currentPlaces.filter((place) => place.placeType === 'restaurant' && place.coordinates)

        chart.setOption({
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(255,253,249,0.96)',
            borderColor: '#cbbfdc',
            textStyle: { color: '#4d4870', fontSize: 12 },
            formatter(params) {
              if (params.seriesType === 'effectScatter' || params.seriesType === 'scatter') {
                return null
              }
              return params.name || ''
            },
          },
          geo: [
            {
              map: MAP_NAME,
              roam: true,
              zlevel: 0,
              center: mapCenter,
              // 中心城区酒店/餐厅密集，最大可放到 150 倍以拉开点位并显示标签
              scaleLimit: { min: 0.8, max: 150 },
              zoom: initialZoom,
              layoutCenter: ['50%', '52%'],
              layoutSize: '98%',
              itemStyle: {
                areaColor: '#eef2f5',
                borderColor: '#9995bc',
                borderWidth: 1,
                borderType: 'dashed',
              },
              label: { show: false },
              emphasis: {
                itemStyle: {
                  areaColor: '#f3eef8',
                  borderColor: '#7c69a9',
                  borderWidth: 1.5,
                },
                label: { show: false },
              },
              regions: buildRegionStyles(geoJson, initialZoom, null),
            },
          ],
          series: [
            buildCityOutlineSeries(geoJson, tierRef.current),
            {
              id: 'rivers',
              name: '清江水系',
              type: 'lines',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 3,
              silent: true,
              polyline: true,
              lineStyle: {
                color: '#7db4d8',
                width: 2.5,
                opacity: 0.6,
              },
              data: rivers,
            },
            {
              id: 'railways',
              name: '铁路',
              type: 'lines',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 4,
              silent: true,
              polyline: true,
              lineStyle: {
                color: '#8b5a4e',
                width: 2,
                opacity: 0.6,
                type: 'dashed',
              },
              data: railways,
            },
            {
              id: 'transports',
              name: '交通枢纽',
              type: 'scatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              symbol: 'circle',
              symbolSize: 13,
              itemStyle: {
                color: '#4a7ba6',
                borderColor: '#ffffff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(74,123,166,0.35)',
              },
              label: {
                show: true,
                position: 'right',
                distance: 8,
                formatter: '{b}',
                color: '#2e5a80',
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: 'rgba(255,253,249,0.92)',
                borderColor: '#8fb3d1',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 6],
              },
              labelLayout: { hideOverlap: false },
              data: toScatterData(currentPlaces.filter((place) => place.placeType === 'transport')),
            },
            {
              id: 'venues',
              name: '婚宴场地',
              type: 'effectScatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              rippleEffect: {
                brushType: 'stroke',
                scale: 3.2,
                color: '#c87691',
              },
              symbolSize: 14,
              itemStyle: {
                color: '#c87691',
                shadowBlur: 8,
                shadowColor: 'rgba(200,118,145,0.45)',
              },
              label: {
                show: true,
                position: 'right',
                distance: 8,
                formatter: '{b}',
                color: '#9b526d',
                fontSize: 12,
                backgroundColor: 'rgba(255,253,249,0.92)',
                borderColor: '#d9a1ae',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 6],
              },
              labelLayout: { hideOverlap: true },
              data: toScatterData(venuePlaces.length ? venuePlaces : [weddingVenue]),
            },
            {
              id: 'attractions',
              name: '推荐景点',
              type: 'scatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              symbolSize: 12,
              itemStyle: {
                color: '#7565a1',
                borderColor: '#ffffff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(117,101,161,0.35)',
              },
              label: {
                show: true,
                position: 'right',
                distance: 8,
                formatter: '{b}',
                color: '#504c74',
                fontSize: 12,
                backgroundColor: 'rgba(255,253,249,0.92)',
                borderColor: '#b9b0cf',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 6],
              },
              labelLayout: { hideOverlap: true },
              data: toScatterData(attractionPlaces),
            },
            {
              id: 'hotels',
              name: '入住酒店',
              type: 'scatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              symbol: 'roundRect',
              symbolSize: 12,
              itemStyle: {
                color: '#d58b5c',
                borderColor: '#ffffff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(213,139,92,0.35)',
              },
              label: {
                show: true,
                position: 'right',
                distance: 8,
                formatter: '{b}',
                color: '#80583f',
                fontSize: 12,
                backgroundColor: 'rgba(255,253,249,0.92)',
                borderColor: '#deb99f',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 6],
              },
              labelLayout: { hideOverlap: true },
              data: toScatterData(hotelPlaces),
            },
            {
              id: 'restaurants',
              name: '推荐餐厅',
              type: 'scatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              symbol: 'diamond',
              symbolSize: 13,
              itemStyle: {
                color: '#5f9672',
                borderColor: '#ffffff',
                borderWidth: 2,
                shadowBlur: 6,
                shadowColor: 'rgba(95,150,114,0.35)',
              },
              label: {
                show: false,
                position: 'right',
                distance: 8,
                formatter: '{b}',
                color: '#456b53',
                fontSize: 12,
                backgroundColor: 'rgba(255,253,249,0.92)',
                borderColor: '#a8c6b2',
                borderWidth: 1,
                borderRadius: 4,
                padding: [3, 6],
              },
              emphasis: {
                label: { show: true },
              },
              labelLayout: { hideOverlap: true },
              data: toScatterData(restaurantPlaces),
            },
            {
              id: 'pois',
              name: '周边 POI',
              type: 'scatter',
              coordinateSystem: 'geo',
              geoIndex: 0,
              zlevel: 5,
              tooltip: { show: false },
              symbolSize: 10,
              itemStyle: { color: '#5d6da0', borderColor: '#fff', borderWidth: 1.5 },
              label: {
                show: true,
                position: 'right',
                formatter: '{b}',
                fontSize: 11,
                color: '#555b87',
                backgroundColor: 'rgba(255,253,249,0.9)',
                borderColor: '#c5bdd8',
                borderWidth: 1,
                borderRadius: 4,
                padding: [2, 5],
              },
              data: [],
            },
          ],
        })

        chart.on('click', (params) => {
          if (params.seriesType !== 'scatter' && params.seriesType !== 'effectScatter') return
          const placeId = params.data?.placeId
          const place = placesRef.current.find((item) => item.id === placeId)
          if (place) onSelectPlaceRef.current?.(place)
        })

        let viewRaf = null
        chart.on('georoam', () => {
          if (viewRaf) cancelAnimationFrame(viewRaf)
          viewRaf = requestAnimationFrame(() => {
            if (!containerRef.current || !geoJsonRef.current) return
            const zoom = getGeoZoom(chart, zoomRef.current)
            updateMapView(chart, containerRef.current, geoJsonRef.current, {
              zoomRef, tierRef, centerTownshipRef,
            })
            applyDensePlaceLabels(chart, zoom)
            applyRiverStyle(chart, zoom)
            applyRailwayStyle(chart, zoom)
          })
        })

        resizeObserver = new ResizeObserver(() => chart.resize())
        resizeObserver.observe(containerRef.current)
        setStatus('ready')
      } catch (error) {
        console.error(error)
        setStatus('error')
        setErrorText(error.message || '地图加载失败')
      }
    }

    init()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      chart?.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || status !== 'ready') return
    const venuePlaces = places.filter((place) => place.placeType === 'venue')
    const attractionPlaces = places.filter((place) => place.placeType === 'attraction' && place.coordinates)
    const hotelPlaces = places.filter((place) => place.placeType === 'hotel' && place.coordinates)
    const restaurantPlaces = places.filter((place) => place.placeType === 'restaurant' && place.coordinates)
    const transportPlaces = places.filter((place) => place.placeType === 'transport' && place.coordinates)
    const poiPlaces = places.filter((place) => place.placeType === 'poi' && place.coordinates)

    chart.setOption({
      series: [
        { id: 'venues', data: toScatterData(venuePlaces) },
        { id: 'attractions', data: toScatterData(attractionPlaces) },
        { id: 'hotels', data: toScatterData(hotelPlaces) },
        { id: 'restaurants', data: toScatterData(restaurantPlaces) },
        { id: 'transports', data: toScatterData(transportPlaces) },
        { id: 'pois', data: toScatterData(poiPlaces) },
      ],
    })
  }, [places, status])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || status !== 'ready' || !focusPlaceId) return
    if (skipInitialFocusRef.current) {
      skipInitialFocusRef.current = false
      return
    }
    const place = places.find((item) => item.id === focusPlaceId)
    if (!place?.coordinates) return
    const zoom = getFocusZoom(place)
    setGeoView(chart, place.coordinates, zoom, { centered: true })
    if (geoJsonRef.current && containerRef.current) {
      updateMapView(chart, containerRef.current, geoJsonRef.current, {
        zoomRef, tierRef, centerTownshipRef,
      })
    }
  }, [focusPlaceId, places, status])

  return (
    <div className="echarts-map-wrap">
      <div ref={containerRef} className="echarts-map" role="img" aria-label="利川及恩施景点地图" />
      {status === 'loading' && <div className="map-status">地图加载中…</div>}
      {status === 'error' && <div className="map-status is-error">{errorText}</div>}
      <div className="map-legend">
        <i></i> 婚礼场地
        <b></b> 推荐景点
        <em className="hotel-dot"></em> 入住酒店
        <em className="restaurant-dot"></em> 推荐餐厅
        <em className="transport-dot"></em> 交通枢纽
      </div>
    </div>
  )
})

export default WeddingMap
