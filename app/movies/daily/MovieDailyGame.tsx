'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle } from '@/lib/tracks'
import { Movie, MovieComparison, compareMovies } from '@/lib/moviedle'
import { useRouter } from 'next/navigation'

type GuessRow = {
  movie: Movie
  comparison: MovieComparison
}

const COLUMNS: { key: keyof MovieComparison; label: string }[] = [
  { key: 'year', label: 'Año' },
  { key: 'genres', label: 'Género' },
  { key: 'classification', label: 'Clasificación' },
  { key: 'imdb_rating', label: 'IMDb' },
  { key: 'studio', label: 'Estudio' },
  { key: 'director', label: 'Director' },
  { key: 'main_actor', label: 'Actor Principal' },
]

function cellStyle(state: 'correct' | 'partial' | 'wrong') {
  if (state === 'correct') return { background: 'rgba(52, 211, 153, 0.22)', border: '1px solid rgba(52, 211, 153, 0.45)', color: '#fff' }
  if (state === 'partial') return { background: 'rgba(247, 181, 72, 0.22)', border: '1px solid rgba(247, 181, 72, 0.5)', color: '#fff' }
  return { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--soft)', color: 'var(--muted)' }
}

function MoviePoster({ movie, size = 32 }: { movie: Movie; size?: number }) {
  const radius = size >= 48 ? 12 : 8
  if (movie.poster_url) {
    return (
      <img
        src={movie.poster_url}
        alt=""
        style={{ width: size, height: size * 1.35, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size * 1.35, borderRadius: radius,
      background: 'rgba(61, 139, 255, 0.14)', border: '1px solid rgba(61, 139, 255, 0.3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: Math.round(size * 0.55)
    }}>
      🎬
    </div>
  )
}

function todayStr() {
  const hoy = new Date()
  const yyyy = hoy.getFullYear()
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const dd = String(hoy.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function MovieDailyGame({ dateStr }: { dateStr?: string }) {
  const router = useRouter()
  const day = dateStr ?? todayStr()

  const [pool, setPool] = useState<Movie[]>([])
  const [target, setTarget] = useState<Movie | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [guess, setGuess] = useState('')
  const [suggestions, setSuggestions] = useState<Movie[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('movie_guess_pool')
        .select('id, title, poster_url, year, genres, classification, imdb_rating, studio, director, main_actor')

      const allMovies = (data ?? []) as Movie[]
      const shuffled = seededShuffle(allMovies, 'movies' + day)
      const todayTarget = shuffled[0]

      if (!cancelled && todayTarget) {
        setPool(allMovies)
        setTarget(todayTarget)

        const saved = localStorage.getItem(`movies_daily_${day}`)
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { titles: string[]; status: 'playing' | 'win' | 'loss' }
            const restored: GuessRow[] = parsed.titles
              .map(title => allMovies.find(m => m.title === title))
              .filter((m): m is Movie => !!m)
              .map(m => ({ movie: m, comparison: compareMovies(m, todayTarget) }))
            setGuesses(restored)
            setStatus(parsed.status)
          } catch (e) {}
        }
        setIsLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [day])

  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(`movies_daily_${day}`, JSON.stringify({
      titles: guesses.map(g => g.movie.title),
      status
    }))
  }, [guesses, status, day, isLoaded])

  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 1 || status !== 'playing') {
        setSuggestions([])
        return
      }
      const already = new Set(guesses.map(g => g.movie.title))
      const matches = pool
        .filter(m => !already.has(m.title) && m.title.toLowerCase().includes(q))
        .slice(0, 8)
      setSuggestions(matches)
    }, 120)
    return () => clearTimeout(t)
  }, [guess, pool, guesses, status])

  const submitGuess = (movie?: Movie) => {
    if (status !== 'playing' || !target) return
    const chosen = movie ?? pool.find(m => m.title.toLowerCase() === guess.trim().toLowerCase())
    if (!chosen) return
    if (guesses.some(g => g.movie.title === chosen.title)) return

    const comparison = compareMovies(chosen, target)
    setGuesses(prev => [{ movie: chosen, comparison }, ...prev])
    setGuess('')
    setSuggestions([])
    setShowSuggestions(false)

    if (chosen.title === target.title) setStatus('win')
  }

  if (!isLoaded || !target) {
    return (
      <div className="theme-movies">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  const finished = status !== 'playing'

  return (
    <div className="theme-movies theme-bg">
      <div className="page-shell">
        <div className="page-card" style={{ width: 'min(100%, 1100px)' }}>
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Adiviná la Película o Serie</p>
              <h1 className="daily-title" style={{ fontSize: '1.9rem' }}>Desafío Diario</h1>
            </div>
            <button onClick={() => router.push('/movies')} className="btn-secondary">Volver</button>
          </div>

          {status === 'win' && (
            <div className="daily-result is-win" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <MoviePoster movie={target} size={56} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>¡Lo adivinaste!</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Era <strong>{target.title}</strong> ({target.year})</p>
              </div>
            </div>
          )}

          {status === 'loss' && (
            <div className="daily-result is-loss" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <MoviePoster movie={target} size={56} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Te rendiste</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>Era <strong>{target.title}</strong> ({target.year})</p>
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
                  placeholder="Escribí el título de una película o serie"
                  autoComplete="off"
                  autoFocus
                />
                <button className="btn-principal" onClick={() => submitGuess()}>Adivinar</button>
                <button
                  className="btn-secondary"
                  onClick={() => { if (confirm('¿Seguro que te querés rendir? Se va a revelar el título.')) setStatus('loss') }}
                  style={{ borderColor: 'rgba(255, 82, 82, 0.3)', color: '#ff5252' }}
                >
                  Rendirse
                </button>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(m => (
                    <li
                      key={m.id}
                      onClick={() => submitGuess(m)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontWeight: 600, color: '#fff' }}
                    >
                      <MoviePoster movie={m} size={28} />
                      {m.title} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({m.year})</span>
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
                          <MoviePoster movie={g.movie} size={32} />
                          {g.movie.title}
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
              Escribí el título de una película o serie para arrancar. Verde es exacto, amarillo está cerca (con flecha si el dato tiene un orden — año, clasificación, IMDb — o si acertaste a la persona pero en la columna equivocada de director/actor), gris no tiene relación.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}