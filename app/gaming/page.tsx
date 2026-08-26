'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/** Fondo animado violeta con glows y partículas */
function AnimatedBackground({ count = 13 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1)
        const b = Math.abs((Math.sin(i * 78.233) * 12345.6789) % 1)
        return {
          left: `${a * 100}%`,
          top: `${30 + b * 60}%`,
          size: 2 + b * 3,
          duration: `${9 + b * 10}s`,
          delay: `${-a * 14}s`,
        }
      }),
    [count]
  )

  return (
    <div className="sg-bg" aria-hidden>
      <span className="sg-glow-a" />
      <span className="sg-glow-b" />
      <span className="sg-scanline" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="sg-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  )
}

function Curtain({ label, leaving }: { label: string; leaving: boolean }) {
  return (
    <div className={`sg-curtain${leaving ? ' is-leaving' : ''}`} aria-hidden>
      <div className="sg-curtain-eq">
        <span /><span /><span /><span /><span />
      </div>
      <p className="sg-curtain-label">{label}</p>
    </div>
  )
}

function useCurtainNav() {
  const [curtain, setCurtain] = useState<{ label: string; leaving: boolean } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const run = (label: string, navigate: () => void | Promise<void>) => {
    if (curtain) return
    setCurtain({ label, leaving: false })
    timers.current.push(setTimeout(() => { void navigate() }, 620))
    timers.current.push(setTimeout(() => setCurtain(c => (c ? { ...c, leaving: true } : c)), 1400))
    timers.current.push(setTimeout(() => setCurtain(null), 1900))
  }

  return { curtain, run, busy: !!curtain }
}

export default function GamingHome() {
  const router = useRouter()
  const { curtain, run, busy } = useCurtainNav()

  return (
    <div className="theme-gaming">
      <AnimatedBackground count={13} />

      <div className={`page-shell${busy ? ' sg-shell-out' : ''}`} style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'absolute', left: 18, top: 18 }}>
          <button
            type="button"
            onClick={() => run('Volviendo al Menú', () => router.push('/'))}
            className="btn-secondary"
            aria-label="Volver al Menú"
          >
            Volver al Menú
          </button>
        </div>

        <div className="brand-header">
          <h1 className="brand-title">VIDEOJUEGOS</h1>
          <span className="brand-kicker sg-rise sg-d1">GAME</span>
        </div>

        <div className="eq sg-rise sg-d2">
          <span /><span /><span /><span />
        </div>

        <h2 className="page-title sg-rise sg-d3">Videojuegos</h2>
        <p className="page-subtitle sg-rise sg-d4">Adiviná el juego del día con la menor cantidad de pistas posible.</p>

        <button
          type="button"
          onClick={() => run('Desafío Diario', () => router.push('/gaming/daily'))}
          className="btn-principal sg-sheen sg-rise sg-d5"
          style={{ width: 'min(100%, 320px)', marginBottom: 18 }}
        >
          Desafío Diario
        </button>

        <main className="page-card sg-breathe" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Cada día un juego nuevo. Tenés 12 intentos: empezás con la sinopsis y un personaje secundario poco conocido, y vas destapando características cada vez más obvias.
          </p>
          <button
            type="button"
            onClick={() => run('Archivo', () => router.push('/gaming/archive'))}
            className="btn-secondary"
            style={{ width: '100%', marginTop: 20 }}
          >
            Ver archivo de días anteriores
          </button>
        </main>
      </div>

      {curtain && <Curtain label={curtain.label} leaving={curtain.leaving} />}
    </div>
  )
}