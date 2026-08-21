import { supabase } from './supabase'

export async function startPickingPhase(roomId: string, seconds = 45) {
  const deadline = new Date(Date.now() + seconds * 1000).toISOString()
  await supabase
    .from('rooms')
    .update({ status: 'picking', picking_deadline: deadline })
    .eq('id', roomId)
}

export async function startPlayingPhase(roomId: string, roundSeconds = 15) {
  // Evita duplicar rondas si esta función se dispara más de una vez
  // (puede pasar por React StrictMode en desarrollo, o por una carrera entre pestañas)
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
    round_deadline: new Date(Date.now() + roundSeconds * 1000).toISOString()
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
  await supabase.from('players').update({ score: 0 }).eq('room_id', roomId)

  await supabase.from('rooms').update({
    status: 'lobby',
    picking_deadline: null,
    current_round: 0,
    round_deadline: null
  }).eq('id', roomId)
}