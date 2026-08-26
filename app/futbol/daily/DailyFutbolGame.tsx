'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle, normalize } from '@/lib/tracks' 
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function DailyFutbolGame({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [targetPlayer, setTargetPlayer] = useState<any>(null)
  const [clubs, setClubs] = useState<string[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [attempt, setAttempt] = useState(1)
  const [guess, setGuess] = useState('')
  const [isLoaded, setIsLoaded] = useState(false)

  // 1. Cargar datos del jugador y la partida guardada
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('football_players').select('*')
      const pool = data ?? []
      const shuffled = seededShuffle(pool, dateStr)
      const target = shuffled[0]

      if (!cancelled && target) {
        setTargetPlayer(target)
        let cList: string[] = []
        if (Array.isArray(target.clubs)) cList = target.clubs
        else if (typeof target.clubs === 'string') cList = target.clubs.split(',').map((s: string) => s.trim()).filter(Boolean)
        setClubs(cList)

        // Leer progreso guardado
        const saved = localStorage.getItem(`futbol_daily_${dateStr}`)
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

  // 2. Guardar progreso (SOLO cuando ya se cargó la partida inicial)
  useEffect(() => {
    if (!isLoaded) return
    const dataToSave = { status, attempt }
    localStorage.setItem(`futbol_daily_${dateStr}`, JSON.stringify(dataToSave))
  }, [status, attempt, dateStr, isLoaded])

  const maxAttempts = clubs.length

  const submitGuess = () => {
    if (status !== 'playing' || !guess.trim()) return

    const candidate = guess.trim()
    const normalizedCandidate = normalize(candidate)
    const fullNormalizedTarget = normalize(targetPlayer.name)
    const targetParts = targetPlayer.name.split(' ').map((part: string) => normalize(part))
    
    // Validación flexible (Nombre completo o partes)
    const isCorrect = fullNormalizedTarget === normalizedCandidate || targetParts.includes(normalizedCandidate)

    if (isCorrect) {
      setStatus('win')
    } else {
      if (attempt < maxAttempts) {
        setAttempt(a => a + 1)
      } else {
        setStatus('loss') // Pierde recién cuando agota el último intento
      }
    }
    setGuess('')
  }

  const handleSkip = () => {
    if (status !== 'playing') return

    if (attempt < maxAttempts) {
      setAttempt(a => a + 1)
    } else {
      setStatus('loss') // Rendirse en la última pista
    }
    setGuess('')
  }

  if (!isLoaded || !targetPlayer) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando carrera diaria...</div>

  return (
    <div className="theme-futbol">
      <div className="page-shell">
        <div className="daily-card page-card">
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Modo Individual</p>
              <h1 className="daily-title">Carrera Diaria</h1>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/futbol/archive" className="btn-secondary">Archivo</Link>
              <button onClick={() => router.push('/futbol')} className="btn-secondary">Volver</button>
            </div>
          </div>
          <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 24 }}>
            Adiviná el jugador descubriendo su historial de clubes.
          </p>

          {/* Grilla de clubes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {clubs.map((c, i) => (
              <div key={i} style={{
                padding: '12px 16px',
                borderRadius: 12,
                background: i < attempt || status !== 'playing' ? 'var(--table-row)' : 'rgba(255,255,255,0.02)',
                border: '1px solid var(--soft)',
                color: i < attempt || status !== 'playing' ? '#fff' : 'var(--muted)',
                textAlign: 'center',
                fontWeight: i < attempt || status !== 'playing' ? 700 : 400
              }}>
                {i < attempt || status !== 'playing' ? c : '🔒 Pista oculta'}
              </div>
            ))}
          </div>

          {status === 'playing' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={guess}
                onChange={e => setGuess(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
                placeholder="Escribí el nombre del jugador"
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
              <img src={targetPlayer.image_url} alt={targetPlayer.name} style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover' }} />
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 24 }}>
                  {status === 'win' ? '¡Ganaste!' : '¡Perdiste!'}
                </h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  El jugador era <strong>{targetPlayer.name}</strong>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}