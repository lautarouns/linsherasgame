'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { startPlayingPhase } from '@/lib/game'
import { nowSynced } from '@/lib/serverTime'

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
  const totalSeconds = useRef(0)

  const totalExpectedPicks = totalPlayers * songsPerPlayer

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(deadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)
      // Guarda el tramo más largo visto para dibujar la barra de progreso
      if (diff > totalSeconds.current) totalSeconds.current = diff

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
      setPicksCount(count ?? 0)
    }
    loadCount()

    const channel = supabase
      .channel(`picks-${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'picks',
        filter: `room_id=eq.${roomId}`
      }, () => {
        setPicksCount(prev => prev + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    console.log('shortcut check:', { isHost, picksCount, totalExpectedPicks, secondsLeft, shortened: shortened.current })

    if (
      isHost &&
      !shortened.current &&
      totalExpectedPicks > 0 &&
      picksCount >= totalExpectedPicks &&
      secondsLeft > SHORTENED_SECONDS
    ) {
      shortened.current = true
      const newDeadline = new Date(nowSynced() + SHORTENED_SECONDS * 1000).toISOString()
      supabase.from('rooms').update({ picking_deadline: newDeadline }).eq('id', roomId)
        .then(({ error }) => console.log('shortcut update error:', error))
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
  const pct = totalSeconds.current > 0
    ? Math.max(0, Math.min(100, (secondsLeft / totalSeconds.current) * 100))
    : 0

  if (doneWithMine) {
    return (
      <div className="room-section">
        <div className="phase-head">
          <div>
            <h2 className="phase-title">Tus elecciones</h2>
            <p className="phase-sub">{picksCount}/{totalExpectedPicks} elegidas en total</p>
          </div>
          <div className="timer-badge">
            <strong>{secondsLeft}</strong>
            <span>s</span>
          </div>
        </div>

        <div className="timer-track">
          <div className="timer-fill" style={{ width: `${pct}%` }} />
        </div>

        <ul className="pick-list">
          {myPicks.map(t => (
            <li key={t.trackId} className="pick-item">
              <span><strong>{t.trackName}</strong> — {t.artistName}</span>
            </li>
          ))}
        </ul>
        <p className="status-box">Esperando a los demás...</p>
      </div>
    )
  }

  return (
    <div className="room-section">
      <div className="phase-head">
        <div>
          <h2 className="phase-title">Elegí tu canción {myPicks.length + 1} de {songsPerPlayer}</h2>
          <p className="phase-sub">{picksCount}/{totalExpectedPicks} elegidas en total</p>
        </div>
        <div className="timer-badge">
          <strong>{secondsLeft}</strong>
          <span>s</span>
        </div>
      </div>

      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ marginTop: 22 }}>
        <input
          className="form-field"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar canción..."
        />
      </div>

      <ul className="track-results">
        {results.map(track => (
          <li key={track.trackId} className="track-result" onClick={() => choosePick(track)}>
            <img src={track.artworkUrl100} width={48} height={48} alt="" />
            <span><strong>{track.trackName}</strong> {track.artistName}</span>
          </li>
        ))}
      </ul>

      {myPicks.length > 0 && (
        <>
          <h3 className="section-title" style={{ marginTop: 26 }}>Tus elecciones</h3>
          <ul className="pick-list">
            {myPicks.map(t => (
              <li key={t.trackId} className="pick-item">
                <span><strong>{t.trackName}</strong> — {t.artistName}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}