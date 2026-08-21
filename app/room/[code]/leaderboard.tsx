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
    <aside className="sidebar">
      <h3 className="sidebar-title">🏆 Leaderboard</h3>
      <ol className="leaderboard-list">
        {sorted.map((p, i) => (
          <li key={p.id} className="leaderboard-row">
            <span className="leaderboard-rank">#{i + 1}</span>
            <span><strong>{p.nickname}</strong>{p.id === playerId ? ' (vos)' : ''}</span>
            <span>{p.total_score}</span>
          </li>
        ))}
      </ol>
    </aside>
  )
}