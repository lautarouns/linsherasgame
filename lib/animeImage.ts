import { supabase } from './supabase'
import { normalize } from './tracks'

// Nombre legible por cada anime cargado — sumá acá si agregás uno nuevo.
export const ANIME_NAMES: Record<string, string> = {
  'attack-on-titan': 'Attack on Titan',
  'jujutsu-kaisen': 'Jujutsu Kaisen',
  'one-piece': 'One Piece',
  'naruto': 'Naruto',
  'dragon-ball-z': 'Dragon Ball Z',
  'death-note': 'Death Note',
  'fullmetal-alchemist-brotherhood': 'Fullmetal Alchemist: Brotherhood',
  'hunter-x-hunter': 'Hunter x Hunter',
  'demon-slayer': 'Demon Slayer',
  'neon-genesis-evangelion': 'Neon Genesis Evangelion',
  'cowboy-bebop': 'Cowboy Bebop',
  'steins-gate': 'Steins;Gate',
  'made-in-abyss': 'Made in Abyss',
  'serial-experiments-lain': 'Serial Experiments Lain',
  'baccano': 'Baccano!',
  'mushishi': 'Mushishi',
  'odd-taxi': 'Odd Taxi',
  'great-teacher-onizuka': 'Great Teacher Onizuka',
  'ping-pong-the-animation': 'Ping Pong the Animation',
  'paranoia-agent': 'Paranoia Agent',
  'mononoke': 'Mononoke',
  'my-hero-academia': 'My Hero Academia',
  'jojos-bizarre-adventure': "JoJo's Bizarre Adventure",
  'bleach': 'Bleach',
  'haikyuu': 'Haikyuu!!',
  'sailor-moon': 'Sailor Moon',
  'cyberpunk-edgerunners': 'Cyberpunk: Edgerunners',
  'inuyasha': 'Inuyasha',
  'yu-yu-hakusho': 'Yu Yu Hakusho',
  'tokyo-ghoul': 'Tokyo Ghoul',
  'one-punch-man': 'One Punch Man',
  'code-geass': 'Code Geass',
  'monster': 'Monster',
  'vinland-saga': 'Vinland Saga',
  'psycho-pass': 'Psycho-Pass',
  'black-lagoon': 'Black Lagoon',
  'dorohedoro': 'Dorohedoro',
  'gintama': 'Gintama',
  'hellsing-ultimate': 'Hellsing Ultimate',
  'ergo-proxy': 'Ergo Proxy',
  'trigun': 'Trigun',
  'gurren-lagann': 'Gurren Lagann',
  'mob-psycho-100': 'Mob Psycho 100',
  'chainsaw-man': 'Chainsaw Man',
  'devilman-crybaby': 'Devilman Crybaby',
  'elfen-lied': 'Elfen Lied',
  'no-game-no-life': 'No Game No Life',
  'erased': 'ERASED',
  'monogatari': 'Monogatari Series',
  'legend-of-the-galactic-heroes': 'Legend of the Galactic Heroes',
  'kaiji': 'Kaiji: Ultimate Survivor',
  'the-tatami-galaxy': 'The Tatami Galaxy',
  'texhnolyze': 'Texhnolyze',
  'haibane-renmei': 'Haibane Renmei',
  'land-of-the-lustrous': 'Land of the Lustrous',
  'sonny-boy': 'Sonny Boy',
  'shiki': 'Shiki',
  'kurokos-basketball': "Kuroko's Basketball",
  'blue-lock': 'Blue Lock',
  'slam-dunk': 'Slam Dunk',
  'nana': 'Nana',
  'toradora': 'Toradora!',
  'clannad': 'Clannad',
  'kaguya-sama': 'Kaguya-sama: Love is War',
  'fruits-basket': 'Fruits Basket',
  'violet-evergarden': 'Violet Evergarden',
  'flcl': 'FLCL',
  'bocchi-the-rock': 'Bocchi the Rock!',
  'frieren': "Frieren: Beyond Journey's End",
  'march-comes-in-like-a-lion': 'March Comes in Like a Lion',
  // --- LOS NUEVOS NICHO / CULTO ---
  'katanagatari': 'Katanagatari',
  'kinos-journey': "Kino's Journey",
  'mawaru-penguindrum': 'Mawaru Penguindrum',
  'kaiba': 'Kaiba',
  'girls-last-tour': "Girls' Last Tour",
  'gankutsuou': 'Gankutsuou',
  'aria': 'Aria the Animation',
  'space-dandy': 'Space Dandy',
  'bokurano': 'Bokurano',
  'dennou-coil': 'Dennou Coil',
  'casshern-sins': 'Casshern Sins'
}

// Compara el/los título(s) de anime que trajo la API contra el anime
// esperado — con normalize() para ignorar tildes/mayúsculas, y de forma
// laxa (includes en ambos sentidos) porque los títulos de Jikan/AniList a
// veces difieren un poco (ej. llevan ": Season 2", o el romaji vs inglés).
function titleMatches(candidateTitles: (string | null | undefined)[], expected: string): boolean {
  const target = normalize(expected)
  if (!target) return true
  return candidateTitles.some(t => {
    if (!t) return false
    const n = normalize(t)
    return !!n && (n === target || n.includes(target) || target.includes(n))
  })
}

// Busca la foto de un personaje en vivo, sin guardarla en ningún lado —
// primero contra Jikan (API de MyAnimeList) y, si no lo encuentra, contra
// AniList (otra base de datos pública de anime) como segundo intento.
//
// Cuando se pasa `expectedAnime`, se verifica que el personaje encontrado
// realmente pertenezca a ESE anime antes de aceptar la foto — una búsqueda
// por texto plano puede matchear a un personaje de otro anime que tenga el
// mismo nombre o un nombre parecido (ej. "Lucy" existe en varios animes
// distintos), y sin esta verificación terminábamos guardando la foto de un
// personaje totalmente distinto.
export async function fetchCharacterImageLive(name: string, expectedAnime?: string): Promise<string | null> {
  const fetchJikan = async (query: string): Promise<string | null> => {
    const candidate = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => data?.data?.[0] ?? null)
      .catch(() => null)

    const img = candidate?.images?.jpg?.image_url ?? null
    if (!img) return null
    if (!expectedAnime) return img

    const full = await fetch(`https://api.jikan.moe/v4/characters/${candidate.mal_id}/full`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
    type JikanAnimeEntry = { anime?: { title?: string; title_english?: string } }
    const animeTitles = ((full?.data?.anime ?? []) as JikanAnimeEntry[])
      .flatMap(a => [a?.anime?.title, a?.anime?.title_english])
    return titleMatches(animeTitles, expectedAnime) ? img : null
  }

  const fetchAniList = async (query: string): Promise<string | null> => {
    const gql = `query ($search: String) {
      Character(search: $search) {
        image { large }
        media(perPage: 5, sort: POPULARITY_DESC) { nodes { title { romaji english } } }
      }
    }`
    const data = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { search: query } })
    })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)

    const img = data?.data?.Character?.image?.large ?? null
    if (!img) return null
    if (!expectedAnime) return img

    type AniListMediaNode = { title?: { romaji?: string; english?: string } }
    const nodes = (data?.data?.Character?.media?.nodes ?? []) as AniListMediaNode[]
    const animeTitles = nodes.flatMap(n => [n?.title?.romaji, n?.title?.english])
    return titleMatches(animeTitles, expectedAnime) ? img : null
  }

  // Jikan es gratuito y a veces devuelve 504 por saturación puntual — se
  // reintenta una vez antes de pasar a la segunda fuente.
  let img = await fetchJikan(name)
  if (!img) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    img = await fetchJikan(name)
  }
  if (!img) {
    img = await fetchAniList(name)
  }

  // Último intento: si el nombre completo no dio nada en ninguna de las dos
  // fuentes, probamos solo con la última palabra (ej: "Sukuna" en vez de
  // "Ryomen Sukuna") — muchos personajes están indexados solo por el nombre
  // por el que son más conocidos, o el nombre completo no matchea por una
  // transliteración distinta (ej: AniList tiene "Tanjirou" y nosotros
  // cargamos "Tanjiro"). Se prueban las dos fuentes de nuevo con ese recorte
  // — la verificación de anime de arriba es la que evita que este recorte
  // (que es más propenso a falsos positivos, ej. "Tuxedo Mask" → "Mask")
  // termine guardando la foto de un personaje sin relación.
  if (!img) {
    const parts = name.trim().split(/\s+/)
    const lastWord = parts[parts.length - 1]
    if (lastWord && lastWord !== name) {
      img = await fetchJikan(lastWord)
      if (!img) img = await fetchAniList(lastWord)
    }
  }

  return img
}

// Guarda en `character_guess_pool` la foto ya encontrada, para no tener que
// volver a pedírsela a la API la próxima vez que salga este personaje.
export async function cacheCharacterImage(characterName: string, url: string, animeSlug?: string) {
  // El personaje puede venir del pool del Grid Diario (`character_guess_pool`)
  // o del pool cargado a mano para el Duelo (`anime_characters`) — probamos
  // guardar en los dos, el que tenga una fila con ese nombre la actualiza.
  let gridQuery = supabase.from('character_guess_pool').update({ cover_url: url }).eq('character_name', characterName)
  if (animeSlug) gridQuery = gridQuery.eq('anime_slug', animeSlug)

  const [gridResult, manualResult] = await Promise.all([
    gridQuery,
    supabase.from('anime_characters').update({ cover_url: url }).eq('character_name', characterName),
  ])

  if (gridResult.error) console.log(`[anime-image] no se pudo guardar la foto de "${characterName}" en character_guess_pool`, gridResult.error)
  if (manualResult.error) console.log(`[anime-image] no se pudo guardar la foto de "${characterName}" en anime_characters`, manualResult.error)
}
