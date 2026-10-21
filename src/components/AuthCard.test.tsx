import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthCard } from './AuthCard'

function renderCard(mode: 'signin' | 'reset') {
  render(
    <AuthCard
      mode={mode}
      email=""
      password=""
      authError=""
      authNotice=""
      authSubmitting={false}
      onEmailChange={vi.fn()}
      onPasswordChange={vi.fn()}
      onSignIn={vi.fn()}
      onSignUp={vi.fn()}
      onResetPassword={vi.fn()}
      onUpdatePassword={vi.fn()}
      onBackToSignIn={vi.fn()}
    />
  )
}

// #199: the fields were named only by their placeholder, which screen
// readers may not announce and which disappears once the user types.
describe('AuthCard', () => {
  it('labels the sign-in email and password fields', () => {
    renderCard('signin')

    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'type',
      'email'
    )
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute(
      'type',
      'password'
    )
  })

  it('labels the new-password field when resetting', () => {
    renderCard('reset')

    expect(screen.getByLabelText('Nueva contraseña')).toHaveAttribute(
      'type',
      'password'
    )
    expect(screen.queryByLabelText('Correo electrónico')).toBeNull()
  })
})
