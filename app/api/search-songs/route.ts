import { NextRequest } from 'next/server'

const CACHE_TTL_MS = 1000 * 60 * 10 // 10 minutos

const cache = new Map<string, { results: any[]; time: number }>()

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) {
    return Response.json({ results: [] })
  }

  const key = query.toLowerCase()
  const cached = cache.get(key)
  const isFresh = cached && Date.now() - cached.time < CACHE_TTL_MS

  if (isFresh) {
    return Response.json({ results: cached!.results })
  }

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=8`
    )

    if (!res.ok) {

      return Response.json({ results: cached?.results ?? [], stale: true })
    }

    const data = await res.json()
    const results = (data.results || []).filter((t: any) => t.previewUrl)

    cache.set(key, { results, time: Date.now() })

    return Response.json({ results })
  } catch (e) {
    console.error('Error buscando en iTunes', e)
    return Response.json({ results: cached?.results ?? [], stale: true })
  }
}