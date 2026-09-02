export type Character = {
  id: string
  character_name: string
  cover_url: string | null
  attributes: Record<string, string>
}

export type CategoryConfig = {
  category_key: string
  label: string
  display_order: number
  comparison_type: 'categorical' | 'ordinal' | 'numeric'
  ordinal_order: string[] | null
  hint_order: number | null
}

export type CellState = 'correct' | 'partial' | 'wrong'
export type Cell = { value: string; state: CellState; arrow?: 'up' | 'down' }

function compareExact(guessVal: string, targetVal: string): Cell {
  return { value: guessVal, state: guessVal === targetVal ? 'correct' : 'wrong' }
}

// Para categorías con un orden lógico (arco, altura, grado): si no coincide
// exacto, se muestra en amarillo con una flecha SOLO cuando está cerca (a 1
// o 2 posiciones de diferencia en la lista de orden) — si está lejos, se
// marca gris, pero igual conserva la flecha para orientar la dirección.
const ORDINAL_CLOSE_THRESHOLD = 2

function compareOrdinal(guessVal: string, targetVal: string, order: string[]): Cell {
  // Coincidencia exacta siempre es correcta, esté o no la lista de orden.
  if (guessVal === targetVal) {
    return { value: guessVal, state: 'correct' }
  }

  const gi = order.indexOf(guessVal)
  const ti = order.indexOf(targetVal)

  // Si alguno de los dos valores no figura en la lista de orden, no hay forma
  // de calcular una dirección confiable — se marca sin relación (gris), nunca
  // "correcto" solo porque los dos dieron -1 en la búsqueda.
  if (gi === -1 || ti === -1) {
    return { value: guessVal, state: 'wrong' }
  }

  const arrow = gi < ti ? 'up' : 'down'
  const distance = Math.abs(gi - ti)
  const isClose = distance <= ORDINAL_CLOSE_THRESHOLD

  return { value: guessVal, state: isClose ? 'partial' : 'wrong', arrow }
}

// Para categorías numéricas (como la edad): compara los números directamente,
// sin necesitar una lista de orden predefinida.
function compareNumeric(guessVal: string, targetVal: string): Cell {
  const g = parseFloat(guessVal)
  const t = parseFloat(targetVal)
  if (isNaN(g) || isNaN(t)) return compareExact(guessVal, targetVal)
  if (g === t) return { value: guessVal, state: 'correct' }
  return { value: guessVal, state: 'partial', arrow: g < t ? 'up' : 'down' }
}

export function compareCharacters(
  guess: Character,
  target: Character,
  categories: CategoryConfig[]
): Record<string, Cell> {
  const result: Record<string, Cell> = {}
  for (const cat of categories) {
    const guessVal = guess.attributes[cat.category_key] ?? ''
    const targetVal = target.attributes[cat.category_key] ?? ''

    if (cat.comparison_type === 'ordinal' && cat.ordinal_order) {
      result[cat.category_key] = compareOrdinal(guessVal, targetVal, cat.ordinal_order)
    } else if (cat.comparison_type === 'numeric') {
      result[cat.category_key] = compareNumeric(guessVal, targetVal)
    } else {
      result[cat.category_key] = compareExact(guessVal, targetVal)
    }
  }
  return result
}

export function isWinningGuess(row: Record<string, Cell>): boolean {
  return Object.values(row).every(cell => cell.state === 'correct')
}