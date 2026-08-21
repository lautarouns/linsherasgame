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
  totalPlayers,
  songsPerPlayer
}: {
  roomId: string
  playerId: string
  deadline: string
  isHost: boolean
  totalPlayers: number
  songsPerPlayer: number
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [myPicks, setMyPicks] = useState<Track[]>([])
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [picksCount, setPicksCount] = useState(0)
  const triggered = useRef(false)
  const shortened = useRef(false)

  const totalExpectedPicks = totalPlayers * songsPerPlayer

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
        console.log('[realtime] nuevo pick insertado')
        setPicksCount(prev => prev + 1)
      })
      .subscribe((status) => console.log('[channel status]', status))

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    console.log('[shortcut check]', {
      isHost,
      shortened: shortened.current,
      totalPlayers,
      songsPerPlayer,
      totalExpectedPicks,
      picksCount,
      secondsLeft
    })

    if (
      isHost &&
      !shortened.current &&
      totalExpectedPicks > 0 &&
      picksCount >= totalExpectedPicks &&
      secondsLeft > SHORTENED_SECONDS
    ) {
      console.log('[shortcut] recortando tiempo a 5s')
      shortened.current = true
      const newDeadline = new Date(Date.now() + SHORTENED_SECONDS * 1000).toISOString()
      supabase.from('rooms').update({ picking_deadline: newDeadline }).eq('id', roomId)
        .then(({ error }) => console.log('[shortcut] update terminado, error:', error))
    }
  }, [picksCount, totalExpectedPicks, isHost, secondsLeft, roomId])

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
    setMyPicks(prev => [...prev, track])
    setQuery('')
    setResults([])
    await supabase.from('picks').insert({
      room_id: roomId,
      player_id: playerId,
      track_name: track.trackName,
      artist: track.artistName,
      preview_url: track.previewUrl,
      artwork_url: track.artworkUrl100
    })
  }, [roomId, playerId])

  const doneWithMine = myPicks.length >= songsPerPlayer

  if (doneWithMine) {
    return (
      <div className="room-section">
        <h2 className="section-title">Tus elecciones</h2>
        <ul className="pick-list">
          {myPicks.map(t => (
            <li key={t.trackId} className="pick-item">
              <span><strong>{t.trackName}</strong> — {t.artistName}</span>
            </li>
          ))}
        </ul>
        <p className="status-box">Esperando a los demás... {secondsLeft}s ({picksCount}/{totalExpectedPicks})</p>
      </div>
    )
  }

  return (
    <div className="room-section">
      <h2 className="section-title">Elegí tu canción {myPicks.length + 1} de {songsPerPlayer} — {secondsLeft}s</h2>
      <p className="info-box">{picksCount}/{totalExpectedPicks} elegidas en total</p>

      {myPicks.length > 0 && (
        <ul className="pick-list" style={{ marginTop: 12 }}>
          {myPicks.map(t => (
            <li key={t.trackId} className="pick-item">
              <span><strong>{t.trackName}</strong> — {t.artistName}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 14 }}>
        <input
          className="form-field"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar canción..."
        />
      </div>

      <ul className="track-results" style={{ marginTop: 12 }}>
        {results.map(track => (
          <li key={track.trackId} className="track-result" onClick={() => choosePick(track)}>
            <img src={track.artworkUrl100} width={40} height={40} alt="" />
            <span><strong>{track.trackName}</strong> — {track.artistName}</span>
          </li>
        ))}
      </ul>
    </div>
  )
} 