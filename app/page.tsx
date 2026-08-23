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
    <div className="page-shell">
      <div className="brand-header">
        <h1 className="brand-title">SONGLIO</h1>
        <span className="brand-kicker">GAME</span>
      </div>

      <div className="eq">
        <span /><span /><span /><span />
      </div>

      <h2 className="page-title">Adiviná la canción</h2>
      <p className="page-subtitle">Entrá con tu nombre o uníndote a una sala.</p>

      <button
        type="button"
        onClick={() => router.push('/daily')}
        className="btn-principal"
        style={{ width: 'min(100%, 320px)', marginBottom: 18 }}
      >
        Songlio Diario
      </button>

      <main className="page-card">
        <label className="field-label" htmlFor="nickname">Tu nombre</label>
        <input
          id="nickname"
          className="form-field"
          placeholder="Tu nombre"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
        />

        <button
          type="button"
          onClick={createRoom}
          className="btn-principal"
          style={{ width: '100%', marginTop: 14 }}
        >
          Crear sala nueva
        </button>

        <div className="divider"><span>O unite</span></div>

        <div className="form-row">
          <input
            className="form-field"
            placeholder="Código"
            maxLength={4}
            value={joinCode}
            onChange={e => setJoinCode(e.target.value)}
          />
          <button type="button" onClick={joinRoom} className="btn-principal">
            Unirse
          </button>
        </div>
      </main>
    </div>
  )
}
