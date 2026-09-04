'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle } from '@/lib/tracks'
import { VideoGame, VideoGameComparison, compareVideoGames, fetchGameCoverLive, cacheGameCover } from '@/lib/videogamedle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type GuessRow = {
  game: VideoGame
  comparison: VideoGameComparison
}

const COLUMNS: { key: keyof VideoGameComparison; label: string }[] = [
  { key: 'release_year', label: 'Lanzamiento' },
  { key: 'age_rating', label: 'Clasificación' },
  { key: 'genres', label: 'Género' },
  { key: 'platforms', label: 'Consolas' },
  { key: 'developer', label: 'Desarrollador' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'engine', label: 'Motor gráfico' },
  { key: 'franchise', label: 'Saga' },
]

function cellStyle(state: 'correct' | 'partial' | 'wrong') {
  if (state === 'correct') return { background: 'rgba(52, 211, 153, 0.22)', border: '1px solid rgba(52, 211, 153, 0.45)', color: '#fff' }
  if (state === 'partial') return { background: 'rgba(247, 181, 72, 0.22)', border: '1px solid rgba(247, 181, 72, 0.5)', color: '#fff' }
  return { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--soft)', color: 'var(--muted)' }
}

function GameCover({ game, size = 32 }: { game: VideoGame; size?: number }) {
  const radius = size >= 48 ? 12 : 8
  if (game.cover_url) {
    return (
      <img
        src={game.cover_url}
        alt=""
        style={{ width: size, height: size * 1.35, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size * 1.35, borderRadius: radius,
      background: 'rgba(122, 92, 255, 0.14)', border: '1px solid rgba(122, 92, 255, 0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: Math.round(size * 0.55)
    }}>
      🎮
    </div>
  )
}

export default function DailyGamingGame({ dateStr }: { dateStr: string }) {
  const router = useRouter()

  const [pool, setPool] = useState<VideoGame[]>([])
  const [target, setTarget] = useState<VideoGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [guess, setGuess] = useState('')
  const [suggestions, setSuggestions] = useState<VideoGame[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // 1. Cargar el pool y el juego del día, y restaurar el progreso guardado
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('video_game_guess_pool')
        .select('id, title, cover_url, release_year, age_rating, genres, platforms, developer, publisher, engine, franchise')

      const allGames = (data ?? []) as VideoGame[]
      const shuffled = seededShuffle(allGames, 'gaming' + dateStr)
      const todayTarget = shuffled[0]

      if (!cancelled && todayTarget) {
        setPool(allGames)
        setTarget(todayTarget)

        const saved = localStorage.getItem(`gaming_daily_v2_${dateStr}`)
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { titles: string[]; status: 'playing' | 'win' | 'loss' }
            const restored: GuessRow[] = parsed.titles
              .map(title => allGames.find(g => g.title === title))
              .filter((g): g is VideoGame => !!g)
              .map(g => ({ game: g, comparison: compareVideoGames(g, todayTarget) }))
            setGuesses(restored)
            setStatus(parsed.status)
          } catch (e) {}
        }
        setIsLoaded(true)
      }

      // Buscamos en vivo la portada de los juegos que no tengan cover_url —
      // UNA POR VEZ, con una pausa entre cada una, igual que hacemos con las
      // fotos de personajes de anime. Apenas se encuentra una se actualiza en
      // memoria (pool, el juego objetivo y las filas ya adivinadas) y se
      // cachea en la base para no volver a pedirla la próxima vez.
      const missing = allGames.filter(g => !g.cover_url)
      ;(async () => {
        for (const g of missing) {
          if (cancelled) return
          const url = await fetchGameCoverLive(g.title)
          if (cancelled) return
          if (url) {
            setPool(prev => prev.map(x => x.title === g.title ? { ...x, cover_url: url } : x))
            setTarget(prev => prev && prev.title === g.title ? { ...prev, cover_url: url } : prev)
            setGuesses(prev => prev.map(row => row.game.title === g.title ? { ...row, game: { ...row.game, cover_url: url } } : row))
            void cacheGameCover(g.title, url)
          }
          await new Promise(resolve => setTimeout(resolve, 300))
        }
      })()
    }
    load()
    return () => { cancelled = true }
  }, [dateStr])

  // 2. Guardar progreso (solo una vez que ya se cargó la partida inicial)
  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(`gaming_daily_v2_${dateStr}`, JSON.stringify({
      titles: guesses.map(g => g.game.title),
      status
    }))
  }, [guesses, status, dateStr, isLoaded])

  // 3. Buscador en vivo: filtra el pool ya cargado en memoria, sin pegarle a la red
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 1 || status !== 'playing') {
        setSuggestions([])
        return
      }
      const already = new Set(guesses.map(g => g.game.title))
      const matches = pool
        .filter(g => !already.has(g.title) && g.title.toLowerCase().includes(q))
        .slice(0, 8)
      setSuggestions(matches)
    }, 120)
    return () => clearTimeout(t)
  }, [guess, pool, guesses, status])

  const submitGuess = (game?: VideoGame) => {
    if (status !== 'playing' || !target) return
    const chosen = game ?? pool.find(g => g.title.toLowerCase() === guess.trim().toLowerCase())
    if (!chosen) return
    if (guesses.some(g => g.game.title === chosen.title)) return

    const comparison = compareVideoGames(chosen, target)
    setGuesses(prev => [{ game: chosen, comparison }, ...prev])
    setGuess('')
    setSuggestions([])
    setShowSuggestions(false)

    if (chosen.title === target.title) {
      new Audio('/audios/correcto.mp3').play().catch(e => console.log('Audio error:', e))
      setStatus('win')
    } else {
      new Audio('/audios/error.mp3').play().catch(e => console.log('Audio error:', e))
    }
  }

  if (!isLoaded || !target) {
    return (
      <div className="theme-gaming">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  const finished = status !== 'playing'

  return (
    <div className="theme-gaming theme-bg">
      <div className="page-shell">
        <div className="page-card" style={{ width: 'min(100%, 1100px)' }}>
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Adiviná el Videojuego</p>
              <h1 className="daily-title" style={{ fontSize: '1.9rem' }}>Desafío Diario</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/gaming/archive" className="btn-secondary">Archivo</Link>
              <button onClick={() => router.push('/gaming')} className="btn-secondary">Volver</button>
            </div>
          </div>

          {status === 'win' && (
            <div className="daily-result is-win" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <GameCover game={target} size={56} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>¡Lo adivinaste!</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Era <strong>{target.title}</strong></p>
              </div>
            </div>
          )}

          {status === 'loss' && (
            <div className="daily-result is-loss" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <GameCover game={target} size={56} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Te rendiste</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Era <strong>{target.title}</strong></p>
              </div>
            </div>
          )}

          {!finished && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="guess-input"
                  value={guess}
                  onChange={e => { setGuess(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => { if (guess.trim().length >= 1) setShowSuggestions(true) }}
                  onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
                  placeholder="Escribí el nombre de un videojuego"
                  autoComplete="off"
                  autoFocus
                />
                <button className="btn-principal" onClick={() => submitGuess()}>Adivinar</button>
                <button
                  className="btn-secondary"
                  onClick={() => { if (confirm('¿Seguro que te querés rendir? Se va a revelar el juego.')) setStatus('loss') }}
                  style={{ borderColor: 'rgba(255, 82, 82, 0.3)', color: '#ff5252' }}
                >
                  Rendirse
                </button>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(g => (
                    <li
                      key={g.id}
                      onClick={() => submitGuess(g)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontWeight: 600, color: '#fff' }}
                    >
                      <GameCover game={g} size={28} />
                      {g.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {guesses.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 6px' }}>Título</th>
                    {COLUMNS.map(col => (
                      <th key={col.key} style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guesses.map((g, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px', minWidth: 170, color: '#fff', fontWeight: 700, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <GameCover game={g.game} size={32} />
                          {g.game.title}
                        </div>
                      </td>
                      {COLUMNS.map(col => {
                        const cell = g.comparison[col.key]
                        return (
                          <td key={col.key} style={{ padding: 0 }}>
                            <div style={{ ...cellStyle(cell.state), borderRadius: 10, padding: '9px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, minWidth: 76 }}>
                              {cell.value}
                              {cell.arrow === 'up' && ' ▲'}
                              {cell.arrow === 'down' && ' ▼'}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {guesses.length === 0 && (
            <p className="status-box">
              Escribí el nombre de un videojuego para arrancar. Verde es exacto, amarillo está cerca (con flecha si el dato tiene un orden — lanzamiento, clasificación — o si acertaste el estudio pero en la columna equivocada de desarrollador/publisher), gris no tiene relación.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
