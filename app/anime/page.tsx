'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function randomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase()
}

/** Fondo animado rojo/rosado con glows y partículas */
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

export default function AnimeHome() {
  const router = useRouter()
  const { curtain, run, busy } = useCurtainNav()
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState('')

  const createRoom = async () => {
    if (!nickname) return alert('Poné un nombre')
    const code = randomCode()

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ code })
      .select()
      .single()
    if (error) return alert(error.message)

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, nickname })
      .select()
      .single()
    if (playerError) return alert(playerError.message)

    localStorage.setItem('playerId', player.id)
    router.push(`/anime/room/${code}`)
  }

  const joinRoom = async () => {
    if (!nickname || !joinCode) return alert('Faltan datos')

    const { data: room, error } = await supabase
      .from('rooms')
      .select()
      .eq('code', joinCode.toUpperCase())
      .single()
    if (error || !room) return alert('Sala no encontrada')

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, nickname })
      .select()
      .single()
    if (playerError) return alert(playerError.message)

    localStorage.setItem('playerId', player.id)
    router.push(`/anime/room/${room.code}`)
  }

  return (
    <div className="theme-anime">
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
          <h1 className="brand-title">ANIME</h1>
          <span className="brand-kicker sg-rise sg-d1">SHOW</span>
        </div>

        <div className="eq sg-rise sg-d2">
          <span /><span /><span /><span />
        </div>

        <h2 className="page-title sg-rise sg-d3">Anime</h2>
        <p className="page-subtitle sg-rise sg-d4">Adiviná el anime del día, o entrá con amigos a jugar en sala.</p>

        <div style={{ display: 'flex', gap: 12, width: 'min(100%, 480px)', marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => run('Desafío Diario', () => router.push('/anime/daily'))}
            className="btn-principal sg-sheen sg-rise sg-d5"
            style={{ flex: 1 }}
          >
            Desafío Diario
          </button>
          <button
            type="button"
            onClick={() => run('Adiviná el Personaje', () => router.push('/anime/characterdle'))}
            className="btn-principal sg-sheen sg-rise sg-d5"
            style={{ flex: 1 }}
          >
            Adiviná el Personaje
          </button>
          <button
            type="button"
            onClick={() => run('Grid Diario', () => router.push('/anime/grid-diario'))}
            className="btn-principal sg-sheen sg-rise sg-d5"
            style={{ flex: 1 }}
          >
            Grid Diario
          </button>
        </div>

        <main className="page-card sg-breathe">
          <label className="field-label" htmlFor="nickname">Tu nombre</label>
          <input
            id="nickname"
            className="form-field"
            placeholder="Tu nombre"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
          />

          <button
            type="button"
            onClick={() => run('Creando sala', createRoom)}
            className="btn-principal sg-sheen sg-sheen-slow"
            style={{ width: '100%', marginTop: 14 }}
          >
            Crear sala de Duelo
          </button>

          <div className="divider"><span>O unite</span></div>

          <div className="form-row">
            <input
              className="form-field"
              placeholder="Código"
              maxLength={4}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
            />
            <button
              type="button"
              onClick={() => run('Entrando a la sala', joinRoom)}
              className="btn-principal"
            >
              Unirse
            </button>
          </div>

          <div className="divider"><span>o</span></div>

          <button
            type="button"
            onClick={() => run('Archivo', () => router.push('/anime/archive'))}
            className="btn-secondary"
            style={{ width: '100%' }}
          >
            Ver archivo del Desafío Diario
          </button>
        </main>
      </div>

      {curtain && <Curtain label={curtain.label} leaving={curtain.leaving} />}
    </div>
  )
}