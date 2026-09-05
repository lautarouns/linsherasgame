'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { normalize, seededShuffle } from '@/lib/tracks'

type ClassicPlayer = {
  id: string
  name: string
  birth_year: number
  nationality: string
  position: string
  is_active: boolean
  clubs: string[]
}

function todayStr() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
}

function cellStyle(state: 'correct' | 'partial' | 'wrong') {
  if (state === 'correct') return { background: 'rgba(52, 211, 153, 0.22)', border: '1px solid rgba(52, 211, 153, 0.45)', color: '#fff' }
  if (state === 'partial') return { background: 'rgba(247, 181, 72, 0.22)', border: '1px solid rgba(247, 181, 72, 0.5)', color: '#fff' }
  return { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--soft)', color: 'var(--muted)' }
}

type CellState = { state: 'correct' | 'partial' | 'wrong'; value: string | number; arrow?: 'up' | 'down' }

function getYearStatus(guessYear: number, targetYear: number): CellState {
  if (guessYear === targetYear) return { state: 'correct', value: guessYear }
  const diff = Math.abs(guessYear - targetYear)
  const arrow = guessYear < targetYear ? 'up' : 'down'
  if (diff <= 2) return { state: 'partial', value: guessYear, arrow }
  return { state: 'wrong', value: guessYear, arrow }
}

function getClubStatus(guessClubs: string[], targetClubs: string[]): CellState {
  const gClubs = guessClubs.map(c => normalize(c))
  const tClubs = targetClubs.map(c => normalize(c))
  
  if (gClubs[gClubs.length - 1] === tClubs[tClubs.length - 1]) return { state: 'correct', value: guessClubs.join(', ') }
  if (gClubs.some(c => tClubs.includes(c))) return { state: 'partial', value: guessClubs.join(', ') }
  
  return { state: 'wrong', value: guessClubs.join(', ') }
}

function getExactStatus(guessVal: string, targetVal: string): CellState {
  if (normalize(guessVal) === normalize(targetVal)) return { state: 'correct', value: guessVal }
  return { state: 'wrong', value: guessVal }
}

export default function ClassicFutbolGame() {
  const router = useRouter()
  const dateStr = todayStr()
  
  const [dbPlayers, setDbPlayers] = useState<ClassicPlayer[]>([])
  const [targetPlayer, setTargetPlayer] = useState<ClassicPlayer | null>(null)
  
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ClassicPlayer[]>([])
  const [guesses, setGuesses] = useState<ClassicPlayer[]>([])
  const [status, setStatus] = useState<'playing' | 'win' | 'loss'>('playing')
  const [isLoaded, setIsLoaded] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)

  // 1. Cargar DB, objetivo del día y restaurar progreso
  useEffect(() => {
    async function loadData() {
      const { data, error } = await supabase.from('football_players_classic').select('*')
      if (error || !data) return
      
      const parsedPlayers = data.map(p => ({
        ...p,
        clubs: typeof p.clubs === 'string' ? JSON.parse(p.clubs) : p.clubs
      })) as ClassicPlayer[]
      
      setDbPlayers(parsedPlayers)
      
      const shuffled = seededShuffle(parsedPlayers, 'futbol_classic_' + dateStr)
      const target = shuffled[0]
      setTargetPlayer(target)

      // Chequeamos si ya jugó hoy
      const saved = localStorage.getItem(`futbol_classic_daily_${dateStr}`)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { guessIds: string[]; status: 'playing' | 'win' | 'loss' }
          const restored = parsed.guessIds
            .map(id => parsedPlayers.find(p => p.id === id))
            .filter((p): p is ClassicPlayer => !!p)
          
          setGuesses(restored)
          setStatus(parsed.status)
        } catch (e) {}
      }

      setIsLoaded(true)
    }
    loadData()
  }, [dateStr])

  // 2. Guardar progreso automáticamente
  useEffect(() => {
    if (!isLoaded) return
    localStorage.setItem(`futbol_classic_daily_${dateStr}`, JSON.stringify({
      guessIds: guesses.map(g => g.id),
      status
    }))
  }, [guesses, status, dateStr, isLoaded])

  const handleSearch = (val: string) => {
    setQuery(val)
    if (val.length < 2 || status !== 'playing') {
      setSuggestions([])
      return
    }
    const searchVal = normalize(val)
    const matches = dbPlayers.filter(p => 
      normalize(p.name).includes(searchVal) && 
      !guesses.some(g => g.id === p.id)
    ).slice(0, 6)
    
    setSuggestions(matches)
  }

  const handleGuess = (player: ClassicPlayer) => {
    if (status !== 'playing') return

    const newGuesses = [player, ...guesses]
    setGuesses(newGuesses)
    setQuery('')
    setSuggestions([])
    inputRef.current?.focus()
    
    if (player.id === targetPlayer?.id) {
      new Audio('/audios/correcto.mp3').play().catch(() => {})
      setStatus('win')
    } else {
      new Audio('/audios/error.mp3').play().catch(() => {})
    }
  }

  const handleSurrender = () => {
    if (confirm('¿Seguro que te querés rendir? Se va a revelar el jugador oculto.')) {
      setStatus('loss')
    }
  }

  if (!isLoaded || !targetPlayer) {
    return (
      <div className="theme-futbol">
        <div className="page-shell">
          <p className="status-box">Cargando desafío...</p>
        </div>
      </div>
    )
  }

  const finished = status !== 'playing'

  return (
    <div className="theme-futbol">
      <div className="page-shell">
        <main className="daily-card page-card" style={{ width: 'min(100%, 1100px)' }}>
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Adiviná el jugador</p>
              <h1 className="daily-title" style={{ fontSize: '1.9rem' }}>Desafío Clásico</h1>
            </div>
            <button className="btn-secondary" onClick={() => router.push('/futbol')}>Volver</button>
          </div>

          {status === 'win' && (
            <div className="daily-result is-win" style={{ marginBottom: 20 }}>
              <div className="daily-result-copy">
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>¡Lo adivinaste!</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                  Era <strong>{targetPlayer.name}</strong>. Lo sacaste en {guesses.length} intentos.
                </p>
              </div>
            </div>
          )}

          {status === 'loss' && (
            <div className="daily-result is-loss" style={{ marginBottom: 20 }}>
              <div className="daily-result-copy">
                <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>Te rendiste</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                  Era <strong>{targetPlayer.name}</strong>.
                </p>
              </div>
            </div>
          )}

          {!finished && (
            <div style={{ display: 'flex', gap: 10, marginTop: '20px', zIndex: 10 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={inputRef}
                  className="guess-input"
                  placeholder="Escribí el nombre de un jugador..."
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  disabled={finished}
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--background)', border: '1px solid var(--panel-border)', borderRadius: '12px', marginTop: '8px', padding: '6px', listStyle: 'none', zIndex: 20 }}>
                    {suggestions.map(p => (
                      <li 
                        key={p.id} 
                        onClick={() => handleGuess(p)}
                        style={{ padding: '12px', cursor: 'pointer', borderRadius: '8px', color: '#fff', fontWeight: 600 }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--table-row)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button 
                className="btn-secondary" 
                onClick={handleSurrender}
                style={{ borderColor: 'rgba(255, 82, 82, 0.3)', color: '#ff5252' }}
              >
                Rendirse
              </button>
            </div>
          )}

          {guesses.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 6px' }}>Jugador</th>
                    <th style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Año</th>
                    <th style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>País</th>
                    <th style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Posición</th>
                    <th style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Clubes</th>
                    <th style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {guesses.map(g => {
                    const yearSt = getYearStatus(g.birth_year, targetPlayer.birth_year)
                    const natSt = getExactStatus(g.nationality, targetPlayer.nationality)
                    const posSt = getExactStatus(g.position, targetPlayer.position)
                    const clubSt = getClubStatus(g.clubs, targetPlayer.clubs)
                    const actSt = getExactStatus(g.is_active ? 'Activo' : 'Retirado', targetPlayer.is_active ? 'Activo' : 'Retirado')

                    const cols = [yearSt, natSt, posSt, clubSt, actSt]

                    return (
                      <tr key={g.id}>
                        <td style={{ padding: '6px', minWidth: 150, color: '#fff', fontWeight: 700, fontSize: 13 }}>
                          {g.name}
                        </td>
                        {cols.map((cell, i) => (
                          <td key={i} style={{ padding: 0 }}>
                            <div style={{ ...cellStyle(cell.state), borderRadius: 10, padding: '9px 6px', textAlign: 'center', fontSize: 12, fontWeight: 700, minWidth: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {cell.value}
                              {cell.arrow === 'up' && ' ▲'}
                              {cell.arrow === 'down' && ' ▼'}
                            </div>
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {guesses.length === 0 && (
            <p className="status-box" style={{ marginTop: 24 }}>
              Escribí el nombre de un jugador para arrancar. Verde es exacto, amarillo está cerca (con flecha indicando si el año es mayor o menor, o coincidencia parcial de club) y gris no tiene relación.
            </p>
          )}
        </main>
      </div>
    </div>
  )
}