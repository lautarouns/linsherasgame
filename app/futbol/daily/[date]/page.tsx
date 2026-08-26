'use client'
import { useParams } from 'next/navigation'
import DailyFutbolGame from '../DailyFutbolGame'

export default function DailyFutbolPastRoute() {
  const params = useParams()
  const dateStr = params.date as string

  return <DailyFutbolGame dateStr={dateStr} />
}