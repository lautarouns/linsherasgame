'use client'

import DailyAnimeGame from './DailyAnimeGame'

function todayStr() {
  const hoy = new Date()
  const yyyy = hoy.getFullYear()
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const dd = String(hoy.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function DailyIndex() {
  const hoy = todayStr()
  return <DailyAnimeGame dateStr={hoy} />
}