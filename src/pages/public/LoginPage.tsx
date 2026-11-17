import { useState, type FormEvent } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/core/firebase/AuthContext'
import { getHomeRoute } from '@/core/rbac/getHomeRoute'
import { BrandMark } from '@/shared/components/BrandMark'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'

const loginSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
})

const INVALID_CREDENTIALS = 'Email ou mot de passe incorrect.'
const INVALID_CONFIG = 'Configuration Firebase invalide.'

const SIGN_IN_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': INVALID_CREDENTIALS,
  'auth/user-not-found': INVALID_CREDENTIALS,
  'auth/wrong-password': INVALID_CREDENTIALS,
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/operation-not-allowed': "La connexion par email n'est pas activée.",
  'auth/too-many-requests':
    'Trop de tentatives. Réessayez dans quelques minutes ou réinitialisez votre mot de passe.',
  'auth/network-request-failed': 'Impossible de joindre le serveur. Vérifiez votre connexion.',
  'auth/api-key-not-valid': INVALID_CONFIG,
  'auth/invalid-api-key': INVALID_CONFIG,
  'auth/user-disabled': 'Ce compte a été désactivé. Contactez votre administrateur.',
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
  const { firebaseUser, appUser, loading, error, signOutMessage, signIn, signOut, refreshClaims } =
    useAuth()
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
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="brand-panel relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <p className="text-sm font-medium tracking-wide opacity-80">
          Plateforme de gestion universitaire
        </p>

        <div>
          <p className="font-display max-w-md text-3xl font-medium leading-snug">
            Un registre unique, piloté par l'IA, pour accompagner chaque
            établissement du premier semestre au diplôme.
          </p>
          <div className="mt-8 space-y-2">
            {['Étudiants & inscriptions', 'Notes & examens', 'Paiements & documents'].map(
              (line, i) => (
                <div key={line} className="flex items-center gap-3 text-sm">
                  <span className="brand-panel-accent font-mono-data w-6">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="h-px flex-1 bg-current opacity-20" />
                  <span className="opacity-85">{line}</span>
                </div>
              )
            )}
          </div>
        </div>

        <p className="text-xs opacity-75">
          © {new Date().getFullYear()} UniFlow — Tous droits réservés
        </p>
      </div>

      <div className="flex items-center justify-center bg-base-100 p-6">
        <div className="w-full max-w-sm">
          <BrandMark className="mb-8" />

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
                Email
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
        </div>
      </div>
    </div>
  )
}
