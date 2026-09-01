export type Movie = {
  id: string
  title: string
  poster_url: string | null
  year: number
  genres: string[]
  classification: string
  imdb_rating: number
  studio: string
  director: string
  main_actor: string
}

export type CellState = 'correct' | 'partial' | 'wrong'
export type Cell = { value: string; state: CellState; arrow?: 'up' | 'down' }

const CLASSIFICATION_ORDER = ['ATP', '+13', '+16', '+18']

function compareExact(guessVal: string, targetVal: string): Cell {
  return { value: guessVal, state: guessVal === targetVal ? 'correct' : 'wrong' }
}

function compareOrdinalStr(guessVal: string, targetVal: string, order: string[]): Cell {
  const gi = order.indexOf(guessVal)
  const ti = order.indexOf(targetVal)
  if (gi === -1 || ti === -1 || gi === ti) {
    return { value: guessVal, state: gi === ti ? 'correct' : 'wrong' }
  }
  return { value: guessVal, state: 'partial', arrow: gi < ti ? 'up' : 'down' }
}

function compareNumeric(guessVal: number, targetVal: number): Cell {
  if (guessVal === targetVal) return { value: String(guessVal), state: 'correct' }
  return { value: String(guessVal), state: 'partial', arrow: guessVal < targetVal ? 'up' : 'down' }
}

// Los géneros son una lista: verde si son exactamente los mismos, amarillo si
// comparten al menos uno, gris si no tienen ninguno en común.
function compareGenres(guessGenres: string[], targetGenres: string[]): Cell {
  const value = guessGenres.join(', ')
  const g = new Set(guessGenres.map(x => x.toLowerCase()))
  const t = new Set(targetGenres.map(x => x.toLowerCase()))
  const exact = g.size === t.size && [...g].every(x => t.has(x))
  const overlap = [...g].some(x => t.has(x))
  return { value, state: exact ? 'correct' : overlap ? 'partial' : 'wrong' }
}

// Para director/actor principal: verde si coincide con esa misma columna del
// objetivo, amarillo si el nombre que pusiste es correcto pero corresponde a
// la OTRA columna (ej: pusiste como director a quien en realidad es el actor
// principal de la película correcta) — como el amarillo de Wordle: letra
// correcta, posición equivocada. Gris si no tiene relación.
function compareCastCross(guessVal: string, targetSame: string, targetOther: string): Cell {
  if (guessVal === targetSame) return { value: guessVal, state: 'correct' }
  if (guessVal === targetOther) return { value: guessVal, state: 'partial' }
  return { value: guessVal, state: 'wrong' }
}

export type MovieComparison = {
  year: Cell
  genres: Cell
  classification: Cell
  imdb_rating: Cell
  studio: Cell
  director: Cell
  main_actor: Cell
}

export function compareMovies(guess: Movie, target: Movie): MovieComparison {
  return {
    year: compareNumeric(guess.year, target.year),
    genres: compareGenres(guess.genres, target.genres),
    classification: compareOrdinalStr(guess.classification, target.classification, CLASSIFICATION_ORDER),
    imdb_rating: compareNumeric(guess.imdb_rating, target.imdb_rating),
    studio: compareExact(guess.studio, target.studio),
    director: compareCastCross(guess.director, target.director, target.main_actor),
    main_actor: compareCastCross(guess.main_actor, target.main_actor, target.director),
  }
}