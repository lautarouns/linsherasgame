'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startAnimeDuelPhase } from '@/lib/game'
import AnimeDuelPhase from './AnimeDuelPhase'

import ChatIsland from '@/app/room/[code]/ChatIsland'
import Leaderboard from '@/app/room/[code]/leaderboard'
import Scoreboard from '@/app/room/[code]/scoreboard'

type Room = {
  id: string
  code: string
  status: string
  game_mode?: string
  current_round: number
  round_deadline: string | null
  total_rounds: number
}

type Player = {
  id: string
  nickname: string
  score: number
  total_score: number
  created_at: string
}

export default function AnimeRoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem('playerId')
  })
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set())
  const [duelRounds, setDuelRounds] = useState(10)
  const [duelSeconds, setDuelSeconds] = useState(20)
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
    <div className="theme-anime theme-bg">
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
                  <div style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.02)', marginBottom: 12 }}>
                    <p style={{ margin: 0, color: 'var(--muted-strong)' }}>Aparece el nombre de un personaje de anime. El primero en escribir el anime al que pertenece se lleva los puntos de la ronda.</p>
                  </div>

                  <div className="select-wrap">
                    <label>Cantidad de rondas</label>
                    <select
                      className="select-oscuro"
                      value={duelRounds}
                      onChange={e => setDuelRounds(Number(e.target.value))}
                    >
                      {[5, 10, 15, 20].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  <div className="select-wrap is-stack">
                    <label>Tiempo por ronda</label>
                    <div className="segment-group">
                      {[15, 20, 30].map(seconds => (
                        <button
                          key={seconds}
                          type="button"
                          onClick={() => setDuelSeconds(seconds)}
                          className={duelSeconds === seconds ? 'segment-button is-selected' : 'segment-button'}
                        >
                          {seconds}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => startAnimeDuelPhase(room.id, duelRounds, duelSeconds)}
                    className="btn-principal"
                    style={{ width: '100%' }}
                  >
                    Empezar Duelo
                  </button>
                </div>
              )}

              {!isHost && <p className="status-box">Esperando a que el host inicie el juego...</p>}
            </>
          )}

          {room.status === 'playing' && room.game_mode === 'anime_duel' && room.round_deadline && (
            <AnimeDuelPhase
              roomId={room.id}
              playerId={playerId}
              nickname={currentPlayer?.nickname}
              currentRound={room.current_round}
              roundDeadline={room.round_deadline}
              isHost={isHost}
              totalRounds={room.total_rounds}
              roundSeconds={duelSeconds}
            />
          )}

          {room.status === 'finished' && (
            <Scoreboard players={players} playerId={playerId} roomId={room.id} isHost={isHost} />
          )}

        </div>

        <Leaderboard players={players} playerId={playerId} />
      </div>
    </div>
  )
}