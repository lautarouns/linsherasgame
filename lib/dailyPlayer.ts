export function getDailyPlayerId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('dailyPlayerId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('dailyPlayerId', id)
  }
  return id
}