'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { normalize, seededShuffle } from '@/lib/tracks'

const GUESSING_SECONDS = 15
const REVEAL_SECONDS = 4
const DUEL_POINTS = 100

type FootballPlayer = {
  name: string
  clubs?: string[] | string | null
  image_url?: string | null
}

type Winner = {
  playerId: string
  nickname: string
}

export default function DueloSincronoPhase({
  roomId, playerId, nickname, roomCode, currentRound, roundDeadline, isHost, totalRounds
}: {
  roomId: string
  playerId: string
  nickname?: string
  roomCode: string
  currentRound: number
  roundDeadline: string
  isHost: boolean
  totalRounds: number
}) {
  const [playersPool, setPlayersPool] = useState<FootballPlayer[]>([])
  const [index, setIndex] = useState(0)
  const [localScore, setLocalScore] = useState(0)
  const [winner, setWinner] = useState<Winner | null>(null)
  const [guess, setGuess] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(GUESSING_SECONDS)
  const [isReveal, setIsReveal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const hasFinished = useRef(false)
  const hasScored = useRef(false)
  const winnerRef = useRef<Winner | null>(null)
  const roundRef = useRef(currentRound)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Semilla estática por partida
  const initialSeed = useRef(`${roomCode}-${roundDeadline}`).current

  const currentPlayer = useMemo(() => playersPool[index] ?? null, [playersPool, index])
  const clubs = useMemo(() => {
    if (!currentPlayer) return []
    if (Array.isArray(currentPlayer.clubs)) return currentPlayer.clubs
    return typeof currentPlayer.clubs === 'string'
      ? currentPlayer.clubs.split(',').map(club => club.trim()).filter(Boolean)
      : []
  }, [currentPlayer])

  useEffect(() => {
    let cancelled = false
    supabase.from('football_players').select('name, clubs, image_url').then(({ data, error }) => {
      if (error) {
        console.error('Error cargando jugadores de fútbol', error)
      } else if (!cancelled) {
        setPlayersPool(seededShuffle((data ?? []) as FootballPlayer[], initialSeed).slice(0, totalRounds))
      }
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [initialSeed, totalRounds])

  useEffect(() => {
    supabase.from('players').select('score').eq('id', playerId).single().then(({ data, error }) => {
      if (error) console.error('Error cargando score', error)
      else setLocalScore(data?.score ?? 0)
    })
  }, [playerId])

  useEffect(() => {
    roundRef.current = currentRound
  }, [currentRound])

  // Receptor de broadcast
  useEffect(() => {
    const channel = supabase
      .channel(`duelo-${roomId}`)
      .on('broadcast', { event: 'round_won' }, ({ payload }) => {
        if (payload?.round !== roundRef.current || winnerRef.current) return
        const receivedWinner = { playerId: payload.winnerId, nickname: payload.winnerName || 'Alguien' }
        winnerRef.current = receivedWinner
        setWinner(receivedWinner)
        setIsReveal(true)
        setSecondsLeft(REVEAL_SECONDS)
      })
      .subscribe()
    channelRef.current = channel

    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // Reloj local
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft(previous => Math.max(0, previous - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Transiciones y fin de juego local
  useEffect(() => {
    if (hasFinished.current || secondsLeft > 0) return

    if (!isReveal) {
      setIsReveal(true)
      setSecondsLeft(REVEAL_SECONDS)
      return
    }

    if (index + 1 < totalRounds) {
      setIndex(previous => previous + 1)
      setWinner(null)
      winnerRef.current = null
      setGuess('')
      setIsReveal(false)
      hasScored.current = false // Candado liberado para poder seguir sumando
      setSecondsLeft(GUESSING_SECONDS)

      if (isHost) {
        supabase.from('rooms').update({
          current_round: currentRound + 1,
          round_deadline: new Date(nowSynced() + GUESSING_SECONDS * 1000).toISOString()
        }).eq('id', roomId).then()
      }
    } else {
      hasFinished.current = true
      setIndex(previous => previous + 1)

      const closeRoom = async () => {
        await supabase.from('players').update({ is_finished: true }).eq('id', playerId)
        if (isHost) {
          await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
        }
      }
      closeRoom()
    }
  }, [secondsLeft, isReveal, currentRound, totalRounds, index, isHost, roomId, playerId])

  const submitGuess = useCallback(async () => {
    if (!currentPlayer || isReveal || winner || !guess.trim()) return
    const safeName = currentPlayer.name || ''
    const candidate = guess.trim()
    const normalizedCandidate = normalize(candidate)
    const fullNormalizedTarget = normalize(safeName)
    const targetParts = safeName.split(' ').map(part => normalize(part))
    const isCorrect = fullNormalizedTarget === normalizedCandidate || targetParts.includes(normalizedCandidate)

    if (!isCorrect) {
      new Audio('/audios/error.mp3').play().catch(e => console.log('Audio error:', e));
      setGuess('')
      return
    }

    new Audio('/audios/correcto.mp3').play().catch(e => console.log('Audio error:', e));

    const nextWinner = { playerId, nickname: nickname ?? 'Jugador' }
    winnerRef.current = nextWinner
    setWinner(nextWinner)
    setIsReveal(true)
    setGuess('')
    setSecondsLeft(REVEAL_SECONDS) // La verdadera solución al desfase de tiempos

    if (channelRef.current) {
      const broadcastResult = await channelRef.current.send({
        type: 'broadcast',
        event: 'round_won',
        payload: { winnerId: playerId, winnerName: nickname ?? 'Jugador', round: currentRound }
      })
      if (broadcastResult !== 'ok') console.error('Error emitiendo ganador', broadcastResult)
    }

    if (!hasScored.current) {
      hasScored.current = true
      const newScore = localScore + DUEL_POINTS
      setLocalScore(newScore)
      const { error: updateError } = await supabase
        .from('players')
        .update({ score: newScore })
        .eq('id', playerId)
      if (updateError) console.error('Error actualizando score', updateError)
    }
  }, [currentPlayer, currentRound, guess, isReveal, localScore, nickname, playerId, winner])

  if (isLoading) return <p className="status-box">Cargando duelo...</p>
  if (index >= totalRounds || !currentPlayer) {
    return <p className="status-box">¡Tiempo finalizado, esperando resultados!</p>
  }

  return (
    <div className="room-section">
      <div className="phase-head">
        <span className="section-title">Duelo {index + 1} / {totalRounds}</span>
        <div className="timer-badge"><strong>{String(secondsLeft).padStart(2, '0')}</strong><span>s</span></div>
      </div>

      {isReveal ? (
        <div className="reveal-panel">
          {currentPlayer.image_url && <img className="reveal-art" src={currentPlayer.image_url} alt={currentPlayer.name} />}
          <h2 className="reveal-title">{currentPlayer.name}</h2>
          <div className="reveal-result is-neutral">
            {winner ? <><strong>{winner.nickname}</strong> ganó el duelo (+{DUEL_POINTS})</> : 'Nadie acertó'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0' }}>
            {clubs.map((club, i) => <div key={`${club}-${i}`} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--table-row)' }}>{club}</div>)}
          </div>
          <div className="guess-input-wrap">
            <input className="guess-input" value={guess} onChange={event => setGuess(event.target.value)} onKeyDown={event => event.key === 'Enter' && submitGuess()} placeholder="Nombre del jugador" autoFocus autoComplete="off" />
            <button className="btn-principal" onClick={submitGuess}>Adivinar</button>
          </div>
        </>
      )}
    </div>
  )
}