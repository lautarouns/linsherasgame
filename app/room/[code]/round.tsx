'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'

const DEFAULT_ROUND_SECONDS = 15
const REVEAL_SECONDS = 5
const BASE_POINTS = 100
const MIN_GUESS_POINTS = 10
const OWNER_POINTS_PER_CORRECT_GUESS = 15

type Pick = {
  track_name: string
  artist: string
  preview_url: string
  artwork_url: string
  player_id: string
}

type RoundRow = { id: string; round_number: number; picks: Pick }

type SearchResult = {
  trackId: number
  trackName: string
  artistName: string
  previewUrl: string
  artworkUrl100: string
}

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function baseTitle(trackName: string) {
  return trackName.split('(')[0].split('[')[0].trim()
}

function pickRevealIndices(title: string): number[] {
  const words: { start: number; text: string }[] = []
  let idx = 0
  title.split(' ').forEach(w => {
    words.push({ start: idx, text: w })
    idx += w.length + 1
  })

  const letterPositions = (word: { start: number; text: string }) =>
    word.text
      .split('')
      .map((ch, i) => (/[a-zA-Z0-9]/.test(ch) ? word.start + i : -1))
      .filter(i => i !== -1)

  const revealed: number[] = []

  if (words.length <= 1) {
    const positions = letterPositions(words[0])
    const shuffled = [...positions].sort(() => Math.random() - 0.5)
    revealed.push(...shuffled.slice(0, 2))
  } else {
    words.forEach(w => {
      const positions = letterPositions(w)
      if (positions.length > 0) {
        revealed.push(positions[Math.floor(Math.random() * positions.length)])
      }
    })
  }

  return revealed
}

function maskTitle(title: string, revealed: Set<number>) {
  return title
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return '   '
      if (!/[a-zA-Z0-9]/.test(ch)) return ch
      return revealed.has(i) ? ch : '_'
    })
    .join('')
}

export default function RoundPhase({
  roomId, playerId, currentRound, roundDeadline, isHost, totalRounds, roundSeconds
}: {
  roomId: string; playerId: string; currentRound: number
  roundDeadline: string; isHost: boolean; totalRounds: number
  roundSeconds: number
}) {
  const roundDuration = roundSeconds > 0 ? roundSeconds : DEFAULT_ROUND_SECONDS
  const [round, setRound] = useState<RoundRow | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(roundDuration)
  const [guess, setGuess] = useState('')
  const [revealedIdx, setRevealedIdx] = useState<Set<number>>(new Set())
  const [correct, setCorrect] = useState(false)
  const [showWrong, setShowWrong] = useState(false)
  const [earned, setEarned] = useState<number | null>(null)
  const [showReveal, setShowReveal] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const revealedOnce = useRef(false)
  const advanceScheduled = useRef(false)
  const streakBroken = useRef(false) 
  const isSubmitting = useRef(false) // NUEVO: Candado para evitar el doble puntaje

  // Sugerencias de la fase de adivinar: pasan por nuestro propio endpoint
  // (app/api/search-songs), igual que en la elección de canciones — así
  // aparece cualquier tema que se haya podido elegir (no solo los del pool
  // curado), y sin depender de la IP de cada jugador.
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    const load = async () => {
      setCorrect(false)
      setShowWrong(false)
      setGuess('')
      setRevealedIdx(new Set())
      setEarned(null)
      setShowReveal(false)
      setSecondsLeft(roundDuration)
      revealedOnce.current = false
      advanceScheduled.current = false
      streakBroken.current = false 
      isSubmitting.current = false // Liberamos el candado al inicio de cada ronda
      setSuggestions([])
      setShowSuggestions(false)

      const { data } = await supabase
        .from('rounds')
        .select('id, round_number, picks(track_name, artist, preview_url, artwork_url, player_id)')
        .eq('room_id', roomId)
        .eq('round_number', currentRound)
        .single()
      if (data) setRound(data as unknown as RoundRow)
    }
    load()
  }, [roomId, currentRound, roundDuration])

  useEffect(() => {
    if (round?.picks.preview_url && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [round])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, round])

  const handleBreakStreak = useCallback(() => {
    if (streakBroken.current) return
    streakBroken.current = true
    
    supabase.from('players').select('current_streak, nickname').eq('id', playerId).single()
      .then(({ data: p }) => {
        if (p && p.current_streak && p.current_streak >= 4) {
          // NUEVO: Agregamos el self: true para que el host lo vea
          supabase.channel(`chat-${roomId}`, { config: { broadcast: { self: true } } }).send({
            type: 'broadcast',
            event: 'chat-message',
            payload: {
              id: 'sys-break-' + Date.now(),
              nickname: 'Sistema',
              text: `¡${p.nickname} perdió la racha!`,
              created_at: new Date().toISOString(),
              isSystem: true
            }
          })
        }
        supabase.from('players').update({ current_streak: 0 }).eq('id', playerId).then()
      })
  }, [playerId, roomId])

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)

      if (!revealedOnce.current && diff <= Math.floor(roundDuration / 2) && round) {
        revealedOnce.current = true
        const title = baseTitle(round.picks.track_name)
        setRevealedIdx(new Set(pickRevealIndices(title)))
      }

      if (diff === 0 && !showReveal) {
        setShowReveal(true)
        audioRef.current?.pause()

        if (!correct && round?.picks.player_id !== playerId) {
          handleBreakStreak()
        }
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
  }, [roundDeadline, round, isHost, currentRound, totalRounds, roomId, showReveal, correct, playerId, handleBreakStreak, roundDuration])

  // Buscador en vivo: pasa por nuestro propio endpoint (app/api/search-songs),
  // que consulta iTunes desde el servidor con un cachecito corto — mismo
  // patrón que la fase de elección, así aparece cualquier tema válido.
  useEffect(() => {
    const q = guess.trim()
    if (q.length < 1 || correct || showReveal) {
      setSuggestions([])
      return
    }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-songs?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setSuggestions(data.results ?? [])
      } catch (e) {
        console.error('Error buscando canciones', e)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [guess, correct, showReveal])

  const submitGuess = useCallback(async (guessTitle?: string) => {
    if (!round || correct || showReveal) return
    if (round.picks.player_id === playerId) return
    const candidate = (guessTitle ?? guess).trim()
    if (!candidate) return

    // NUEVO: Bloqueamos si ya está procesando una respuesta
    if (isSubmitting.current) return
    isSubmitting.current = true

    const isCorrect = normalize(baseTitle(candidate)) === normalize(baseTitle(round.picks.track_name))

    if (!isCorrect) {
      new Audio('/audios/error.mp3').play().catch(e => console.log('Audio error:', e));
      setShowWrong(true)
      setGuess('')
      setSuggestions([])
      setShowSuggestions(false)
      
      // Liberamos el candado para que pueda intentar de nuevo
      isSubmitting.current = false 
      return
    }

    new Audio('/audios/correcto.mp3').play().catch(e => console.log('Audio error:', e));

    const elapsedMs = (roundDuration - secondsLeft) * 1000
    const points = Math.max(
      MIN_GUESS_POINTS,
      Math.round(BASE_POINTS * (1 - elapsedMs / (roundDuration * 1000)))
    )

    await supabase.from('guesses').insert({ round_id: round.id, player_id: playerId, is_correct: true })

    const { data: guesser } = await supabase.from('players').select('score, total_score, current_streak, nickname').eq('id', playerId).single()
    
    if (guesser) {
      let finalPoints = points;
      const currentStreak = guesser.current_streak || 0;
      const newStreak = currentStreak + 1;

      if (newStreak >= 4) {
        finalPoints = Math.round(points * 1.50);
      }

      await supabase.from('players').update({
        score: guesser.score + finalPoints,
        total_score: (guesser.total_score ?? 0) + finalPoints,
        current_streak: newStreak
      }).eq('id', playerId)

      if (newStreak === 4) {
        // NUEVO: Agregamos el self: true acá también
        supabase.channel(`chat-${roomId}`, { config: { broadcast: { self: true } } }).send({
          type: 'broadcast',
          event: 'chat-message',
          payload: {
            id: 'sys-' + Date.now(),
            nickname: 'Sistema',
            text: `¡${guesser.nickname} está en racha! 🔥`,
            created_at: new Date().toISOString(),
            isSystem: true 
          }
        })
      }

      setEarned(finalPoints)
    }

    const { data: owner } = await supabase.from('players').select('score, total_score').eq('id', round.picks.player_id).single()
    if (owner) {
      await supabase.from('players').update({
        score: owner.score + OWNER_POINTS_PER_CORRECT_GUESS,
        total_score: (owner.total_score ?? 0) + OWNER_POINTS_PER_CORRECT_GUESS
      }).eq('id', round.picks.player_id)
    }

    setCorrect(true)
  }, [round, guess, playerId, correct, secondsLeft, showReveal, roomId, handleBreakStreak, roundDuration])

  if (!round) return <p className="status-box">Cargando ronda...</p>

  const isOwnSong = round.picks.player_id === playerId
  const pct = roundDuration > 0 ? Math.max(0, Math.min(100, (secondsLeft / roundDuration) * 100)) : 0

  if (showReveal) {
    return (
      <div className="reveal-panel">
        <span className="section-title" style={{ margin: 0 }}>Ronda {currentRound} de {totalRounds}</span>
        <img className="reveal-art" src={round.picks.artwork_url} width={190} height={190} alt="" />
        <h2 className="reveal-title">{round.picks.track_name}</h2>
        <p className="reveal-artist">{round.picks.artist}</p>

        {!isOwnSong && correct && (
          <div className="reveal-result">
            ¡Acertaste! <strong>+{earned}</strong> puntos
          </div>
        )}
        {!isOwnSong && !correct && (
          <div className="reveal-result is-neutral">No la adivinaste esta vez.</div>
        )}
        {isOwnSong && (
          <div className="reveal-result is-neutral">Era tu canción.</div>
        )}
      </div>
    )
  }

  return (
    <div className="room-section">
      <div className="phase-head">
        <span className="section-title">Ronda {currentRound} / {totalRounds}</span>
        <div className="timer-badge">
          <strong>{String(secondsLeft).padStart(2, '0')}</strong>
          <span>s</span>
        </div>
      </div>

      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="hint-box">
        <p className="hint-text">
          {maskTitle(baseTitle(round.picks.track_name), revealedIdx)}
        </p>
      </div>

      {round.picks.preview_url && (
        <>
          <audio ref={audioRef} src={round.picks.preview_url} autoPlay />
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

      {isOwnSong && <p className="status-box">Esta es tu canción — esperá el resultado.</p>}
      {!isOwnSong && correct && <p className="status-box is-correct">¡Correcto! Sumaste {earned} puntos.</p>}

      {!isOwnSong && !correct && (
        <div className="guess-panel">
          <p className="guess-header">Tu intento</p>
          <div className="guess-input-wrap">
            <input
              className="guess-input"
              value={guess}
              onChange={e => { setGuess(e.target.value); setShowWrong(false); setShowSuggestions(true) }}
              onFocus={() => { if (guess.trim().length >= 1) setShowSuggestions(true) }}
              onKeyDown={e => e.key === 'Enter' && submitGuess()}
              placeholder="Nombre de la canción"
              autoComplete="off"
            />
            <button onClick={() => submitGuess()} className="btn-principal">Adivinar</button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <ul className="track-results" style={{ marginTop: 8 }}>
              {suggestions.map((s, i) => (
                <li key={s.trackId ?? i} onClick={() => submitGuess(s.trackName)} className="track-result" style={{ cursor: 'pointer' }}>
                  <img src={s.artworkUrl100} alt="" />
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <strong>{s.trackName}</strong>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.artistName}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showWrong && <p className="status-box is-wrong">No es esa canción, seguí intentando.</p>}
        </div>
      )}
    </div>
  )
}