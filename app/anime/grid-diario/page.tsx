'use client'

import AnimeGridDiarioPhase from '../daily/AnimeGridDiarioPhase'

function todayStr() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

export default function AnimeGridDiarioPage() {
  return <AnimeGridDiarioPhase dateStr={todayStr()} />
}