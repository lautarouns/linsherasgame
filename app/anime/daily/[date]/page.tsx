'use client'
import { useParams } from 'next/navigation'
import DailyAnimeGame from '../DailyAnimeGame'

export default function DailyAnimePastRoute() {
  const params = useParams()
  const dateStr = params.date as string

  return <DailyAnimeGame dateStr={dateStr} />
}