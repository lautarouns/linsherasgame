'use client'

import { useParams } from 'next/navigation'
import DailyGame from '../DailyGame'

export default function DailyArchivedPage() {
  const params = useParams()
  const date = params.date as string
  return <DailyGame dateId={date} isArchive />
}