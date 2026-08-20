'use client'

type Player = {
  id: string
  nickname: string
  score: number
}

export default function Scoreboard({
  players,
  playerId
}: {
  players: Player[]
  playerId: string
}) {
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
    </div>
  )
}