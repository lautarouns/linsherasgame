'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'

const ROUND_SECONDS = 15
const REVEAL_SECONDS = 5
const BASE_POINTS = 1000

type Pick = {
  track_name: string
  artist: string
  preview_url: string
  artwork_url: string
  player_id: string
}

type RoundRow = { id: string; round_number: number; picks: Pick }

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function baseTitle(trackName: string) {
  return trackName.split('(')[0].split('[')[0].trim()
}

function maskTitle(title: string, revealed: Set<number>) {
  return title.split('').map((ch, i) => {
    if (!/[a-zA-Z0-9]/.test(ch)) return ch
    return revealed.has(i) ? ch : '_'
  }).join(' ')
}

export default function RoundPhase({
  roomId, playerId, currentRound, roundDeadline, isHost, totalRounds
}: {
  roomId: string; playerId: string; currentRound: number
  roundDeadline: string; isHost: boolean; totalRounds: number
}) {
  const [round, setRound] = useState<RoundRow | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS)
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

  useEffect(() => {
    setCorrect(false)
    setShowWrong(false)
    setGuess('')
    setRevealedIdx(new Set())
    setEarned(null)
    setShowReveal(false)
    revealedOnce.current = false
    advanceScheduled.current = false

    const load = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, round_number, picks(track_name, artist, preview_url, artwork_url, player_id)')
        .eq('room_id', roomId)
        .eq('round_number', currentRound)
        .single()
      if (data) setRound(data as unknown as RoundRow)
    }
    load()
  }, [roomId, currentRound])

  useEffect(() => {
    if (round?.picks.preview_url && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }, [round])

  // Mantiene el volumen elegido cada vez que arranca una canción nueva
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, round])

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)

      if (!revealedOnce.current && diff <= Math.floor(ROUND_SECONDS / 2) && round) {
        revealedOnce.current = true
        const title = baseTitle(round.picks.track_name)
        const letterPositions = title
          .split('')
          .map((ch, i) => (/[a-zA-Z0-9]/.test(ch) ? i : -1))
          .filter(i => i !== -1)
        const shuffled = [...letterPositions].sort(() => Math.random() - 0.5)
        setRevealedIdx(new Set(shuffled.slice(0, 2)))
      }

      if (diff === 0 && !showReveal) {
        console.log('[round] mostrando reveal')
        setShowReveal(true)
        audioRef.current?.pause()
      }

      if (diff === 0 && isHost && !advanceScheduled.current) {
        console.log('[round] host programando avance en', REVEAL_SECONDS, 's. currentRound:', currentRound, 'totalRounds:', totalRounds)
        advanceScheduled.current = true
        setTimeout(() => {
          console.log('[round] timeout DISPARADO')
          if (currentRound >= totalRounds) {
            console.log('[round] update a finished...')
            supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
              .then(({ error }) => console.log('[round] resultado update finished, error:', error))
          } else {
            console.log('[round] update a ronda', currentRound + 1)
            supabase.from('rooms').update({
              current_round: currentRound + 1,
              round_deadline: new Date(nowSynced() + ROUND_SECONDS * 1000).toISOString()
            }).eq('id', roomId)
              .then(({ error }) => console.log('[round] resultado update next round, error:', error))
          }
        }, REVEAL_SECONDS * 1000)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundDeadline, round, isHost, currentRound, totalRounds, roomId, showReveal])

  const submitGuess = useCallback(async () => {
    if (!round || correct || !guess.trim() || showReveal) return
    if (round.picks.player_id === playerId) return

    const isCorrect = normalize(guess) === normalize(baseTitle(round.picks.track_name))

    if (!isCorrect) {
      setShowWrong(true)
      setGuess('')
      return
    }

    const elapsedMs = (ROUND_SECONDS - secondsLeft) * 1000
    const points = Math.max(50, Math.round(BASE_POINTS * (1 - elapsedMs / (ROUND_SECONDS * 1000))))

    await supabase.from('guesses').insert({ round_id: round.id, player_id: playerId, is_correct: true })

    const { data: player } = await supabase.from('players').select('score, total_score').eq('id', playerId).single()
    if (player) {
      await supabase.from('players').update({
        score: player.score + points,
        total_score: (player.total_score ?? 0) + points
      }).eq('id', playerId)
    }

    setEarned(points)
    setCorrect(true)
  }, [round, guess, playerId, correct, secondsLeft, showReveal])

  if (!round) return <p className="status-box">Cargando ronda...</p>

  const isOwnSong = round.picks.player_id === playerId
  const pct = Math.max(0, Math.min(100, (secondsLeft / ROUND_SECONDS) * 100))

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
              onChange={e => { setGuess(e.target.value); setShowWrong(false) }}
              onKeyDown={e => e.key === 'Enter' && submitGuess()}
              placeholder="Nombre de la canción"
            />
            <button onClick={submitGuess} className="btn-principal">Adivinar</button>
          </div>
          {showWrong && <p className="status-box is-wrong">No es esa canción, seguí intentando.</p>}
        </div>
      )}
    </div>
  )
}