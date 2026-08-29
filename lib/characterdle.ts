export type Character = {
  id: string
  character_name: string
  cover_url: string | null
  gender: string
  arc: string
  regiment: string
  species: string
  height_category: string
  status: string
}

// Orden narrativo aproximado de los arcos, usado para dar la pista de
// dirección (▲/▼) cuando el arco no coincide exacto.
export const ARC_ORDER = ['Entrenamiento', 'Trost', 'Titán Hembra', 'Regreso a Shiganshina', 'Choque de Titanes', 'Marley']
export const HEIGHT_ORDER = ['Bajo', 'Promedio', 'Alto']

export type CellState = 'correct' | 'partial' | 'wrong'
export type Cell = { value: string; state: CellState; arrow?: 'up' | 'down' }

function compareExact(guessVal: string, targetVal: string): Cell {
  return { value: guessVal, state: guessVal === targetVal ? 'correct' : 'wrong' }
}

// Para atributos con un orden lógico (altura, arco): si no coincide exacto,
// se muestra en amarillo con una flecha indicando si el personaje objetivo
// está "más arriba" o "más abajo" en ese orden.
function compareOrdinal(guessVal: string, targetVal: string, order: string[]): Cell {
  const gi = order.indexOf(guessVal)
  const ti = order.indexOf(targetVal)
  if (gi === -1 || ti === -1 || gi === ti) {
    return { value: guessVal, state: gi === ti ? 'correct' : 'wrong' }
  }
  return { value: guessVal, state: 'partial', arrow: gi < ti ? 'up' : 'down' }
}

export type ComparisonRow = {
  gender: Cell
  arc: Cell
  regiment: Cell
  species: Cell
  height: Cell
  status: Cell
}

export function compareCharacters(guess: Character, target: Character): ComparisonRow {
  return {
    gender: compareExact(guess.gender, target.gender),
    arc: compareOrdinal(guess.arc, target.arc, ARC_ORDER),
    regiment: compareExact(guess.regiment, target.regiment),
    species: compareExact(guess.species, target.species),
    height: compareOrdinal(guess.height_category, target.height_category, HEIGHT_ORDER),
    status: compareExact(guess.status, target.status),
  }
}

export function isWinningGuess(row: ComparisonRow): boolean {
  return Object.values(row).every(cell => cell.state === 'correct')
}