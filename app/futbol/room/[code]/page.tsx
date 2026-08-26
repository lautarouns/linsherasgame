'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startDueloPhase } from '@/lib/game'
import DueloPhase from './DueloPhase'

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
  const [selectedMode, setSelectedMode] = useState<'duelo' | 'higher'>('duelo')

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
                <button type="button" className="btn-copy" title="Copiar código">COPIAR</button>
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
                      Duelo de Carreras
                    </button>
                    <button
                      type="button"
                      className={selectedMode === 'higher' ? 'segment-button is-selected' : 'segment-button'}
                      onClick={() => setSelectedMode('higher')}
                    >
                      Higher or Lower
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

                  {selectedMode === 'higher' && (
                    <>
                      <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
                        <p style={{ margin: 0, color: 'var(--muted-strong)' }}>Higher or Lower - configuración pendiente. Aún no implementado.</p>
                      </div>
                      <button className="btn-principal" style={{ width: '100%' }}>
                        Preparar Higher or Lower
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

          {room.status === 'finished' && (
            <Scoreboard players={players} playerId={playerId} roomId={room.id} isHost={isHost} />
          )}

        </div>

        {room.game_mode !== 'duelo' && (
          <Leaderboard players={players} playerId={playerId} />
        )}
      </div>
    </div>
  )
}