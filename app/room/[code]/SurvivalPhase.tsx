'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'

type Track = {
  title: string
  artist: string
  cover: string
  previewUrl: string
}

function baseTitle(trackName: string) {
  return trackName.split('(')[0].split('[')[0].trim()
}

function normalize(v: string) {
  return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

function hashStringToInt(str: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0
  }
  return h >>> 0
}

function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(arr: T[], seedStr: string) {
  const seed = hashStringToInt(seedStr)
  const rng = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function SurvivalPhase({ roomId, playerId, roomCode, roundDeadline, isHost, totalPlayers }:
  { roomId: string, playerId: string | null, roomCode: string, roundDeadline: string, isHost?: boolean, totalPlayers: number }) {

  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [guessed, setGuessed] = useState(0)
  
  // EL FIX DEL ERROR ROJO: Declaramos el estado del volumen (0.5 = 50%)
  const [volume, setVolume] = useState(0.5)
  
  const [remaining, setRemaining] = useState<number>(() => Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000)))
  const [isFinished, setIsFinished] = useState(false)

  const [guess, setGuess] = useState('')
  const [suggestions, setSuggestions] = useState<Track[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<number | null>(null)

  // 1. Cargar temas con la seed que cambia cada partida
  useEffect(() => {
    let cancelled = false
    async function loadTop() {
      try {
        const res = await fetch('https://itunes.apple.com/us/rss/topsongs/limit=200/json')
        if (!res.ok) return
        const data = await res.json()
        const entries = data.feed.entry || []
        const maps: Track[] = entries.map((entry: any) => {
          const audioLink = (entry.link || []).find((l: any) => l.attributes && l.attributes.title === 'Preview')?.attributes?.href
          const imageArray = entry['im:image'] || []
          const coverLink = imageArray[imageArray.length - 1]?.label
          return {
            title: entry['im:name']?.label ?? '',
            artist: entry['im:artist']?.label ?? '',
            cover: coverLink ?? '',
            previewUrl: audioLink ?? ''
          }
        }).filter((t: Track) => t.previewUrl)

        const shuffled = seededShuffle(maps, roomCode + roundDeadline)
        if (!cancelled) setTracks(shuffled)
      } catch (e) {
        console.error('Error cargando top songs', e)
      }
    }
    loadTop()
    return () => { cancelled = true }
  }, [roomCode, roundDeadline])

  // 2. Cronómetro Local
  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          window.clearInterval(timerRef.current ?? 0)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => { if (timerRef.current) window.clearInterval(timerRef.current) }
  }, [])

  // 3. Auto-reproducir en loop (Sin botón de play)
  useEffect(() => {
    if (tracks.length === 0 || isFinished || !audioRef.current) return
    const track = tracks[index]
    const audio = audioRef.current
    
    if (audio.src !== track.previewUrl) {
      audio.src = track.previewUrl
    }
    
    audio.volume = volume
    audio.loop = true // Vuelve a empezar si pasan los 30s de la preview
    audio.currentTime = 0
    audio.play().catch(e => console.log('Autoplay bloqueado por el navegador (hacé clic en la página):', e))

    return () => {
      audio.pause()
    }
  }, [index, tracks, isFinished])

  // 4. Actualizar volumen en tiempo real
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  // 5. Finalizar localmente
  useEffect(() => {
    if (remaining <= 0 && !isFinished) {
      setIsFinished(true)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      ;(async () => {
        if (playerId) {
          await supabase.from('players').update({ score: guessed }).eq('id', playerId)
        }
      })()
    }
  }, [remaining, isFinished, guessed, playerId])

  // 6. El Host chequea el tiempo global
  useEffect(() => {
    if (!isHost) return
    const checkGlobal = setInterval(() => {
      const globalTimeLeft = new Date(roundDeadline).getTime() - nowSynced()
      if (globalTimeLeft <= 0 || (remaining <= 0 && totalPlayers === 1)) {
        clearInterval(checkGlobal)
        supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId).then()
      }
    }, 1000)
    return () => clearInterval(checkGlobal)
  }, [isHost, roundDeadline, roomId, remaining, totalPlayers])

  const submitGuess = (guessTitle?: string) => {
    if (isFinished || tracks.length === 0) return
    const track = tracks[index]
    const candidate = (guessTitle ?? guess).trim()
    if (!candidate) return

    const isCorrect = normalize(baseTitle(candidate)) === normalize(baseTitle(track.title))

    if (isCorrect) {
      setGuessed(c => c + 1)
      setIndex(i => Math.min(tracks.length - 1, i + 1))
      setGuess('')
      setSuggestions([])
    } else {
      setRemaining(r => Math.max(0, r - 5))
      setGuess('')
      setSuggestions([])
    }
  }

  const handleSkip = () => {
    if (isFinished || tracks.length === 0) return
    setRemaining(r => Math.max(0, r - 5))
    setIndex(i => Math.min(tracks.length - 1, i + 1))
    setGuess('')
    setSuggestions([])
  }

  // Buscador en vivo
  useEffect(() => {
    const t = setTimeout(async () => {
      if (guess.trim().length < 2) {
        setSuggestions([])
        return
      }
      if (isFinished) return
      try {
        setIsSearching(true)
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(guess)}&entity=song&limit=5`)
        const data = await res.json()
        const found = (data.results || []).map((r: any) => ({ title: r.trackName, artist: r.artistName, cover: r.artworkUrl100, previewUrl: r.previewUrl }))
        setSuggestions(found)
      } catch (e) {
        console.error('search error', e)
      } finally {
        setIsSearching(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [guess, isFinished])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: remaining <= 10 ? '#ff5252' : '#fff', transition: 'color 0.3s' }}>
          {remaining}s
        </div>
      </div>

      {!isFinished ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>

          {/* Regulador de volumen integrado */}
          <div className="volume-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 18 }}>🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ flex: 1, cursor: 'pointer' }}
            />
            <span className="volume-value" style={{ minWidth: 45, textAlign: 'right', fontSize: 13, fontFamily: 'var(--font-code)', color: 'var(--muted)' }}>
              {Math.round(volume * 100)}%
            </span>
          </div>

          <input
            value={guess}
            onChange={e => setGuess(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
            placeholder="Escribí el título de la canción"
            className="guess-input"
            disabled={isFinished}
            autoComplete="off"
            autoFocus
          />

          {suggestions.length > 0 && (
            <ul className="track-results" style={{ marginTop: 0 }}>
              {suggestions.map((s, i) => (
                <li key={i} onClick={() => submitGuess(s.title)} className="track-result" style={{ cursor: 'pointer' }}>
                  <img src={s.cover} alt="" />
                  <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <strong>{s.title}</strong>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.artist}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="daily-actions" style={{ display: 'flex', gap: 12 }}>
            <button className="btn-principal" onClick={() => submitGuess()} style={{ flex: 1 }}>
              Adivinar
            </button>
            <button 
              className="btn-principal" 
              onClick={handleSkip} 
              style={{ flex: 1, background: 'rgba(255, 82, 82, 0.1)', border: '1px solid rgba(255, 82, 82, 0.3)', color: '#ff5252', boxShadow: 'none' }}
            >
              Saltar (-5s)
            </button>
          </div>

          <div className="daily-meta" style={{ display: 'flex', marginTop: 20, paddingBottom: 16, borderBottom: '1px solid var(--panel-border)' }}>
            <div className="daily-meta-item" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Racha actual</span>
              <strong style={{ fontSize: 16, color: 'var(--accent)' }}>🔥 {guessed} adivinadas</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="daily-result is-win" style={{ marginTop: 20, padding: 32, textAlign: 'center', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--soft-strong)' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 24 }}>¡Tiempo finalizado!</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>Conseguiste adivinar <strong>{guessed}</strong> canciones.</p>
          
          {totalPlayers > 1 && (
            <p style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 'bold', animation: 'pulse 2s infinite' }}>
              Esperando a que termine el resto para ver los resultados...
            </p>
          )}
        </div>
      )}

      {/* Audio oculto definitivo */}
      <audio ref={audioRef} preload="auto" />
    </div>
  )
}