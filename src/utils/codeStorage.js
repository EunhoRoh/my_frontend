const STORAGE_KEY = 'donation-codes-state'

export async function loadCodeState() {
  const saved = localStorage.getItem(STORAGE_KEY)

  if (saved) {
    return JSON.parse(saved)
  }

  const response = await fetch('/codes.json')
  if (!response.ok) {
    throw new Error('codes.json을 불러올 수 없습니다.')
  }

  const available = await response.json()
  const initialState = { available, used: {} }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState))
  return initialState
}

export function saveCodeState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function redeemCode(state, code) {
  const trimmed = code.trim()

  if (state.used[trimmed]) {
    return { ok: false, reason: 'used' }
  }

  const amount = state.available[trimmed]
  if (!amount) {
    return { ok: false, reason: 'invalid' }
  }

  const { [trimmed]: redeemedAmount, ...remaining } = state.available
  const nextState = {
    available: remaining,
    used: {
      ...state.used,
      [trimmed]: {
        amount: redeemedAmount,
        usedAt: new Date().toISOString(),
      },
    },
  }

  saveCodeState(nextState)
  return { ok: true, amount: redeemedAmount, state: nextState }
}

export async function resetCodeState() {
  const response = await fetch('/codes.json')
  if (!response.ok) {
    throw new Error('codes.json을 불러올 수 없습니다.')
  }

  const available = await response.json()
  const initialState = { available, used: {} }
  saveCodeState(initialState)
  return initialState
}
