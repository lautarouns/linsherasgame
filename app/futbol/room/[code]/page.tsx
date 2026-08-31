'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startDueloPhase, startFutbolDueloSincronoPhase } from '@/lib/game'
import DueloPhase from './DueloPhase'
import DueloSincronoPhase from './DueloSincronoPhase'

import ChatIsland from '@/app/room/[code]/ChatIsland'
import Leaderboard from '@/app/room/[code]/leaderboard'
import Scoreboard from '@/app/room/[code]/scoreboard'

type Room = {
  id: string
  code: string
  status: string
  game_mode?: string
  picking_deadline: string | null
  current_round: number
  round_deadline: string | null
  songs_per_player: number
  total_rounds: number
}

type Player = {
  id: string
  nickname: string
  score: number
  total_score: number
  created_at: string
}

export default function FutbolRoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('playerId')
  })
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set())
  const [roundSeconds, setRoundSeconds] = useState(60)
  const [dueloRounds, setDueloRounds] = useState(7)
  const [selectedMode, setSelectedMode] = useState<'duelo' | 'duelo_sincrono'>('duelo')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!code) return
    const load = async () => {
      const { data: roomData } = await supabase
        .from('rooms').select().eq('code', code).single()
      if (!roomData) return
      setRoom(roomData)

      const { data: playersData } = await supabase
        .from('players').select().eq('room_id', roomData.id)
        .order('created_at', { ascending: true })
      setPlayers(playersData ?? [])
    }
    load()
  }, [code])

  useEffect(() => {
    if (!room) return
    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms',
        filter: `id=eq.${room.id}`
      }, payload => {
        setRoom(payload.new as Room)
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'players',
        filter: `room_id=eq.${room.id}`
      }, payload => setPlayers(prev => [...prev, payload.new as Player]))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'players',
        filter: `room_id=eq.${room.id}`
      }, payload => {
        const updated = payload.new as Player
        setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [room?.id])

  useEffect(() => {
    if (!room || !playerId) return

    const presenceChannel = supabase.channel(`presence-${room.id}`, {
      config: { presence: { key: playerId } }
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        setOnlinePlayerIds(new Set(Object.keys(state)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => { supabase.removeChannel(presenceChannel) }
  }, [room?.id, playerId])

  const copyCode = async () => {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  if (!room || !playerId) return <p style={{ padding: 40 }}>Cargando sala...</p>

  const onlinePlayers = players.filter(p => onlinePlayerIds.has(p.id))
  const hostPlayerId = players[0]?.id ?? null
  const isHost = hostPlayerId === playerId
  const currentPlayer = players.find(p => p.id === playerId) ?? null

  return (
    <div className="theme-futbol">
      <div className="room-shell">
        <ChatIsland roomId={room.id} playerId={playerId} nickname={currentPlayer?.nickname} />
        <div className="room-panel">
          <div className="room-header">
            <div>
              <div className="room-label">Sala</div>
              <div className="code-wrap">
                <h1 className="room-title">{room.code}</h1>
                <button
                  type="button"
                  onClick={copyCode}
                  className={copied ? 'btn-copy is-copied' : 'btn-copy'}
                  title="Copiar código"
                >
                  {copied ? 'COPIADO' : 'COPIAR'}
                </button>
              </div>
            </div>
            <span className="room-badge">{room.status}</span>
          </div>

          {room.status === 'lobby' && (
            <>
              <div className="room-section">
                <h3 className="section-title">Jugadores ({onlinePlayers.length})</h3>
                <ul className="player-table">
                  {onlinePlayers.map(p => {
                    const playerIsHost = hostPlayerId === p.id
                    return (
                      <li key={p.id} className="player-row">
                        <span><strong>{p.nickname}</strong>{p.id === playerId ? ' (vos)' : ''}</span>
                        <span className="player-meta">{playerIsHost ? 'Host' : 'Invitado'}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              {isHost && (
                <div className="field-group">
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button
                      type="button"
                      className={selectedMode === 'duelo' ? 'segment-button is-selected' : 'segment-button'}
                      onClick={() => setSelectedMode('duelo')}
                    >
                      Clasico
                    </button>
                    <button
                      type="button"
                      className={selectedMode === 'duelo_sincrono' ? 'segment-button is-selected' : 'segment-button'}
                      onClick={() => setSelectedMode('duelo_sincrono')}
                    >
                      Duelo
                    </button>
                  </div>

                  {selectedMode === 'duelo' && (
                    <>
                      <div className="select-wrap is-stack">
                        <label>Tiempo total de la partida</label>
                        <div className="segment-group">
                          {[45, 60, 75].map(seconds => (
                            <button
                              key={seconds}
                              type="button"
                              onClick={() => setRoundSeconds(seconds)}
                              className={roundSeconds === seconds ? 'segment-button is-selected' : 'segment-button'}
                            >
                              {seconds}s
                            </button>
                          ))}
                        </div>
                      </div>

                      <button className="btn-principal" style={{ width: '100%' }} onClick={() => startDueloPhase(room.id, roundSeconds)}>
                        Preparar carrera
                      </button>
                    </>
                  )}

                  {selectedMode === 'duelo_sincrono' && (
                    <>
                      <div className="select-wrap is-stack">
                        <label>Rondas</label>
                        <div className="segment-group">
                          {[7, 11, 15].map(rounds => (
                            <button
                              key={rounds}
                              type="button"
                              onClick={() => setDueloRounds(rounds)}
                              className={dueloRounds === rounds ? 'segment-button is-selected' : 'segment-button'}
                            >
                              {rounds}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        className="btn-principal"
                        style={{ width: '100%' }}
                        onClick={() => startFutbolDueloSincronoPhase(room.id, dueloRounds)}
                      >
                        Preparar Duelo
                      </button>
                    </>
                  )}
                </div>
              )}

              {!isHost && <p className="status-box">Esperando a que el host inicie el juego...</p>}
            </>
          )}

          {room.status === 'playing' && room.game_mode === 'duelo' && room.round_deadline && (
            <DueloPhase
              roomId={room.id}
              playerId={playerId}
              roomCode={room.code}
              roundDeadline={room.round_deadline}
              isHost={isHost}
              totalPlayers={onlinePlayers.length}
            />
          )}

          {room.status === 'playing' && room.game_mode === 'duelo_sincrono' && room.round_deadline && (
            <DueloSincronoPhase
              roomId={room.id}
              playerId={playerId}
              nickname={currentPlayer?.nickname}
              roomCode={room.code}
              currentRound={room.current_round}
              roundDeadline={room.round_deadline}
              isHost={isHost}
              totalRounds={room.total_rounds}
            />
          )}

          {room.status === 'finished' && (
            <Scoreboard players={players} playerId={playerId} roomId={room.id} isHost={isHost} />
          )}

        </div>

        {room.game_mode !== 'duelo' && room.game_mode !== 'duelo_sincrono' && (
          <Leaderboard players={players} playerId={playerId} />
        )}
      </div>
    </div>
  )
}