'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const ROUND_SECONDS = 15
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const revealedOnce = useRef(false)
  const advancedOnce = useRef(false)

  useEffect(() => {
    setCorrect(false)
    setShowWrong(false)
    setGuess('')
    setRevealedIdx(new Set())
    setEarned(null)
    revealedOnce.current = false
    advancedOnce.current = false

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

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - Date.now()) / 1000))
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

      if (diff === 0 && isHost && !advancedOnce.current) {
        advancedOnce.current = true
        if (currentRound >= totalRounds) {
          supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
        } else {
          supabase.from('rooms').update({
            current_round: currentRound + 1,
            round_deadline: new Date(Date.now() + ROUND_SECONDS * 1000).toISOString()
          }).eq('id', roomId)
        }
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundDeadline, round, isHost, currentRound, totalRounds, roomId])

  const submitGuess = useCallback(async () => {
    if (!round || correct || !guess.trim()) return
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

    const { data: player } = await supabase.from('players').select('score').eq('id', playerId).single()
    if (player) {
      await supabase.from('players').update({ score: player.score + points }).eq('id', playerId)
    }

    setEarned(points)
    setCorrect(true)
  }, [round, guess, playerId, correct, secondsLeft])

  if (!round) return <p>Cargando ronda...</p>

  const isOwnSong = round.picks.player_id === playerId
  const showHint = revealedIdx.size > 0

  return (
    <div style={{ marginTop: 20 }}>
      <p>Ronda {currentRound} de {totalRounds} — {secondsLeft}s</p>

      {round.picks.preview_url && <audio ref={audioRef} src={round.picks.preview_url} autoPlay />}

      {showHint && (
        <p style={{ letterSpacing: 2, fontFamily: 'monospace', fontSize: 20 }}>
          {maskTitle(baseTitle(round.picks.track_name), revealedIdx)}
        </p>
      )}

      {isOwnSong && <p>Esta es tu canción — esperá el resultado.</p>}

      {!isOwnSong && correct && <p>¡Correcto! Sumaste {earned} puntos.</p>}
      {!isOwnSong && !correct && showWrong && <p>No es esa canción, seguí intentando.</p>}

      {!isOwnSong && !correct && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={guess}
            onChange={e => { setGuess(e.target.value); setShowWrong(false) }}
            onKeyDown={e => e.key === 'Enter' && submitGuess()}
            placeholder="Nombre de la canción"
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={submitGuess} style={{ padding: '8px 16px' }}>Adivinar</button>
        </div>
      )}
    </div>
  )
}