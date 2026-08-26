import { supabase } from './supabase'

export type Track = {
  title: string
  artist: string
  cover: string
  previewUrl: string
}

// Mezcla de artistas populares por región y género: Argentina/Latam, EE.UU., Europa, metal, 80s, hip-hop
export const POPULAR_ARTISTS = [
  'Duki', 'Bizarrap', 'Emilia', 'Trueno', 'Nicki Nicole', 'Wos',
  'Paulo Londra', 'Tini', 'La Joaqui', 'Khea', 'Cazzu', 'Milo J',
  'YSY A', 'Tiago PZK', 'Bad Bunny', 'Karol G', 'Feid', 'Rauw Alejandro',
  'Shakira', 'Ozuna', 'Maluma', 'J Balvin', 'Peso Pluma', 'Fuerza Regida',
  'Rels B', 'Taylor Swift', 'Drake', 'The Weeknd', 'Billie Eilish', 'Ariana Grande',
  'Post Malone', 'Travis Scott', 'Olivia Rodrigo', 'Doja Cat', 'SZA', 'Kendrick Lamar',
  'Bruno Mars', 'Beyoncé', 'Justin Bieber', 'Chris Brown', 'Dua Lipa', 'Ed Sheeran',
  'Coldplay', 'David Guetta', 'Rosalía', 'Stromae', 'Aitana', 'Quevedo',
  'Sam Smith', 'Skrillex', 'Calvin Harris', 'Imagine Dragons', 'Måneskin', 'ABBA',
  'Metallica', 'Iron Maiden', 'Black Sabbath', 'Slipknot', 'System of a Down', 'Megadeth',
  'Slayer', 'Pantera', 'Rammstein', 'Judas Priest', 'Korn', 'Guns N Roses',
  'AC/DC', 'Sepultura', 'Deftones', 'Nirvana', 'Michael Jackson', 'Madonna',
  'Queen', 'Duran Duran', 'Whitney Houston', 'Cyndi Lauper', 'Tears for Fears', 'a-ha',
  'Culture Club', 'Wham', 'Prince', 'Eurythmics', 'Bon Jovi', 'Soda Stereo',
  'Hombres G', 'Eminem', 'Jay-Z', 'Kanye West', 'Tyler the Creator', 'Nicki Minaj',
  '50 Cent', 'Snoop Dogg', 'Dr. Dre', 'Cardi B', 'A$AP Rocky', 'Wu-Tang Clan',
  'Notorious B.I.G.', 'Tupac', 'J. Cole', 'Lil Wayne', 'Plan B', 'Chencho Corleone',
  'Don omar', 'Daddy Yankee', 'Wisin y Yandel', 'Justin Quiles', 'Radiohead', 'Zion & Lennox',
  'Arcangel', 'Nicky Jam', 'Sech', 'Myke Towers', 'XXXTENTACION', 'Juice WRLD',
  'Lil Peep', 'Pop Smoke', 'Lil Baby', 'Danny Ocean', 'Jhay Cortez', 'J Alvarez',
  'Prince Royce', 'Romeo Santos', 'Tego Calderon', 'Cosculluela'
]

const POOL_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 días: refresco completo del catálogo
const TOPUP_COOLDOWN_MS = 1000 * 60 * 15 // no intentar completar artistas faltantes más de 1 vez cada 15 min
const TOPUP_BATCH_LIMIT = 15 // como mucho 15 artistas nuevos por intento de relleno, para ser suave con la API

export function baseTitle(trackName: string) {
  return trackName.split('(')[0].split('[')[0].trim()
}

export function normalize(v: string) {
  return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

export function hashStringToInt(str: string) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0
  }
  return h >>> 0
}

export function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

export function seededShuffle<T>(arr: T[], seedStr: string) {
  const seed = hashStringToInt(seedStr)
  const rng = mulberry32(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type ArtistFetchResult = { artist: string; data: any | null }

async function fetchArtist(artist: string): Promise<ArtistFetchResult> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=15`)
    if (!res.ok) return { artist, data: null }
    const data = await res.json()
    return { artist, data }
  } catch {
    return { artist, data: null }
  }
}

// Ejecuta las búsquedas de a tandas chicas para no saturar el límite de la API de iTunes.
// Los que fallan (red caída, 403/429 puntual) se reintentan una vez más al final, con más aire.
async function fetchInBatches(artists: string[], batchSize = 3, delayMs = 700): Promise<ArtistFetchResult[]> {
  const results: ArtistFetchResult[] = []
  for (let i = 0; i < artists.length; i += batchSize) {
    const batch = artists.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fetchArtist))
    results.push(...batchResults)
    if (i + batchSize < artists.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  const failed = results.filter(r => !r.data)
  if (failed.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 3000))
    for (const r of failed) {
      const retry = await fetchArtist(r.artist)
      if (retry.data) {
        const idx = results.findIndex(x => x.artist === r.artist)
        if (idx !== -1) results[idx] = retry
      }
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
  }

  return results
}

function tracksFromResults(results: ArtistFetchResult[]): Track[] {
  const allResults = results
    .map(r => r.data)
    .filter(Boolean)
    .flatMap((d: any) => d.results || [])

  const maps: Track[] = allResults
    .filter((r: any) => r.previewUrl)
    .map((r: any) => ({
      title: r.trackName,
      artist: r.artistName,
      cover: r.artworkUrl100,
      previewUrl: r.previewUrl
    }))

  return dedupeTracks(maps)
}

function dedupeTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  return tracks.filter(t => {
    const key = normalize(t.title) + '|' + normalize(t.artist)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Arma el pool completo desde cero (los 124 artistas) y pisa el caché entero.
// Se usa la primera vez que no hay ninguna fila cacheada, o cuando pasaron 7+ días.
async function buildFullPool(): Promise<Track[]> {
  const artistResults = await fetchInBatches(POPULAR_ARTISTS)

  const covered = artistResults.filter(r => r.data).map(r => r.artist)
  const stillFailed = artistResults.filter(r => !r.data).map(r => r.artist)
  if (stillFailed.length > 0) {
    console.warn('[tracks] No se pudieron cargar canciones para:', stillFailed.join(', '))
  }

  const tracks = tracksFromResults(artistResults)

  await supabase.from('survival_pool').upsert({
    id: 1,
    tracks,
    covered_artists: covered,
    updated_at: new Date().toISOString(),
    last_topup_attempt: new Date().toISOString()
  })

  return tracks
}

// Trae el pool de canciones: primero intenta el caché en Supabase (compartido por
// Supervivencia, Duelo y Diario). Si ya existe pero le faltan artistas (porque
// alguna búsqueda falló en su momento), intenta completar solo esos — de a poco,
// respetando un enfriamiento entre intentos — en vez de rehacer todo el catálogo
// cada vez, que es lo que termina gatillando el límite de iTunes una y otra vez.
export async function loadTrackPool(): Promise<Track[]> {
  const { data: cached } = await supabase
    .from('survival_pool')
    .select('tracks, covered_artists, updated_at, last_topup_attempt')
    .eq('id', 1)
    .single()

  if (!cached) {
    return buildFullPool()
  }

  const isStale = Date.now() - new Date(cached.updated_at).getTime() > POOL_MAX_AGE_MS
  if (isStale) {
    return buildFullPool()
  }

  const covered = new Set((cached.covered_artists as string[]) ?? [])
  const missing = POPULAR_ARTISTS.filter(a => !covered.has(a))
  const existingTracks = (cached.tracks as Track[]) ?? []

  if (missing.length === 0) {
    return existingTracks
  }

  const lastAttempt = cached.last_topup_attempt ? new Date(cached.last_topup_attempt).getTime() : 0
  if (Date.now() - lastAttempt < TOPUP_COOLDOWN_MS) {
    // Ya se intentó hace poco completar los faltantes — se devuelve lo que hay
    // sin pegarle de nuevo a la API, para no seguir alimentando el bloqueo.
    return existingTracks
  }

  const toTry = missing.slice(0, TOPUP_BATCH_LIMIT)
  const artistResults = await fetchInBatches(toTry)

  const newlyCovered = artistResults.filter(r => r.data).map(r => r.artist)
  const stillFailed = artistResults.filter(r => !r.data).map(r => r.artist)
  if (stillFailed.length > 0) {
    console.warn('[tracks] Todavía sin cargar (se reintentará más tarde):', stillFailed.join(', '))
  }
  if (newlyCovered.length > 0) {
    console.info('[tracks] Se sumaron canciones de:', newlyCovered.join(', '))
  }

  const newTracks = tracksFromResults(artistResults)
  const mergedTracks = dedupeTracks([...existingTracks, ...newTracks])
  const mergedCovered = [...covered, ...newlyCovered]

  await supabase.from('survival_pool').upsert({
    id: 1,
    tracks: mergedTracks,
    covered_artists: mergedCovered,
    updated_at: cached.updated_at, // no reiniciamos el reloj de 7 días solo por completar artistas
    last_topup_attempt: new Date().toISOString()
  })

  return mergedTracks
}