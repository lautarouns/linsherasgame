'use client'

type Player = {
  id: string
  nickname: string
  total_score: number
}

export default function Leaderboard({
  players,
  playerId
}: {
  players: Player[]
  playerId: string
}) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score)

  return (
    <div style={{ width: 220, flexShrink: 0 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>🏆 Leaderboard</h3>
      <ol style={{ padding: 0, listStyle: 'none' }}>
        {sorted.map((p, i) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 10px',
              marginBottom: 4,
              borderRadius: 6,
              background: i === 0 ? '#3a3320' : '#1c1c1c',
              fontWeight: p.id === playerId ? 700 : 400,
              fontSize: 13
            }}
          >
            <span>#{i + 1} {p.nickname}{p.id === playerId ? ' (vos)' : ''}</span>
            <span>{p.total_score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}