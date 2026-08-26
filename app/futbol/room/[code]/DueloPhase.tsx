'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { seededShuffle, normalize } from '@/lib/tracks'

export default function DueloPhase({ roomId, playerId, roomCode, roundDeadline, isHost, totalPlayers }:
  { roomId: string, playerId: string | null, roomCode: string, roundDeadline: string, isHost?: boolean, totalPlayers: number }) {

  const [playersPool, setPlayersPool] = useState<any[]>([])
  const [index, setIndex] = useState(0)
  const [guessed, setGuessed] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  const durationMsRef = useRef<number>(new Date(roundDeadline).getTime() - nowSynced())
  const [effectiveDeadline, setEffectiveDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number>(() => Math.ceil(durationMsRef.current / 1000))
  const [isFinished, setIsFinished] = useState(false)

  const [guess, setGuess] = useState('')

  // Load football players and shuffle deterministically
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoading(true)
        const { data } = await supabase.from('football_players').select('*')
        const pool = data ?? []
        const shuffled = seededShuffle(pool, roomCode + roundDeadline)
        if (!cancelled) {
          setPlayersPool(shuffled)
          setEffectiveDeadline(nowSynced() + durationMsRef.current)
        }
      } catch (e) {
        console.error('Error cargando players', e)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [roomCode, roundDeadline])

  // Cronómetro
  useEffect(() => {
    if (effectiveDeadline === null) return
    const tick = () => {
      const diff = Math.max(0, Math.ceil((effectiveDeadline - nowSynced()) / 1000))
      setRemaining(diff)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [effectiveDeadline])

  // Finalizar localmente
  useEffect(() => {
    if (effectiveDeadline !== null && remaining <= 0 && !isFinished) {
      setIsFinished(true)
      ;(async () => {
        if (playerId) {
          await supabase.from('players').update({ score: guessed }).eq('id', playerId)
        }
      })()
    }
  }, [remaining, isFinished, guessed, playerId, effectiveDeadline])

  // Host: chequear global y cerrar la sala
  useEffect(() => {
    if (!isHost) return
    const checkGlobal = setInterval(() => {
      const globalTimeLeft = new Date(roundDeadline).getTime() - nowSynced()
      if (globalTimeLeft <= 0 || (remaining <= 0 && totalPlayers === 1)) {
        clearInterval(checkGlobal)
        supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId).then()
      }
    }, 1000)
    return () => clearInterval(checkGlobal)
  }, [isHost, roundDeadline, roomId, remaining, totalPlayers])

  const submitGuess = (guessTitle?: string) => {
    if (isFinished || playersPool.length === 0) return
    const track = playersPool[index]
    const candidate = (guessTitle ?? guess).trim()
    if (!candidate) return

    // Normalizamos lo que escribió el usuario
    const normalizedCandidate = normalize(candidate)
    
    // Normalizamos el nombre completo de la BD
    const fullNormalizedTarget = normalize(track.name)
    
    // Dividimos el nombre de la BD en palabras (ej: ["lionel", "messi"])
    const targetParts = track.name.split(' ').map((part: string) => normalize(part))

    // Es correcto si escribe el nombre completo, o si pega una de las palabras exactas (el apellido o primer nombre)
    const isCorrect = fullNormalizedTarget === normalizedCandidate || targetParts.includes(normalizedCandidate)

    if (isCorrect) {
      setGuessed(c => c + 1)
      setIndex(i => Math.min(playersPool.length - 1, i + 1))
      setGuess('')
    } else {
      // Restamos 3 segundos al reloj de forma correcta
      setEffectiveDeadline(d => (d !== null ? d - 3000 : d))
      setGuess('')
    }
  }

  const handleSkip = () => {
    if (isFinished || playersPool.length === 0) return
    setEffectiveDeadline(d => (d !== null ? d - 5000 : d))
    setIndex(i => Math.min(playersPool.length - 1, i + 1))
    setGuess('')
  }

  // Render clubs for current player
  const renderClubs = (item: any) => {
    const clubs = item?.clubs ?? item?.teams ?? ''
    let list: string[] = []
    if (Array.isArray(clubs)) list = clubs
    else if (typeof clubs === 'string') list = clubs.split(',').map(s => s.trim()).filter(Boolean)

    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12 }}>
        {list.map((c, i) => (
          <div key={i} style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--table-row)', color: '#fff', border: '1px solid rgba(255,255,255,0.04)' }}>{c}</div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: remaining <= 10 ? '#ff5252' : '#fff', transition: 'color 0.3s' }}>
          {remaining}s
        </div>
      </div>

      {isLoading && <p className="status-box" style={{ textAlign: 'center' }}>Cargando jugadores...</p>}

      {!isFinished ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cards grid showing all clubs of current player */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {playersPool[index] ? renderClubs(playersPool[index]) : <div className="status-box">No hay jugadores</div>}
          </div>

          <input
            value={guess}
            onChange={e => setGuess(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
            placeholder="Escribí el nombre del jugador"
            className="guess-input"
            disabled={isFinished}
            autoComplete="off"
            autoFocus
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-principal" onClick={() => submitGuess()} style={{ flex: 1 }}>Adivinar</button>
            <button className="btn-principal" onClick={handleSkip} style={{ flex: 1, background: 'rgba(255, 82, 82, 0.1)', border: '1px solid rgba(255, 82, 82, 0.3)', color: '#ff5252', boxShadow: 'none' }}>Saltar (-5s)</button>
          </div>

          <div className="daily-meta" style={{ display: 'flex', marginTop: 20 }}>
            <div className="daily-meta-item" style={{ flex: 1, textAlign: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Adivinadas</span>
              <strong style={{ fontSize: 16, color: 'var(--accent)' }}>🔥 {guessed}</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="daily-result is-win" style={{ marginTop: 20, padding: 32, textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 24 }}>¡Tiempo finalizado!</h3>
          <p style={{ color: 'var(--muted)' }}>Conseguiste adivinar <strong>{guessed}</strong> jugadores.</p>
          {totalPlayers > 1 && <p style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 'bold' }}>Esperando a que termine el resto para ver los resultados...</p>}
        </div>
      )}

    </div>
  )
}