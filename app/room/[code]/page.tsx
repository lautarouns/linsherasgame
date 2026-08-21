'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startPickingPhase } from '@/lib/game'
import PickingPhase from './picking'
import RoundPhase from './round'
import Scoreboard from './scoreboard'
import Leaderboard from './leaderboard'

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

  useEffect(() => {
    setPlayerId(localStorage.getItem('playerId'))
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

  if (!room || !playerId) return <p style={{ padding: 40 }}>Cargando sala...</p>

  const onlinePlayers = players.filter(p => onlinePlayerIds.has(p.id))
  const isHost = onlinePlayers.length > 0 && onlinePlayers[0].id === playerId

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 32, padding: 40 }}>
      <div style={{ maxWidth: 500, width: '100%' }}>
        <h1>Sala {room.code}</h1>

        {room.status === 'lobby' && (
          <>
            <h3>Jugadores ({onlinePlayers.length})</h3>
            <ul>
              {onlinePlayers.map(p => (
                <li key={p.id}>{p.nickname}{p.id === playerId ? ' (vos)' : ''}</li>
              ))}
            </ul>

            {isHost && (
              <>
                <div style={{ marginTop: 16 }}>
                  <label>
                    Canciones por jugador:{' '}
                    <select
                      value={songsPerPlayer}
                      onChange={e => setSongsPerPlayer(Number(e.target.value))}
                      style={{ padding: 4 }}
                    >
                      {[1, 2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  onClick={() => startPickingPhase(room.id, songsPerPlayer)}
                  style={{ padding: 10, marginTop: 12 }}
                >
                  Iniciar juego
                </button>
              </>
            )}
            {!isHost && <p>Esperando a que el host inicie el juego...</p>}
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