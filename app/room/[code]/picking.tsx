'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { startPlayingPhase } from '@/lib/game'

const SHORTENED_SECONDS = 5

type Track = {
  trackId: number
  trackName: string
  artistName: string
  previewUrl: string
  artworkUrl100: string
}

export default function PickingPhase({
  roomId,
  playerId,
  deadline,
  isHost,
  totalPlayers
}: {
  roomId: string
  playerId: string
  deadline: string
  isHost: boolean
  totalPlayers: number
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [picked, setPicked] = useState<Track | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [picksCount, setPicksCount] = useState(0)
  const triggered = useRef(false)
  const shortened = useRef(false)

  // Timer sincronizado contra el deadline guardado en la sala (servidor)
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000))
      setSecondsLeft(diff)

      if (diff === 0 && isHost && !triggered.current) {
        triggered.current = true
        startPlayingPhase(roomId)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline, isHost, roomId])

  // Cuenta inicial de picks ya hechos, más suscripción en vivo a nuevos picks
  useEffect(() => {
    const loadCount = async () => {
      const { count } = await supabase
        .from('picks')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
      console.log('[loadCount] count inicial:', count)
      setPicksCount(count ?? 0)
    }
    loadCount()

    const channel = supabase
      .channel(`picks-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'picks',
        filter: `room_id=eq.${roomId}`
      }, () => {
        console.log('[realtime] nuevo pick insertado, sumando al contador')
        setPicksCount(prev => prev + 1)
      })
      .subscribe((status) => {
        console.log('[channel status]', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // Cuando todos eligieron, el host recorta el tiempo restante a 5s
  useEffect(() => {
  console.log('[shortcut check]', {
    isHost,
    shortened: shortened.current,
    totalPlayers,
    picksCount,
    secondsLeft
  })

  if (
    isHost &&
    !shortened.current &&
    totalPlayers > 0 &&
    picksCount >= totalPlayers &&
    secondsLeft > SHORTENED_SECONDS
  ) {
    console.log('[shortcut] recortando tiempo a 5s')
    shortened.current = true
    const newDeadline = new Date(Date.now() + SHORTENED_SECONDS * 1000).toISOString()
    supabase.from('rooms').update({ picking_deadline: newDeadline }).eq('id', roomId)
      .then(({ error }) => console.log('[shortcut] update terminado, error:', error))
  }
}, [picksCount, totalPlayers, isHost, secondsLeft, roomId])

  // Búsqueda en iTunes con debounce (espera 350ms sin tipeo antes de buscar)
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    const timeout = setTimeout(async () => {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=8`
      )
      const data = await res.json()
      setResults(data.results.filter((t: Track) => t.previewUrl))
    }, 350)
    return () => clearTimeout(timeout)
  }, [query])

  const choosePick = useCallback(async (track: Track) => {
    setPicked(track)
    await supabase.from('picks').insert({
      room_id: roomId,
      player_id: playerId,
      track_name: track.trackName,
      artist: track.artistName,
      preview_url: track.previewUrl,
      artwork_url: track.artworkUrl100
    })
  }, [roomId, playerId])

  if (picked) {
    return (
      <div style={{ marginTop: 20 }}>
        <p>Elegiste: <strong>{picked.trackName}</strong> — {picked.artistName}</p>
        <p>Esperando a los demás... {secondsLeft}s ({picksCount}/{totalPlayers})</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h2>Elegí tu canción — {secondsLeft}s</h2>
      <p style={{ fontSize: 13, opacity: 0.7 }}>{picksCount}/{totalPlayers} ya eligieron</p>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Buscar canción..."
        style={{ width: '100%', padding: 8 }}
      />
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
        {results.map(track => (
          <li
            key={track.trackId}
            onClick={() => choosePick(track)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              cursor: 'pointer',
              borderBottom: '1px solid #333'
            }}
          >
            <img src={track.artworkUrl100} width={40} height={40} alt="" />
            <span>{track.trackName} — {track.artistName}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}