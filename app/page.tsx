'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getDailyPlayerId } from '@/lib/dailyPlayer'
import { seededShuffle } from '@/lib/tracks'
import IntroScreen from './IntroScreen'

type GameStatus = 'unplayed' | 'progress' | 'solved' | 'lost'
type GameKey = 'songlio' | 'futbol' | 'gaming' | 'anime' | 'movies'

// Cantidad fija de intentos por modo (Fútbol es variable, se calcula aparte)
const FIXED_MAX_ATTEMPTS: Record<Exclude<GameKey, 'futbol'>, number> = {
  songlio: 4,
  gaming: 12,
  anime: 12,
  movies: 99, // sin límite de intentos: mostramos un número alto para el "X/Y" del hub
}

function todayStr() {
  const hoy = new Date()
  const yyyy = hoy.getFullYear()
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const dd = String(hoy.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

type GameCard = {
  key: GameKey
  href: string
  label: string
  tagline: string
  icon: string
  theme: string
  tint: string
}

const GAMES: GameCard[] = [
  { key: 'songlio', href: '/songlio', label: 'Songlio', tagline: 'Adiviná la canción', icon: '🎵', theme: 'theme-classic', tint: 'rgba(247,201,72' },
  { key: 'futbol', href: '/futbol', label: 'Fútbol', tagline: 'Adiviná el jugador', icon: '⚽', theme: 'theme-futbol', tint: 'rgba(38,255,106' },
  { key: 'gaming', href: '/gaming', label: 'Videojuegos', tagline: 'Adiviná el juego', icon: '🎮', theme: 'theme-gaming', tint: 'rgba(155,89,255' },
  { key: 'anime', href: '/anime', label: 'Anime', tagline: 'Adiviná el anime', icon: '🎌', theme: 'theme-anime', tint: 'rgba(255,61,113' },
  { key: 'movies', href: '/movies', label: 'Cine', tagline: 'Adiviná la película o serie', icon: '🎬', theme: 'theme-movies', tint: 'rgba(61,139,255' },
]

type Progress = { status: GameStatus; attempt: number; max: number }

const DEFAULT_PROGRESS: Record<GameKey, Progress> = {
  songlio: { status: 'unplayed', attempt: 0, max: FIXED_MAX_ATTEMPTS.songlio },
  futbol: { status: 'unplayed', attempt: 0, max: 6 },
  gaming: { status: 'unplayed', attempt: 0, max: FIXED_MAX_ATTEMPTS.gaming },
  anime: { status: 'unplayed', attempt: 0, max: FIXED_MAX_ATTEMPTS.anime },
  movies: { status: 'unplayed', attempt: 0, max: FIXED_MAX_ATTEMPTS.movies },
}

function statusLabel(status: GameStatus, attempt: number, max: number) {
  if (status === 'solved') return 'RESUELTO'
  if (status === 'lost') return 'PERDISTE'
  if (status === 'progress') return max >= 90 ? `${attempt} INTENTOS` : `${attempt}/${max} INTENTOS`
  return 'SIN JUGAR'
}

export default function HubPage() {
  const bg = `radial-gradient(700px 420px at 12% -6%, rgba(247,201,72,0.05), transparent 60%), radial-gradient(600px 400px at 92% 8%, rgba(155,89,255,0.05), transparent 60%), radial-gradient(520px 360px at 30% 108%, rgba(38,255,106,0.035), transparent 60%), var(--background)`
  const today = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date())

  const [progress, setProgress] = useState<Record<GameKey, Progress>>(DEFAULT_PROGRESS)
  const [intro, setIntro] = useState<'in' | 'out' | 'done'>('in')

  function startGame() {
    setIntro('out')
    setTimeout(() => setIntro('done'), 900)
  }

  useEffect(() => {
    let cancelled = false
    const dateStr = todayStr()

    function readLocal(key: 'futbol' | 'gaming' | 'anime' | 'movies') {
      const saved = localStorage.getItem(`${key}_daily_${dateStr}`)
      if (!saved) return null
      try {
        const parsed = JSON.parse(saved)
        const rawStatus = parsed.status as 'playing' | 'win' | 'loss' | undefined
        const status: GameStatus =
          rawStatus === 'win' ? 'solved' :
          rawStatus === 'loss' ? 'lost' :
          rawStatus === 'playing' ? 'progress' :
          'unplayed'
        return { status, attempt: parsed.attempt as number }
      } catch {
        return null
      }
    }

    async function loadAll() {
      const gaming = readLocal('gaming')
      const anime = readLocal('anime')
      const futbolLocal = readLocal('futbol')
      const movies = readLocal('movies')

      // Fútbol: el máximo de intentos depende de cuántos clubes tiene el
      // jugador del día, así que lo recalculamos igual que su propio componente.
      let futbolMax = DEFAULT_PROGRESS.futbol.max
      try {
        const { data } = await supabase.from('football_players').select('*')
        const pool = data ?? []
        const shuffled = seededShuffle(pool, dateStr)
        const target = shuffled[0] as any
        if (target) {
          const cList = Array.isArray(target.clubs)
            ? target.clubs
            : typeof target.clubs === 'string'
              ? target.clubs.split(',').map((s: string) => s.trim()).filter(Boolean)
              : []
          if (cList.length > 0) futbolMax = cList.length
        }
      } catch (e) {
        console.error('No se pudo calcular el máximo de intentos de fútbol', e)
      }

      // Songlio guarda el progreso en Supabase (no en localStorage)
      let songlio: { status: GameStatus; attempt: number } | null = null
      try {
        const playerId = getDailyPlayerId()
        const { data } = await supabase
          .from('daily_progress')
          .select('current_attempt, is_win, is_lose')
          .eq('date_id', dateStr)
          .eq('player_id', playerId)
          .maybeSingle()

        if (data) {
          songlio = {
            status: data.is_win ? 'solved' : data.is_lose ? 'lost' : 'progress',
            attempt: data.current_attempt ?? 0
          }
        }
      } catch (e) {
        console.error('No se pudo cargar el progreso de Songlio', e)
      }

      if (cancelled) return

      setProgress({
        songlio: songlio ? { ...songlio, max: FIXED_MAX_ATTEMPTS.songlio } : DEFAULT_PROGRESS.songlio,
        futbol: futbolLocal ? { ...futbolLocal, max: futbolMax } : { ...DEFAULT_PROGRESS.futbol, max: futbolMax },
        gaming: gaming ? { ...gaming, max: FIXED_MAX_ATTEMPTS.gaming } : DEFAULT_PROGRESS.gaming,
        anime: anime ? { ...anime, max: FIXED_MAX_ATTEMPTS.anime } : DEFAULT_PROGRESS.anime,
        movies: movies ? { ...movies, max: FIXED_MAX_ATTEMPTS.movies } : DEFAULT_PROGRESS.movies,
      })
    }

    loadAll()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '56px 20px 120px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>

        <header className="hub-header">
          <div className="hub-header-text">
            <div className="hub-eyebrow">{today}</div>
            <h1 className="animated-title" style={{ fontSize: '3.5rem', margin: 0, lineHeight: 1 }}>Linsheradle</h1>
            <p className="hub-sub">Cinco juegos diarios. Uno nuevo cada día a medianoche.</p>
          </div>
        </header>

        <div className="hub-grid">
          {GAMES.map((game) => {
            const p = progress[game.key]
            return (
              <div key={game.href} className={game.theme} style={{ display: 'flex' }}>
                <Link
                  href={game.href}
                  className="hub-card hub-card-v2"
                  aria-label={game.label}
                  style={{ background: `linear-gradient(180deg, ${game.tint},0.06), rgba(0,0,0,0.4))` }}
                >
                  <span className="hub-icon" style={{ filter: `drop-shadow(0 10px 24px ${game.tint},0.32))` }}>{game.icon}</span>
                  <h2>{game.label}</h2>
                  <p className="hub-card-tagline">{game.tagline}</p>
                  <span className="hub-status" data-status={p.status}>
                    <span className="hub-status-dot" />
                    {statusLabel(p.status, p.attempt, p.max)}
                  </span>
                </Link>
              </div>
            )
          })}
        </div>

      </div>

      {intro !== 'done' && (
        <div className={intro === 'out' ? 'intro-wrap is-leaving' : 'intro-wrap'}>
          <IntroScreen onStart={startGame} />
        </div>
      )}
    </div>
  )
}
