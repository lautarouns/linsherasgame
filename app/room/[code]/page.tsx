'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startPickingPhase } from '@/lib/game'
import PickingPhase from './picking'
import RoundPhase from './round'
import Scoreboard from './scoreboard'
import Leaderboard from './leaderboard'
import { syncServerTime } from '@/lib/serverTime'

type Room = {
  id: string
  code: string
  status: string
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

export default function RoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set())
  const [songsPerPlayer, setSongsPerPlayer] = useState(1)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPlayerId(localStorage.getItem('playerId'))
  }, [])

  // Sincroniza el reloj contra el servidor una vez al entrar a la sala
  useEffect(() => {
    syncServerTime()
  }, [])

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

  // Presencia: detecta en vivo quién sigue con la pestaña abierta
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

  return (
    <div className="room-shell">
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
                <div className="select-wrap">
                  <label>Canciones por jugador</label>
                  <select
                    className="select-oscuro"
                    value={songsPerPlayer}
                    onChange={e => setSongsPerPlayer(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => startPickingPhase(room.id, songsPerPlayer)}
                  className="btn-principal"
                  style={{ width: '100%' }}
                >
                  Iniciar juego
                </button>
              </div>
            )}

            {!isHost && <p className="status-box">Esperando a que el host inicie el juego...</p>}
          </>
        )}

        {room.status === 'picking' && room.picking_deadline && (
          <PickingPhase
            roomId={room.id}
            playerId={playerId}
            deadline={room.picking_deadline}
            isHost={isHost}
            totalPlayers={onlinePlayers.length}
            songsPerPlayer={room.songs_per_player}
          />
        )}

        {room.status === 'playing' && room.round_deadline && (
          <RoundPhase
            roomId={room.id}
            playerId={playerId}
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

      <Leaderboard players={players} playerId={playerId} />
    </div>
  )
}
