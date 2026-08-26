'use client'
import { useParams } from 'next/navigation'
import DailyGamingGame from '../DailyGamingGame'

export default function DailyGamingPastRoute() {
  const params = useParams()
  const dateStr = params.date as string

  return <DailyGamingGame dateStr={dateStr} />
}