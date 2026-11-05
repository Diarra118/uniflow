import { useCallback, useState } from 'react'
import { FirebaseError } from 'firebase/app'
import {
  createUserAccount,
  resendAccountInvite,
  type LoginAccessRole,
} from '@/core/firebase/functions'

/** Résultat affiché à l'admin après création — jamais de lien. */
export interface InvitationInfo {
  name: string
  email: string
  invitationSent: boolean
}

/** Codes pour lesquels le message du serveur (en français, propre à nos
 * fonctions) est plus précis qu'un message générique. */
const SERVER_MESSAGE_CODES = new Set([
  'functions/already-exists',
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/permission-denied',
])

const ERROR_MESSAGES: Record<string, string> = {
  'functions/unauthenticated':
    "Session expirée ou vérification de l'application (App Check) refusée. Rechargez la page et reconnectez-vous.",
  'functions/permission-denied': "Vous n'avez pas les droits pour gérer les accès de connexion.",
  'functions/invalid-argument': 'Données invalides : vérifiez le nom de la fiche.',
  'functions/not-found':
    'Fiche introuvable dans votre université (ou fonction non déployée).',
  'functions/unavailable': 'Service indisponible. Vérifiez votre connexion et réessayez.',
  'functions/deadline-exceeded': 'Le serveur a mis trop de temps à répondre. Réessayez.',
  'functions/internal': 'Erreur serveur : opération non effectuée. Réessayez.',
}

function toMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (SERVER_MESSAGE_CODES.has(err.code) && err.message) return err.message
    return ERROR_MESSAGES[err.code] ?? `Erreur inattendue (${err.code}).`
  }
  return 'Erreur inattendue : opération non effectuée.'
}

/**
 * Création d'un accès de connexion pour une fiche existante. Ne lève jamais :
 * l'erreur est exposée en français via `error`, et `create` retourne false.
 * L'invitation est envoyée par email par le serveur : aucun lien ici.
 */
export function useCreateLoginAccess() {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)

  const create = useCallback(
    async (params: { recordType: LoginAccessRole; recordId: string; name: string; email: string }) => {
      setCreating(true)
      setError(null)
      try {
        // params.name et params.email ne servent qu'à l'affichage : le
        // serveur lit ceux de la fiche.
        const res = await createUserAccount({
          role: params.recordType,
          linkedRecordType: params.recordType,
          linkedRecordId: params.recordId,
        })
        setInvitation({
          name: params.name,
          email: params.email.trim().toLowerCase(),
          invitationSent: res.invitationSent,
        })
        return true
      } catch (err) {
        console.error('createUserAccount', err instanceof FirebaseError ? err.code : err)
        setError(toMessage(err))
        return false
      } finally {
        setCreating(false)
      }
    },
    []
  )

  return {
    creating,
    error,
    invitation,
    create,
    clearError: useCallback(() => setError(null), []),
    dismissInvitation: useCallback(() => setInvitation(null), []),
  }
}

/** Renvoi de l'invitation d'une fiche déjà liée. Ne lève jamais. */
export function useResendAccountInvite() {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const resend = useCallback(
    async (params: { recordType: LoginAccessRole; recordId: string; email: string }) => {
      setSending(true)
      setError(null)
      setSentTo(null)
      try {
        const res = await resendAccountInvite({
          linkedRecordType: params.recordType,
          linkedRecordId: params.recordId,
        })
        if (res.invitationSent) {
          setSentTo(params.email.trim().toLowerCase())
        } else {
          setError("L'envoi de l'invitation a échoué. Réessayez plus tard.")
        }
      } catch (err) {
        console.error('resendAccountInvite', err instanceof FirebaseError ? err.code : err)
        setError(toMessage(err))
      } finally {
        setSending(false)
      }
    },
    []
  )

  return { sending, error, sentTo, resend }
}
