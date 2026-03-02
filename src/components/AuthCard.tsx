import { Button } from './ui/button'

interface AuthCardProps {
  mode: 'signin' | 'reset'
  email: string
  password: string
  authError: string
  authNotice: string
  authSubmitting: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSignIn: () => void
  onSignUp: () => void
  onResetPassword: () => void
  onUpdatePassword: () => void
  onBackToSignIn: () => void
}

export function AuthCard({
  mode,
  email,
  password,
  authError,
  authNotice,
  authSubmitting,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp,
  onResetPassword,
  onUpdatePassword,
  onBackToSignIn,
}: AuthCardProps) {
  const isResetMode = mode === 'reset'

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (isResetMode) {
          onUpdatePassword()
          return
        }

        onSignIn()
      }}
    >
      {!isResetMode && (
        <input
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-background"
          placeholder="email@ejemplo.com"
          autoComplete="email"
          required
        />
      )}
      <input
        type="password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        className="w-full px-3 py-2 rounded-md border border-border bg-background"
        placeholder={isResetMode ? 'Nueva contraseña' : 'Contraseña'}
        autoComplete={isResetMode ? 'new-password' : 'current-password'}
        required
        minLength={6}
      />
      {authError && (
        <p className="text-sm text-destructive" role="alert">
          {authError}
        </p>
      )}
      {authNotice && (
        <p className="text-sm text-muted-foreground" role="status">
          {authNotice}
        </p>
      )}
      {isResetMode ? (
        <>
          <Button type="submit" disabled={authSubmitting}>
            {authSubmitting ? 'Procesando...' : 'Guardar contraseña'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={authSubmitting}
            onClick={onBackToSignIn}
            className="px-0"
          >
            Volver a iniciar sesión
          </Button>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <Button type="submit" disabled={authSubmitting}>
              {authSubmitting ? 'Procesando...' : 'Iniciar sesión'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={authSubmitting}
              onClick={onSignUp}
            >
              Crear cuenta
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={authSubmitting || !email}
            onClick={onResetPassword}
            className="px-0"
          >
            Restablecer contraseña
          </Button>
        </>
      )}
    </form>
  )
}
