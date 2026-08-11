import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WeddingMap from './components/WeddingMap'
import ChatHistoryPage from './components/ChatHistoryPage'
import SplashScreen from './components/SplashScreen'
import { buildAmapNavigationUrl, loadCozePlaces, loadDrivingDuration } from './data/poiProvider'
import { sendChatMessage } from './data/chatClient'
import { attractionList, defaultHotel, mapPlaces, transportHubs, weddingVenue } from './data/places'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/500.css'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import '@fontsource/dm-serif-display/400.css'
import './style.css'

const CATEGORY_CONFIG = {
  venue: { title: '婚宴场地', icon: '♡' },
  attraction: { title: '推荐景点', icon: '⌁' },
  restaurant: { title: '推荐餐厅', icon: '♨' },
  hotel: { title: '入住酒店', icon: '⌂' },
}

function App() {
  const [card, setCard] = useState(weddingVenue)
  const [assistantCard, setAssistantCard] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [places, setPlaces] = useState(mapPlaces)
  const [placesStatus, setPlacesStatus] = useState('loading')
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focusPlaceId, setFocusPlaceId] = useState(weddingVenue.id)
  const [showQuickPicks, setShowQuickPicks] = useState(true)
  const [navOpen, setNavOpen] = useState(false)
  const [listPage, setListPage] = useState(null)
  const [detailPlace, setDetailPlace] = useState(null)
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false)
  const [splashDone, setSplashDone] = useState(false)
  const mapRef = useRef(null)

  const hideQuickPicks = () => setShowQuickPicks(false)

  const placesByCategory = useMemo(() => {
    const grouped = { venue: [], attraction: [], restaurant: [], hotel: [] }
    places.forEach((place) => {
      if (grouped[place.placeType]) grouped[place.placeType].push(place)
    })
    return grouped
  }, [places])

  useEffect(() => {
    let cancelled = false

    loadCozePlaces()
      .then(({ places: cozePlaces, failedTypes }) => {
        if (cancelled) return

        // 景点接口失败时保留原有三个本地景点，避免已完成的功能退化
        const fallbackAttractions = failedTypes.includes('attraction') ? attractionList : []
        // 酒店接口失败时保留本地默认酒店，避免"交通枢纽→酒店驾车时长"卡在查询中
        const fallbackHotels = failedTypes.includes('hotel') ? [defaultHotel] : []
        // 交通枢纽始终保留，不被扣子数据覆盖
        const nextPlaces = [weddingVenue, ...fallbackAttractions, ...cozePlaces, ...fallbackHotels, ...transportHubs]
        setPlaces(nextPlaces)
        setPlacesStatus(failedTypes.length ? 'partial' : 'ready')
      })
      .catch((error) => {
        if (cancelled) return
        console.error('扣子地点数据加载失败：', error)
        setPlacesStatus('fallback')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const selectPlace = async (place, { focus = true, hidePicks = false } = {}) => {
    setLoading(false)
    setAssistantCard(null)
    setCard(place)
    if (hidePicks || place?.placeType === 'attraction') {
      hideQuickPicks()
    }
    if (focus && place?.coordinates) {
      setFocusPlaceId(place.id)
      mapRef.current?.focusPlace?.(place)
    }

    // 交通枢纽：异步加载距各酒店的驾车时长
    if (place?.placeType === 'transport') {
      const hotel = places.find((p) => p.placeType === 'hotel')
      if (hotel?.coordinates) {
        setLoading(true)
        try {
          const duration = await loadDrivingDuration(place.coordinates, hotel.coordinates)
          setCard((prev) => (prev.id === place.id ? { ...prev, drivingDuration: duration } : prev))
        } catch (error) {
          console.error('驾车时长查询失败：', error)
          setCard((prev) => (prev.id === place.id ? { ...prev, drivingDuration: '查询失败' } : prev))
        } finally {
          setLoading(false)
        }
      }
    }
  }

  const openListPage = (category) => {
    setNavOpen(false)
    setListPage(category)
  }

  const closeListPage = () => setListPage(null)
  const openDetail = (place) => setDetailPlace(place)
  const closeDetail = () => setDetailPlace(null)

  const focusPlacesOnMap = (placeIds = []) => {
    if (!placeIds.length) return
    const first = places.find((item) => item.id === placeIds[0])
    if (first?.coordinates) {
      setFocusPlaceId(first.id)
      mapRef.current?.focusPlace?.(first)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || chatLoading) return

    hideQuickPicks()
    const nextMessages = [...chatMessages, { role: 'user', content: text }]
    setChatMessages(nextMessages)
    setInput('')
    setChatLoading(true)
    setAssistantCard(null)

    try {
      const history = nextMessages.map(({ role, content }) => ({ role, content }))
      const { reply, card: replyCard, focusPlaceIds } = await sendChatMessage(history)
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, card: replyCard },
      ])
      if (replyCard) setAssistantCard(replyCard)
      focusPlacesOnMap(focusPlaceIds)
    } catch (error) {
      console.error('对话失败：', error)
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: error.message || '对话请求失败，请稍后再试。' },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  useEffect(() => {
    if (!chatHistoryOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [chatHistoryOpen])

  return (
    <main className="page-shell">
      {!splashDone && <SplashScreen onFinish={() => setSplashDone(true)} />}
      <section className="app">
        <div className="app-top">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="nav-toggle"
                type="button"
                aria-label="打开导航"
                onClick={() => setNavOpen(true)}
              >
                <span></span><span></span><span></span>
              </button>
              <div>
                <p className="eyebrow">WELCOME TO OUR WEDDING</p>
                <h1>婚礼指南</h1>
              </div>
            </div>
            <div className="wedding-date">
              <span>婚礼时间</span>
              <strong>2026.08.23</strong>
            </div>
          </header>

          <div className="intro">
            <span className="sparkle">✦</span>
            <p>与山水相约 · 共赴浪漫之宴</p>
            <span className="sparkle">✦</span>
          </div>
        </div>

        <div className="app-body">
          <section className="map-section" aria-label="利川及恩施景点地图">
            <div className="map-title">
              <span>婚礼周边地图</span>
              <small>
                {placesStatus === 'loading' ? '地点数据加载中…' : '点击地点查看详情'}
              </small>
            </div>
            <WeddingMap
              ref={mapRef}
              places={places}
              focusPlaceId={focusPlaceId}
              onSelectPlace={(place) => selectPlace(place, { focus: Boolean(place?.coordinates) })}
            />
            {showQuickPicks && (
              <div className="quick-picks" aria-label="推荐旅游地点">
                {attractionList.map((place) => (
                  <button key={place.id} type="button" onClick={() => selectPlace(place, { hidePicks: true })}>
                    <span>⌁</span>{place.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="info-card-panel" aria-label="信息卡片">
            <div className={`info-card ${loading || chatLoading ? 'is-loading' : ''}`}>
              {loading || chatLoading ? (
                <div className="loading-state"><span></span><span></span><span></span><p>{chatLoading ? '正在思考中…' : '正在查询…'}</p></div>
              ) : assistantCard ? (
                <AssistantCard
                  card={assistantCard}
                  places={places}
                  onSelectPlace={(place) => selectPlace(place)}
                  compact
                />
              ) : (
                <>
                  <div className="info-card-fixed">
                    <div className="card-heading">
                      <span>{card.type}</span>
                      <div className="flower" aria-hidden="true"></div>
                    </div>
                    <div className="card-title-row">
                      <h2>{card.title}</h2>
                      {card.coordinates?.length === 2 && (
                        <a
                          className="nav-btn"
                          href={buildAmapNavigationUrl(card)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          高德导航
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="info-card-scroll">
                    <InfoLine icon="⌖" label="地址" value={card.address} />
                    {card.placeType === 'transport' ? (
                      <InfoLine icon="◷" label="距酒店驾车" value={card.drivingDuration || '查询中…'} />
                    ) : (
                      <>
                        <InfoLine icon="◷" label="时间" value={card.time} />
                        <InfoLine icon="♡" label="推荐" value={card.details} />
                      </>
                    )}
                    <div className="description">{card.description}</div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <form className="chat-bar" onSubmit={(event) => { event.preventDefault(); send() }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：酒店到利川站多远？步行半小时有什么好吃的？"
            aria-label="输入旅游问题"
            disabled={chatLoading}
          />
          <button type="submit" className="chat-send-btn" aria-label="发送" disabled={chatLoading || !input.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.3 13.9 20c-.3.7-1.3.7-1.6 0l-2.1-5.3-5.3-2.1c-.7-.3-.7-1.3 0-1.6L20.7 2c.6-.3 1 .6.7 1.3Z" /><path d="m10.1 14.6 4.7-4.7" /></svg>
          </button>
          <button
            type="button"
            className={`chat-history-btn${chatMessages.length ? ' has-history' : ''}`}
            aria-label="历史对话"
            onClick={() => setChatHistoryOpen(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>
        </form>
      </section>

      {chatHistoryOpen && (
        <ChatHistoryPage
          messages={chatMessages}
          chatLoading={chatLoading}
          input={input}
          onInputChange={setInput}
          onSend={send}
          onClose={() => setChatHistoryOpen(false)}
          renderAssistantCard={(card) => (
            <AssistantCard
              card={card}
              places={places}
              onSelectPlace={(place) => {
                setChatHistoryOpen(false)
                selectPlace(place)
              }}
            />
          )}
        />
      )}

      {navOpen && (
        <div className="nav-overlay" onClick={() => setNavOpen(false)}>
          <nav className="nav-panel" onClick={(event) => event.stopPropagation()}>
            <div className="nav-panel-header">
              <h3>导航</h3>
              <button type="button" className="nav-close" onClick={() => setNavOpen(false)}>×</button>
            </div>
            <ul>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <li key={key}>
                  <button type="button" onClick={() => openListPage(key)}>
                    <span className="nav-icon">{config.icon}</span>
                    <span>{config.title}</span>
                    <span className="nav-count">{placesByCategory[key].length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}

      {listPage && (
        <div className="page-overlay">
          <div className="page-header">
            <button type="button" className="page-back" onClick={closeListPage}>←</button>
            <h3>{CATEGORY_CONFIG[listPage].title}</h3>
            <div className="page-header-spacer"></div>
          </div>
          <div className="page-body">
            {placesByCategory[listPage].length === 0 ? (
              <p className="empty-state">暂无数据</p>
            ) : (
              <ul className="place-list">
                {placesByCategory[listPage].map((place) => (
                  <li key={place.id}>
                    <button type="button" onClick={() => openDetail(place)}>
                      <strong>{place.name}</strong>
                      <small>{place.address}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {detailPlace && (
        <div className="detail-overlay" onClick={closeDetail}>
          <div className="detail-card" onClick={(event) => event.stopPropagation()}>
            <div className="detail-card-top">
              <div className="card-heading">
                <span>{detailPlace.type}</span>
              </div>
              <div className="detail-card-actions">
                <div className="flower" aria-hidden="true"></div>
                <button type="button" className="detail-close" onClick={closeDetail} aria-label="关闭">×</button>
              </div>
            </div>
            <h2>{detailPlace.title}</h2>
            <InfoLine icon="⌖" label="地址" value={detailPlace.address} />
            {detailPlace.placeType === 'transport' ? (
              <InfoLine icon="◷" label="距酒店驾车" value={detailPlace.drivingDuration || '查询中…'} />
            ) : (
              <>
                {detailPlace.time && <InfoLine icon="◷" label="时间" value={detailPlace.time} />}
                {detailPlace.details && <InfoLine icon="♡" label="推荐" value={detailPlace.details} />}
              </>
            )}
            {detailPlace.description && <div className="description">{detailPlace.description}</div>}
            {detailPlace.coordinates?.length === 2 && (
              <a
                className="nav-btn detail-nav-btn"
                href={buildAmapNavigationUrl(detailPlace)}
                target="_blank"
                rel="noreferrer"
              >
                高德导航
              </a>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function InfoLine({ icon, label, value }) {
  if (!value) return null
  return <div className="info-line">
    <span className="info-icon">{icon}</span>
    <div><small>{label}</small><p>{value}</p></div>
  </div>
}

/** 助手返回的结构化卡片（路程 / 地点列表 / 行程 / 天气）；compact 用于首页紧凑信息卡 */
function AssistantCard({ card, places, onSelectPlace, compact = false }) {
  const wrapClass = compact ? 'assistant-card-compact' : ''

  if (card.card_type === 'route') {
    return (
      <div className={wrapClass}>
        <div className="card-heading">
          <span>{card.mode_label || '路程'}查询</span>
          <div className="flower" aria-hidden="true"></div>
        </div>
        <h2>{card.title}</h2>
        <InfoLine icon="◎" label="起点" value={card.origin_name} />
        <InfoLine icon="◎" label="终点" value={card.destination_name} />
        <InfoLine icon="⌁" label="距离" value={card.distance_text} />
        <InfoLine icon="◷" label="时长" value={card.duration_text} />
      </div>
    )
  }

  if (card.card_type === 'place_list') {
    return (
      <div className={wrapClass}>
        <div className="card-heading">
          <span>推荐列表</span>
          <div className="flower" aria-hidden="true"></div>
        </div>
        <h2>{card.title}</h2>
        {card.subtitle && <p className="assistant-subtitle">{card.subtitle}</p>}
        {card.items?.length ? (
          <ul className="assistant-place-list">
            {card.items.map((item) => {
              const place = places.find((p) => p.id === item.place_id || p.id === item.id)
              return (
                <li key={item.place_id || item.id || item.name}>
                  <button type="button" onClick={() => place && onSelectPlace(place)}>
                    <strong>{item.name}</strong>
                    <small>
                      {[item.duration_text, item.distance_text, item.address].filter(Boolean).join(' · ')}
                    </small>
                    {item.details && <em>{item.details}</em>}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="empty-state">{card.empty_text || '暂无结果'}</p>
        )}
      </div>
    )
  }

  if (card.card_type === 'itinerary') {
    return (
      <div className={wrapClass}>
        <div className="card-heading">
          <span>{card.feasible ? '行程推荐' : '行程提示'}</span>
          <div className="flower" aria-hidden="true"></div>
        </div>
        <h2>{card.title}</h2>
        {card.summary && <p className="assistant-subtitle">{card.summary}</p>}
        {card.assumptions?.map((text) => (
          <p key={text} className="assistant-assumption">※ {text}</p>
        ))}
        {card.suggestion && !card.feasible && (
          <div className="description">{card.suggestion}</div>
        )}
        {card.days?.length ? (
          card.days.map((day) => (
            <div key={day.day} className="itinerary-day">
              <h3>{day.title}</h3>
              {day.note && <p className="assistant-subtitle">{day.note}</p>}
              <ol className="itinerary-steps">
                {day.steps.map((item, index) => (
                  <li key={`${day.day}-${index}`}>
                    <time>{item.time}</time>
                    <span>{item.label}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))
        ) : (
          <ol className="itinerary-steps">
            {(card.steps || []).map((item, index) => (
              <li key={index}>
                <time>{item.time}</time>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  }

  if (card.card_type === 'weather') {
    return (
      <div className={wrapClass}>
        <div className="card-heading">
          <span>天气参考</span>
          <div className="flower" aria-hidden="true"></div>
        </div>
        <h2>{card.title}</h2>
        <p className={`weather-source ${card.source_type === 'climate_reference' ? 'is-climate' : ''}`}>
          {card.source_label}
        </p>
        <InfoLine icon="◷" label="日期" value={card.date} />
        <InfoLine icon="☼" label="白天" value={`${card.dayweather} ${card.daytemp}℃`} />
        <InfoLine icon="☾" label="夜间" value={`${card.nightweather} ${card.nighttemp}℃`} />
        {card.wind && <InfoLine icon="≈" label="风力" value={card.wind} />}
        {card.note && card.source_type === 'climate_reference' && (
          <div className="description">{card.note}</div>
        )}
        {card.tips?.length > 0 && (
          <ul className="weather-tips">
            {card.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return null
}

createRoot(document.getElementById('root')).render(<App />)
