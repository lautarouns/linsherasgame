import { NextRequest } from 'next/server'

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 24 horas — las portadas no cambian

const cache = new Map<string, { cover_url: string | null; time: number }>()

// Steam bloquea CORS para pedidos desde el navegador, por eso esta ruta
// interna busca del lado del servidor y le devuelve al cliente solo la URL.
async function findSteamCover(title: string): Promise<string | null> {
  const searchRes = await fetch(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=english&cc=us`
  )
  if (!searchRes.ok) return null

  const data = await searchRes.json()
  const appId = data?.items?.[0]?.id
  if (!appId) return null

  // La portada vertical (estilo poster) no existe para todos los juegos —
  // si no está, probamos con el header horizontal, que sí es casi universal.
  const library = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
  const libraryOk = await fetch(library, { method: 'HEAD' }).then(r => r.ok).catch(() => false)
  if (libraryOk) return library

  const header = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
  const headerOk = await fetch(header, { method: 'HEAD' }).then(r => r.ok).catch(() => false)
  return headerOk ? header : null
}

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title')?.trim() ?? ''
  if (title.length < 2) {
    return Response.json({ cover_url: null })
  }

  const key = title.toLowerCase()
  const cached = cache.get(key)
  const isFresh = cached && Date.now() - cached.time < CACHE_TTL_MS
  if (isFresh) {
    return Response.json({ cover_url: cached!.cover_url })
  }

  try {
    const cover_url = await findSteamCover(title)
    cache.set(key, { cover_url, time: Date.now() })
    return Response.json({ cover_url })
  } catch (e) {
    console.error('Error buscando portada de juego', e)
    return Response.json({ cover_url: null })
  }
}
