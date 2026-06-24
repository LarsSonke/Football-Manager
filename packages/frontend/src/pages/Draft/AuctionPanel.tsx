import type { AuctionRound, AvailablePlayer, ClubInfo, DraftSession } from './types'

interface AuctionPanelProps {
  auction: AuctionRound | null
  session: DraftSession
  clubs: ClubInfo[]
  availablePlayers: AvailablePlayer[]
  myClub: ClubInfo | undefined
  isMyNominatorTurn: boolean
  auctionCountdown: number
  bidAmount: string
  auctionMsg: string
  onBidAmountChange: (v: string) => void
  onBid: () => void
  onNominateMode: () => void
}

export function AuctionPanel({
  auction, session, clubs, availablePlayers,
  myClub, isMyNominatorTurn, auctionCountdown,
  bidAmount, auctionMsg,
  onBidAmountChange, onBid, onNominateMode,
}: AuctionPanelProps) {
  return (
    <div style={{ padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-2)', marginBottom: 12 }}>
        Auction Draft
      </div>

      {/* Active auction */}
      {auction?.instanceId && auction.endsAt ? (
        <div>
          {/* Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, color: auctionCountdown <= 5 ? 'var(--red)' : auctionCountdown <= 10 ? 'var(--gold)' : 'var(--text-1)' }}>
              {auctionCountdown}s
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Current bid</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>
                €{(auction.highBid / 1000).toFixed(1)}k
              </div>
              {auction.highBidderId && (
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {clubs.find(c => c.id === auction.highBidderId)?.name ?? 'Unknown'}
                </div>
              )}
            </div>
          </div>

          {/* Nominated player info */}
          {(() => {
            const nomInst = availablePlayers.find(p => p.id === auction.instanceId)
            const nomPlayer = nomInst?.player
            return nomPlayer ? (
              <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-base)', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ width: 44, height: 52, background: 'var(--bg-card-2)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                  {nomPlayer.photoUrl
                    ? <img src={nomPlayer.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>👤</div>
                  }
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{nomPlayer.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{nomPlayer.position} · {nomPlayer.age}y · {nomPlayer.overall} OVR</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>POT {nomPlayer.potential}</div>
                </div>
              </div>
            ) : null
          })()}

          {/* Bid input */}
          {myClub && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                value={bidAmount}
                onChange={e => onBidAmountChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onBid()}
                placeholder={`Min ${auction.highBid + 100}`}
                min={auction.highBid + 100}
                style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13 }}
              />
              <button
                className="btn btn-primary"
                onClick={onBid}
                disabled={!bidAmount || parseInt(bidAmount, 10) <= auction.highBid}
                style={{ flexShrink: 0 }}
              >
                Bid
              </button>
            </div>
          )}
          {myClub && auction.budgets[myClub.id] !== undefined && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              Your budget: €{((auction.budgets[myClub.id] ?? 0) / 1000).toFixed(1)}k
            </div>
          )}
        </div>
      ) : (
        /* Waiting for nomination */
        <div>
          {isMyNominatorTurn ? (
            <div>
              <div style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700, marginBottom: 10 }}>
                Your turn to nominate a player!
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={onNominateMode}>
                Choose Player to Nominate
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', padding: '20px 0' }}>
              Waiting for {clubs.find(c => auction && c.id === session.pickOrder[auction.nominatorIdx % session.pickOrder.length])?.name ?? '…'} to nominate a player
            </div>
          )}
        </div>
      )}

      {auctionMsg && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>{auctionMsg}</div>}
    </div>
  )
}
