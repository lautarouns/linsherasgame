'use client'
import { useRouter } from 'next/navigation'
import { resetGame } from '@/lib/game'

type Player = {
  id: string
  nickname: string
  score: number
}

export default function Scoreboard({
  players,
  playerId,
  roomId,
  isHost
}: {
  players: Player[]
  playerId: string
  roomId: string
  isHost: boolean
}) {
  const router = useRouter()
  const sorted = [...players].sort((a, b) => b.score - a.score)

  return (
    <div className="scoreboard-panel">
      <div className="score-header">
        <h2 className="section-title" style={{ margin: 0 }}>Resultados finales</h2>
      </div>

      <ol className="score-table">
        {sorted.map((p, i) => (
          <li key={p.id} className="score-row">
            <span>
              <strong>#{i + 1} {p.nickname}{p.id === playerId ? ' (vos)' : ''}</strong>
              {i === 0 ? ' 🏆' : ''}
            </span>
            <span className="score-meta">{p.score} pts</span>
          </li>
        ))}
      </ol>

      <div className="score-actions">
        <button onClick={() => router.push('/')} className="btn-principal">
          Salir al menú
        </button>

        {isHost ? (
          <button onClick={() => resetGame(roomId)} className="btn-principal">
            Jugar de nuevo
          </button>
        ) : (
          <p className="status-box" style={{ flex: 1, marginTop: 0 }}>
            Esperando al host...
          </p>
        )}
      </div>
    </div>
  )
}