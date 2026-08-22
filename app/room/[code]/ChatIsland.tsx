'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Props = {
  roomId: string
  playerId: string | null
  nickname?: string | null
}

export default function ChatIsland({ roomId, playerId, nickname }: Props) {
  const [messages, setMessages] = useState<Array<{ id: string; nickname: string; text: string; created_at: string; isSystem?: boolean }>>([])
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(false)
  const channelRef = useRef<any>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!roomId) return
    const chan = supabase.channel(`chat-${roomId}`, {
      config: {
        broadcast: { self: true } // ¡ESTO HACE QUE VEAS TUS PROPIOS AVISOS!
      }
    })
      .on('broadcast', { event: 'chat-message' }, (payload) => {
        const msg = payload.payload as any
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })
      .subscribe()

    channelRef.current = chan

    return () => { supabase.removeChannel(chan) }
  }, [roomId])

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
    }
  }, [messages])

  const enableEditing = () => {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 40)
  }

  const sendMessage = async () => {
    if (!text.trim()) return
    if (!channelRef.current) return
    const msg = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      nickname: nickname ?? 'Anon',
      text: text.trim(),
      created_at: new Date().toISOString()
    }
    try {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })

      await channelRef.current.send({ type: 'broadcast', event: 'chat-message', payload: msg })
      setText('')
      setEditing(false)
    } catch (err) {
      console.error('chat send error', err)
      setMessages(prev => prev.filter(m => m.id !== msg.id))
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      setEditing(false)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <aside className="chat-island sidebar" onClick={() => {}}>
      <div className="sidebar-title chat-header">Chat de la sala</div>

      <div
        className="chat-messages"
        ref={scrollerRef}
        onClick={() => {}}
      >
        {messages.length === 0 && (
          <div className="status-box" style={{ marginTop: 8 }}>No hay mensajes todavía. Haz clic en el cuadro de abajo para escribir.</div>
        )}

        <ul className="leaderboard-list" style={{ marginTop: 8 }}>
          {messages.map(m => (
            <li 
              key={m.id} 
              className="chat-row"
              style={m.isSystem ? { background: 'var(--accent-soft)', borderColor: 'var(--accent-line)', justifyContent: 'center' } : {}}
            >
              {!m.isSystem && <strong style={{ display: 'block' }}>{m.nickname}</strong>}
              <span 
                className="leaderboard-meta" 
                style={m.isSystem ? { color: 'var(--accent)', marginTop: 0 } : { marginTop: 4 }}
              >
                {m.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-input-wrap" style={{ marginTop: 12 }} onClick={enableEditing}>
        <input
          ref={inputRef}
          className="guess-input chat-input"
          placeholder={editing ? 'Escribe un mensaje y presiona Enter' : 'Haz clic aquí para activar el chat'}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          readOnly={!editing}
          aria-label="Chat de la sala"
        />
        <button
          type="button"
          className="btn-principal"
          onClick={sendMessage}
          style={{ marginLeft: 8 }}
          disabled={!editing || text.trim().length === 0}
          title="Enviar mensaje"
        >
          Enviar
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <small style={{ color: 'var(--muted)', fontSize: 12 }}>
          El chat es sólo para conversar entre jugadores. Escribir la canción aca no afectará al juego.
        </small>
      </div>
    </aside>
  )
}