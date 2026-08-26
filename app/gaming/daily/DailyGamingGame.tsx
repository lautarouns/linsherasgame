'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle, normalize } from '@/lib/tracks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type VideoGame = {
  id: string
  title: string
  cover_url: string | null
  synopsis: string
  secondary_character: string
  game_modes: string[]
  platform: string
  release_year: number
  features: string[]
}

const HINT_KIND = [
  'Sinopsis',
  'Personaje secundario',
  'Modo de juego',
  'Modo de juego',
  'Modo de juego',
  'Plataforma',
  'Año de lanzamiento',
  ...Array.from({ length: 5 }, () => 'Característica')
]

export default function DailyGamingGame({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [targetGame, setTargetGame] = useState<VideoGame | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [attempt, setAttempt] = useState(1)
  const [guess, setGuess] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  // 1. Cargar el juego del día y el progreso guardado
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('video_games').select('*')
      const pool = data ?? []
      const shuffled = seededShuffle(pool, dateStr)
      const target = shuffled[0] as VideoGame | undefined

      if (!cancelled && target) {
        setTargetGame(target)
        setHints([
          target.synopsis,
          target.secondary_character,
          ...(target.game_modes ?? []),
          target.platform,
          String(target.release_year),
          ...(target.features ?? [])
        ])

        const saved = localStorage.getItem(`gaming_daily_${dateStr}`)
        if (saved) {
          try {
            const parsed = JSON.parse(saved)
            setStatus(parsed.status || 'playing')
            setAttempt(parsed.attempt || 1)
          } catch (e) {}
        }
        setIsLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [dateStr])

  // 2. Guardar progreso (solo una vez que ya se cargó la partida inicial)
  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(`gaming_daily_${dateStr}`, JSON.stringify({ status, attempt }))
  }, [status, attempt, dateStr, isLoaded])

  const maxAttempts = hints.length

  const submitGuess = () => {
    if (status !== 'playing' || !guess.trim() || !targetGame) return

    const isCorrect = normalize(guess.trim()) === normalize(targetGame.title)

    if (isCorrect) {
      setStatus('win')
    } else if (attempt < maxAttempts) {
      setAttempt(a => a + 1)
    } else {
      setStatus('loss')
    }
    setGuess('')
  }

  const handleSkip = () => {
    if (status !== 'playing') return

    if (attempt < maxAttempts) {
      setAttempt(a => a + 1)
    } else {
      setStatus('loss')
    }
    setGuess('')
  }

  if (!isLoaded || !targetGame) {
    return (
      <div className="theme-gaming">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-gaming">
      <div className="page-shell">
        <div className="daily-card page-card">
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Modo Individual</p>
              <h1 className="daily-title">Desafío Diario</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/gaming/archive" className="btn-secondary">Archivo</Link>
              <button onClick={() => router.push('/gaming')} className="btn-secondary">Volver</button>
            </div>
          </div>
          <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 24 }}>
            Adiviná el juego destapando pistas: primero la sinopsis, después un personaje secundario, y por último características cada vez más obvias.
          </p>

          {/* Pistas reveladas progresivamente */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {hints.map((hint, i) => {
              const isUnlocked = i < attempt || status !== 'playing'
              return (
                <div key={i} style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: isUnlocked ? 'var(--table-row)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--soft)',
                  color: isUnlocked ? '#fff' : 'var(--muted)',
                  textAlign: 'left'
                }}>
                  <span style={{
                    display: 'block',
                    fontSize: 10,
                    fontFamily: 'var(--font-code)',
                    color: 'var(--accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 4
                  }}>
                    Pista {i + 1} · {HINT_KIND[i]}
                  </span>
                  <span style={{ fontWeight: isUnlocked ? 600 : 400 }}>
                    {isUnlocked ? hint : '🔒 Pista oculta'}
                  </span>
                </div>
              )
            })}
          </div>

          {status === 'playing' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={guess}
                onChange={e => setGuess(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
                placeholder="Escribí el nombre del juego"
                className="guess-input"
                autoFocus
                autoComplete="off"
              />
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn-principal" style={{ flex: 1 }} onClick={submitGuess}>
                  Adivinar
                </button>
                <button className="btn-secondary" style={{ flex: 1, borderColor: 'var(--soft-strong)' }} onClick={handleSkip}>
                  {attempt < maxAttempts ? 'Saltar (+ pista)' : 'Rendirse'}
                </button>
              </div>
              <div className="daily-meta" style={{ marginTop: 12, borderTop: '1px solid var(--panel-border)', paddingTop: 16 }}>
                <div className="daily-meta-item" style={{ textAlign: 'center', background: 'transparent', border: 'none' }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase' }}>Intento actual</span>
                  <strong style={{ fontSize: 16, color: 'var(--foreground)' }}>{attempt} / {maxAttempts}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className={`daily-result ${status === 'win' ? 'is-win' : 'is-loss'}`} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {targetGame.cover_url && (
                <img src={targetGame.cover_url} alt={targetGame.title} style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 24 }}>
                  {status === 'win' ? '¡Ganaste!' : '¡Perdiste!'}
                </h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  El juego era <strong>{targetGame.title}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}