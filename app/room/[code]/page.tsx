'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { startPickingPhase } from '@/lib/game'
import PickingPhase from './picking'
import RoundPhase from './round'
import Scoreboard from './scoreboard'

type Room = {
  id: string
  code: string
  status: string
  picking_deadline: string | null
  current_round: number
  round_deadline: string | null
}

type Player = {
  id: string
  nickname: string
  score: number
  created_at: string
}

export default function RoomPage() {
  const params = useParams()
  const code = (params.code as string).toUpperCase()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [playerId, setPlayerId] = useState<string | null>(null)

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
      }, payload => setRoom(payload.new as Room))
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

  if (!room || !playerId) return <p style={{ padding: 40 }}>Cargando sala...</p>

  const isHost = players.length > 0 && players[0].id === playerId

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: '0 auto' }}>
      <h1>Sala {room.code}</h1>

      {room.status === 'lobby' && (
        <>
          <h3>Jugadores ({players.length})</h3>
          <ul>
            {players.map(p => (
              <li key={p.id}>{p.nickname}{p.id === playerId ? ' (vos)' : ''}</li>
            ))}
          </ul>

          {isHost && (
            <button onClick={() => startPickingPhase(room.id)} style={{ padding: 10, marginTop: 20 }}>
              Iniciar juego
            </button>
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
          totalPlayers={players.length}
        />
      )}

      {room.status === 'playing' && room.round_deadline && (
        <RoundPhase
          roomId={room.id}
          playerId={playerId}
          currentRound={room.current_round}
          roundDeadline={room.round_deadline}
          isHost={isHost}
          totalRounds={players.length}
        />
      )}

      {room.status === 'finished' && <Scoreboard players={players} playerId={playerId} />}
    </div>
  )
}