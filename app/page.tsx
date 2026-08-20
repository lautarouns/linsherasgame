'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function randomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase()
}

export default function Home() {
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState('')
  const router = useRouter()

  const createRoom = async () => {
    if (!nickname) return alert('Poné un nombre')
    const code = randomCode()

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({ code })
      .select()
      .single()
    if (error) return alert(error.message)

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, nickname })
      .select()
      .single()
    if (playerError) return alert(playerError.message)

    localStorage.setItem('playerId', player.id)
    router.push(`/room/${code}`)
  }

  const joinRoom = async () => {
    if (!nickname || !joinCode) return alert('Faltan datos')

    const { data: room, error } = await supabase
      .from('rooms')
      .select()
      .eq('code', joinCode.toUpperCase())
      .single()
    if (error || !room) return alert('Sala no encontrada')

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ room_id: room.id, nickname })
      .select()
      .single()
    if (playerError) return alert(playerError.message)

    localStorage.setItem('playerId', player.id)
    router.push(`/room/${room.code}`)
  }

  return (
    <div style={{ padding: 40, maxWidth: 400, margin: '0 auto' }}>
      <h1>Adiviná la canción</h1>

      <input
        placeholder="Tu nombre"
        value={nickname}
        onChange={e => setNickname(e.target.value)}
        style={{ width: '100%', padding: 8, marginTop: 20 }}
      />

      <button onClick={createRoom} style={{ width: '100%', padding: 10, marginTop: 12 }}>
        Crear sala nueva
      </button>

      <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <input
          placeholder="Código de sala"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={joinRoom} style={{ padding: '10px 16px' }}>
          Unirse
        </button>
      </div>
    </div>
  )
}