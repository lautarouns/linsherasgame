'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle, normalize } from '@/lib/tracks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Anime = {
  id: string
  title: string
  cover_url: string | null
  synopsis: string
  secondary_character: string
  genre: string
  release_year: number
  studio: string
  features: string[]
}

const HINT_KIND = [
  'Personaje secundario',
  'Género',
  'Sinopsis',
  'Año de lanzamiento',
  'Estudio de animación',
  ...Array.from({ length: 7 }, () => 'Característica')
]

export default function DailyAnimeGame({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [targetAnime, setTargetAnime] = useState<Anime | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [attempt, setAttempt] = useState(1)
  const [guess, setGuess] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  // Pool completo de animes (ya se trae igual para elegir el del día), usado
  // acá para armar las sugerencias del buscador sin pegarle a la base de nuevo.
  const [pool, setPool] = useState<Anime[]>([])
  const [suggestions, setSuggestions] = useState<Anime[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // 1. Cargar el anime del día y el progreso guardado
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('animes').select('*')
      const allAnimes = (data ?? []) as Anime[]
      const shuffled = seededShuffle(allAnimes, dateStr)
      const target = shuffled[0] as Anime | undefined

      if (!cancelled && target) {
        setPool(allAnimes)
        setTargetAnime(target)
        setHints([
          target.secondary_character,
          target.genre,
          target.synopsis,
          String(target.release_year),
          target.studio,
          ...(target.features ?? [])
        ])

        const saved = localStorage.getItem(`anime_daily_${dateStr}`)
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
    localStorage.setItem(`anime_daily_${dateStr}`, JSON.stringify({ status, attempt }))
  }, [status, attempt, dateStr, isLoaded])

  // 3. Buscador en vivo: filtra el pool ya cargado en memoria, sin pegarle a la red
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 1 || status !== 'playing') {
        setSuggestions([])
        return
      }
      const matches = pool
        .filter(a => a.title.toLowerCase().includes(q))
        .slice(0, 8)
      setSuggestions(matches)
    }, 150)
    return () => clearTimeout(t)
  }, [guess, status, pool])

  const maxAttempts = hints.length

  const submitGuess = (guessTitle?: string) => {
    const candidate = (guessTitle ?? guess).trim()
    if (status !== 'playing' || !candidate || !targetAnime) return

    const isCorrect = normalize(candidate) === normalize(targetAnime.title)

    if (isCorrect) {
      setStatus('win')
    } else if (attempt < maxAttempts) {
      setAttempt(a => a + 1)
    } else {
      setStatus('loss')
    }
    setGuess('')
    setShowSuggestions(false)
  }

  const handleSkip = () => {
    if (status !== 'playing') return

    if (attempt < maxAttempts) {
      setAttempt(a => a + 1)
    } else {
      setStatus('loss')
    }
    setGuess('')
    setShowSuggestions(false)
  }

  if (!isLoaded || !targetAnime) {
    return (
      <div className="theme-anime">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="theme-anime">
      <div className="page-shell">
        <div className="daily-card page-card">
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Modo Individual</p>
              <h1 className="daily-title">Desafío Diario</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/anime/archive" className="btn-secondary">Archivo</Link>
              <button onClick={() => router.push('/anime')} className="btn-secondary">Volver</button>
            </div>
          </div>
          <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 24 }}>
            Adiviná el anime destapando pistas: primero un personaje secundario muy poco conocido, después el género, la sinopsis, el año y el estudio, y por último características cada vez más obvias.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
              <input
                value={guess}
                onChange={e => { setGuess(e.target.value); setShowSuggestions(true) }}
                onFocus={() => { if (guess.trim().length >= 2) setShowSuggestions(true) }}
                onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
                placeholder="Escribí el nombre del anime"
                className="guess-input"
                autoFocus
                autoComplete="off"
              />

              {showSuggestions && suggestions.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(a => (
                    <li
                      key={a.id}
                      onClick={() => submitGuess(a.title)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'var(--table-row)',
                        border: '1px solid var(--soft)',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {a.title}
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn-principal" style={{ flex: 1 }} onClick={() => submitGuess()}>
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
              {targetAnime.cover_url && (
                <img src={targetAnime.cover_url} alt={targetAnime.title} style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 24 }}>
                  {status === 'win' ? '¡Ganaste!' : '¡Perdiste!'}
                </h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  El anime era <strong>{targetAnime.title}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}