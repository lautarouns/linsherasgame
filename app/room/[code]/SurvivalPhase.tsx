'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { Track, baseTitle, normalize, seededShuffle, loadTrackPool } from '@/lib/tracks'

export default function SurvivalPhase({ roomId, playerId, roomCode, roundDeadline, isHost, totalPlayers }:
  { roomId: string, playerId: string | null, roomCode: string, roundDeadline: string, isHost?: boolean, totalPlayers: number }) {

  const [tracks, setTracks] = useState<Track[]>([])
  const [index, setIndex] = useState(0)
  const [guessed, setGuessed] = useState(0)
  const [isLoadingTracks, setIsLoadingTracks] = useState(true)

  const [volume, setVolume] = useState(0.5)

  // Duración total del modo (calculada una sola vez al montar, antes de que arranque la carga)
  const durationMsRef = useRef<number>(new Date(roundDeadline).getTime() - nowSynced())

  // El cronómetro real no arranca hasta que las canciones terminan de cargar
  const [effectiveDeadline, setEffectiveDeadline] = useState<number | null>(null)
  const [remaining, setRemaining] = useState<number>(() => Math.ceil(durationMsRef.current / 1000))
  const [isFinished, setIsFinished] = useState(false)

  const [guess, setGuess] = useState('')
  const [suggestions, setSuggestions] = useState<Track[]>([])

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 1. Cargar temas (desde caché si existe, o armarlo una vez si no) y mezclarlos con la seed de esta partida
  useEffect(() => {
    let cancelled = false
    async function loadTop() {
      try {
        setIsLoadingTracks(true)
        const allTracks = await loadTrackPool()

        const shuffled = seededShuffle(allTracks, roomCode + roundDeadline)
        if (!cancelled) {
          setTracks(shuffled)
          // El cronómetro arranca recién ahora: te da la duración completa sin descontar la carga
          setEffectiveDeadline(nowSynced() + durationMsRef.current)
        }
      } catch (e) {
        console.error('Error cargando canciones', e)
      } finally {
        if (!cancelled) setIsLoadingTracks(false)
      }
    }
    loadTop()
    return () => { cancelled = true }
  }, [roomCode, roundDeadline])

  // 2. Cronómetro basado en el deadline efectivo (recién definido tras cargar)
  useEffect(() => {
    if (effectiveDeadline === null) return

    const tick = () => {
      const diff = Math.max(0, Math.ceil((effectiveDeadline - nowSynced()) / 1000))
      setRemaining(diff)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [effectiveDeadline])

  // 3. Auto-reproducir en loop (Sin botón de play)
  useEffect(() => {
    if (tracks.length === 0 || isFinished || !audioRef.current) return
    const track = tracks[index]
    const audio = audioRef.current

    if (audio.src !== track.previewUrl) {
      audio.src = track.previewUrl
    }

    audio.volume = volume
    audio.loop = true
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
    if (effectiveDeadline !== null && remaining <= 0 && !isFinished) {
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
  }, [remaining, isFinished, guessed, playerId, effectiveDeadline])

  // 6. El Host chequea el tiempo global (basado en el deadline original de la sala, para mantener sincronía entre jugadores)
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
      setEffectiveDeadline(d => (d !== null ? d - 5000 : d))
      setGuess('')
      setSuggestions([])
    }
  }

  const handleSkip = () => {
    if (isFinished || tracks.length === 0) return
    setEffectiveDeadline(d => (d !== null ? d - 5000 : d))
    setIndex(i => Math.min(tracks.length - 1, i + 1))
    setGuess('')
    setSuggestions([])
  }

  // Buscador en vivo: filtra el pool ya cargado en memoria, sin pegarle a la red
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 2 || isFinished || tracks.length === 0) {
        setSuggestions([])
        return
      }
      const matches = tracks.filter(track =>
        track.title.toLowerCase().includes(q) || track.artist.toLowerCase().includes(q)
      )

      // Mezclamos el orden: si no, el tema que está sonando queda siempre
      // primero (por cómo recorremos el pool en orden a medida que avanza
      // la partida), y eso delata cuál es sin que el jugador acierte nada.
      for (let i = matches.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[matches[i], matches[j]] = [matches[j], matches[i]]
      }
      setSuggestions(matches.slice(0, 15))
    }, 150)
    return () => clearTimeout(t)
  }, [guess, isFinished, tracks])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: remaining <= 10 ? '#ff5252' : '#fff', transition: 'color 0.3s' }}>
          {remaining}s
        </div>
      </div>

      {isLoadingTracks && (
        <p className="status-box" style={{ textAlign: 'center', marginBottom: 16 }}>Cargando canciones... (el cronómetro todavía no arrancó)</p>
      )}

      {!isFinished ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>

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

      <audio ref={audioRef} preload="auto" />
    </div>
  )
}