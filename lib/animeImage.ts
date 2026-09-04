import { supabase } from './supabase'

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

// Busca la foto de un personaje en vivo, sin guardarla en ningún lado —
// primero contra Jikan (API de MyAnimeList) y, si no lo encuentra, contra
// AniList (otra base de datos pública de anime) como segundo intento.
export async function fetchCharacterImageLive(name: string): Promise<string | null> {
  const fetchJikan = (query: string) =>
    fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => data?.data?.[0]?.images?.jpg?.image_url ?? null)
      .catch(() => null)

  const fetchAniList = (query: string) => {
    const gql = `query ($search: String) { Character(search: $search) { image { large } } }`
    return fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: gql, variables: { search: query } })
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => data?.data?.Character?.image?.large ?? null)
      .catch(() => null)
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
  // cargamos "Tanjiro"). Se prueban las dos fuentes de nuevo con ese recorte.
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
