'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { nowSynced } from '@/lib/serverTime'
import { normalize } from '@/lib/tracks'
import { ANIME_NAMES, fetchCharacterImageLive, cacheCharacterImage } from '@/lib/animeImage'

const DEFAULT_ROUND_SECONDS = 20
const REVEAL_SECONDS = 4
const DUEL_POINTS = 100

type AnimeDuelRow = {
  id: string
  round_number: number
  character_name: string
  anime_title: string
  cover_url: string | null
  winner_player_id: string | null
  winner_nickname: string | null
}

type AnimeCharacter = {
  character_name: string
  anime_title: string
  cover_url: string | null
}

export default function AnimeDuelPhase({
  roomId, playerId, nickname, currentRound, roundDeadline, isHost, totalRounds, roundSeconds
}: {
  roomId: string; playerId: string; nickname?: string; currentRound: number
  roundDeadline: string; isHost: boolean; totalRounds: number
  roundSeconds: number
}) {
  const roundDuration = roundSeconds > 0 ? roundSeconds : DEFAULT_ROUND_SECONDS
  const [duel, setDuel] = useState<AnimeDuelRow | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(roundDuration)
  const [guess, setGuess] = useState('')
  const [showWrong, setShowWrong] = useState(false)
  const [iWon, setIWon] = useState(false)
  const [showReveal, setShowReveal] = useState(false)
  const advanceScheduledRound = useRef<number | null>(null)
  const isSubmitting = useRef(false)

  // Pool completo de personajes, cargado una sola vez, usado solo para las
  // sugerencias del buscador (no se pega a la red en cada tecla).
  const [pool, setPool] = useState<AnimeCharacter[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Foto del personaje, mostrada tanto durante el guess como en la
  // revelación. Si no está cacheada en la base se busca en vivo y se guarda.
  const [characterImage, setCharacterImage] = useState<string | null>(null)

  // 0. Cargar el pool de personajes una sola vez — combina `anime_characters`
  // con los títulos de `character_guess_pool` (mapeados desde ANIME_NAMES),
  // para que el buscador conozca todos los animes posibles.
  useEffect(() => {
    let cancelled = false
    supabase.from('anime_characters').select('*').then(({ data }) => {
      if (cancelled) return
      const manual = (data ?? []) as AnimeCharacter[]
      const fromGrid = Object.values(ANIME_NAMES).map(anime_title => ({
        character_name: '', anime_title, cover_url: null,
      }))
      setPool([...manual, ...fromGrid])
    })
    return () => { cancelled = true }
  }, [])

  // 1. Cargar la ronda actual (la fila de `anime_duels` correspondiente) y resetear estado local
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setDuel(null)
      setGuess('')
      setShowWrong(false)
      setIWon(false)
      setShowReveal(false)
      setSecondsLeft(roundDuration)
      setSuggestions([])
      setShowSuggestions(false)
      setCharacterImage(null)
      isSubmitting.current = false

      const { data } = await supabase
        .from('anime_duels')
        .select('id, round_number, character_name, anime_title, cover_url, winner_player_id, winner_nickname')
        .eq('room_id', roomId)
        .eq('round_number', currentRound)
        .single()

      if (!cancelled && data) setDuel(data as AnimeDuelRow)
    }
    load()
    return () => { cancelled = true }
  }, [roomId, currentRound, roundDuration])

  // 2. Escuchar en tiempo real cuándo alguien gana la ronda
  useEffect(() => {
    if (!duel) return
    const channel = supabase
      .channel(`anime-duel-${duel.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'anime_duels',
        filter: `id=eq.${duel.id}`
      }, payload => {
        const updated = payload.new as AnimeDuelRow
        setDuel(updated)
        if (updated.winner_player_id && !showReveal) {
          setShowReveal(true)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [duel?.id, showReveal])

  // 3. Cronómetro: se detiene apenas arranca la revelación
  useEffect(() => {
    if (showReveal) return
    const tick = () => {
      const diff = Math.max(0, Math.ceil((new Date(roundDeadline).getTime() - nowSynced()) / 1000))
      setSecondsLeft(diff)
      if (diff === 0 && !showReveal) {
        setShowReveal(true)
      }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [roundDeadline, showReveal])

  // 4. Avance de ronda: único punto de control, evaluado solo cuando el
  // `duel` cargado ya pertenece a la ronda actual (evita que datos viejos de
  // la ronda anterior disparen un avance antes de tiempo).
  useEffect(() => {
    if (!isHost || advanceScheduledRound.current === currentRound) return
    if (!duel || duel.round_number !== currentRound) return

    const roundEnded = !!duel.winner_player_id || secondsLeft === 0
    if (!roundEnded) return

    advanceScheduledRound.current = currentRound
    const timer = setTimeout(() => {
      if (currentRound >= totalRounds) {
        supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
          .then(({ error }) => { if (error) console.error(error) })
      } else {
        supabase.from('rooms').update({
          current_round: currentRound + 1,
          round_deadline: new Date(nowSynced() + roundDuration * 1000).toISOString()
        }).eq('id', roomId)
          .then(({ error }) => { if (error) console.error(error) })
      }
    }, REVEAL_SECONDS * 1000)

    return () => clearTimeout(timer)
  }, [isHost, duel?.round_number, duel?.winner_player_id, secondsLeft, currentRound, totalRounds, roomId, roundDuration])

  // 5. Buscador en vivo: filtra el pool ya cargado en memoria, sin pegarle a la red
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 1 || showReveal || pool.length === 0) {
        setSuggestions([])
        return
      }
      const titles = Array.from(new Set(pool.map(c => c.anime_title)))
      const matches = titles.filter(title => title.toLowerCase().includes(q))
      setSuggestions(matches.slice(0, 10))
    }, 150)
    return () => clearTimeout(t)
  }, [guess, showReveal, pool])

  // 6. Buscamos la foto del personaje apenas carga la ronda (no solo en la
  // revelación), con el mismo buscador con reintentos y segunda fuente
  // (Jikan + AniList) que usa el Grid Diario. Si el personaje ya tiene
  // cover_url cargado en la base, se usa directo y no se pega a la API; si
  // no, apenas se encuentra se guarda en `character_guess_pool` para no
  // volver a pedirla en futuros duelos o Grid Diarios.
  useEffect(() => {
    if (!duel) return
    let cancelled = false

    ;(async () => {
      if (duel.cover_url) {
        if (!cancelled) setCharacterImage(duel.cover_url)
        return
      }
      const img = await fetchCharacterImageLive(duel.character_name)
      if (cancelled) return
      setCharacterImage(img)
      if (img) void cacheCharacterImage(duel.character_name, img)
    })()

    return () => { cancelled = true }
  }, [duel?.id])

  const submitGuess = useCallback(async (guessTitle?: string) => {
    if (!duel || duel.winner_player_id || showReveal) return
    const candidate = (guessTitle ?? guess).trim()
    if (!candidate) return
    if (isSubmitting.current) return
    isSubmitting.current = true

    const isCorrect = normalize(candidate) === normalize(duel.anime_title)

    if (!isCorrect) {
      new Audio('/audios/error.mp3').play().catch(e => console.log('Audio error:', e));
      setShowWrong(true)
      setGuess('')
      setSuggestions([])
      setShowSuggestions(false)
      isSubmitting.current = false
      return
    }

    new Audio('/audios/correcto.mp3').play().catch(e => console.log('Audio error:', e));

    // Intento atómico: solo gana quien logre pasar winner_player_id de null a su id.
    const { data: claimed } = await supabase
      .from('anime_duels')
      .update({
        winner_player_id: playerId,
        winner_nickname: nickname ?? null,
        answered_at: new Date().toISOString()
      })
      .eq('id', duel.id)
      .is('winner_player_id', null)
      .select()
      .maybeSingle()

    if (claimed) {
      setIWon(true)
      setDuel(claimed as AnimeDuelRow)
      setShowReveal(true)

      const { data: p } = await supabase.from('players').select('score, total_score').eq('id', playerId).single()
      if (p) {
        await supabase.from('players').update({
          score: p.score + DUEL_POINTS,
          total_score: (p.total_score ?? 0) + DUEL_POINTS
        }).eq('id', playerId)
      }
    } else {
      // Adivinaste bien, pero otro jugador te ganó de mano por instantes
      setGuess('')
      isSubmitting.current = false
    }
  }, [duel, guess, showReveal, playerId, nickname])

  if (!duel) return <p className="status-box">Cargando duelo...</p>

  const pct = roundDuration > 0 ? Math.max(0, Math.min(100, (secondsLeft / roundDuration) * 100)) : 0

  if (showReveal) {
    const winnerName = duel.winner_nickname
    return (
      <div className="reveal-panel">
        <span className="section-title" style={{ margin: 0 }}>Duelo {currentRound} de {totalRounds}</span>
        {characterImage && (
          <img className="reveal-art" src={characterImage} width={190} height={190} alt="" />
        )}
        <h2 className="reveal-title">{duel.anime_title}</h2>
        <p className="reveal-artist">Personaje: {duel.character_name}</p>

        {winnerName ? (
          <div className={iWon ? 'reveal-result' : 'reveal-result is-neutral'}>
            {iWon ? <>¡La sacaste! <strong>+{DUEL_POINTS}</strong> puntos</> : <><strong>{winnerName}</strong> la adivinó primero</>}
          </div>
        ) : (
          <div className="reveal-result is-neutral">Nadie la adivinó esta vez.</div>
        )}
      </div>
    )
  }

  return (
    <div className="room-section">
      <div className="phase-head">
        <span className="section-title">Duelo {currentRound} / {totalRounds}</span>
        <div className="timer-badge">
          <strong>{String(secondsLeft).padStart(2, '0')}</strong>
          <span>s</span>
        </div>
      </div>

      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <div style={{ padding: 30, borderRadius: 16, background: 'rgba(255,255,255,0.03)', margin: '16px 0', textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-code)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Personaje</span>
        {characterImage ? (
          <img
            src={characterImage}
            alt="Personaje de anime"
            style={{ width: 160, height: 160, borderRadius: 16, objectFit: 'cover', margin: '14px auto 0', display: 'block' }}
          />
        ) : (
          <div style={{
            width: 160, height: 160, borderRadius: 16, margin: '14px auto 0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', fontSize: 13,
          }}>
            Sin foto
          </div>
        )}
        <h2 style={{ margin: '14px 0 0', fontSize: 28, color: '#fff' }}>{duel.character_name}</h2>
      </div>

      <div className="guess-panel">
        <p className="guess-header">¿De qué anime es?</p>
        <div className="guess-input-wrap" style={{ position: 'relative' }}>
          <input
            className="guess-input"
            value={guess}
            onChange={e => { setGuess(e.target.value); setShowWrong(false); setShowSuggestions(true) }}
            onFocus={() => { if (guess.trim().length >= 1) setShowSuggestions(true) }}
            onKeyDown={e => e.key === 'Enter' && submitGuess()}
            placeholder="Nombre del anime"
            autoFocus
            autoComplete="off"
          />
          <button onClick={() => submitGuess()} className="btn-principal">Adivinar</button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {suggestions.map((title, i) => (
              <li
                key={i}
                onClick={() => submitGuess(title)}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontWeight: 600 }}
              >
                {title}
              </li>
            ))}
          </ul>
        )}

        {showWrong && <p className="status-box is-wrong">No es ese anime, seguí intentando.</p>}
      </div>
    </div>
  )
}