export function normalizePinCode(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 4) return null
  return digits
}

export function pinToAuthCredentials(pin) {
  const code = normalizePinCode(pin)
  if (!code) {
    throw new Error('Enter a valid 4-digit code')
  }

  return {
    email: `staff-${code}@linentrack.internal`,
    password: `Linen${code}!`,
    pinCode: code,
  }
}
