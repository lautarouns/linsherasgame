'use client'
import { useParams } from 'next/navigation'
import CharacterdleGame from './CharacterdleGame'

function todayStr() {
  const hoy = new Date()
  const yyyy = hoy.getFullYear()
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const dd = String(hoy.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function CharacterdleRoute() {
  const params = useParams()
  const slug = params.slug as string
  return <CharacterdleGame slug={slug} dateStr={todayStr()} />
}