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
    <div style={{ marginTop: 20 }}>
      <h2>Resultados finales</h2>
      <ol style={{ padding: 0, listStyle: 'none' }}>
        {sorted.map((p, i) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 12px',
              marginBottom: 6,
              borderRadius: 6,
              background: i === 0 ? '#3a3320' : '#1c1c1c',
              fontWeight: p.id === playerId ? 700 : 400
            }}
          >
            <span>
              #{i + 1} {p.nickname}{p.id === playerId ? ' (vos)' : ''}
              {i === 0 ? ' 🏆' : ''}
            </span>
            <span>{p.score} pts</span>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button
          onClick={() => router.push('/')}
          style={{ flex: 1, padding: 10 }}
        >
          Salir al menú
        </button>

        {isHost ? (
          <button
            onClick={() => resetGame(roomId)}
            style={{ flex: 1, padding: 10 }}
          >
            Jugar de nuevo
          </button>
        ) : (
          <p style={{ flex: 1, textAlign: 'center', fontSize: 13, opacity: 0.7 }}>
            Esperando al host para jugar de nuevo...
          </p>
        )}
      </div>
    </div>
  )
}