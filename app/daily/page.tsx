'use client'

import { useRouter } from 'next/navigation'
import DailyGame from './DailyGame'

export default function DailyPage() {
  return <DailyGame isArchive />
}
