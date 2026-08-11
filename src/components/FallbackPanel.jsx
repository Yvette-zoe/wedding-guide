import React, { useState } from 'react'
import {
  FALLBACK_CLIMATE,
  FALLBACK_ITINERARIES,
  FALLBACK_WEDDING,
  buildFallbackNavUrl,
  getFallbackDistanceRows,
} from '../data/staticFallback'

/** 助手不可用时的简易模式面板 */
export default function FallbackPanel({ onRetry }) {
  const [openId, setOpenId] = useState('wedding')
  const distanceRows = getFallbackDistanceRows()

  const toggle = (id) => {
    setOpenId((prev) => (prev === id ? '' : id))
  }

  return (
    <section className="fallback-panel" aria-label="备用信息">
      <div className="fallback-panel-head">
        <strong>简易模式</strong>
        <p>助手暂时不可用，以下为预置备用信息</p>
      </div>

      <div className="fallback-section">
        <button type="button" className="fallback-section-toggle" onClick={() => toggle('wedding')} aria-expanded={openId === 'wedding'}>
          <span>婚礼信息</span>
          <span aria-hidden="true">{openId === 'wedding' ? '−' : '+'}</span>
        </button>
        {openId === 'wedding' && (
          <div className="fallback-section-body">
            <p><small>日期</small>{FALLBACK_WEDDING.dateLabel}</p>
            <p><small>仪式</small>{FALLBACK_WEDDING.ceremonyTime}</p>
            <p><small>宴席</small>{FALLBACK_WEDDING.banquetTime}</p>
            <p><small>场地</small>{FALLBACK_WEDDING.venueName}</p>
            <p><small>地址</small>{FALLBACK_WEDDING.venueAddress}</p>
            <p className="fallback-note">{FALLBACK_WEDDING.note}</p>
            <a
              className="nav-btn fallback-nav"
              href={buildFallbackNavUrl(FALLBACK_WEDDING.venueName, FALLBACK_WEDDING.venueCoordinates)}
              target="_blank"
              rel="noreferrer"
            >
              导航到婚宴场地
            </a>
            <a
              className="nav-btn fallback-nav is-secondary"
              href={buildFallbackNavUrl(FALLBACK_WEDDING.hotelName, FALLBACK_WEDDING.hotelCoordinates)}
              target="_blank"
              rel="noreferrer"
            >
              导航到酒店
            </a>
          </div>
        )}
      </div>

      <div className="fallback-section">
        <button type="button" className="fallback-section-toggle" onClick={() => toggle('distance')} aria-expanded={openId === 'distance'}>
          <span>预置距离表（酒店出发 · 驾车）</span>
          <span aria-hidden="true">{openId === 'distance' ? '−' : '+'}</span>
        </button>
        {openId === 'distance' && (
          <div className="fallback-section-body">
            {distanceRows.length === 0 ? (
              <p className="fallback-note">暂无预置距离数据</p>
            ) : (
              <ul className="fallback-distance-list">
                {distanceRows.map((row) => (
                  <li key={row.name}>
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.distance_text} · {row.duration_text}</small>
                    </div>
                    {row.destination?.length === 2 && (
                      <a
                        className="fallback-link"
                        href={buildFallbackNavUrl(row.name, row.destination)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        导航
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="fallback-section">
        <button type="button" className="fallback-section-toggle" onClick={() => toggle('trip')} aria-expanded={openId === 'trip'}>
          <span>预置行程</span>
          <span aria-hidden="true">{openId === 'trip' ? '−' : '+'}</span>
        </button>
        {openId === 'trip' && (
          <div className="fallback-section-body">
            {FALLBACK_ITINERARIES.map((item) => (
              <div key={item.id} className="fallback-itinerary">
                <strong>{item.title}</strong>
                <p>{item.summary}</p>
                <ol>
                  {item.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fallback-section">
        <button type="button" className="fallback-section-toggle" onClick={() => toggle('climate')} aria-expanded={openId === 'climate'}>
          <span>穿衣与出行（{FALLBACK_CLIMATE.sourceLabel}）</span>
          <span aria-hidden="true">{openId === 'climate' ? '−' : '+'}</span>
        </button>
        {openId === 'climate' && (
          <div className="fallback-section-body">
            <p className="weather-source is-climate">{FALLBACK_CLIMATE.sourceLabel}</p>
            <p><small>白天</small>{FALLBACK_CLIMATE.dayweather} {FALLBACK_CLIMATE.daytemp}℃</p>
            <p><small>夜间</small>{FALLBACK_CLIMATE.nightweather} {FALLBACK_CLIMATE.nighttemp}℃</p>
            <ul className="weather-tips">
              {FALLBACK_CLIMATE.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <p className="fallback-note">{FALLBACK_CLIMATE.note}</p>
          </div>
        )}
      </div>

      {onRetry && (
        <button type="button" className="fallback-retry" onClick={onRetry}>
          重试连接助手
        </button>
      )}
    </section>
  )
}
