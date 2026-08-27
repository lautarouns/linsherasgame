import Link from 'next/link'

export default function HubPage() {
  const bg = `radial-gradient(500px 300px at 8% 10%, rgba(247,201,72,0.04), transparent 20%), radial-gradient(400px 260px at 12% 90%, rgba(38,255,106,0.03), transparent 20%), radial-gradient(420px 300px at 88% 18%, rgba(155,89,255,0.04), transparent 18%), var(--background)`

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: '72px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <h1 className="animated-title" style={{ fontSize: '3.5rem', margin: 0 }}>Linsheradle</h1>

        <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center', marginTop: 40 }}>

          <div className="theme-classic" style={{ display: 'flex' }}>
            <Link href="/songlio" className="hub-card" aria-label="Songlio" style={{ background: 'linear-gradient(180deg, rgba(247,201,72,0.05), rgba(0,0,0,0.4))' }}>
              <span className="hub-icon">🎵</span>
              <h2>Songlio</h2>
            </Link>
          </div>

          <div className="theme-futbol" style={{ display: 'flex' }}>
            <Link href="/futbol" className="hub-card" aria-label="Fútbol" style={{ background: 'linear-gradient(180deg, rgba(38,255,106,0.05), rgba(0,0,0,0.4))' }}>
              <span className="hub-icon">⚽</span>
              <h2>Fútbol</h2>
            </Link>
          </div>

          <div className="theme-gaming" style={{ display: 'flex' }}>
            <Link href="/gaming" className="hub-card" aria-label="Videojuegos" style={{ background: 'linear-gradient(180deg, rgba(155,89,255,0.05), rgba(0,0,0,0.4))' }}>
              <span className="hub-icon">🎮</span>
              <h2>Videojuegos</h2>
            </Link>
          </div>

          <div className="theme-anime" style={{ display: 'flex' }}>
            <Link href="/anime" className="hub-card" aria-label="Anime" style={{ background: 'linear-gradient(180deg, rgba(255,61,113,0.05), rgba(0,0,0,0.4))' }}>
              <span className="hub-icon">🎌</span>
              <h2>Anime</h2>
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}