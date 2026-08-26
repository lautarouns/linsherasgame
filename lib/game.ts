import { supabase } from './supabase'
import { nowSynced } from './serverTime'
import { loadTrackPool, seededShuffle } from './tracks'

export async function startPickingPhase(roomId: string, songsPerPlayer = 1, seconds = 120) {
  const deadline = new Date(nowSynced() + seconds * 1000).toISOString()
  await supabase
    .from('rooms')
    .update({ 
      status: 'picking', 
      picking_deadline: deadline, 
      songs_per_player: songsPerPlayer,
      game_mode: 'classic' // Le forzamos el modo clásico acá
    })
    .eq('id', roomId)
}

export async function startPlayingPhase(roomId: string, roundSeconds = 15) {
  const { data: existingRounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('room_id', roomId)

  if (existingRounds && existingRounds.length > 0) {
    return
  }

  const { data: picks } = await supabase
    .from('picks')
    .select('id')
    .eq('room_id', roomId)

  if (!picks || picks.length === 0) return

  const shuffled = [...picks].sort(() => Math.random() - 0.5)
  const rows = shuffled.map((pick, i) => ({
    room_id: roomId,
    pick_id: pick.id,
    round_number: i + 1
  }))

  await supabase.from('rounds').insert(rows)

  await supabase.from('rooms').update({
    status: 'playing',
    current_round: 1,
    total_rounds: rows.length,
    round_deadline: new Date(nowSynced() + roundSeconds * 1000).toISOString()
  }).eq('id', roomId)
}

export async function startSurvivalPhase(roomId: string, seconds = 75) {
  // Set the room into playing + survival mode with a global deadline
  const deadline = new Date(nowSynced() + seconds * 1000).toISOString()
  await supabase.from('rooms').update({
    status: 'playing',
    game_mode: 'survival',
    current_round: 1,
    total_rounds: 0,
    round_deadline: deadline
  }).eq('id', roomId)
}

// Spanish alias / new function for Duelo de Carreras
export async function startDueloPhase(roomId: string, seconds = 60) {
  const deadline = new Date(nowSynced() + seconds * 1000).toISOString()
  await supabase.from('rooms').update({
    status: 'playing',
    game_mode: 'duelo',
    current_round: 1,
    total_rounds: 0,
    round_deadline: deadline
  }).eq('id', roomId)
}

// Arranca el modo Duelo: arma `totalRounds` rondas a partir del mismo pool de
// canciones que usa Supervivencia (cacheado en Supabase), idempotente igual que
// startPlayingPhase — si ya hay duelos armados para esta sala, no los reharagas.
export async function startDuelPhase(roomId: string, totalRounds = 10, roundSeconds = 20) {
  const { data: existingDuels } = await supabase
    .from('duels')
    .select('id')
    .eq('room_id', roomId)

  if (existingDuels && existingDuels.length > 0) {
    await supabase.from('duels').delete().eq('room_id', roomId)
  }

  const pool = await loadTrackPool()
  if (pool.length === 0) return

  const shuffled = seededShuffle(pool, roomId + Date.now())
  const picked = shuffled.slice(0, Math.min(totalRounds, shuffled.length))

  const rows = picked.map((track, i) => ({
    room_id: roomId,
    round_number: i + 1,
    track_title: track.title,
    track_artist: track.artist,
    track_cover: track.cover,
    track_preview_url: track.previewUrl
  }))

  await supabase.from('duels').insert(rows)

  await supabase.from('rooms').update({
    status: 'playing',
    game_mode: 'duel',
    current_round: 1,
    total_rounds: rows.length,
    round_deadline: new Date(nowSynced() + roundSeconds * 1000).toISOString()
  }).eq('id', roomId)
}

export async function resetGame(roomId: string) {
  const { data: rounds } = await supabase
    .from('rounds')
    .select('id')
    .eq('room_id', roomId)

  const roundIds = rounds?.map(r => r.id) ?? []
  if (roundIds.length > 0) {
    await supabase.from('guesses').delete().in('round_id', roundIds)
  }

  await supabase.from('rounds').delete().eq('room_id', roomId)
  await supabase.from('picks').delete().eq('room_id', roomId)
  await supabase.from('duels').delete().eq('room_id', roomId)
  
  // ACÁ ESTÁ EL ARREGLO DE AYER: Mantenemos el current_streak intacto
  await supabase.from('players').update({ score: 0, current_streak: 0 }).eq('room_id', roomId)

  await supabase.from('rooms').update({
    status: 'lobby',
    game_mode: 'classic', // Limpiamos el modo al volver al lobby
    picking_deadline: null,
    current_round: 0,
    round_deadline: null,
    total_rounds: 0
  }).eq('id', roomId)
}