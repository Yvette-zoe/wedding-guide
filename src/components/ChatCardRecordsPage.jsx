import React, { useEffect, useMemo, useRef } from 'react'

/** 从对话消息中提取带卡片的查询记录 */
export function extractCardRecords(messages = []) {
  const records = []
  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || !message.card) return
    const userQuestion = messages[index - 1]?.role === 'user' ? messages[index - 1].content : ''
    records.push({
      id: index,
      userQuestion,
      card: message.card,
    })
  })
  return records
}

function getCardTypeLabel(card) {
  if (card.card_type === 'route') return card.mode_label ? `${card.mode_label}查询` : '路程查询'
  if (card.card_type === 'place_list') return '推荐列表'
  if (card.card_type === 'itinerary') return card.feasible ? '行程推荐' : '行程提示'
  if (card.card_type === 'weather') return '天气参考'
  return '查询结果'
}

/** 对话气泡内跳转按钮文案 */
export function getCardLinkLabel(card) {
  if (card.card_type === 'route') return '查看路程详情 →'
  if (card.card_type === 'place_list') return '查看推荐详情 →'
  if (card.card_type === 'itinerary') return '查看行程详情 →'
  if (card.card_type === 'weather') return '查看天气详情 →'
  return '查看查询详情 →'
}

/** 去掉正文中已过时的「见下方卡片」类引导语 */
export function stripCardRedirectText(content) {
  if (!content) return content
  return content
    .replace(/\n*详细分日安排见下方行程卡。?\n*/g, '\n')
    .replace(/\n*见下方(?:行程|查询)?卡。?\n*/g, '\n')
    .replace(/\n*详情见查询记录。?\n*/g, '\n')
    .trim()
}

/** 查询卡片记录：滚动浏览完整卡片详情 */
export default function ChatCardRecordsPage({
  messages,
  onBack,
  renderAssistantCard,
  focusRecordId = null,
}) {
  const records = useMemo(() => extractCardRecords(messages), [messages])
  const bodyRef = useRef(null)

  useEffect(() => {
    if (focusRecordId == null || !bodyRef.current) return
    const target = bodyRef.current.querySelector(`[data-record-id="${focusRecordId}"]`)
    if (!target) return
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [focusRecordId, records])

  return (
    <div className="page-overlay chat-history-page">
      <div className="page-header chat-history-header">
        <button type="button" className="page-back" onClick={onBack} aria-label="返回对话">
          ←
        </button>
        <h3>查询记录</h3>
        <div className="page-header-spacer"></div>
      </div>
      <div className="page-body chat-card-records-body" ref={bodyRef}>
        {records.length === 0 ? (
          <p className="empty-state">暂无查询记录，向婚礼助手提问后会保存在这里</p>
        ) : (
          <div className="chat-card-records-feed">
            {records.map((record) => (
              <article key={record.id} className="chat-card-record-item" data-record-id={record.id}>                <div className="chat-card-record-meta">
                  <span className="chat-card-record-type">{getCardTypeLabel(record.card)}</span>
                  {record.userQuestion && (
                    <p className="chat-card-record-question">{record.userQuestion}</p>
                  )}
                </div>
                <div className="chat-card-record-card">
                  {renderAssistantCard?.(record.card)}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
