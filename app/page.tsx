import Link from 'next/link'

type GameStatus = 'unplayed' | 'progress' | 'solved'

const GAMES = [
  {
    href: '/songlio',
    label: 'Songlio',
    tagline: 'Adiviná la canción',
    icon: '🎵',
    theme: 'theme-classic',
    tint: 'rgba(247,201,72',
    // TODO: reemplazar por el progreso real del día
    status: 'unplayed' as GameStatus,
    guesses: 0,
  },
  {
    href: '/futbol',
    label: 'Fútbol',
    tagline: 'Adiviná el jugador',
    icon: '⚽',
    theme: 'theme-futbol',
    tint: 'rgba(38,255,106',
    status: 'progress' as GameStatus,
    guesses: 3,
  },
  {
    href: '/gaming',
    label: 'Videojuegos',
    tagline: 'Adiviná el juego',
    icon: '🎮',
    theme: 'theme-gaming',
    tint: 'rgba(155,89,255',
    status: 'unplayed' as GameStatus,
    guesses: 0,
  },
  {
    href: '/anime',
    label: 'Anime',
    tagline: 'Adiviná el anime',
    icon: '🎌',
    theme: 'theme-anime',
    tint: 'rgba(255,61,113',
    status: 'solved' as GameStatus,
    guesses: 4,
  },
]

const MAX_GUESSES = 6

function statusLabel(status: GameStatus, guesses: number) {
  if (status === 'solved') return 'RESUELTO'
  if (status === 'progress') return `${guesses}/${MAX_GUESSES} INTENTOS`
  return 'SIN JUGAR'
}

export default function HubPage() {
  const bg = `radial-gradient(700px 420px at 12% -6%, rgba(247,201,72,0.05), transparent 60%), radial-gradient(600px 400px at 92% 8%, rgba(155,89,255,0.05), transparent 60%), radial-gradient(520px 360px at 30% 108%, rgba(38,255,106,0.035), transparent 60%), var(--background)`

  const today = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date())

  // TODO: reemplazar por la racha real del usuario
  const streak = 12

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '56px 20px 120px' }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>

        <header className="hub-header">
          <div className="hub-header-text">
            <div className="hub-eyebrow">{today}</div>
            <h1 className="animated-title" style={{ fontSize: '3.5rem', margin: 0, lineHeight: 1 }}>Linsheradle</h1>
            <p className="hub-sub">Cuatro juegos diarios. Uno nuevo cada día a medianoche.</p>
          </div>

          <div className="hub-streak">
            <span className="hub-streak-label">Racha</span>
            <span className="hub-streak-value">{streak}</span>
          </div>
        </header>

        <div className="hub-grid">
          {GAMES.map((game) => (
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
                <span className="hub-status" data-status={game.status}>
                  <span className="hub-status-dot" />
                  {statusLabel(game.status, game.guesses)}
                </span>
              </Link>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
