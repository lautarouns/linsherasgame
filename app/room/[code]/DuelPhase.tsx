'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { baseTitle, normalize } from '@/lib/tracks'

const DEFAULT_ROUND_SECONDS = 20
const REVEAL_SECONDS = 4
const DUEL_POINTS = 100

type DuelRow = {
  id: string
  round_number: number
  track_title: string
  track_artist: string
  track_cover: string | null
  track_preview_url: string
  winner_player_id: string | null
  winner_nickname: string | null
}

export default function DuelPhase({
  roomId, playerId, nickname, currentRound, roundDeadline, isHost, totalRounds, roundSeconds
}: {
  roomId: string; playerId: string; nickname?: string; currentRound: number
  roundDeadline: string; isHost: boolean; totalRounds: number
  roundSeconds: number
}) {
  const roundDuration = roundSeconds > 0 ? roundSeconds : DEFAULT_ROUND_SECONDS
  const [duel, setDuel] = useState<DuelRow | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(roundDuration)
  const [guess, setGuess] = useState('')
  const [showWrong, setShowWrong] = useState(false)
  const [iWon, setIWon] = useState(false)
  const [showReveal, setShowReveal] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const advanceScheduled = useRef(false)
  const isSubmitting = useRef(false)

  // 1. Cargar la ronda actual (la fila de `duels` correspondiente) y resetear estado local
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setDuel(null)
      setGuess('')
      setShowWrong(false)
      setIWon(false)
      setShowReveal(false)
      setSecondsLeft(roundDuration)
      advanceScheduled.current = false
      isSubmitting.current = false

      const { data } = await supabase
        .from('duels')
        .select('id, round_number, track_title, track_artist, track_cover, track_preview_url, winner_player_id, winner_nickname')
        .eq('room_id', roomId)
        .eq('round_number', currentRound)
        .single()

      if (!cancelled && data) setDuel(data as DuelRow)
    }
    load()
    return () => { cancelled = true }
  }, [roomId, currentRound, roundDuration])

  // 2. Escuchar en tiempo real cuándo alguien gana la ronda (para que TODOS vean el resultado, no solo el que acertó)
  useEffect(() => {
    if (!duel) return
    const channel = supabase
      .channel(`duel-${duel.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'duels',
        filter: `id=eq.${duel.id}`
      }, payload => {
        const updated = payload.new as DuelRow
        setDuel(updated)
        if (updated.winner_player_id && !showReveal) {
          setShowReveal(true)
          audioRef.current?.pause()
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [duel?.id, showReveal])

  // 3. Reproducir automáticamente al cargar la ronda
  useEffect(() => {
    if (duel?.track_preview_url && audioRef.current && !showReveal) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [duel, showReveal])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, duel])

  // 4. Cronómetro + avance automático (lo maneja el host, igual que en Clásico)
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)

      if (diff === 0 && !showReveal) {
        setShowReveal(true)
        audioRef.current?.pause()
      }

      if (diff === 0 && isHost && !advanceScheduled.current) {
        advanceScheduled.current = true
        setTimeout(() => {
          if (currentRound >= totalRounds) {
            supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
              .then(({ error }) => { if (error) console.error(error) })
          } else {
            supabase.from('rooms').update({
              current_round: currentRound + 1,
              round_deadline: new Date(nowSynced() + roundDuration * 1000).toISOString()
            }).eq('id', roomId)
              .then(({ error }) => { if (error) console.error(error) })
          }
        }, REVEAL_SECONDS * 1000)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundDeadline, isHost, currentRound, totalRounds, roomId, showReveal, roundDuration])

  // 5. Si alguien ganó, el host también programa el avance automático (por si el timer normal no llegó a 0 todavía)
  useEffect(() => {
    if (!isHost || !duel?.winner_player_id || advanceScheduled.current) return
    advanceScheduled.current = true
    setTimeout(() => {
      if (currentRound >= totalRounds) {
        supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
          .then(({ error }) => { if (error) console.error(error) })
      } else {
        supabase.from('rooms').update({
          current_round: currentRound + 1,
          round_deadline: new Date(nowSynced() + roundDuration * 1000).toISOString()
        }).eq('id', roomId)
          .then(({ error }) => { if (error) console.error(error) })
      }
    }, REVEAL_SECONDS * 1000)
  }, [duel?.winner_player_id, isHost, currentRound, totalRounds, roomId, roundDuration])

  const submitGuess = useCallback(async () => {
    if (!duel || duel.winner_player_id || !guess.trim() || showReveal) return
    if (isSubmitting.current) return
    isSubmitting.current = true

    const isCorrect = normalize(guess) === normalize(baseTitle(duel.track_title))

    if (!isCorrect) {
      setShowWrong(true)
      setGuess('')
      isSubmitting.current = false
      return
    }

    // Intento atómico: solo gana quien logre pasar winner_player_id de null a su id.
    // Postgres serializa los UPDATE sobre la misma fila, así que no puede haber empate.
    const { data: claimed } = await supabase
      .from('duels')
      .update({
        winner_player_id: playerId,
        winner_nickname: nickname ?? null,
        answered_at: new Date().toISOString()
      })
      .eq('id', duel.id)
      .is('winner_player_id', null)
      .select()
      .maybeSingle()

    if (claimed) {
      setIWon(true)
      setDuel(claimed as DuelRow)
      setShowReveal(true)
      audioRef.current?.pause()

      const { data: p } = await supabase.from('players').select('score, total_score').eq('id', playerId).single()
      if (p) {
        await supabase.from('players').update({
          score: p.score + DUEL_POINTS,
          total_score: (p.total_score ?? 0) + DUEL_POINTS
        }).eq('id', playerId)
      }
    } else {
      // Adivinaste bien, pero otro jugador te ganó de mano por instantes
      setGuess('')
      isSubmitting.current = false
    }
  }, [duel, guess, showReveal, playerId, nickname])

  if (!duel) return <p className="status-box">Cargando duelo...</p>

  const pct = roundDuration > 0 ? Math.max(0, Math.min(100, (secondsLeft / roundDuration) * 100)) : 0

  if (showReveal) {
    const winnerName = duel.winner_nickname
    return (
      <div className="reveal-panel">
        <span className="section-title" style={{ margin: 0 }}>Duelo {currentRound} de {totalRounds}</span>
        {duel.track_cover && (
          <img className="reveal-art" src={duel.track_cover} width={190} height={190} alt="" />
        )}
        <h2 className="reveal-title">{duel.track_title}</h2>
        <p className="reveal-artist">{duel.track_artist}</p>

        {winnerName ? (
          <div className={iWon ? 'reveal-result' : 'reveal-result is-neutral'}>
            {iWon ? <>¡La sacaste! <strong>+{DUEL_POINTS}</strong> puntos</> : <><strong>{winnerName}</strong> la adivinó primero</>}
          </div>
        ) : (
          <div className="reveal-result is-neutral">Nadie la adivinó esta vez.</div>
        )}
      </div>
    )
  }

  return (
    <div className="room-section">
      <div className="phase-head">
        <span className="section-title">Duelo {currentRound} / {totalRounds}</span>
        <div className="timer-badge">
          <strong>{String(secondsLeft).padStart(2, '0')}</strong>
          <span>s</span>
        </div>
      </div>

      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', margin: '16px 0', textAlign: 'center' }}>
        <p style={{ margin: 0, color: 'var(--muted-strong)' }}>El primero en adivinar se lleva los <strong>{DUEL_POINTS}</strong> puntos.</p>
      </div>

      {duel.track_preview_url && (
        <>
          <audio ref={audioRef} src={duel.track_preview_url} autoPlay />
          <div className="volume-row">
            <span>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
            />
            <span className="volume-value">{Math.round(volume * 100)}%</span>
          </div>
        </>
      )}

      <div className="guess-panel">
        <p className="guess-header">Tu intento</p>
        <div className="guess-input-wrap">
          <input
            className="guess-input"
            value={guess}
            onChange={e => { setGuess(e.target.value); setShowWrong(false) }}
            onKeyDown={e => e.key === 'Enter' && submitGuess()}
            placeholder="Nombre de la canción"
            autoFocus
          />
          <button onClick={submitGuess} className="btn-principal">Adivinar</button>
        </div>
        {showWrong && <p className="status-box is-wrong">No es esa canción, seguí intentando.</p>}
      </div>
    </div>
  )
}
