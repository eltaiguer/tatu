// The production adapter of the auth port: Supabase Auth, through the
// single-call functions in `services/supabase/auth.ts`.
import {
  getCurrentSession,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  subscribeToAuthChanges,
  updatePassword,
} from '../supabase/auth'
import type { AuthPort } from './auth-port'

export const supabaseAuth: AuthPort = {
  getSession: getCurrentSession,
  onAuthChange: subscribeToAuthChanges,
  signIn: signInWithPassword,
  signUp: signUpWithPassword,
  requestPasswordReset,
  updatePassword,
  signOut,
}
