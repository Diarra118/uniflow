import { createUserWithEmailAndPassword, deleteUser } from 'firebase/auth'
import { auth } from '@/core/firebase/config'
import { submitSignupRequest } from '@/core/firebase/functions'
import type { SignupFormValues } from './schema'

const CREATE_ERRORS: Record<string, string> = {
  'auth/email-already-in-use':
    'Un compte existe déjà avec cette adresse e-mail. Connectez-vous, ou utilisez « Mot de passe oublié ? ».',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/weak-password': 'Mot de passe trop faible : choisissez-en un plus long.',
  'auth/operation-not-allowed': "Les inscriptions ne sont pas ouvertes pour le moment.",
  'auth/network-request-failed': 'Impossible de joindre le serveur. Vérifiez votre connexion.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
}

/** Codes dont le message serveur (en français) peut être montré tel quel. */
const SERVER_MESSAGE_CODES = new Set([
  'functions/already-exists',
  'functions/not-found',
  'functions/failed-precondition',
  'functions/resource-exhausted',
  'functions/permission-denied',
])

function codeOf(err: unknown): string | undefined {
  return (err as { code?: unknown } | null)?.code as string | undefined
}

/**
 * Crée le compte Firebase Auth (sans aucun rôle) puis enregistre la demande
 * via la fonction serveur. Si la demande échoue, le compte tout juste créé
 * est supprimé : pas de compte orphelin sans demande.
 */
export async function registerAndRequestAccess(values: SignupFormValues): Promise<void> {
  let created
  try {
    created = await createUserWithEmailAndPassword(auth, values.email, values.password)
  } catch (err) {
    const code = codeOf(err)
    throw new Error((code && CREATE_ERRORS[code]) ?? 'La création du compte a échoué. Réessayez.')
  }
  try {
    await submitSignupRequest({
      universityId: values.universityId,
      requestedRole: values.requestedRole,
      firstName: values.firstName,
      lastName: values.lastName,
    })
  } catch (err) {
    await deleteUser(created.user).catch(() => undefined)
    const code = codeOf(err)
    const message = (err as { message?: unknown }).message
    throw new Error(
      code && SERVER_MESSAGE_CODES.has(code) && typeof message === 'string'
        ? message
        : "La demande n'a pas pu être envoyée. Réessayez."
    )
  }
}
