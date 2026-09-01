'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { baseTitle, normalize, loadTrackPool, Track } from '@/lib/tracks'

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
  const advanceScheduledRound = useRef<number | null>(null)
  const isSubmitting = useRef(false)

  // Pool compartido de canciones (el mismo que usan Supervivencia y Diario),
  // cargado una sola vez al entrar y usado solo para sugerir mientras se escribe.
  const [pool, setPool] = useState<Track[]>([])
  const [suggestions, setSuggestions] = useState<Track[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // 0. Cargar el pool de canciones una sola vez (viene del caché compartido, no pega a iTunes salvo que esté vencido)
  useEffect(() => {
    let cancelled = false
    loadTrackPool()
      .then(tracks => { if (!cancelled) setPool(tracks) })
      .catch(e => console.error('Error cargando el pool de canciones', e))
    return () => { cancelled = true }
  }, [])

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
      setSuggestions([])
      setShowSuggestions(false)
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

  // 4. Cronómetro: solo cuenta el tiempo y detecta cuándo se cumplió (por reloj o porque alguien ganó).
  // Deja de tickear apenas arranca la revelación, para que secondsLeft no siga
  // cambiando de ahí en más (eso reiniciaba el efecto de avance en cada segundo
  // y terminaba cancelando su propio setTimeout ya programado).
  useEffect(() => {
    if (showReveal) return

    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)

      if (diff === 0 && !showReveal) {
        setShowReveal(true)
        audioRef.current?.pause()
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundDeadline, showReveal])

  // 5. Avance de ronda: ÚNICO punto de control. Se dispara ni bien la ronda
  // termina (por tiempo agotado o porque alguien ganó, lo que pase primero),
  // se agenda una sola vez por ronda gracias al candado, y calcula la duración
  // de la siguiente ronda una única vez, en el momento en que efectivamente
  // arranca — así nunca puede quedar más corta por una doble programación.
  useEffect(() => {
    console.log('[duelo] check avance', { isHost, advanceScheduledRound: advanceScheduledRound.current, currentRound, duelRound: duel?.round_number, winner: duel?.winner_player_id, secondsLeft })
    if (!isHost || advanceScheduledRound.current === currentRound) return

    // No evaluamos nada hasta que el `duel` cargado sea el de ESTA ronda —
    // si no, todavía tenemos los datos viejos de la ronda anterior (con su
    // propio ganador ya marcado), y eso hacía creer que la ronda actual ya
    // había terminado antes de arrancar.
    if (!duel || duel.round_number !== currentRound) return

    const roundEnded = !!duel.winner_player_id || secondsLeft === 0
    if (!roundEnded) return

    console.log('[duelo] programando avance, ronda terminó', { currentRound, totalRounds })
    advanceScheduledRound.current = currentRound
    const timer = setTimeout(() => {
      console.log('[duelo] ejecutando avance ahora')
      if (currentRound >= totalRounds) {
        supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
          .then(({ error }) => { if (error) console.error('[duelo] error al finalizar', error) })
      } else {
        supabase.from('rooms').update({
          current_round: currentRound + 1,
          round_deadline: new Date(nowSynced() + roundDuration * 1000).toISOString()
        }).eq('id', roomId)
          .then(({ error }) => {
            if (error) console.error('[duelo] error al avanzar ronda', error)
            else console.log('[duelo] avance escrito OK')
          })
      }
    }, REVEAL_SECONDS * 1000)

    return () => clearTimeout(timer)
  }, [isHost, duel?.round_number, duel?.winner_player_id, secondsLeft, currentRound, totalRounds, roomId, roundDuration])

  // 6. Buscador en vivo: filtra el pool ya cargado en memoria, sin pegarle a la red.
  // Se mezcla el orden para no delatar el tema actual por su posición en la lista.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 2 || showReveal || pool.length === 0) {
        setSuggestions([])
        return
      }
      const matches = pool.filter(track =>
        track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q)
      )
      for (let i = matches.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[matches[i], matches[j]] = [matches[j], matches[i]]
      }
      setSuggestions(matches.slice(0, 15))
    }, 150)
    return () => clearTimeout(t)
  }, [guess, showReveal, pool])

  const submitGuess = useCallback(async (guessTitle?: string) => {
    if (!duel || duel.winner_player_id || showReveal) return
    const candidate = (guessTitle ?? guess).trim()
    if (!candidate) return
    if (isSubmitting.current) return
    isSubmitting.current = true

    const isCorrect = normalize(baseTitle(candidate)) === normalize(baseTitle(duel.track_title))

    if (!isCorrect) {
      new Audio('/audios/error.mp3').play().catch(e => console.log('Audio error:', e));
      setShowWrong(true)
      setGuess('')
      setSuggestions([])
      setShowSuggestions(false)
      isSubmitting.current = false
      return
    }

    new Audio('/audios/correcto.mp3').play().catch(e => console.log('Audio error:', e));

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
        <div className="guess-input-wrap" style={{ position: 'relative' }}>
          <input
            className="guess-input"
            value={guess}
            onChange={e => { setGuess(e.target.value); setShowWrong(false); setShowSuggestions(true) }}
            onFocus={() => { if (guess.trim().length >= 2) setShowSuggestions(true) }}
            onKeyDown={e => e.key === 'Enter' && submitGuess()}
            placeholder="Nombre de la canción"
            autoFocus
            autoComplete="off"
          />
          <button onClick={() => submitGuess()} className="btn-principal">Adivinar</button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <ul className="track-results" style={{ marginTop: 8 }}>
            {suggestions.map((s, i) => (
              <li key={i} onClick={() => submitGuess(s.title)} className="track-result" style={{ cursor: 'pointer' }}>
                <img src={s.cover} alt="" />
                <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                  <strong>{s.title}</strong>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.artist}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showWrong && <p className="status-box is-wrong">No es esa canción, seguí intentando.</p>}
      </div>
    </div>
  )
}