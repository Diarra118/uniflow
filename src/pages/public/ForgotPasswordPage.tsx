import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { z } from 'zod'
import { useAuth } from '@/core/firebase/AuthContext'

const schema = z.object({ email: z.string().email('Adresse email invalide') })

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFieldError(null)

    const parsed = schema.safeParse({ email })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0].message)
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(parsed.data.email)
    } catch {
      // Par prudence, on ne révèle jamais si l'email existe ou non.
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-6">
      <div className="w-full max-w-sm rounded-box border border-base-300 bg-base-100 p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-content">
            <GraduationCap size={20} />
          </div>
          <span className="font-display text-lg font-semibold">Gestion Universitaire</span>
        </div>

        {sent ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 size={32} className="mb-3 text-success" />
            <h1 className="font-display text-lg font-semibold">Email envoyé</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Si un compte existe pour {email}, vous recevrez un lien de réinitialisation.
            </p>
            <Link to="/login" className="btn btn-ghost btn-sm mt-6 gap-2">
              <ArrowLeft size={15} />
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold">Mot de passe oublié</h1>
            <p className="mt-1 text-sm text-base-content/60">
              Indiquez votre email pour recevoir un lien de réinitialisation.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="input input-bordered flex items-center gap-2">
                  <Mail size={16} className="text-base-content/40" />
                  <input
                    type="email"
                    className="grow"
                    placeholder="nom@universite.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                {fieldError && <p className="mt-1 text-xs text-error">{fieldError}</p>}
              </div>

              <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                {submitting ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  'Envoyer le lien'
                )}
              </button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1 text-sm text-base-content/60 hover:text-base-content"
              >
                <ArrowLeft size={14} />
                Retour à la connexion
              </Link>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
