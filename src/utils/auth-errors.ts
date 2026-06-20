const FALLBACK = 'No pudimos completar la acción. Intentá de nuevo.'

const MAPPINGS: Array<[pattern: string, message: string]> = [
  ['invalid login credentials', 'Email o contraseña incorrectos.'],
  ['user already registered', 'Ya existe una cuenta con ese email.'],
  ['already exists', 'Ya existe una cuenta con ese email.'],
  ['anonymous sign-ins are disabled', 'El registro no está disponible por el momento.'],
  ['email not confirmed', 'Revisá tu casilla y confirmá tu email.'],
  ['password should be at least', 'La contraseña debe tener al menos 6 caracteres.'],
  ['too many requests', 'Demasiados intentos. Esperá unos minutos.'],
  ['rate limit', 'Demasiados intentos. Esperá unos minutos.'],
]

export function mapAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''

  const lower = raw.toLowerCase()
  for (const [pattern, message] of MAPPINGS) {
    if (lower.includes(pattern)) return message
  }

  return FALLBACK
}
