import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WeddingMap from './components/WeddingMap'
import { buildAmapNavigationUrl } from './data/poiProvider'
import { attractionList, itinerary, weddingVenue } from './data/places'
import './style.css'

function App() {
  const [card, setCard] = useState(weddingVenue)
  const [input, setInput] = useState('利川一日游推荐')
  const [loading, setLoading] = useState(false)
  const [focusPlaceId, setFocusPlaceId] = useState(weddingVenue.id)
  const [showQuickPicks, setShowQuickPicks] = useState(true)
  const pageEnd = useRef(null)
  const mapRef = useRef(null)

  const hideQuickPicks = () => setShowQuickPicks(false)

  const selectPlace = (place, { focus = true, hidePicks = false } = {}) => {
    setLoading(false)
    setCard(place)
    if (hidePicks || place?.placeType === 'attraction') {
      hideQuickPicks()
    }
    if (focus && place?.coordinates) {
      setFocusPlaceId(place.id)
      mapRef.current?.focusPlace?.(place)
    }
  }

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
          <div>
            <p className="eyebrow">WELCOME TO OUR WEDDING</p>
            <h1>婚礼指南</h1>
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
            <small>点击地点查看详情</small>
          </div>
          <WeddingMap
            ref={mapRef}
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
              <InfoLine icon="◷" label="时间" value={card.time} />
              <InfoLine icon="♡" label="推荐" value={card.details} />
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
