import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WeddingMap from './components/WeddingMap'
import { buildAmapNavigationUrl, loadCozePlaces, loadDrivingDuration } from './data/poiProvider'
import { attractionList, defaultHotel, itinerary, mapPlaces, transportHubs, weddingVenue } from './data/places'
import './style.css'

const CATEGORY_CONFIG = {
  attraction: { title: '推荐景点', icon: '⌁' },
  restaurant: { title: '推荐餐厅', icon: '♨' },
  hotel: { title: '入住酒店', icon: '⌂' },
}

function App() {
  const [card, setCard] = useState(weddingVenue)
  const [places, setPlaces] = useState(mapPlaces)
  const [placesStatus, setPlacesStatus] = useState('loading')
  const [input, setInput] = useState('利川一日游推荐')
  const [loading, setLoading] = useState(false)
  const [focusPlaceId, setFocusPlaceId] = useState(weddingVenue.id)
  const [showQuickPicks, setShowQuickPicks] = useState(true)
  const [navOpen, setNavOpen] = useState(false)
  const [listPage, setListPage] = useState(null)
  const [detailPlace, setDetailPlace] = useState(null)
  const pageEnd = useRef(null)
  const mapRef = useRef(null)

  const hideQuickPicks = () => setShowQuickPicks(false)

  const placesByCategory = useMemo(() => {
    const grouped = { attraction: [], restaurant: [], hotel: [] }
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

  const send = () => {
    if (!input.trim() || loading) return
    setLoading(true)
    setInput('')
    setTimeout(() => {
      setLoading(false)
      setCard(itinerary)
    }, 1000)
  }

  useEffect(() => {
    pageEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [loading, card])

  return (
    <main className="page-shell">
      <section className="app">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="nav-toggle"
              type="button"
              aria-label="打开分类导航"
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
        </section>

        <section className={`info-card ${loading ? 'is-loading' : ''}`}>
          {loading ? (
            <div className="loading-state"><span></span><span></span><span></span><p>正在查询…</p></div>
          ) : (
            <>
              <div className="card-heading">
                <span>{card.type}</span>
                <div className="flower">✿</div>
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
            </>
          )}
        </section>

        {showQuickPicks && (
          <section className="quick-picks" aria-label="推荐旅游地点">
            {attractionList.map((place) => (
              <button key={place.id} onClick={() => selectPlace(place, { hidePicks: true })}>
                <span>⌁</span>{place.name}
              </button>
            ))}
          </section>
        )}

        <form className="chat-bar" onSubmit={(event) => { event.preventDefault(); send() }}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="问问利川的好风景…"
            aria-label="输入旅游问题"
          />
          <button type="submit" aria-label="发送">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 3.3 13.9 20c-.3.7-1.3.7-1.6 0l-2.1-5.3-5.3-2.1c-.7-.3-.7-1.3 0-1.6L20.7 2c.6-.3 1 .6.7 1.3Z" /><path d="m10.1 14.6 4.7-4.7" /></svg>
          </button>
        </form>
        <div ref={pageEnd}></div>
      </section>

      {navOpen && (
        <div className="nav-overlay" onClick={() => setNavOpen(false)}>
          <nav className="nav-panel" onClick={(event) => event.stopPropagation()}>
            <div className="nav-panel-header">
              <h3>分类导航</h3>
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
            <button type="button" className="detail-close" onClick={closeDetail}>×</button>
            <div className="card-heading">
              <span>{detailPlace.type}</span>
              <div className="flower">✿</div>
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
  return <div className="info-line">
    <span className="info-icon">{icon}</span>
    <div><small>{label}</small><p>{value}</p></div>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
