'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function GamingArchive() {
  const router = useRouter()
  const [history, setHistory] = useState<Record<string, string>>({})

  // useMemo evita que el array de fechas recree el bucle infinito en cada render
  const dates = useMemo(() => {
    const list = []
    let current = new Date()
    const launchDate = new Date('2026-08-26T00:00:00')

    while (current >= launchDate) {
      list.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() - 1)
    }

    if (list.length === 0) list.push('2026-08-26')
    return list
  }, [])

  useEffect(() => {
    const loaded: Record<string, string> = {}
    dates.forEach(d => {
      const saved = localStorage.getItem(`gaming_daily_v2_${d}`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          loaded[d] = parsed.status || 'playing'
        } catch (e) {}
      }
    })
    setHistory(loaded)
  }, [dates])

  return (
    <div className="theme-gaming">
      <div className="page-shell">
        <div className="page-card" style={{ width: 'min(100%, 600px)' }}>
          <div className="daily-header" style={{ marginBottom: 24 }}>
            <h1 className="daily-title" style={{ fontSize: '1.8rem' }}>Archivo — Desafío Diario</h1>
            <button onClick={() => router.push('/gaming')} className="btn-secondary">Volver</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dates.map(date => {
              const status = history[date]
              let statusText = 'Sin jugar'
              let statusColor = 'var(--muted)'

              if (status === 'win') {
                statusText = 'Ganado'
                statusColor = 'var(--accent)'
              } else if (status === 'loss') {
                statusColor = '#ff5252'
                statusText = 'Perdido'
              } else if (status === 'playing') {
                statusText = 'Jugando'
                statusColor = 'var(--foreground)'
              }

              return (
                <Link
                  key={date}
                  href={`/gaming/daily/${date}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--soft)',
                    borderRadius: 16,
                    textDecoration: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    transition: 'border-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-line)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--soft)'}
                >
                  <span>{date}</span>
                  <span style={{ color: statusColor }}>{statusText}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}