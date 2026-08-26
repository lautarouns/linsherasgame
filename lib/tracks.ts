import { supabase } from './supabase'

export type Track = {
  title: string
  artist: string
  cover: string
  previewUrl: string
}

// Mezcla de artistas populares por región y género: Argentina/Latam, EE.UU., Europa, metal, 80s, hip-hop
export const POPULAR_ARTISTS = [
  'Duki', 'Bizarrap', 'Emilia', 'Trueno', 'Nicki Nicole', 'Wos', 'Paulo Londra',
  'Tini', 'La Joaqui', 'Khea', 'Cazzu', 'Milo J', 'YSY A', 'Tiago PZK',
  'Bad Bunny', 'Karol G', 'Feid', 'Rauw Alejandro', 'Shakira', 'Ozuna',
  'Maluma', 'J Balvin', 'Peso Pluma', 'Fuerza Regida', 'Rels B',
  'Taylor Swift', 'Drake', 'The Weeknd', 'Billie Eilish', 'Ariana Grande',
  'Post Malone', 'Travis Scott', 'Olivia Rodrigo', 'Doja Cat', 'SZA',
  'Kendrick Lamar', 'Bruno Mars', 'Beyoncé', 'Justin Bieber', 'Chris Brown',
  'Dua Lipa', 'Ed Sheeran', 'Coldplay', 'David Guetta', 'Rosalía',
  'Stromae', 'Aitana', 'Quevedo', 'Sam Smith','Skrillex',
  'Calvin Harris', 'Imagine Dragons', 'Måneskin', 'ABBA',
  'Metallica', 'Iron Maiden', 'Black Sabbath', 'Slipknot', 'System of a Down',
  'Megadeth', 'Slayer', 'Pantera', 'Rammstein', 'Judas Priest',
  'Korn', 'Guns N Roses', 'AC/DC', 'Sepultura', 'Deftones','Nirvana',
  'Michael Jackson', 'Madonna', 'Queen', 'Duran Duran', 'Whitney Houston',
  'Cyndi Lauper', 'Tears for Fears', 'a-ha', 'Culture Club', 'Wham',
  'Prince', 'Eurythmics', 'Bon Jovi', 'Soda Stereo', 'Hombres G',
  'Eminem', 'Jay-Z', 'Kanye West', 'Tyler the Creator', 'Nicki Minaj',
  '50 Cent', 'Snoop Dogg', 'Dr. Dre', 'Cardi B', 'A$AP Rocky',
  'Wu-Tang Clan', 'Notorious B.I.G.', 'Tupac', 'J. Cole', 'Lil Wayne',
  'Plan B', 'Chencho Corleone', 'Don omar', 'Daddy Yankee', 'Wisin y Yandel',
  'Justin Quiles', 'Radiohead', 'Zion & Lennox', 'Arcangel', 'Nicky Jam', 'Sech', 'Myke Towers',
  'XXXTENTACION', 'Juice WRLD', 'Lil Peep', 'Pop Smoke', 'Lil Baby','Danny Ocean', 'Rauw Alejandro', 'Jhay Cortez', 'J Alvarez',
  'Prince Royce', 'Romeo Santos', 'Tego Calderon', 'Cosculluela'
]

const POOL_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 días

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

// Ejecuta las búsquedas de a tandas para no saturar el límite de la API de iTunes
async function fetchInBatches(artists: string[], batchSize = 5, delayMs = 400) {
  const results: any[] = []
  for (let i = 0; i < artists.length; i += batchSize) {
    const batch = artists.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(artist =>
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=15`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )
    results.push(...batchResults)
    if (i + batchSize < artists.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  return results
}

// Trae el pool de canciones: primero intenta el caché en Supabase (compartido por
// Supervivencia y Duelo), y si no hay (o está viejo), lo arma pegándole a iTunes
// y lo guarda para las próximas partidas de ambos modos.
export async function loadTrackPool(): Promise<Track[]> {
  const { data: cached } = await supabase
    .from('survival_pool')
    .select('tracks, updated_at')
    .eq('id', 1)
    .single()

  const isStale = !cached || (Date.now() - new Date(cached.updated_at).getTime() > POOL_MAX_AGE_MS)

  if (cached && !isStale) {
    return cached.tracks as Track[]
  }

  const responses = await fetchInBatches(POPULAR_ARTISTS)
  const allResults = responses
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

  const seen = new Set<string>()
  const unique = maps.filter(t => {
    const key = normalize(t.title) + '|' + normalize(t.artist)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  await supabase.from('survival_pool').upsert({
    id: 1,
    tracks: unique,
    updated_at: new Date().toISOString()
  })

  return unique
}