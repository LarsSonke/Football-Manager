import { useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { api } from '../../api/client'
import { posClass, getBadgeColor, ovrColor } from '../../utils/helpers'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import { useIsMobile } from './types'
import type { ClubData, LeagueData, SquadPlayer, MessageData, InboxEntry, LeagueChatMessage } from './types'
import styles from './Messages.module.css'

function findInstance(league: LeagueData, instanceId: string | null): { player: SquadPlayer; clubName: string } | null {
  if (!instanceId) return null
  for (const club of league.clubs) {
    const player = club.squad.find(p => p.id === instanceId)
    if (player) return { player, clubName: club.name }
  }
  return null
}

export default function Messages({ leagueId, myClub, league, currentUserId, onRefresh }: {
  leagueId: string
  myClub: ClubData
  league: LeagueData
  currentUserId: string
  onRefresh: () => void
}) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [thread, setThread] = useState<MessageData[]>([])
  const [inbox, setInbox] = useState<InboxEntry[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [offerFor, setOfferFor] = useState<{ player: SquadPlayer; club: ClubData } | null>(null)
  const [offerPrice, setOfferPrice] = useState('')
  const [showOfferPicker, setShowOfferPicker] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [view, setView] = useState<'dm' | 'league'>('league')
  const [leagueChat, setLeagueChat] = useState<LeagueChatMessage[]>([])
  const [leagueChatText, setLeagueChatText] = useState('')
  const [sendingLeague, setSendingLeague] = useState(false)
  const leagueChatEndRef = useRef<HTMLDivElement>(null)

  const loadInbox = useCallback(() => {
    api.get(`/leagues/${leagueId}/messages`).then(r => setInbox(r.data)).catch(() => {})
  }, [leagueId])

  const loadThread = useCallback((userId: string) => {
    api.get(`/leagues/${leagueId}/messages/${userId}`).then(r => {
      setThread(r.data)
      setSelectedUserId(userId)
    }).catch(() => {})
  }, [leagueId])

  const loadLeagueChat = useCallback(() => {
    api.get(`/leagues/${leagueId}/league-chat`).then(r => setLeagueChat(r.data)).catch(() => {})
  }, [leagueId])

  useEffect(() => { loadInbox() }, [loadInbox])
  useEffect(() => { loadLeagueChat() }, [loadLeagueChat])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread])

  useEffect(() => {
    leagueChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [leagueChat])

  useEffect(() => {
    const sock = io()
    sock.emit('join:user', currentUserId)
    sock.emit('join:league', leagueId)
    sock.on('dm:message', (msg: MessageData) => {
      if (
        selectedUserId === msg.fromUserId ||
        selectedUserId === msg.toUserId
      ) {
        setThread(prev => {
          const idx = prev.findIndex(m => m.id === msg.id)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = msg
            return next
          }
          return [...prev, msg]
        })
      }
      loadInbox()
    })
    sock.on('league:message', (msg: LeagueChatMessage) => {
      if (msg.leagueId === leagueId) {
        setLeagueChat(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      }
    })
    return () => { sock.disconnect() }
  }, [currentUserId, selectedUserId, loadInbox, leagueId])

  async function handleSend() {
    if (!selectedUserId) return
    const hasText = text.trim().length > 0
    const hasOffer = offerFor != null && offerPrice.trim().length > 0
    if (!hasText && !hasOffer) return
    setSending(true)
    try {
      const body: Record<string, unknown> = {}
      if (hasText) body.text = text.trim()
      if (hasOffer) {
        body.instanceId = offerFor!.player.id
        body.offerPrice = parseInt(offerPrice, 10)
      }
      const r = await api.post(`/leagues/${leagueId}/messages/${selectedUserId}`, body)
      setThread(prev => [...prev, r.data])
      setText('')
      setOfferFor(null)
      setOfferPrice('')
      setShowOfferPicker(false)
      loadInbox()
    } catch { /* ignore */ }
    finally { setSending(false) }
  }

  async function handleAccept(messageId: string) {
    try {
      await api.post(`/leagues/${leagueId}/messages/${messageId}/accept`)
      if (selectedUserId) loadThread(selectedUserId)
      onRefresh()
    } catch { /* ignore */ }
  }

  async function handleReject(messageId: string) {
    try {
      await api.post(`/leagues/${leagueId}/messages/${messageId}/reject`)
      if (selectedUserId) loadThread(selectedUserId)
    } catch { /* ignore */ }
  }

  async function handleSendLeague() {
    if (!leagueChatText.trim()) return
    setSendingLeague(true)
    try {
      const r = await api.post(`/leagues/${leagueId}/league-chat`, { text: leagueChatText.trim() })
      setLeagueChat(prev => [...prev, r.data])
      setLeagueChatText('')
    } catch { /* ignore */ }
    finally { setSendingLeague(false) }
  }

  const otherHumanClubs = league.clubs.filter(c => !c.isAI && c.id !== myClub.id)
  const fmtPrice = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : `${n}`
  const selectedInboxEntry = inbox.find(e => e.user?.id === selectedUserId)

  return (
    <div className={styles.root}>
      {/* Left sidebar – conversation list */}
      {(!isMobile || (!selectedUserId && view !== 'league')) && (
        <div className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Inbox</div>
          {/* League Chat entry */}
          <div
            onClick={() => { setView('league'); setSelectedUserId(null) }}
            className={view === 'league' ? styles.convItemLeagueActive : styles.convItemLeague}
          >
            <div className={styles.convAvatar}>💬</div>
            <div className={styles.convInfo}>
              <div className={styles.convName}>League Chat</div>
              <div className={styles.convSub}>Everyone can see this</div>
            </div>
          </div>
          {otherHumanClubs.length === 0 && (
            <div className={styles.noClubs}>No other human clubs yet.</div>
          )}
          {otherHumanClubs.map(club => {
            const entry = inbox.find(e => e.user?.id === club.user?.id)
            const last = entry?.lastMessage
            const isSelected = selectedUserId === club.user?.id
            return (
              <div
                key={club.id}
                onClick={() => { if (club.user) { setView('dm'); loadThread(club.user.id) } }}
                className={isSelected ? styles.convItemActive : styles.convItem}
              >
                <div className={styles.convBadge} style={{ background: getBadgeColor(club.name) }}>
                  {club.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div className={styles.convInfo}>
                  <div className={styles.convName}>{club.name}</div>
                  <div className={styles.convSub}>
                    {last
                      ? last.type === 'TRANSFER_OFFER'
                        ? `Transfer offer · ${fmtPrice(last.offerPrice ?? 0)}`
                        : (last.text ?? '')
                      : 'No messages yet'
                    }
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Right panel – thread or league chat */}
      {(!isMobile || selectedUserId || view === 'league') && (
        <div className={styles.panel}>
          {view === 'league' ? (
            <div className={styles.chat}>
              {/* Header */}
              <div className={styles.chatHeader}>
                <span className={styles.chatHeaderIcon}>💬</span>
                <div>
                  <div className={styles.chatHeaderTitle}>League Chat</div>
                  <div className={styles.chatHeaderSub}>{league.name} · visible to everyone</div>
                </div>
                {isMobile && (
                  <button className={styles.backBtn} onClick={() => setView('dm')}>←</button>
                )}
              </div>
              {/* Messages */}
              <div className={styles.messagesFeed}>
                {leagueChat.length === 0 && (
                  <div className={styles.feedEmpty}>Be the first to say something!</div>
                )}
                {leagueChat.map(msg => {
                  const isMe = msg.fromUserId === currentUserId
                  return (
                    <div key={msg.id} className={isMe ? styles.bubbleWrapMe : styles.bubbleWrapThem}>
                      <div className={styles.bubbleMeta}>
                        {msg.fromUser.username} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className={isMe ? styles.bubbleLeagueMe : styles.bubbleLeagueThem}>
                        {msg.text}
                      </div>
                    </div>
                  )
                })}
                <div ref={leagueChatEndRef} />
              </div>
              {/* Input */}
              <div className={styles.inputAreaLeague}>
                <input
                  value={leagueChatText}
                  onChange={e => setLeagueChatText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendLeague() } }}
                  placeholder="Message everyone..."
                  className={styles.msgInputLeague}
                />
                <button className={`btn btn-green ${styles.sendBtnLeague}`} onClick={handleSendLeague} disabled={sendingLeague || !leagueChatText.trim()}>
                  Send
                </button>
              </div>
            </div>
          ) : !selectedUserId ? (
            <div className={styles.panelEmpty}>
              Select a conversation to start messaging
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className={styles.threadHeader}>
                {isMobile && (
                  <button className={styles.threadBackBtn} onClick={() => setSelectedUserId(null)}>←</button>
                )}
                <div className={styles.threadBadge} style={{ background: getBadgeColor(selectedInboxEntry?.clubName ?? '') }}>
                  {(selectedInboxEntry?.clubName ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className={styles.threadHeaderName}>{selectedInboxEntry?.clubName ?? ''}</div>
                  <div className={styles.threadHeaderUser}>{selectedInboxEntry?.user?.username ?? ''}</div>
                </div>
              </div>

              {/* Messages */}
              <div className={styles.threadFeed}>
                {thread.length === 0 && (
                  <div className={styles.feedEmptyDm}>No messages yet. Say hello!</div>
                )}
                {thread.map(msg => {
                  const isMine = msg.fromUserId === currentUserId
                  if (msg.type === 'TRANSFER_OFFER') {
                    const found = findInstance(league, msg.instanceId)
                    const statusColor = msg.offerStatus === 'ACCEPTED' ? 'var(--green)' : msg.offerStatus === 'REJECTED' ? 'var(--red)' : 'var(--gold)'
                    const statusLabel = msg.offerStatus === 'ACCEPTED' ? 'Accepted' : msg.offerStatus === 'REJECTED' ? 'Rejected' : 'Pending'
                    return (
                      <div key={msg.id} className={isMine ? styles.offerWrapMe : styles.offerWrapThem}>
                        <div className={styles.offerCard}>
                          <div className={styles.offerCardHeader}>
                            <span className={styles.offerCardLabel}>Transfer Offer</span>
                            <span className={styles.offerStatus} style={{ color: statusColor, background: `${statusColor}22` }}>{statusLabel}</span>
                          </div>
                          {found ? (
                            <div className={styles.offerBody}>
                              <PlayerPhoto url={found.player.player.photoUrl} name={found.player.player.name} size={32} className={styles.offerPlayerAvatar} />
                              <div>
                                <div className={styles.offerPlayerName}>{found.player.player.name}</div>
                                <div className={styles.offerPlayerMeta}>
                                  <span className={posClass(found.player.player.position)} style={{ fontSize: 9 }}>{found.player.player.position}</span>
                                  <span className={styles.offerOvr} style={{ color: ovrColor(found.player.player.overall) }}>{found.player.player.overall}</span>
                                  <span className={styles.offerClub}>{found.clubName}</span>
                                </div>
                              </div>
                              <div className={styles.offerPrice}>
                                <div className={styles.offerPriceValue}>{fmtPrice(msg.offerPrice ?? 0)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className={styles.offerCardUnavailable}>Player no longer available</div>
                          )}
                          {msg.offerStatus === 'PENDING' && !isMine && (
                            <div className={styles.offerActions}>
                              <button className="btn btn-green" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => handleAccept(msg.id)}>Accept</button>
                              <button className={`btn ${styles.offerRejectBtn}`} onClick={() => handleReject(msg.id)}>Reject</button>
                            </div>
                          )}
                          {msg.offerStatus === 'PENDING' && isMine && (
                            <div className={styles.offerPending}>Awaiting response…</div>
                          )}
                        </div>
                        <div className={isMine ? styles.offerTimeMe : styles.offerTimeThem}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )
                  }
                  // TEXT message
                  return (
                    <div key={msg.id} className={isMine ? styles.dmMsgWrapMe : styles.dmMsgWrapThem}>
                      {!isMine && <div className={styles.bubbleSenderName}>{msg.fromUser.username}</div>}
                      <div className={isMine ? styles.bubbleDmMe : styles.bubbleDmThem}>{msg.text}</div>
                      <div className={isMine ? styles.bubbleTimeMe : styles.bubbleTimeThem}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Offer picker */}
              {showOfferPicker && (
                <div className={styles.offerPicker}>
                  <div className={styles.offerPickerTitle}>Select a player to offer</div>
                  {/* Sell: your squad */}
                  <div className={styles.offerPickerSectionLabel}>Offer to sell (your squad)</div>
                  <div className={styles.offerPickerList}>
                    {myClub.squad.map(p => (
                      <div key={p.id} onClick={() => { setOfferFor({ player: p, club: myClub }); setOfferPrice(String(p.player.baseValue)) }}
                        className={offerFor?.player.id === p.id ? styles.offerPickerRowActive : styles.offerPickerRow}>
                        <PlayerPhoto url={p.player.photoUrl} name={p.player.name} size={24} className={styles.offerPickerAvatar} />
                        <span className={styles.offerPickerName}>{p.player.name}</span>
                        <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                        <span className={styles.offerPickerOvr} style={{ color: ovrColor(p.player.overall) }}>{p.player.overall}</span>
                      </div>
                    ))}
                  </div>
                  {/* Buy: their squad */}
                  {(() => {
                    const otherClub = league.clubs.find(c => c.user?.id === selectedUserId)
                    if (!otherClub) return null
                    return (
                      <>
                        <div className={styles.offerPickerSectionLabel}>Offer to buy ({otherClub.name})</div>
                        <div className={styles.offerPickerList}>
                          {otherClub.squad.map(p => (
                            <div key={p.id} onClick={() => { setOfferFor({ player: p, club: otherClub }); setOfferPrice(String(p.player.baseValue)) }}
                              className={offerFor?.player.id === p.id ? styles.offerPickerRowActive : styles.offerPickerRow}>
                              <PlayerPhoto url={p.player.photoUrl} name={p.player.name} size={24} className={styles.offerPickerAvatar} />
                              <span className={styles.offerPickerName}>{p.player.name}</span>
                              <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                              <span className={styles.offerPickerOvr} style={{ color: ovrColor(p.player.overall) }}>{p.player.overall}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                  {offerFor && (
                    <div className={styles.offerConfirmRow}>
                      <span className={styles.offerConfirmName}>{offerFor.player.player.name}</span>
                      <input
                        type="number"
                        value={offerPrice}
                        onChange={e => setOfferPrice(e.target.value)}
                        className={styles.offerConfirmInput}
                        placeholder="Price"
                      />
                      <button className={`btn btn-green ${styles.offerConfirmDone}`} onClick={() => setShowOfferPicker(false)}>
                        Done
                      </button>
                      <button className={styles.offerConfirmClear} onClick={() => { setOfferFor(null); setOfferPrice(''); setShowOfferPicker(false) }}>✕</button>
                    </div>
                  )}
                </div>
              )}

              {/* Pending offer preview */}
              {offerFor && !showOfferPicker && (
                <div className={styles.offerPreview}>
                  <span className={styles.offerPreviewLabel}>Offer:</span>
                  <span className={styles.offerPreviewName}>{offerFor.player.player.name}</span>
                  <span className={styles.offerPreviewFor}>for</span>
                  <span className={styles.offerPreviewPrice}>{fmtPrice(parseInt(offerPrice, 10) || 0)}</span>
                  <button className={styles.offerPreviewClear} onClick={() => { setOfferFor(null); setOfferPrice('') }}>✕</button>
                </div>
              )}

              {/* Input area */}
              <div className={styles.inputArea}>
                <button
                  onClick={() => setShowOfferPicker(v => !v)}
                  title="Transfer offer"
                  className={showOfferPicker ? styles.offerToggleBtnActive : styles.offerToggleBtn}
                >
                  ⇄
                </button>
                <input
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Type a message…"
                  className={styles.msgInput}
                />
                <button className={`btn btn-green ${styles.sendBtn}`} onClick={handleSend} disabled={sending || (!text.trim() && !offerFor)}>
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
