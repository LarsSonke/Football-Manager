import { useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { api } from '../../api/client'
import { posClass, getBadgeColor, ovrColor } from '../../utils/helpers'
import { PlayerPhoto } from '../../components/PlayerPhoto'
import { useIsMobile } from './types'
import type { ClubData, LeagueData, SquadPlayer, MessageData, InboxEntry, LeagueChatMessage } from './types'

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
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : '260px 1fr',
      gap: 0,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      minHeight: 500,
      overflow: 'hidden',
    }}>
      {/* Left sidebar – conversation list */}
      {(!isMobile || (!selectedUserId && view !== 'league')) && (
        <div style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
            Inbox
          </div>
          {/* League Chat entry */}
          <div
            onClick={() => { setView('league'); setSelectedUserId(null) }}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
              background: view === 'league' ? 'rgba(229,32,47,0.08)' : 'transparent',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(244,241,234,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              💬
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>League Chat</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Everyone can see this</div>
            </div>
          </div>
          {otherHumanClubs.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No other human clubs yet.</div>
          )}
          {otherHumanClubs.map(club => {
            const entry = inbox.find(e => e.user?.id === club.user?.id)
            const last = entry?.lastMessage
            const isSelected = selectedUserId === club.user?.id
            return (
              <div
                key={club.id}
                onClick={() => { if (club.user) { setView('dm'); loadThread(club.user.id) } }}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: getBadgeColor(club.name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 900, color: '#000',
                }}>
                  {club.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {view === 'league' ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>League Chat</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{league.name} · visible to everyone</div>
                </div>
                {isMobile && (
                  <button onClick={() => setView('dm')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 20 }}>←</button>
                )}
              </div>
              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leagueChat.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '40px 0' }}>Be the first to say something!</div>
                )}
                {leagueChat.map(msg => {
                  const isMe = msg.fromUserId === currentUserId
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>
                        {msg.fromUser.username} · {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{
                        maxWidth: '75%', padding: '8px 12px',
                        background: isMe ? 'rgba(229,32,47,0.1)' : 'var(--steel)',
                        border: `2px solid ${isMe ? 'rgba(229,32,47,0.4)' : 'rgba(244,241,234,0.1)'}`,
                        borderRadius: 0,
                        fontSize: 13, color: 'var(--text-1)',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  )
                })}
                <div ref={leagueChatEndRef} />
              </div>
              {/* Input */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <input
                  value={leagueChatText}
                  onChange={e => setLeagueChatText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendLeague() } }}
                  placeholder="Message everyone..."
                  style={{ flex: 1, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-1)', fontSize: 13, outline: 'none' }}
                />
                <button className="btn btn-green" style={{ flexShrink: 0 }} onClick={handleSendLeague} disabled={sendingLeague || !leagueChatText.trim()}>
                  Send
                </button>
              </div>
            </div>
          ) : !selectedUserId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 14 }}>
              Select a conversation to start messaging
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                {isMobile && (
                  <button onClick={() => setSelectedUserId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 18, padding: 0, marginRight: 4 }}>←</button>
                )}
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: getBadgeColor(selectedInboxEntry?.clubName ?? ''), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, color: '#000', flexShrink: 0 }}>
                  {(selectedInboxEntry?.clubName ?? '??').split(' ').map(w => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{selectedInboxEntry?.clubName ?? ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{selectedInboxEntry?.user?.username ?? ''}</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200, maxHeight: 420 }}>
                {thread.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, margin: 'auto' }}>No messages yet. Say hello!</div>
                )}
                {thread.map(msg => {
                  const isMine = msg.fromUserId === currentUserId
                  if (msg.type === 'TRANSFER_OFFER') {
                    const found = findInstance(league, msg.instanceId)
                    const statusColor = msg.offerStatus === 'ACCEPTED' ? 'var(--green)' : msg.offerStatus === 'REJECTED' ? 'var(--red)' : 'var(--gold)'
                    const statusLabel = msg.offerStatus === 'ACCEPTED' ? 'Accepted' : msg.offerStatus === 'REJECTED' ? 'Rejected' : 'Pending'
                    return (
                      <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                        <div style={{ background: 'var(--bg-base)', border: `1px solid var(--border)`, borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>Transfer Offer</span>
                            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: statusColor, background: `${statusColor}22`, padding: '1px 6px', borderRadius: 4 }}>{statusLabel}</span>
                          </div>
                          {found ? (
                            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                              <PlayerPhoto url={found.player.player.photoUrl} name={found.player.player.name} size={32} style={{ borderRadius: '50%' }} />
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{found.player.player.name}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span className={posClass(found.player.player.position)} style={{ fontSize: 9 }}>{found.player.player.position}</span>
                                  <span style={{ fontSize: 11, color: ovrColor(found.player.player.overall), fontFamily: 'var(--font-display)', fontWeight: 800 }}>{found.player.player.overall}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{found.clubName}</span>
                                </div>
                              </div>
                              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{fmtPrice(msg.offerPrice ?? 0)}</div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ padding: '8px 12px', color: 'var(--text-3)', fontSize: 12 }}>Player no longer available</div>
                          )}
                          {msg.offerStatus === 'PENDING' && !isMine && (
                            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                              <button className="btn btn-green" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => handleAccept(msg.id)}>Accept</button>
                              <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)', color: '#fff' }} onClick={() => handleReject(msg.id)}>Reject</button>
                            </div>
                          )}
                          {msg.offerStatus === 'PENDING' && isMine && (
                            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)' }}>Awaiting response…</div>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, textAlign: isMine ? 'right' : 'left' }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    )
                  }
                  // TEXT message
                  return (
                    <div key={msg.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                      {!isMine && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{msg.fromUser.username}</div>}
                      <div style={{
                        background: isMine ? 'var(--green)' : 'var(--bg-base)',
                        border: isMine ? 'none' : '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        padding: '8px 12px',
                        fontSize: 13,
                        color: isMine ? '#000' : 'var(--text-1)',
                      }}>{msg.text}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, textAlign: isMine ? 'right' : 'left' }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Offer picker */}
              {showOfferPicker && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-base)', padding: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-2)', marginBottom: 8 }}>Select a player to offer</div>
                  {/* Sell: your squad */}
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Offer to sell (your squad)</div>
                  <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 10 }}>
                    {myClub.squad.map(p => (
                      <div key={p.id} onClick={() => { setOfferFor({ player: p, club: myClub }); setOfferPrice(String(p.player.baseValue)) }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                        borderRadius: 6, cursor: 'pointer',
                        background: offerFor?.player.id === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                      }}>
                        <PlayerPhoto url={p.player.photoUrl} name={p.player.name} size={24} style={{ borderRadius: '50%' }} />
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name}</span>
                        <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                        <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 800, color: ovrColor(p.player.overall) }}>{p.player.overall}</span>
                      </div>
                    ))}
                  </div>
                  {/* Buy: their squad */}
                  {(() => {
                    const otherClub = league.clubs.find(c => c.user?.id === selectedUserId)
                    if (!otherClub) return null
                    return (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Offer to buy ({otherClub.name})</div>
                        <div style={{ maxHeight: 150, overflowY: 'auto', marginBottom: 10 }}>
                          {otherClub.squad.map(p => (
                            <div key={p.id} onClick={() => { setOfferFor({ player: p, club: otherClub }); setOfferPrice(String(p.player.baseValue)) }} style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                              borderRadius: 6, cursor: 'pointer',
                              background: offerFor?.player.id === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                            }}>
                              <PlayerPhoto url={p.player.photoUrl} name={p.player.name} size={24} style={{ borderRadius: '50%' }} />
                              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.player.name}</span>
                              <span className={posClass(p.player.position)} style={{ fontSize: 9 }}>{p.player.position}</span>
                              <span style={{ fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 800, color: ovrColor(p.player.overall) }}>{p.player.overall}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                  {offerFor && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{offerFor.player.player.name}</span>
                      <input
                        type="number"
                        value={offerPrice}
                        onChange={e => setOfferPrice(e.target.value)}
                        style={{ width: 100, padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13 }}
                        placeholder="Price"
                      />
                      <button className="btn btn-green" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setShowOfferPicker(false)}>
                        Done
                      </button>
                      <button onClick={() => { setOfferFor(null); setOfferPrice(''); setShowOfferPicker(false) }} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  )}
                </div>
              )}

              {/* Pending offer preview */}
              {offerFor && !showOfferPicker && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-2)' }}>Offer:</span>
                  <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{offerFor.player.player.name}</span>
                  <span style={{ color: 'var(--text-3)' }}>for</span>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmtPrice(parseInt(offerPrice, 10) || 0)}</span>
                  <button onClick={() => { setOfferFor(null); setOfferPrice('') }} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14 }}>✕</button>
                </div>
              )}

              {/* Input area */}
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setShowOfferPicker(v => !v)}
                  title="Transfer offer"
                  style={{ background: showOfferPicker ? 'rgba(255,255,255,0.08)' : 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-2)', fontSize: 16, padding: '5px 10px', flexShrink: 0 }}
                >
                  ⇄
                </button>
                <input
                  type="text"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Type a message…"
                  style={{ flex: 1, padding: '7px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13 }}
                />
                <button className="btn btn-green" style={{ fontSize: 13, padding: '7px 16px', flexShrink: 0 }} onClick={handleSend} disabled={sending || (!text.trim() && !offerFor)}>
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
