'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const ANIMES = [
  { slug: 'attack-on-titan', name: 'Attack on Titan', icon: '⚔️' },
  { slug: 'jujutsu-kaisen', name: 'Jujutsu Kaisen(WIP)', icon: '🌀' },
]

export default function CharacterdlePicker() {
  const router = useRouter()

  return (
    <div className="theme-anime theme-bg">
      <div className="page-shell">
        <div className="page-card" style={{ width: 'min(100%, 480px)', textAlign: 'center' }}>
          <div className="daily-header" style={{ justifyContent: 'center' }}>
            <div>
              <p className="daily-kicker">Adiviná el Personaje</p>
              <h1 className="daily-title" style={{ fontSize: '1.8rem' }}>Elegí un anime</h1>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
            {ANIMES.map(anime => (
              <Link
                key={anime.slug}
                href={`/anime/characterdle/${anime.slug}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 20px', borderRadius: 16,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--soft)',
                  textDecoration: 'none', color: '#fff', fontWeight: 700
                }}
              >
                <span style={{ fontSize: 22 }}>{anime.icon}</span>
                {anime.name}
              </Link>
            ))}
          </div>

          <button onClick={() => router.push('/anime')} className="btn-secondary" style={{ width: '100%', marginTop: 20 }}>
            Volver
          </button>
        </div>
      </div>
    </div>
  )
}