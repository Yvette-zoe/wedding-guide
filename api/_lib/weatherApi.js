/**
 * 高德天气查询
 */
import { AmapApiError } from './amap.js'

export async function fetchWeather({ key, city, extensions = 'all' }) {
  if (!key) {
    throw new AmapApiError('缺少 AMAP_KEY，请在环境变量中配置', 503)
  }
  if (!city) {
    throw new AmapApiError('缺少 city（adcode）参数', 400)
  }

  const url = `https://restapi.amap.com/v3/weather/weatherInfo?key=${key}&city=${city}&extensions=${extensions}`
  const response = await fetch(url)
  return response.json()
}
