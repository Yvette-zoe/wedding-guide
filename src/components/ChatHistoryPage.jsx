import React, { useEffect, useMemo, useRef, useState } from 'react'
import ChatCardRecordsPage, {
  extractCardRecords,
  getCardLinkLabel,
  stripCardRedirectText,
} from './ChatCardRecordsPage'

/** 无对话记录时，助手首条引导气泡 */
const WELCOME_MESSAGE = `你好，我是婚礼助手，可以帮你查这些信息：

· 路程与时长：酒店到利川站、景点之间怎么走、要多久
· 推荐地点：周边景点、餐厅、酒店与交通枢纽
· 行程规划：半日游、一日游、两日游怎么安排
· 天气参考：婚礼当天或指定日期的天气与穿衣建议
· 婚宴信息：仪式与宴席时间、场地地址与导航

直接在下方输入问题即可，例如「酒店到利川站多远？」`

/** 婚礼助手对话页：顶部标题、中部对话、底部输入发送 */
export default function ChatHistoryPage({
  messages,
  chatLoading,
  input,
  onInputChange,
  onSend,
  onClose,
  renderAssistantCard,
}) {
  const threadRef = useRef(null)
  const [view, setView] = useState('chat')
  const [recordsFocusId, setRecordsFocusId] = useState(null)
  const cardRecordCount = useMemo(() => extractCardRecords(messages).length, [messages])

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTop = thread.scrollHeight
  }, [messages, chatLoading])

  const handleClose = () => {
    setView('chat')
    setRecordsFocusId(null)
    onClose?.()
  }

  const openRecords = (focusId = null) => {
    setRecordsFocusId(focusId)
    setView('records')
  }

  if (view === 'records') {
    return (
      <ChatCardRecordsPage
        messages={messages}
        focusRecordId={recordsFocusId}
        onBack={() => {
          setRecordsFocusId(null)
          setView('chat')
        }}
        renderAssistantCard={renderAssistantCard}
      />
    )
  }

  return (
    <div className="page-overlay chat-history-page">
      <div className="page-header chat-history-header">
        <button type="button" className="page-back" onClick={handleClose} aria-label="返回首页">
          ←
        </button>
        <h3>婚礼助手</h3>
        <button
          type="button"
          className={`page-header-action${cardRecordCount ? ' has-records' : ''}`}
          aria-label="查询记录"
          onClick={() => openRecords()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M8 9h8M8 13h5" />
          </svg>
        </button>
      </div>

      <div className="chat-history-main">
        <div className="chat-history-watermark" aria-hidden="true"></div>
        <div className="chat-history-body" ref={threadRef}>
          {messages.length === 0 && !chatLoading ? (
            <div className="chat-history-item">
              <div className="chat-bubble is-assistant">
                <small>婚礼助手</small>
                <p className="chat-welcome">{WELCOME_MESSAGE}</p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="chat-history-item">
                <div className={`chat-bubble is-${message.role}`}>
                  <small>{message.role === 'user' ? '我' : '婚礼助手'}</small>
                  <p>
                    {message.role === 'assistant' && message.card
                      ? stripCardRedirectText(message.content)
                      : message.content}
                  </p>
                </div>
                {message.role === 'assistant' && message.card && (
                  <button
                    type="button"
                    className="chat-card-link"
                    onClick={() => openRecords(index)}
                  >
                    {getCardLinkLabel(message.card)}
                  </button>
                )}
              </div>
            ))
          )}

          {chatLoading && (
            <div className="chat-history-item">
              <div className="chat-bubble is-assistant is-pending">
                <small>婚礼助手</small>
                <p>正在思考中…</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        className="chat-bar chat-history-bar"
        onSubmit={(event) => {
          event.preventDefault()
          onSend?.()
        }}
      >
        <input
          value={input}
          onChange={(event) => onInputChange?.(event.target.value)}
          placeholder="例如：酒店到利川站多远？步行半小时有什么好吃的？"
          aria-label="输入旅游问题"
          disabled={chatLoading}
        />
        <button
          type="submit"
          className="chat-send-btn"
          aria-label="发送"
          disabled={chatLoading || !input.trim()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21.4 3.3 13.9 20c-.3.7-1.3.7-1.6 0l-2.1-5.3-5.3-2.1c-.7-.3-.7-1.3 0-1.6L20.7 2c.6-.3 1 .6.7 1.3Z" />
            <path d="m10.1 14.6 4.7-4.7" />
          </svg>
        </button>
      </form>
    </div>
  )
}
