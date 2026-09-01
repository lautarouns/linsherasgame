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

const levels: Difficulty[] = ['easy', 'medium', 'hard']
const levelLabels: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
}

const emptyAnswers = (): Answer[] =>
  Array.from({ length: 4 }, () => ({ name: '', nationality: '' }))

export default function GridDiarioPhase({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [playersByLevel, setPlayersByLevel] = useState<Record<Difficulty, FootballPlayer[]>>({
    easy: [], medium: [], hard: [],
  })
  const [levelIndex, setLevelIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>(emptyAnswers)
  const [results, setResults] = useState<boolean[][] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPlayers() {
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
      setIsLoading(false)
    }

    void loadPlayers()
    return () => { cancelled = true }
  }, [dateStr])

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
    setResults(players.map((player, index) => {
      const rawCandidate = answers[index].name.trim()
      const candidateName = normalize(rawCandidate)
      
      const rawTarget = player.name || ''
      const fullTargetName = normalize(rawTarget)
      // Separamos el string original ANTES de normalizar para no perder los espacios
      const targetParts = rawTarget.split(' ').map(part => normalize(part))
      
      // Validación flexible: nombre completo, una de las palabras, o coincidencia parcial (min 4 letras)
      const isNameCorrect = candidateName !== '' && (
        fullTargetName === candidateName || 
        targetParts.includes(candidateName) ||
        (fullTargetName.includes(candidateName) && candidateName.length >= 4)
      )

      // Validación de país estricta
      const candidateNat = normalize(answers[index].nationality.trim())
      const targetNat = player.nationality ? normalize(player.nationality) : ''
      
      const isNatCorrect = candidateNat !== '' && candidateNat === targetNat

      return [isNameCorrect, isNatCorrect]
    }))
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