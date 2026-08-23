'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDailyPlayerId } from '@/lib/dailyPlayer'

type DaySong = {
  date_id: string
  title: string
  artist: string
  cover: string
}

type ProgressMap = Record<string, { is_win: boolean; is_lose: boolean }>

function todayStr() {
  const hoy = new Date()
  const yyyy = hoy.getFullYear()
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const dd = String(hoy.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function DailyArchivePage() {
  const router = useRouter()
  const [days, setDays] = useState<DaySong[]>([])
  const [progress, setProgress] = useState<ProgressMap>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: songs } = await supabase
        .from('daily_songs')
        .select('date_id, title, artist, cover')
        .lt('date_id', todayStr())
        .order('date_id', { ascending: false })

      setDays(songs ?? [])

      const playerId = getDailyPlayerId()
      if (playerId) {
        const { data: prog } = await supabase
          .from('daily_progress')
          .select('date_id, is_win, is_lose')
          .eq('player_id', playerId)

        const map: ProgressMap = {}
        prog?.forEach(p => { map[p.date_id] = { is_win: p.is_win, is_lose: p.is_lose } })
        setProgress(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="page-shell">
      <div className="page-card daily-card">
        <div className="daily-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="page-title daily-title" style={{ fontSize: 28, margin: 0 }}>Días anteriores</h1>
          <button type="button" className="btn-principal" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--soft-strong)', boxShadow: 'none' }} onClick={() => router.push('/daily')}>
            Volver al de hoy
          </button>
        </div>

        {loading && <p className="status-box" style={{ marginTop: 20 }}>Cargando...</p>}

        {!loading && days.length === 0 && (
          <p className="status-box" style={{ marginTop: 20 }}>Todavía no hay días anteriores guardados.</p>
        )}

        <ul style={{ listStyle: 'none', padding: 0, marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {days.map(day => {
            const p = progress[day.date_id]
            const status = p?.is_win ? 'Ganado' : p?.is_lose ? 'Perdido' : 'Sin jugar'
            const statusColor = p?.is_win ? 'var(--accent)' : p?.is_lose ? 'rgba(255,138,128,0.9)' : 'var(--muted)'

            return (
              <li
                key={day.date_id}
                onClick={() => router.push(`/daily/${day.date_id}`)}
                className="track-result"
                style={{ cursor: 'pointer' }}
              >
                <img src={day.cover} alt="" />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1 }}>
                  <strong>{day.date_id}</strong>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {p ? `${day.title} — ${day.artist}` : 'Canción oculta hasta que juegues'}
                  </span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{status}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}