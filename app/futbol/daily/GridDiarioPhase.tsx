'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalize, seededShuffle } from '@/lib/tracks'
import { supabase } from '@/lib/supabase'

type Difficulty = 'easy' | 'medium' | 'hard'

type FootballPlayer = {
  name: string
  clubs: string[] | string | null
  image_url: string | null
  nationality: string | null
  difficulty: Difficulty
}

type Answer = {
  name: string
  nationality: string
}

type LevelResult = {
  players: FootballPlayer[]
  answers: Answer[]
  results: boolean[][]
}

type SavedGame = {
  completado: true
  history: Record<Difficulty, LevelResult>
}

type PartialProgress = {
  levelIndex: number
  history: Record<Difficulty, LevelResult | null>
  answers: Answer[]
  results: boolean[][] | null
}

const levels: Difficulty[] = ['easy', 'medium', 'hard']
const levelLabels: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
}

const emptyAnswers = (): Answer[] =>
  Array.from({ length: 4 }, () => ({ name: '', nationality: '' }))

// Tarjeta de solo lectura para la pantalla de resultados
function ReadonlyCard({
  player, answer, nameCorrect, natCorrect
}: {
  player: FootballPlayer
  answer: Answer
  nameCorrect: boolean
  natCorrect: boolean
}) {
  return (
    <div className="grid-diario-card">
      {player.image_url ? (
        <img src={player.image_url} alt="Jugador de fútbol" className="grid-diario-image" />
      ) : (
        <div className="grid-diario-image grid-diario-image-empty">Sin foto</div>
      )}
      <div className={`grid-diario-input${nameCorrect ? ' is-correct' : ' is-incorrect'}`} style={{ display: 'flex', alignItems: 'center' }}>
        {answer.name || <span style={{ color: 'var(--muted)' }}>(vacío)</span>}
      </div>
      <div className={`grid-diario-input${natCorrect ? ' is-correct' : ' is-incorrect'}`} style={{ display: 'flex', alignItems: 'center' }}>
        {answer.nationality || <span style={{ color: 'var(--muted)' }}>(vacío)</span>}
      </div>
      {(!nameCorrect || !natCorrect) && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          Era <strong style={{ color: '#fff' }}>{player.name}</strong> — {player.nationality}
        </p>
      )}
    </div>
  )
}

export default function GridDiarioPhase({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [playersByLevel, setPlayersByLevel] = useState<Record<Difficulty, FootballPlayer[]>>({
    easy: [], medium: [], hard: [],
  })
  const [levelIndex, setLevelIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>(emptyAnswers)
  const [results, setResults] = useState<boolean[][] | null>(null)
  const [history, setHistory] = useState<Record<Difficulty, LevelResult | null>>({ easy: null, medium: null, hard: null })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null)

  const progressKey = `futbol_grid_diario_progress_${dateStr}`

  useEffect(() => {
    let cancelled = false

    async function loadPlayers() {
      // Verificamos en localStorage si ya completó el grid de hoy
      const estadoGuardado = localStorage.getItem(`grid_diario_${dateStr}`)
      if (estadoGuardado) {
        try {
          const parsed = JSON.parse(estadoGuardado) as SavedGame
          if (parsed.completado) {
            if (!cancelled) {
              setSavedGame(parsed)
              setIsLoading(false)
            }
            return
          }
        } catch (e) {
          // Formato viejo (string 'completado'), lo ignoramos y dejamos jugar o lo limpiamos
        }
      }

      const { data, error: loadError } = await supabase
        .from('football_players')
        .select('name, clubs, image_url, nationality, difficulty')
        .order('name')
        
      if (cancelled) return
      if (loadError) {
        setError('No se pudieron cargar los jugadores. Intentá nuevamente.')
        setIsLoading(false)
        return
      }

      const shuffled = seededShuffle((data ?? []) as FootballPlayer[], dateStr)
      const selected = levels.reduce((grouped, difficulty) => {
        grouped[difficulty] = shuffled.filter(player => player.difficulty === difficulty).slice(0, 4)
        return grouped
      }, { easy: [], medium: [], hard: [] } as Record<Difficulty, FootballPlayer[]>)

      if (levels.some(difficulty => selected[difficulty].length !== 4)) {
        setError('No hay suficientes jugadores para preparar el Grid Diario.')
      } else {
        setPlayersByLevel(selected)
      }

      // Restaurar progreso a mitad de partida (niveles ya resueltos)
      const progresoGuardado = localStorage.getItem(progressKey)
      if (progresoGuardado) {
        try {
          const progress = JSON.parse(progresoGuardado) as PartialProgress
          setLevelIndex(progress.levelIndex)
          setHistory(progress.history)
          setAnswers(progress.answers)
          setResults(progress.results)
        } catch (e) {
          // progreso corrupto
        }
      }

      setIsLoading(false)
    }

    void loadPlayers()
    return () => { cancelled = true }
  }, [dateStr])

  // Guardar progreso parcial
  useEffect(() => {
    if (isLoading || savedGame) return
    const progress: PartialProgress = { levelIndex, history, answers, results }
    localStorage.setItem(progressKey, JSON.stringify(progress))
  }, [isLoading, savedGame, progressKey, levelIndex, history, answers, results])

  const difficulty = levels[levelIndex]
  const players = playersByLevel[difficulty]
  const score = results?.flat().filter(Boolean).length ?? 0
  const isLastLevel = levelIndex === levels.length - 1

  const updateAnswer = (index: number, field: keyof Answer, value: string) => {
    setAnswers(current => current.map((answer, answerIndex) =>
      answerIndex === index ? { ...answer, [field]: value } : answer
    ))
  }

  const submit = () => {
    if (results) return
    const computed = players.map((player, index) => {
      const rawCandidate = answers[index].name.trim()
      const candidateName = normalize(rawCandidate)
      
      const rawTarget = player.name || ''
      const fullTargetName = normalize(rawTarget)
      const targetParts = rawTarget.split(' ').map(part => normalize(part))
      
      const isNameCorrect = candidateName !== '' && (
        fullTargetName === candidateName || 
        targetParts.includes(candidateName) ||
        (fullTargetName.includes(candidateName) && candidateName.length >= 4)
      )

      const candidateNat = normalize(answers[index].nationality.trim())
      const targetNat = player.nationality ? normalize(player.nationality) : ''
      
      const isNatCorrect = candidateNat !== '' && candidateNat === targetNat

      return [isNameCorrect, isNatCorrect]
    })
    setResults(computed)

    const updatedHistory: Record<Difficulty, LevelResult | null> = {
      ...history,
      [difficulty]: { players, answers, results: computed }
    }
    setHistory(updatedHistory)

    if (isLastLevel) {
      const fullHistory = updatedHistory as Record<Difficulty, LevelResult>
      const saved: SavedGame = { completado: true, history: fullHistory }
      localStorage.setItem(`grid_diario_${dateStr}`, JSON.stringify(saved))
      localStorage.removeItem(progressKey)
    }
  }

  const nextLevel = () => {
    if (isLastLevel) {
      router.push('/futbol')
      return
    }
    setLevelIndex(current => current + 1)
    setAnswers(emptyAnswers())
    setResults(null)
  }

  if (isLoading) {
    return <div className="theme-futbol"><div className="page-shell"><div className="page-card">Cargando Grid Diario...</div></div></div>
  }

  // Pantalla de resultados cuando ya jugó
  if (savedGame) {
    const totalScore = levels.reduce((sum, d) => sum + savedGame.history[d].results.flat().filter(Boolean).length, 0)
    return (
      <div className="theme-futbol">
        <div className="page-shell">
          <main className="daily-card page-card">
            <div className="daily-header">
              <div>
                <p className="daily-kicker">Ya jugaste hoy</p>
                <h1 className="daily-title">Tus resultados</h1>
              </div>
              <button className="btn-secondary" onClick={() => router.push('/futbol')}>Volver</button>
            </div>
            <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 8 }}>
              Puntaje total: <strong style={{ color: 'var(--foreground)' }}>{totalScore}/24</strong>. Volvé mañana a partir de las 00:00 para un nuevo Grid Diario.
            </p>

            {levels.map(lvl => {
              const level = savedGame.history[lvl]
              const levelScore = level.results.flat().filter(Boolean).length
              return (
                <div key={lvl} style={{ marginTop: 26 }}>
                  <h3 className="section-title" style={{ marginBottom: 10 }}>
                    {levelLabels[lvl]} — {levelScore}/8
                  </h3>
                  <div className="grid-diario-grid">
                    {level.players.map((player, index) => (
                      <ReadonlyCard
                        key={`${player.name}-${index}`}
                        player={player}
                        answer={level.answers[index]}
                        nameCorrect={level.results[index][0]}
                        natCorrect={level.results[index][1]}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            <button className="btn-principal" style={{ width: '100%', marginTop: 26 }} onClick={() => router.push('/futbol')}>
              Volver al menú
            </button>
          </main>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="theme-futbol"><div className="page-shell"><div className="page-card">
      <p className="page-subtitle">{error}</p>
      <button className="btn-secondary" onClick={() => router.push('/futbol')}>Volver al menú</button>
    </div></div></div>
  }

  return (
    <div className="theme-futbol">
      <div className="page-shell">
        <main className="daily-card page-card">
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Modo Individual · {levelIndex + 1}/3</p>
              <h1 className="daily-title">Grid Diario</h1>
            </div>
            <button className="btn-secondary" onClick={() => router.push('/futbol')}>Volver</button>
          </div>
          <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 20 }}>
            Completá el nombre y el país de nacimiento de cada jugador.
          </p>
          <div className="grid-diario-grid">
            {players.map((player, index) => {
              const nameCorrect = results?.[index]?.[0]
              const nationalityCorrect = results?.[index]?.[1]
              return (
                <div className="grid-diario-card" key={`${player.name}-${index}`}>
                  {player.image_url ? (
                    <img src={player.image_url} alt="Jugador de fútbol" className="grid-diario-image" />
                  ) : (
                    <div className="grid-diario-image grid-diario-image-empty">Sin foto</div>
                  )}
                  <input
                    className={`grid-diario-input${nameCorrect === undefined ? '' : nameCorrect ? ' is-correct' : ' is-incorrect'}`}
                    placeholder="Nombre del jugador"
                    value={answers[index].name}
                    onChange={event => updateAnswer(index, 'name', event.target.value)}
                    disabled={!!results}
                  />
                  <input
                    className={`grid-diario-input${nationalityCorrect === undefined ? '' : nationalityCorrect ? ' is-correct' : ' is-incorrect'}`}
                    placeholder="País de nacimiento"
                    value={answers[index].nationality}
                    onChange={event => updateAnswer(index, 'nationality', event.target.value)}
                    disabled={!!results}
                  />
                </div>
              )
            })}
          </div>
          {results && <p className="grid-diario-score">{score}/8 correctos</p>}
          <button className="btn-principal" style={{ width: '100%', marginTop: 20 }} onClick={results ? nextLevel : submit}>
            {results ? (isLastLevel ? 'Volver al menú' : `Siguiente nivel · ${levelLabels[levels[levelIndex + 1]]}`) : 'Enviar'}
          </button>
        </main>
      </div>
    </div>
  )
}