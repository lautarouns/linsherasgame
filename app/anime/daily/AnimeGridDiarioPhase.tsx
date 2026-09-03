'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalize, seededShuffle } from '@/lib/tracks'
import { supabase } from '@/lib/supabase'

type Difficulty = 'easy' | 'medium' | 'hard'

type AnimeCharacterRow = {
  character_name: string
  anime_slug: string
  cover_url: string | null
  difficulty: Difficulty
}

type Answer = {
  name: string
  anime: string
}

type LevelResult = {
  characters: AnimeCharacterRow[]
  answers: Answer[]
  results: boolean[][]
}

type SavedGame = {
  completado: true
  history: Record<Difficulty, LevelResult>
  images: Record<string, string | null>
}

const levels: Difficulty[] = ['easy', 'medium', 'hard']
const levelLabels: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Medio',
  hard: 'Difícil',
}

// Nombre legible por cada anime cargado — sumá acá si agregás uno nuevo.
const ANIME_NAMES: Record<string, string> = {
  'attack-on-titan': 'Attack on Titan',
  'jujutsu-kaisen': 'Jujutsu Kaisen',
  'one-piece': 'One Piece',
  'naruto': 'Naruto',
  'dragon-ball-z': 'Dragon Ball Z',
  'death-note': 'Death Note',
  'fullmetal-alchemist-brotherhood': 'Fullmetal Alchemist: Brotherhood',
  'hunter-x-hunter': 'Hunter x Hunter',
  'demon-slayer': 'Demon Slayer',
  'neon-genesis-evangelion': 'Neon Genesis Evangelion',
  'cowboy-bebop': 'Cowboy Bebop',
  'steins-gate': 'Steins;Gate',
  'made-in-abyss': 'Made in Abyss',
  'serial-experiments-lain': 'Serial Experiments Lain',
  'baccano': 'Baccano!',
  'mushishi': 'Mushishi',
  'odd-taxi': 'Odd Taxi',
  'great-teacher-onizuka': 'Great Teacher Onizuka',
  'ping-pong-the-animation': 'Ping Pong the Animation',
  'paranoia-agent': 'Paranoia Agent',
  'mononoke': 'Mononoke',
  'my-hero-academia': 'My Hero Academia',
  'jojos-bizarre-adventure': "JoJo's Bizarre Adventure",
  'bleach': 'Bleach',
  'haikyuu': 'Haikyuu!!',
  'sailor-moon': 'Sailor Moon',
  'cyberpunk-edgerunners': 'Cyberpunk: Edgerunners',
  'inuyasha': 'Inuyasha',
  'yu-yu-hakusho': 'Yu Yu Hakusho',
  'tokyo-ghoul': 'Tokyo Ghoul',
  'one-punch-man': 'One Punch Man',
  'code-geass': 'Code Geass',
  'monster': 'Monster'
};

const emptyAnswers = (): Answer[] =>
  Array.from({ length: 4 }, () => ({ name: '', anime: '' }))

// Busca la foto de un personaje en vivo, sin guardarla en ningún lado —
// primero contra Jikan (API de MyAnimeList) y, si no lo encuentra, contra
// AniList (otra base de datos pública de anime) como segundo intento.
async function fetchCharacterImageLive(name: string): Promise<string | null> {
  const fetchJikanOnce = () =>
    fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(name)}&limit=1`)
      .then(r => {
        console.log(`[grid-diario] Jikan "${name}" → status ${r.status}`)
        return r.ok ? r.json() : null
      })
      .then(data => data?.data?.[0]?.images?.jpg?.image_url ?? null)
      .catch(e => { console.log(`[grid-diario] Jikan "${name}" → error`, e); return null })

  const fetchAniList = () => {
    const query = `query ($search: String) { Character(search: $search) { image { large } } }`
    return fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { search: name } })
    })
      .then(r => {
        console.log(`[grid-diario] AniList "${name}" → status ${r.status}`)
        return r.ok ? r.json() : null
      })
      .then(data => data?.data?.Character?.image?.large ?? null)
      .catch(e => { console.log(`[grid-diario] AniList "${name}" → error`, e); return null })
  }

  // Jikan es gratuito y a veces devuelve 504 por saturación puntual — se
  // reintenta una vez antes de pasar a la segunda fuente.
  let img = await fetchJikanOnce()
  if (!img) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    img = await fetchJikanOnce()
  }
  if (!img) {
    img = await fetchAniList()
  }

  // Último intento: si el nombre completo no dio nada en ninguna de las dos
  // fuentes, probamos solo con la última palabra (ej: "Sukuna" en vez de
  // "Ryomen Sukuna") — muchos personajes están indexados solo por el nombre
  // por el que son más conocidos.
  if (!img) {
    const parts = name.trim().split(/\s+/)
    const lastWord = parts[parts.length - 1]
    if (lastWord && lastWord !== name) {
      console.log(`[grid-diario] "${name}" → probando último intento con "${lastWord}"`)
      img = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(lastWord)}&limit=1`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => data?.data?.[0]?.images?.jpg?.image_url ?? null)
        .catch(() => null)
    }
  }

  console.log(`[grid-diario] "${name}" → resultado final:`, img ? 'encontrada' : 'SIN IMAGEN')
  return img
}

// Tarjeta de solo lectura, usada en la pantalla de revisión (después de
// haber jugado) para mostrar lo que pusiste y la respuesta correcta.
function ReadonlyCard({
  character, image, answer, nameCorrect, animeCorrect
}: {
  character: AnimeCharacterRow
  image: string | null
  answer: Answer
  nameCorrect: boolean
  animeCorrect: boolean
}) {
  const animeName = ANIME_NAMES[character.anime_slug] ?? character.anime_slug
  return (
    <div className="grid-diario-card">
      {image ? (
        <img src={image} alt="Personaje de anime" className="grid-diario-image" />
      ) : (
        <div className="grid-diario-image grid-diario-image-empty">Sin foto</div>
      )}
      <div className={`grid-diario-input${nameCorrect ? ' is-correct' : ' is-incorrect'}`} style={{ display: 'flex', alignItems: 'center' }}>
        {answer.name || <span style={{ color: 'var(--muted)' }}>(vacío)</span>}
      </div>
      <div className={`grid-diario-input${animeCorrect ? ' is-correct' : ' is-incorrect'}`} style={{ display: 'flex', alignItems: 'center' }}>
        {answer.anime || <span style={{ color: 'var(--muted)' }}>(vacío)</span>}
      </div>
      {(!nameCorrect || !animeCorrect) && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
          Era <strong style={{ color: '#fff' }}>{character.character_name}</strong> — {animeName}
        </p>
      )}
    </div>
  )
}

export default function AnimeGridDiarioPhase({ dateStr }: { dateStr: string }) {
  const router = useRouter()
  const [charactersByLevel, setCharactersByLevel] = useState<Record<Difficulty, AnimeCharacterRow[]>>({
    easy: [], medium: [], hard: [],
  })
  const [allCharacters, setAllCharacters] = useState<AnimeCharacterRow[]>([])
  const [images, setImages] = useState<Record<string, string | null>>({})
  const [levelIndex, setLevelIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>(emptyAnswers)
  const [results, setResults] = useState<boolean[][] | null>(null)
  const [history, setHistory] = useState<Record<Difficulty, LevelResult | null>>({ easy: null, medium: null, hard: null })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null)
  const [activeSuggestion, setActiveSuggestion] = useState<{ index: number; field: 'name' | 'anime' } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadCharacters() {
      const estadoGuardado = localStorage.getItem(`anime_grid_diario_${dateStr}`)
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
          // formato viejo ("completado" como string plano) — lo ignoramos y volvemos a jugar
        }
      }

      const { data, error: loadError } = await supabase
        .from('character_guess_pool')
        .select('character_name, anime_slug, cover_url, difficulty')
        .order('character_name')

      if (cancelled) return
      if (loadError) {
        setError('No se pudieron cargar los personajes. Intentá nuevamente.')
        setIsLoading(false)
        return
      }

      const shuffled = seededShuffle((data ?? []) as AnimeCharacterRow[], 'animegrid' + dateStr)
      const selected = levels.reduce((grouped, difficulty) => {
        grouped[difficulty] = shuffled.filter(c => c.difficulty === difficulty).slice(0, 4)
        return grouped
      }, { easy: [], medium: [], hard: [] } as Record<Difficulty, AnimeCharacterRow[]>)

      if (levels.some(difficulty => selected[difficulty].length !== 4)) {
        setError('No hay suficientes personajes clasificados por dificultad para preparar el Grid Diario.')
        setIsLoading(false)
        return
      }

      setCharactersByLevel(selected)
      setAllCharacters((data ?? []) as AnimeCharacterRow[])

      // Buscamos en vivo la foto de los personajes que no tienen cover_url —
      // UNA POR VEZ, con una pausa entre cada una. Pedirlas todas juntas
      // (como hacíamos antes) revienta el límite de pedidos por segundo de
      // Jikan y termina en 429/504 en cascada.
      const allSelected = levels.flatMap(d => selected[d]).filter(c => !c.cover_url)
      ;(async () => {
        for (const c of allSelected) {
          if (cancelled) return
          const url = await fetchCharacterImageLive(c.character_name)
          if (cancelled) return
          setImages(prev => ({ ...prev, [c.character_name]: url }))
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      })()

      setIsLoading(false)
    }

    void loadCharacters()
    return () => { cancelled = true }
  }, [dateStr])

  const difficulty = levels[levelIndex]
  const characters = charactersByLevel[difficulty]
  const score = results?.flat().filter(Boolean).length ?? 0
  const isLastLevel = levelIndex === levels.length - 1

  const updateAnswer = (index: number, field: keyof Answer, value: string) => {
    setAnswers(current => current.map((answer, answerIndex) =>
      answerIndex === index ? { ...answer, [field]: value } : answer
    ))
  }

  // Sugerencias en vivo: filtran datos ya cargados en memoria, sin pegarle a la red.
  const getNameSuggestions = (query: string) => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return allCharacters
      .filter(c => c.character_name.toLowerCase().includes(q))
      .slice(0, 6)
  }

  const getAnimeSuggestions = (query: string) => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []
    return Object.values(ANIME_NAMES).filter(name => name.toLowerCase().includes(q)).slice(0, 6)
  }

  const submit = () => {
    if (results) return
    const computed = characters.map((character, index) => {
      const rawCandidate = answers[index].name.trim()
      const candidateName = normalize(rawCandidate)

      const rawTarget = character.character_name || ''
      const fullTargetName = normalize(rawTarget)
      const targetParts = rawTarget.split(' ').map(part => normalize(part))

      const isNameCorrect = candidateName !== '' && (
        fullTargetName === candidateName ||
        targetParts.includes(candidateName) ||
        (fullTargetName.includes(candidateName) && candidateName.length >= 4)
      )

      const candidateAnime = normalize(answers[index].anime.trim())
      const targetAnimeName = ANIME_NAMES[character.anime_slug] ?? character.anime_slug
      const targetAnime = normalize(targetAnimeName)

      const isAnimeCorrect = candidateAnime !== '' && candidateAnime === targetAnime

      return [isNameCorrect, isAnimeCorrect]
    })
    setResults(computed)

    const updatedHistory: Record<Difficulty, LevelResult | null> = {
      ...history,
      [difficulty]: { characters, answers, results: computed }
    }
    setHistory(updatedHistory)

    if (isLastLevel) {
      const fullHistory = updatedHistory as Record<Difficulty, LevelResult>
      const saved: SavedGame = { completado: true, history: fullHistory, images }
      localStorage.setItem(`anime_grid_diario_${dateStr}`, JSON.stringify(saved))
    }
  }

  const nextLevel = () => {
    if (isLastLevel) {
      router.push('/anime')
      return
    }
    setLevelIndex(current => current + 1)
    setAnswers(emptyAnswers())
    setResults(null)
  }

  if (isLoading) {
    return <div className="theme-anime"><div className="page-shell"><div className="page-card">Cargando Grid Diario...</div></div></div>
  }

  // Ya jugaste hoy: mostramos las 3 rondas con lo que pusiste, en modo lectura.
  if (savedGame) {
    const totalScore = levels.reduce((sum, d) => sum + savedGame.history[d].results.flat().filter(Boolean).length, 0)
    return (
      <div className="theme-anime">
        <div className="page-shell">
          <main className="daily-card page-card">
            <div className="daily-header">
              <div>
                <p className="daily-kicker">Ya jugaste hoy</p>
                <h1 className="daily-title">Tus resultados</h1>
              </div>
              <button className="btn-secondary" onClick={() => router.push('/anime')}>Volver</button>
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
                    {level.characters.map((character, index) => (
                      <ReadonlyCard
                        key={`${character.character_name}-${index}`}
                        character={character}
                        image={character.cover_url ?? savedGame.images[character.character_name] ?? null}
                        answer={level.answers[index]}
                        nameCorrect={level.results[index][0]}
                        animeCorrect={level.results[index][1]}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            <button className="btn-principal" style={{ width: '100%', marginTop: 26 }} onClick={() => router.push('/anime')}>
              Volver al menú
            </button>
          </main>
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="theme-anime"><div className="page-shell"><div className="page-card">
      <p className="page-subtitle">{error}</p>
      <button className="btn-secondary" onClick={() => router.push('/anime')}>Volver al menú</button>
    </div></div></div>
  }

  return (
    <div className="theme-anime">
      <div className="page-shell">
        <main className="daily-card page-card">
          <div className="daily-header">
            <div>
              <p className="daily-kicker">Modo Individual · {levelIndex + 1}/3</p>
              <h1 className="daily-title">Grid Diario</h1>
            </div>
            <button className="btn-secondary" onClick={() => router.push('/anime')}>Volver</button>
          </div>
          <p className="page-subtitle" style={{ textAlign: 'left', marginBottom: 20 }}>
            Completá el nombre del personaje y el anime al que pertenece.
          </p>
          <div className="grid-diario-grid">
            {characters.map((character, index) => {
              const nameCorrect = results?.[index]?.[0]
              const animeCorrect = results?.[index]?.[1]
              const imageUrl = character.cover_url ?? images[character.character_name]
              return (
                <div className="grid-diario-card" key={`${character.character_name}-${index}`}>
                  {imageUrl ? (
                    <img src={imageUrl} alt="Personaje de anime" className="grid-diario-image" />
                  ) : (
                    <div className="grid-diario-image grid-diario-image-empty">Sin foto</div>
                  )}
                  <div style={{ position: 'relative' }}>
                    <input
                      className={`grid-diario-input${nameCorrect === undefined ? '' : nameCorrect ? ' is-correct' : ' is-incorrect'}`}
                      placeholder="Nombre del personaje"
                      value={answers[index].name}
                      onChange={event => updateAnswer(index, 'name', event.target.value)}
                      onFocus={() => setActiveSuggestion({ index, field: 'name' })}
                      onBlur={() => setTimeout(() => setActiveSuggestion(null), 150)}
                      disabled={!!results}
                      autoComplete="off"
                    />
                    {activeSuggestion?.index === index && activeSuggestion.field === 'name' && getNameSuggestions(answers[index].name).length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {getNameSuggestions(answers[index].name).map(c => (
                          <li
                            key={c.character_name}
                            onClick={() => { updateAnswer(index, 'name', c.character_name); setActiveSuggestion(null) }}
                            style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontSize: 13, color: '#fff' }}
                          >
                            {c.character_name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className={`grid-diario-input${animeCorrect === undefined ? '' : animeCorrect ? ' is-correct' : ' is-incorrect'}`}
                      placeholder="Anime al que pertenece"
                      value={answers[index].anime}
                      onChange={event => updateAnswer(index, 'anime', event.target.value)}
                      onFocus={() => setActiveSuggestion({ index, field: 'anime' })}
                      onBlur={() => setTimeout(() => setActiveSuggestion(null), 150)}
                      disabled={!!results}
                      autoComplete="off"
                    />
                    {activeSuggestion?.index === index && activeSuggestion.field === 'anime' && getAnimeSuggestions(answers[index].anime).length > 0 && (
                      <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {getAnimeSuggestions(answers[index].anime).map(name => (
                          <li
                            key={name}
                            onClick={() => { updateAnswer(index, 'anime', name); setActiveSuggestion(null) }}
                            style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--table-row)', border: '1px solid var(--soft)', cursor: 'pointer', fontSize: 13, color: '#fff' }}
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {results && (nameCorrect === false || animeCorrect === false) && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                      Era <strong style={{ color: '#fff' }}>{character.character_name}</strong> — {ANIME_NAMES[character.anime_slug] ?? character.anime_slug}
                    </p>
                  )}
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