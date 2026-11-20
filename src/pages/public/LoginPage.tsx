import { useState, type FormEvent } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/core/firebase/AuthContext'
import { getHomeRoute } from '@/core/rbac/getHomeRoute'
import { AuthLayout } from '@/shared/components/AuthLayout'
import { LocalOnlyNotice } from '@/shared/components/LocalOnlyNotice'
import { FUNCTIONS_ENABLED } from '@/core/config/features'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'

const loginSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.'
const INVALID_CONFIG = 'Configuration Firebase invalide.'

const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': INVALID_CREDENTIALS,
  'auth/user-not-found': INVALID_CREDENTIALS,
  'auth/wrong-password': INVALID_CREDENTIALS,
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/operation-not-allowed': "La connexion par e-mail n'est pas activée.",
  'auth/too-many-requests':
    'Trop de tentatives. Réessayez dans quelques minutes ou réinitialisez votre mot de passe.',
  'auth/network-request-failed': 'Impossible de joindre le serveur. Vérifiez votre connexion.',
  'auth/api-key-not-valid': INVALID_CONFIG,
  'auth/invalid-api-key': INVALID_CONFIG,
  'auth/user-disabled':
    "Ce compte est désactivé (demande d'inscription refusée ou accès retiré). Contactez l'administration de votre université.",
}

function signInErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code
  if (typeof code !== 'string') return 'La connexion a échoué. Réessayez.'
  // Les clés d'API invalides arrivent aussi sous la forme
  // « auth/api-key-not-valid.-please-pass-a-valid-api-key. ».
  if (code.startsWith('auth/api-key-not-valid')) return INVALID_CONFIG
  return SIGN_IN_ERROR_MESSAGES[code] ?? `La connexion a échoué (${code}).`
}

export function LoginPage() {
  const {
    firebaseUser,
    appUser,
    loading,
    error,
    signOutMessage,
    signupRequest,
    signIn,
    signOut,
    refreshClaims,
  } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  useDocumentTitle('Connexion')

  if (!loading && firebaseUser && appUser) {
    return <Navigate to={getHomeRoute(appUser.role)} replace />
  }
  // Compte auto-inscrit : l'écran d'attente (ou de refus) est dans /app.
  if (!loading && firebaseUser && !appUser && signupRequest) {
    return <Navigate to="/app" replace />
  }

  // Connecté côté Auth mais compte inutilisable (claims pas encore posés,
  // profil /users/{uid} absent...) : message du contexte + nouvelle tentative.
  const accountError = firebaseUser && !appUser ? error : null

  async function handleRetry() {
    setRetrying(true)
    try {
      await refreshClaims()
    } catch {
      setAuthError('Impossible de joindre le serveur. Vérifiez votre connexion.')
    } finally {
      setRetrying(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldError(null)
    setAuthError(null)

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message)
      return
    }

    setSubmitting(true)
    try {
      await signIn(parsed.data.email, parsed.data.password)
    } catch (err) {
      setAuthError(signInErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
          <h1 className="font-display text-2xl font-semibold">Connexion</h1>
          <p className="mt-1 text-sm text-base-content/70">
            Accédez à l'espace de votre université.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                className="mb-1.5 block text-xs font-medium text-base-content/80"
                htmlFor="email"
              >
                E-mail
              </label>
              <label className="input input-bordered flex w-full items-center gap-2">
                <Mail size={16} className="text-base-content/50" />
                <input
                  id="email"
                  type="email"
                  className="grow"
                  placeholder="nom@universite.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label className="text-xs font-medium text-base-content/80" htmlFor="password">
                  Mot de passe
                </label>
                <Link
                  to="/mot-de-passe-oublie"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <label className="input input-bordered flex w-full items-center gap-2">
                <Lock size={16} className="text-base-content/50" />
                <input
                  id="password"
                  type="password"
                  className="grow"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
            </div>

            {(fieldError || authError) && (
              <p className="text-sm text-error">{fieldError ?? authError}</p>
            )}

            {!firebaseUser && signOutMessage && (
              <div role="alert" className="alert alert-warning text-sm">
                <span>{signOutMessage}</span>
              </div>
            )}

            {accountError && (
              <div className="alert alert-warning flex-col items-start gap-2 text-sm">
                <span>{accountError}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={handleRetry}
                    disabled={retrying}
                  >
                    {retrying ? <span className="loading loading-spinner loading-xs" /> : 'Réessayer'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut()}>
                    Se déconnecter
                  </button>
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
              {submitting ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {FUNCTIONS_ENABLED ? (
            <p className="mt-6 text-center text-sm text-base-content/70">
              Pas encore de compte ?{' '}
              <Link to="/inscription" className="font-medium text-primary hover:underline">
                Créer un compte
              </Link>
            </p>
          ) : (
            <LocalOnlyNotice className="mt-6 justify-center text-xs" />
          )}
    </AuthLayout>
  )
}
