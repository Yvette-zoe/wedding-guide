import React, { useEffect, useRef } from 'react'

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

  useEffect(() => {
    const thread = threadRef.current
    if (!thread) return
    thread.scrollTop = thread.scrollHeight
  }, [messages, chatLoading])

  return (
    <div className="page-overlay chat-history-page">
      <div className="page-header chat-history-header">
        <button type="button" className="page-back" onClick={onClose} aria-label="返回首页">
          ←
        </button>
        <h3>婚礼助手</h3>
        <div className="page-header-spacer"></div>
      </div>

      <div className="chat-history-main">
        <div className="chat-history-watermark" aria-hidden="true"></div>
        <div className="chat-history-body" ref={threadRef}>
          {messages.length === 0 && !chatLoading ? (
            <p className="chat-empty">向婚礼助手提问，对话记录将显示在这里</p>
          ) : (
            messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="chat-history-item">
                <div className={`chat-bubble is-${message.role}`}>
                  <small>{message.role === 'user' ? '我' : '婚礼助手'}</small>
                  <p>{message.content}</p>
                </div>
                {message.card && renderAssistantCard && (
                  <div className="chat-history-card">
                    {renderAssistantCard(message.card)}
                  </div>
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
