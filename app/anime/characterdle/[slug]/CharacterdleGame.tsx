'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { seededShuffle } from '@/lib/tracks'
import { Character, ComparisonRow, compareCharacters, isWinningGuess } from '@/lib/characterdle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type GuessRow = {
  character: Character
  comparison: ComparisonRow
}

const COLUMNS: { key: keyof ComparisonRow; label: string; field: keyof Character }[] = [
  { key: 'gender', label: 'Género', field: 'gender' },
  { key: 'arc', label: 'Arco', field: 'arc' },
  { key: 'regiment', label: 'Regimiento', field: 'regiment' },
  { key: 'species', label: 'Especie', field: 'species' },
  { key: 'height', label: 'Altura', field: 'height_category' },
  { key: 'status', label: 'Estado', field: 'status' },
]

// Cada 5 intentos se destapa una pista más, en este orden.
const HINTS_ORDER: { field: keyof Character; label: string }[] = [
  { field: 'arc', label: 'Arco' },
  { field: 'status', label: 'Estado' },
  { field: 'height_category', label: 'Altura' },
  { field: 'regiment', label: 'Regimiento' },
]
const HINT_EVERY = 5

function cellStyle(state: 'correct' | 'partial' | 'wrong') {
  if (state === 'correct') return { background: 'rgba(52, 211, 153, 0.22)', border: '1px solid rgba(52, 211, 153, 0.45)', color: '#fff' }
  if (state === 'partial') return { background: 'rgba(247, 181, 72, 0.22)', border: '1px solid rgba(247, 181, 72, 0.5)', color: '#fff' }
  return { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--soft)', color: 'var(--muted)' }
}

export default function CharacterdleGame({ slug, dateStr }: { slug: string; dateStr: string }) {
  const router = useRouter()
  const [pool, setPool] = useState<Character[]>([])
  const [target, setTarget] = useState<Character | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [won, setWon] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  const [guess, setGuess] = useState('')
  const [suggestions, setSuggestions] = useState<Character[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // 1. Cargar el pool del anime elegido, el personaje del día, y el progreso guardado
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('character_guess_pool')
        .select('id, character_name, cover_url, gender, arc, regiment, species, height_category, status')
        .eq('anime_slug', slug)
      const allCharacters = (data ?? []) as Character[]
      const shuffled = seededShuffle(allCharacters, slug + dateStr)
      const todayTarget = shuffled[0]

      if (!cancelled && todayTarget) {
        setPool(allCharacters)
        setTarget(todayTarget)

        const saved = localStorage.getItem(`characterdle_${slug}_${dateStr}`)
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as { names: string[]; won: boolean; gaveUp?: boolean }
            const restoredGuesses: GuessRow[] = parsed.names
              .map(name => allCharacters.find(c => c.character_name === name))
              .filter((c): c is Character => !!c)
              .map(c => ({ character: c, comparison: compareCharacters(c, todayTarget) }))
            setGuesses(restoredGuesses)
            setWon(parsed.won)
            setGaveUp(parsed.gaveUp ?? false)
          } catch (e) {}
        }
        setIsLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug, dateStr])

  // 2. Guardar progreso
  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(`characterdle_${slug}_${dateStr}`, JSON.stringify({
      names: guesses.map(g => g.character.character_name),
      won,
      gaveUp
    }))
  }, [guesses, won, gaveUp, slug, dateStr, isLoaded])

  // 3. Buscador en vivo
  useEffect(() => {
    const t = setTimeout(() => {
      const q = guess.trim().toLowerCase()
      if (q.length < 1 || won || gaveUp) {
        setSuggestions([])
        return
      }
      const already = new Set(guesses.map(g => g.character.character_name))
      const matches = pool
        .filter(c => !already.has(c.character_name) && c.character_name.toLowerCase().includes(q))
        .slice(0, 8)
      setSuggestions(matches)
    }, 120)
    return () => clearTimeout(t)
  }, [guess, pool, guesses, won, gaveUp])

  const submitGuess = (character?: Character) => {
    if (won || gaveUp || !target) return
    const chosen = character ?? pool.find(c => c.character_name.toLowerCase() === guess.trim().toLowerCase())
    if (!chosen) return
    if (guesses.some(g => g.character.character_name === chosen.character_name)) return

    const comparison = compareCharacters(chosen, target)
    const newRow: GuessRow = { character: chosen, comparison }
    setGuesses(prev => [newRow, ...prev])
    setGuess('')
    setSuggestions([])
    setShowSuggestions(false)

    if (isWinningGuess(comparison)) setWon(true)
  }

  if (!isLoaded || !target) {
    return (
      <div className="theme-anime">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  const finished = won || gaveUp
  const unlockedHints = Math.min(Math.floor(guesses.length / HINT_EVERY), HINTS_ORDER.length)

  return (
    <div className="theme-anime theme-bg">
      <div className="page-shell">
        <div className="page-card" style={{ width: 'min(100%, 920px)' }}>
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Adiviná el Personaje</p>
              <h1 className="daily-title" style={{ fontSize: '1.9rem' }}>Attack on Titan</h1>
            </div>
            <button onClick={() => router.push('/anime/characterdle')} className="btn-secondary">Volver</button>
          </div>

          {unlockedHints > 0 && !finished && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              {HINTS_ORDER.slice(0, unlockedHints).map(hint => (
                <div key={hint.field} style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255, 61, 113, 0.08)', border: '1px solid rgba(255, 61, 113, 0.28)', flex: '1 1 140px' }}>
                  <span style={{ display: 'block', fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{hint.label}</span>
                  <strong style={{ color: '#fff', fontSize: 14 }}>{target[hint.field]}</strong>
                </div>
              ))}
            </div>
          )}

          {won && (
            <div className="daily-result is-win" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {target.cover_url && (
                <img src={target.cover_url} alt={target.character_name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>¡Lo adivinaste!</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>El personaje era <strong>{target.character_name}</strong></p>
              </div>
            </div>
          )}

          {gaveUp && !won && (
            <div className="daily-result is-loss" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              {target.cover_url && (
                <img src={target.cover_url} alt={target.character_name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
              )}
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Te rendiste</h3>
                <p style={{ margin: 0, color: 'var(--muted)' }}>El personaje era <strong>{target.character_name}</strong></p>
              </div>
            </div>
          )}

          {!finished && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="guess-input"
                  value={guess}
                  onChange={e => { setGuess(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => { if (guess.trim().length >= 1) setShowSuggestions(true) }}
                  onKeyDown={e => { if (e.key === 'Enter') submitGuess() }}
                  placeholder="Escribí el nombre de un personaje"
                  autoComplete="off"
                  autoFocus
                />
                <button className="btn-principal" onClick={() => submitGuess()}>Adivinar</button>
                <button
                  className="btn-secondary"
                  onClick={() => { if (confirm('¿Seguro que te querés rendir? Se va a revelar el personaje.')) setGaveUp(true) }}
                  style={{ borderColor: 'rgba(255, 82, 82, 0.3)', color: '#ff5252' }}
                >
                  Rendirse
                </button>
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestions.map(c => (
                    <li
                      key={c.id}
                      onClick={() => submitGuess(c)}
                      style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontWeight: 600, color: '#fff' }}
                    >
                      {c.character_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {guesses.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 6px' }}>Personaje</th>
                    {COLUMNS.map(col => (
                      <th key={col.key} style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guesses.map((g, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px', minWidth: 170, color: '#fff', fontWeight: 700, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {g.character.cover_url ? (
                            <img
                              src={g.character.cover_url}
                              alt=""
                              style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--soft)', flexShrink: 0 }} />
                          )}
                          {g.character.character_name}
                        </div>
                      </td>
                      {COLUMNS.map(col => {
                        const cell = g.comparison[col.key]
                        return (
                          <td key={col.key} style={{ padding: 0 }}>
                            <div style={{ ...cellStyle(cell.state), borderRadius: 10, padding: '9px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, minWidth: 76 }}>
                              {cell.value}
                              {cell.arrow === 'up' && ' ▲'}
                              {cell.arrow === 'down' && ' ▼'}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {guesses.length === 0 && (
            <p className="status-box">Escribí el nombre de un personaje para arrancar. Verde es exacto, naranja está cerca (con flecha si tiene que ver con orden, como la altura o el momento de la historia), gris no tiene relación.</p>
          )}
        </div>
      </div>
    </div>
  )
}