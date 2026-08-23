'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DAILY_SEGMENTS = [0.5, 2, 4.5, 7]

type Track = {
  title: string
  artist: string
  cover: string
  previewUrl: string
}

type Attempt = {
  text: string
  artistMatch: boolean
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function baseTitle(trackName: string) {
  return trackName.split('(')[0].split('[')[0].trim()
}

export default function DailyPage() {
  const router = useRouter()
  
  const [dailyTrack, setDailyTrack] = useState<Track | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [currentAttempt, setCurrentAttempt] = useState(0)
  const [guess, setGuess] = useState('')
  const [attemptHistory, setAttemptHistory] = useState<Attempt[]>([])
  const [isWin, setIsWin] = useState(false)
  const [isLose, setIsLose] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  
  const [suggestions, setSuggestions] = useState<Track[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackTimerRef = useRef<number | null>(null)

  const allowedSeconds = DAILY_SEGMENTS[Math.min(currentAttempt, DAILY_SEGMENTS.length - 1)]

  // CARGA DE CANCIÓN (CON SUPABASE)
  useEffect(() => {
    async function fetchDailyTrack() {
      try {
        setIsLoading(true)
        
        // 1. Armamos el string de la fecha de hoy (Ej: "2026-08-23")
        const hoy = new Date()
        const yyyy = hoy.getFullYear()
        const mm = String(hoy.getMonth() + 1).padStart(2, '0')
        const dd = String(hoy.getDate()).padStart(2, '0')
        const todayStr = `${yyyy}-${mm}-${dd}`

        // 2. Buscamos en Supabase si ya se generó la canción de hoy
        const { data: existingSong, error: dbError } = await supabase
          .from('daily_songs')
          .select('*')
          .eq('date_id', todayStr)
          .single()

        if (existingSong) {
          // Si ya existe, usamos esa y listo. ¡No cambia en todo el día!
          setDailyTrack({
            title: existingSong.title,
            artist: existingSong.artist,
            cover: existingSong.cover,
            previewUrl: existingSong.preview_url
          })
          setIsLoading(false)
          return
        }

        // 3. Si no existe, es el primer jugador del día. Le pegamos a iTunes.
        const res = await fetch('https://itunes.apple.com/us/rss/topsongs/limit=200/json')
        if (!res.ok) throw new Error('Error al conectar con la API')
        
        const data = await res.json()
        const entries = data.feed.entry

        const validTracks = entries.filter((entry: any) => 
          entry.link.some((l: any) => l.attributes.title === 'Preview')
        )

        if (validTracks.length === 0) throw new Error('No se encontraron canciones válidas')

        // Elegimos una con la semilla de la fecha
        const seed = parseInt(`${yyyy}${mm}${dd}`)
        const index = seed % validTracks.length
        const selectedEntry = validTracks[index]

        const audioLink = selectedEntry.link.find((l: any) => l.attributes.title === 'Preview').attributes.href
        const imageArray = selectedEntry['im:image']
        const coverLink = imageArray[imageArray.length - 1].label

        const newSong = {
          date_id: todayStr,
          title: selectedEntry['im:name'].label,
          artist: selectedEntry['im:artist'].label,
          cover: coverLink,
          preview_url: audioLink
        }

        // 4. La guardamos en Supabase para el resto de los jugadores
        await supabase.from('daily_songs').upsert(newSong)

        setDailyTrack({
          title: newSong.title,
          artist: newSong.artist,
          cover: newSong.cover,
          previewUrl: newSong.preview_url
        })

      } catch (err) {
        console.error(err)
        setError('No pudimos cargar la canción de hoy. Reintentá más tarde.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDailyTrack()
  }, [])

  // Buscador en vivo
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (guess.trim().length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      if (isWin || isLose) return

      try {
        setIsSearching(true)
        setShowSuggestions(true)
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(guess)}&entity=song&limit=5`)
        const data = await res.json()
        
        const tracks = data.results.map((r: any) => ({
          title: r.trackName,
          artist: r.artistName,
          cover: r.artworkUrl100,
          previewUrl: r.previewUrl
        }))
        
        setSuggestions(tracks)
      } catch (e) {
        console.error('Error buscando sugerencias:', e)
      } finally {
        setIsSearching(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [guess, isWin, isLose])

  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        window.clearTimeout(playbackTimerRef.current)
      }
    }
  }, [])

  const handleListen = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !dailyTrack) return

    if (playbackTimerRef.current) {
      window.clearTimeout(playbackTimerRef.current)
    }

    if (audio.src !== dailyTrack.previewUrl) {
      audio.src = dailyTrack.previewUrl
    }
    
    audio.currentTime = 0
    audio.play().catch(e => console.log('Error de reproducción:', e))

    playbackTimerRef.current = window.setTimeout(() => {
      audio.pause()
      audio.currentTime = 0
    }, allowedSeconds * 1000)
  }, [allowedSeconds, dailyTrack])

  const processGuess = (guessTitle: string, guessArtist?: string) => {
    if (isWin || isLose || !dailyTrack || !guessTitle.trim()) return

    const artistMatch = guessArtist
      ? normalize(guessArtist) === normalize(dailyTrack.artist)
      : false

    const historyEntry = guessArtist ? `${guessTitle} - ${guessArtist}` : guessTitle
    setAttemptHistory(prev => [...prev, { text: historyEntry, artistMatch }])
    setShowSuggestions(false)

    if (normalize(baseTitle(guessTitle)) === normalize(baseTitle(dailyTrack.title))) {
      setIsWin(true)
      setMessage(`¡Correcto! Lo adivinaste con ${allowedSeconds}s.`)
      setGuess('')
      return
    }

    const nextAttempt = currentAttempt + 1
    if (nextAttempt >= DAILY_SEGMENTS.length) {
      setIsLose(true)
      setMessage('Se acabó el día. Esta era la canción correcta.')
      setGuess('')
      return
    }

    setCurrentAttempt(nextAttempt)
    setGuess('')
  }

  const handleManualGuess = () => {
    processGuess(guess)
  }

  const handleSelectSuggestion = (track: Track) => {
    processGuess(track.title, track.artist)
  }

  const handleSkip = () => {
    if (isWin || isLose || !dailyTrack) return

    setAttemptHistory(prev => [...prev, { text: 'Saltaste', artistMatch: false }])
    setShowSuggestions(false)
    const nextAttempt = currentAttempt + 1

    if (nextAttempt >= DAILY_SEGMENTS.length) {
      setIsLose(true)
      setMessage('Se acabó el día. Esta era la canción correcta.')
      setGuess('')
      return
    }

    setCurrentAttempt(nextAttempt)
    setGuess('')
  }

  if (isLoading) {
    return (
      <div className="page-shell">
        <div className="page-card daily-card" style={{ textAlign: 'center' }}>
          <p className="status-box">Cargando el desafío de hoy...</p>
        </div>
      </div>
    )
  }

  if (error || !dailyTrack) {
    return (
      <div className="page-shell">
        <div className="page-card daily-card" style={{ textAlign: 'center' }}>
          <p className="status-box is-wrong">{error}</p>
          <button className="btn-secondary" onClick={() => router.push('/')} style={{ marginTop: 20 }}>Volver al menú</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-card daily-card">
        <div className="daily-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p className="daily-kicker" style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'var(--font-code)', margin: 0 }}>Modo individual</p>
            <h1 className="page-title daily-title" style={{ fontSize: 32, margin: '5px 0 0' }}>Songlio Diario</h1>
          </div>
          <button type="button" className="btn-principal" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--soft-strong)', boxShadow: 'none' }} onClick={() => router.push('/')}>
            Volver
          </button>
        </div>

        <p className="page-subtitle" style={{ textAlign: 'left', marginTop: 20 }}>
          Escuchá el fragmento y adiviná la canción antes de llegar al último tramo.
        </p>

        <div className="daily-progress" style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {DAILY_SEGMENTS.map((segment, index) => {
            const isDone = index < currentAttempt
            const isActive = index === currentAttempt && !isWin && !isLose
            
            return (
              <div
                key={segment}
                style={{
                  flex: 1,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  fontFamily: 'var(--font-code)',
                  fontSize: 12,
                  fontWeight: 700,
                  transition: 'all 0.2s ease',
                  background: isActive ? 'var(--accent)' : (isDone ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)'),
                  color: isActive ? 'var(--accent-text)' : (isDone ? '#fff' : 'rgba(255,255,255,0.3)'),
                  border: `1px solid ${isActive ? 'var(--accent)' : (isDone ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)')}`
                }}
              >
                {segment}s
              </div>
            )
          })}
        </div>

        <div className="daily-audio-row" style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button type="button" className="btn-principal" onClick={handleListen} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} disabled={isWin || isLose}>
            ▶ Escuchar
          </button>
          <div className="daily-timer-badge" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', background: 'var(--field-bg)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, fontFamily: 'var(--font-code)', fontWeight: 700 }}>
            {allowedSeconds}s
          </div>
        </div>

        <div className="daily-input-row" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="guess-input"
            type="text"
            value={guess}
            onChange={event => setGuess(event.target.value)}
            onFocus={() => { if (guess.trim().length >= 2) setShowSuggestions(true) }}
            onKeyDown={event => {
              if (event.key === 'Enter') handleManualGuess()
            }}
            placeholder="Escribí el título de la canción"
            disabled={isWin || isLose}
          />

          {showSuggestions && (suggestions.length > 0 || isSearching) && (
            <ul className="track-results" style={{ marginTop: 0 }}>
              {isSearching ? (
                <li style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, background: 'var(--table-row)', borderRadius: 16 }}>Buscando...</li>
              ) : (
                suggestions.map((track, i) => (
                  <li key={i} className="track-result" onClick={() => handleSelectSuggestion(track)}>
                    <img src={track.cover} alt="" />
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <strong>{track.title}</strong>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{track.artist}</span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}

          <div className="daily-actions" style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn-principal" onClick={handleManualGuess} style={{ flex: 1 }} disabled={isWin || isLose || showSuggestions}>
              Adivinar
            </button>
            <button type="button" className="btn-principal" onClick={handleSkip} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--soft-strong)', boxShadow: 'none' }} disabled={isWin || isLose}>
              Saltar (+tiempo)
            </button>
          </div>
        </div>

        <div className="daily-meta" style={{ display: 'flex', marginTop: 30, paddingBottom: 16, borderBottom: '1px solid var(--panel-border)' }}>
          <div className="daily-meta-item" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Intento actual</span>
            <strong style={{ fontSize: 16 }}>{Math.min(currentAttempt + 1, DAILY_SEGMENTS.length)} / {DAILY_SEGMENTS.length}</strong>
          </div>
        </div>

        <ul className="daily-attempts" style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attemptHistory.length > 0 ? (
            attemptHistory.map((attempt, index) => (
              <li
                key={`${attempt.text}-${index}`}
                style={{
                  background: attempt.artistMatch ? 'rgba(247, 201, 72, 0.16)' : 'var(--table-row)',
                  border: `1px solid ${attempt.artistMatch ? 'rgba(247, 201, 72, 0.5)' : 'var(--soft)'}`,
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: 14
                }}
              >
                <span style={{ color: 'var(--muted)', marginRight: 10, fontFamily: 'var(--font-code)' }}>{index + 1}.</span> {attempt.text}
                {attempt.artistMatch && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>ARTISTA CORRECTO</span>
                )}
              </li>
            ))
          ) : (
            <li style={{ color: 'var(--muted)', fontSize: 14 }}>Sin intentos todavía.</li>
          )}
        </ul>

        {(isWin || isLose) && (
          <div className="daily-result" style={{ marginTop: 30, padding: 24, borderRadius: 16, background: isWin ? 'rgba(247, 201, 72, 0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isWin ? 'rgba(247, 201, 72, 0.3)' : 'var(--soft-strong)'}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
              <p style={{ color: isWin ? 'var(--accent)' : 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 16px', fontSize: 12 }}>
                {isWin ? '¡Ganaste!' : 'Resultado'}
              </p>
              <img 
                src={dailyTrack.cover.replace('100x100bb', '400x400bb')} 
                alt={dailyTrack.title} 
                style={{ width: 150, height: 150, borderRadius: 12, marginBottom: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', objectFit: 'cover' }} 
              />
              <h3 style={{ margin: '0 0 4px', fontSize: 24 }}>{dailyTrack.title}</h3>
              <span style={{ color: 'var(--muted)' }}>{dailyTrack.artist}</span>

              {message && (
                <p style={{ margin: '20px 0 0', color: isWin ? '#fff' : 'rgba(255, 138, 128, 0.9)' }}>
                  {message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <audio ref={audioRef} preload="auto" />
    </div>
  )
}