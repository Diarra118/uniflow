import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import app from './config'
import { EMULATOR_HOST, EMULATOR_PORTS, USE_EMULATORS } from './emulators'

/** Même région que les Cloud Functions déployées (functions/src). */
export const functions = getFunctions(app, 'europe-west1')

if (USE_EMULATORS) {
  connectFunctionsEmulator(functions, EMULATOR_HOST, EMULATOR_PORTS.functions)
}

/** Rôles créables via createUserAccount — jamais les rôles administrateurs. */
export type LoginAccessRole = 'teacher' | 'student' | 'parent'

/** Ni email ni nom : la fonction utilise toujours ceux enregistrés sur la fiche. */
export interface CreateUserAccountInput {
  role: LoginAccessRole
  linkedRecordType: LoginAccessRole
  linkedRecordId: string
}

export interface CreateUserAccountResult {
  uid: string
  /** Invitation (email de définition du mot de passe) envoyée par Firebase.
   * false : le compte est créé, l'invitation peut être renvoyée. */
  invitationSent: boolean
}

export interface ResendAccountInviteInput {
  linkedRecordType: LoginAccessRole
  linkedRecordId: string
}

export interface ResendAccountInviteResult {
  invitationSent: boolean
}

const createUserAccountCallable = httpsCallable<CreateUserAccountInput, CreateUserAccountResult>(
  functions,
  'createUserAccount'
)

/** L'université n'est volontairement pas transmise : la fonction utilise
 * exclusivement celle des claims de l'appelant. */
export async function createUserAccount(input: CreateUserAccountInput) {
  const res = await createUserAccountCallable(input)
  return res.data
}

const resendAccountInviteCallable = httpsCallable<ResendAccountInviteInput, ResendAccountInviteResult>(
  functions,
  'resendAccountInvite'
)

/** Renvoie l'invitation d'une fiche déjà liée (email lu dans la fiche). */
export async function resendAccountInvite(input: ResendAccountInviteInput) {
  const res = await resendAccountInviteCallable(input)
  return res.data
}

/** Université ouverte aux inscriptions : identifiant et nom, rien d'autre. */
export interface SignupUniversity {
  id: string
  name: string
}

const listSignupUniversitiesCallable = httpsCallable<void, { universities: SignupUniversity[] }>(
  functions,
  'listSignupUniversities'
)

/** Liste publique (sans connexion) des universités ouvertes aux inscriptions. */
export async function listSignupUniversities() {
  const res = await listSignupUniversitiesCallable()
  return res.data.universities
}

/** Ce que le client transmet : université visée, rôle demandé et nom.
 * L'e-mail est lu côté serveur dans le compte Auth ; aucun droit n'est
 * accordé avant la validation par l'admin de l'université. */
export interface SubmitSignupRequestInput {
  universityId: string
  requestedRole: 'student' | 'teacher'
  firstName: string
  lastName: string
}

const submitSignupRequestCallable = httpsCallable<SubmitSignupRequestInput, { status: 'pending' }>(
  functions,
  'submitSignupRequest'
)

export async function submitSignupRequest(input: SubmitSignupRequestInput) {
  const res = await submitSignupRequestCallable(input)
  return res.data
}
