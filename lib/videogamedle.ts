import { supabase } from './supabase'

export type VideoGame = {
  id: string
  title: string
  cover_url: string | null
  release_year: number
  age_rating: string
  genres: string[]
  platforms: string[]
  developer: string
  publisher: string
  engine: string
  franchise: string | null
}

export type CellState = 'correct' | 'partial' | 'wrong'
export type Cell = { value: string; state: CellState; arrow?: 'up' | 'down' }

const AGE_RATING_ORDER = ['PEGI 3', 'PEGI 7', 'PEGI 12', 'PEGI 16', 'PEGI 18']

// Diferencia de hasta 3 años se pinta amarillo — más lejos que eso, gris
// (pero con flecha igual, para orientar).
const RELEASE_CLOSE_YEARS = 3

function compareExact(guessVal: string, targetVal: string): Cell {
  return { value: guessVal, state: guessVal === targetVal ? 'correct' : 'wrong' }
}

// Igual que arco/altura/grado en Adiviná el Personaje: solo se marca amarillo
// si está a `closeThreshold` posiciones o menos en la lista de orden — si
// está más lejos, se marca gris pero conserva la flecha para orientar.
function compareOrdinalStr(guessVal: string, targetVal: string, order: string[], closeThreshold: number): Cell {
  if (guessVal === targetVal) {
    return { value: guessVal, state: 'correct' }
  }

  const gi = order.indexOf(guessVal)
  const ti = order.indexOf(targetVal)

  if (gi === -1 || ti === -1) {
    return { value: guessVal, state: 'wrong' }
  }

  const arrow = gi < ti ? 'up' : 'down'
  const distance = Math.abs(gi - ti)
  return { value: guessVal, state: distance <= closeThreshold ? 'partial' : 'wrong', arrow }
}

// Para el año de lanzamiento: solo se marca amarillo si la diferencia real
// en años es chica — si está lejos, se marca gris pero conserva la flecha.
function compareNumeric(guessVal: number, targetVal: number, closeThreshold: number): Cell {
  if (guessVal === targetVal) return { value: String(guessVal), state: 'correct' }
  const arrow = guessVal < targetVal ? 'up' : 'down'
  const distance = Math.abs(guessVal - targetVal)
  return { value: String(guessVal), state: distance <= closeThreshold ? 'partial' : 'wrong', arrow }
}

// Para géneros y consolas: verde si son exactamente los mismos, amarillo si
// comparten al menos uno, gris si no tienen ninguno en común.
function compareList(guessList: string[], targetList: string[]): Cell {
  const value = guessList.join(', ')
  const g = new Set(guessList.map(x => x.toLowerCase()))
  const t = new Set(targetList.map(x => x.toLowerCase()))
  const exact = g.size === t.size && [...g].every(x => t.has(x))
  const overlap = [...g].some(x => t.has(x))
  return { value, state: exact ? 'correct' : overlap ? 'partial' : 'wrong' }
}

// Para desarrollador/publisher: verde si coincide con esa misma columna del
// objetivo, amarillo si el estudio que pusiste es correcto pero corresponde a
// la OTRA columna (ej: pusiste como developer al que en realidad es el
// publisher del juego correcto) — como el amarillo de Wordle: dato correcto,
// columna equivocada. Gris si no tiene relación.
function compareStudioCross(guessVal: string, targetSame: string, targetOther: string): Cell {
  if (guessVal === targetSame) return { value: guessVal, state: 'correct' }
  if (guessVal === targetOther) return { value: guessVal, state: 'partial' }
  return { value: guessVal, state: 'wrong' }
}

// Para la saga/franquicia: verde si son de la misma, gris si no — un juego
// sin saga cargada (`null`) nunca da verde, ni siquiera contra otro sin saga,
// porque no hay ninguna franquicia real en común.
function compareFranchise(guessVal: string | null, targetVal: string | null): Cell {
  const value = guessVal ?? 'Independiente'
  if (guessVal && targetVal && guessVal === targetVal) return { value, state: 'correct' }
  return { value, state: 'wrong' }
}

export type VideoGameComparison = {
  release_year: Cell
  age_rating: Cell
  genres: Cell
  platforms: Cell
  developer: Cell
  publisher: Cell
  engine: Cell
  franchise: Cell
}

export function compareVideoGames(guess: VideoGame, target: VideoGame): VideoGameComparison {
  return {
    release_year: compareNumeric(guess.release_year, target.release_year, RELEASE_CLOSE_YEARS),
    age_rating: compareOrdinalStr(guess.age_rating, target.age_rating, AGE_RATING_ORDER, 1),
    genres: compareList(guess.genres, target.genres),
    platforms: compareList(guess.platforms, target.platforms),
    developer: compareStudioCross(guess.developer, target.developer, target.publisher),
    publisher: compareStudioCross(guess.publisher, target.publisher, target.developer),
    engine: compareExact(guess.engine, target.engine),
    franchise: compareFranchise(guess.franchise, target.franchise),
  }
}

// Busca la portada de un juego en vivo, pegándole a nuestra propia ruta
// interna (/api/game-cover), que a su vez consulta el buscador de Steam del
// lado del servidor (Steam bloquea CORS para pedidos directos del navegador).
export async function fetchGameCoverLive(title: string): Promise<string | null> {
  return fetch(`/api/game-cover?title=${encodeURIComponent(title)}`)
    .then(r => (r.ok ? r.json() : null))
    .then(data => data?.cover_url ?? null)
    .catch(() => null)
}

// Guarda en `video_game_guess_pool` la portada ya encontrada, para no tener
// que volver a pedírsela la próxima vez que salga este juego.
export async function cacheGameCover(title: string, url: string) {
  const { error } = await supabase.from('video_game_guess_pool').update({ cover_url: url }).eq('title', title)
  if (error) console.log(`[game-cover] no se pudo guardar la portada de "${title}"`, error)
}
