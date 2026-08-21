import { supabase } from './supabase'

let cachedOffset = 0

export async function syncServerTime() {
  const clientBefore = Date.now()
  const { data } = await supabase.rpc('get_server_time')
  const clientAfter = Date.now()

  if (data) {
    const serverTime = new Date(data).getTime()
    const roundTrip = clientAfter - clientBefore
    const clientAtServerMoment = clientBefore + roundTrip / 2
    cachedOffset = serverTime - clientAtServerMoment
  }
}

export function nowSynced() {
  return Date.now() + cachedOffset
}