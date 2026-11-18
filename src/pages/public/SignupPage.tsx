import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '@/core/firebase/AuthContext'
import { getHomeRoute } from '@/core/rbac/getHomeRoute'
import { listSignupUniversities, type SignupUniversity } from '@/core/firebase/functions'
import { AuthLayout } from '@/shared/components/AuthLayout'
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle'
import {
  SIGNUP_ROLES,
  SIGNUP_ROLE_LABELS,
  signupFormSchema,
  type SignupFormValues,
} from '@/modules/signup/schema'
import { registerAndRequestAccess } from '@/modules/signup/api'

type FormState = Omit<SignupFormValues, 'requestedRole'> & { requestedRole: string }

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  confirmPassword: '',
  universityId: '',
  requestedRole: '',
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-base-content/80" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

/**
 * Inscription publique : la personne crée son compte et DEMANDE un accès
 * (étudiant ou enseignant) à une université. Aucun droit n'est accordé ici :
 * l'admin de l'université valide ou refuse la demande (fonctions serveur).
 */
export function SignupPage() {
  useDocumentTitle('Créer un compte')
  const { firebaseUser, appUser, loading } = useAuth()
  const [values, setValues] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [universities, setUniversities] = useState<SignupUniversity[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    listSignupUniversities()
      .then((list) => {
        if (!cancelled) setUniversities(list)
      })
      .catch(() => {
        if (!cancelled) {
          setUniversities([])
          setListError('Impossible de charger la liste des universités. Réessayez plus tard.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!loading && firebaseUser && appUser) {
    return <Navigate to={getHomeRoute(appUser.role)} replace />
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    const parsed = signupFormSchema.safeParse(values)
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof FormState
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await onValidSubmit(parsed.data)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "L'envoi de la demande a échoué. Réessayez.")
    } finally {
      setSubmitting(false)
    }
  }

  // Compte Auth créé (sans rôle) puis demande enregistrée côté serveur ;
  // l'espace /app affiche ensuite l'écran d'attente.
  async function onValidSubmit(data: SignupFormValues) {
    await registerAndRequestAccess(data)
    navigate('/app', { replace: true })
  }

  const input = (key: keyof FormState) =>
    `input input-bordered w-full ${errors[key] ? 'input-error' : ''}`

  return (
    <AuthLayout wide>
      <h1 className="font-display text-2xl font-semibold">Créer un compte</h1>
      <p className="mt-1 text-sm text-base-content/70">
        Demandez un accès à votre université : il sera actif après validation par son
        administration.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="firstName" label="Prénom" error={errors.firstName}>
            <input id="firstName" className={input('firstName')} autoComplete="given-name"
              value={values.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field id="lastName" label="Nom" error={errors.lastName}>
            <input id="lastName" className={input('lastName')} autoComplete="family-name"
              value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
        </div>

        <Field id="email" label="E-mail" error={errors.email}>
          <input id="email" type="email" className={input('email')} autoComplete="email"
            placeholder="nom@universite.edu" value={values.email}
            onChange={(e) => set('email', e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="password" label="Mot de passe" error={errors.password}>
            <input id="password" type="password" className={input('password')} autoComplete="new-password"
              value={values.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
          <Field id="confirmPassword" label="Confirmation" error={errors.confirmPassword}>
            <input id="confirmPassword" type="password" className={input('confirmPassword')}
              autoComplete="new-password" value={values.confirmPassword}
              onChange={(e) => set('confirmPassword', e.target.value)} />
          </Field>
        </div>

        <Field id="universityId" label="Université" error={errors.universityId ?? listError ?? undefined}>
          <select id="universityId"
            className={`select select-bordered w-full ${errors.universityId ? 'select-error' : ''}`}
            value={values.universityId} disabled={universities === null}
            onChange={(e) => set('universityId', e.target.value)}>
            <option value="">
              {universities === null ? 'Chargement des universités…' : 'Choisissez votre université'}
            </option>
            {(universities ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <p className="mb-1.5 block text-xs font-medium text-base-content/80" id="requestedRole-label">
            Rôle demandé
          </p>
          <div className="join w-full" role="radiogroup" aria-labelledby="requestedRole-label">
            {SIGNUP_ROLES.map((role) => (
              <input key={role} type="radio" name="requestedRole" value={role}
                className="join-item btn btn-sm flex-1" aria-label={SIGNUP_ROLE_LABELS[role]}
                checked={values.requestedRole === role}
                onChange={() => set('requestedRole', role)} />
            ))}
          </div>
          {errors.requestedRole && <p className="mt-1 text-xs text-error">{errors.requestedRole}</p>}
        </div>

        {submitError && (
          <div role="alert" className="alert alert-error text-sm">
            <span>{submitError}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full gap-2" disabled={submitting}>
          {submitting ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <>
              Envoyer ma demande
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-base-content/70">
        Déjà un compte ?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthLayout>
  )
}
