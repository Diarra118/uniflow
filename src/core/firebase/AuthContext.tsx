import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { ref, onValue } from 'firebase/database'
import { auth, rtdb } from './config'
import { userPath, universityMetaPath, signupStatusPath } from './paths'
import type { AppUser, Role, SignupRequestState, UniversityMeta } from '@/core/types'

interface AuthContextValue {
  firebaseUser: FirebaseUser | null
  appUser: AppUser | null
  university: UniversityMeta | null
  loading: boolean
  error: string | null
  /** Raison d'une déconnexion imposée (suspension, suppression, droits
   * modifiés), affichée sur la page de connexion. */
  signOutMessage: string | null
  /** Demande d'inscription du compte connecté SANS rôle (auto-inscription) :
   * en attente, validée (ouverture en cours) ou refusée ; null sinon. */
  signupRequest: SignupRequestState | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshClaims: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const SIGN_OUT_REASON_KEY = 'uniflow-signout-reason'

const SIGN_OUT_MESSAGES = {
  suspended: "Votre compte a été suspendu. Contactez l'administration de votre université.",
  deleted:
    "Profil introuvable : votre compte a été supprimé ou n'est plus rattaché à une université. Contactez votre administrateur.",
  rightsChanged: 'Vos droits ont été modifiés. Reconnectez-vous pour continuer.',
} as const

/** Délais des tentatives de renouvellement du token quand le profil ne
 * correspond plus aux claims (le déclencheur serveur met les claims à jour
 * juste APRÈS le profil). Au-delà : déconnexion. */
const RIGHTS_REFRESH_DELAYS_MS = [0, 2000, 5000, 10000]

/** Demande validée : renouvellement du token jusqu'à l'arrivée des claims
 * (posés par approveSignupRequest juste après le statut). */
const APPROVED_REFRESH_DELAYS_MS = [0, 1000, 2000, 4000, 8000]

function readStoredSignOutReason(): string | null {
  try {
    return sessionStorage.getItem(SIGN_OUT_REASON_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [claims, setClaims] = useState<{ role: Role; universityId: string | null } | null>(null)
  const [profile, setProfile] = useState<Omit<AppUser, 'role' | 'universityId'> | null>(null)
  const [university, setUniversity] = useState<UniversityMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signOutMessage, setSignOutMessage] = useState<string | null>(readStoredSignOutReason)
  /** Connecté sans claims de rôle (compte en attente ou en cours d'activation). */
  const [noRole, setNoRole] = useState(false)
  const [signupRequest, setSignupRequest] = useState<SignupRequestState | null>(null)
  /** Boucle de renouvellement en cours (rôle/université attendus du profil). */
  const rightsLoop = useRef<{ key: string; cancelled: boolean } | null>(null)

  const cancelRightsLoop = useCallback(() => {
    if (rightsLoop.current) rightsLoop.current.cancelled = true
    rightsLoop.current = null
  }, [])

  /** Déconnexion imposée par un changement du profil côté serveur. */
  const forceSignOut = useCallback(async (reason: keyof typeof SIGN_OUT_MESSAGES) => {
    const message = SIGN_OUT_MESSAGES[reason]
    try {
      sessionStorage.setItem(SIGN_OUT_REASON_KEY, message)
    } catch {
      // Stockage indisponible : le message reste affiché jusqu'au rechargement.
    }
    setSignOutMessage(message)
    await firebaseSignOut(auth)
  }, [])

  // Session Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      if (!user) {
        // Déconnexion : aucune boucle de renouvellement ne doit survivre.
        if (rightsLoop.current) rightsLoop.current.cancelled = true
        rightsLoop.current = null
        setClaims(null)
        setProfile(null)
        setUniversity(null)
        setNoRole(false)
        setSignupRequest(null)
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  // Custom claims (role, universityId) — source de vérité RBAC/multi-tenant,
  // jamais un champ lu depuis un noeud de donnée modifiable côté client.
  useEffect(() => {
    if (!firebaseUser) return

    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!user) return
      try {
        const tokenResult = await user.getIdTokenResult()
        const role = tokenResult.claims.role as Role | undefined
        const universityId = (tokenResult.claims.universityId as string | undefined) ?? null

        if (!role) {
          // Le compte vient d'être créé et la Cloud Function d'attribution
          // des claims n'a pas encore été traitée — état transitoire attendu.
          // Le chargement se termine une fois la demande d'inscription
          // éventuelle lue (effet ci-dessous) : pas d'écran d'erreur fugace.
          setClaims(null)
          setNoRole(true)
          setError(
            "Votre compte est en cours d'activation. Réessayez dans quelques instants."
          )
          return
        }

        setError(null)
        setNoRole(false)
        setSignupRequest(null)
        setClaims({ role, universityId })
      } catch {
        setError('Impossible de vérifier vos autorisations.')
        setLoading(false)
      }
    })

    return unsubscribe
  }, [firebaseUser])

  // Profil (/users/{uid}) — écrit uniquement côté serveur, lu ici pour le
  // nom, l'email et le statut, et ÉCOUTÉ pour réagir sans attendre
  // l'expiration du token : les Security Rules coupent déjà l'accès aux
  // données dès que le profil change ; l'interface suit.
  useEffect(() => {
    if (!firebaseUser || !claims) {
      setProfile(null)
      return
    }

    const nodeRef = ref(rtdb, userPath(firebaseUser.uid))
    const unsubscribe = onValue(
      nodeRef,
      (snap) => {
        if (!snap.exists()) {
          // Profil supprimé (ou jamais créé) alors que le compte a des claims.
          setProfile(null)
          void forceSignOut('deleted')
          return
        }
        const data = snap.val()
        if (data.status === 'suspended') {
          setProfile(null)
          void forceSignOut('suspended')
          return
        }

        setProfile({
          uid: firebaseUser.uid,
          name: data.name,
          email: data.email,
          status: data.status,
          createdAt: data.createdAt,
          linkedRecordId: data.linkedRecordId,
          linkedRecordType: data.linkedRecordType,
        })
        setLoading(false)

        const profileRole = data.role as Role
        const profileUniversity: string | null = data.universityId ?? null
        if (profileRole !== claims.role || profileUniversity !== claims.universityId) {
          // Rôle ou université modifiés : l'accès aux données est déjà coupé
          // par les règles ; on masque l'écran et on renouvelle le token
          // jusqu'à obtenir les nouveaux claims (le déclencheur serveur les
          // pose juste après le profil), sinon déconnexion.
          setError('Vos droits ont été modifiés : mise à jour en cours…')
          const key = `${profileRole}|${profileUniversity}`
          if (rightsLoop.current?.key === key) return
          cancelRightsLoop()
          const loop = { key, cancelled: false }
          rightsLoop.current = loop
          void (async () => {
            // Boucle autonome : elle lit elle-même les claims renouvelés et ne
            // dépend pas d'onIdTokenChanged (qui ne se déclenche pas si le
            // token renouvelé est identique au précédent).
            for (const delay of RIGHTS_REFRESH_DELAYS_MS) {
              await new Promise((resolve) => window.setTimeout(resolve, delay))
              if (loop.cancelled || !auth.currentUser) return
              try {
                const res = await auth.currentUser.getIdTokenResult(true)
                const newUniversity = (res.claims.universityId as string | undefined) ?? null
                if (res.claims.role === profileRole && newUniversity === profileUniversity) {
                  if (rightsLoop.current === loop) rightsLoop.current = null
                  setError(null)
                  setClaims({ role: profileRole, universityId: profileUniversity })
                  return
                }
              } catch {
                break
              }
            }
            if (!loop.cancelled) {
              if (rightsLoop.current === loop) rightsLoop.current = null
              void forceSignOut('rightsChanged')
            }
          })()
          return
        }
        cancelRightsLoop()
        if (data.status !== 'active') {
          setError("Votre compte est en cours d'activation. Réessayez dans quelques instants.")
        }
      },
      () => {
        setError('Impossible de charger le profil.')
        setLoading(false)
      }
    )
    return unsubscribe
  }, [firebaseUser, claims, forceSignOut, cancelRightsLoop])

  // Demande d'inscription d'un compte sans rôle (signupStatus/{uid}, lisible
  // par son seul titulaire, écrit uniquement par les fonctions serveur).
  useEffect(() => {
    if (!firebaseUser || !noRole) return
    let cancelled = false
    let refreshing = false
    const unsubscribe = onValue(
      ref(rtdb, signupStatusPath(firebaseUser.uid)),
      (snap) => {
        const data = snap.val() as SignupRequestState | null
        setSignupRequest(data)
        setLoading(false)
        if (data?.status === 'approved' && !refreshing) {
          // Validée : les claims arrivent juste après ; onIdTokenChanged prend
          // le relais dès que le token renouvelé les contient.
          refreshing = true
          void (async () => {
            for (const delay of APPROVED_REFRESH_DELAYS_MS) {
              await new Promise((resolve) => window.setTimeout(resolve, delay))
              if (cancelled || !auth.currentUser) return
              try {
                const res = await auth.currentUser.getIdTokenResult(true)
                if (res.claims.role) return
              } catch {
                return
              }
            }
            refreshing = false
          })()
        }
      },
      () => {
        setSignupRequest(null)
        setLoading(false)
      }
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [firebaseUser, noRole])

  // Métadonnées de l'université (si rattaché à un tenant)
  useEffect(() => {
    if (!claims?.universityId) {
      setUniversity(null)
      return
    }

    const nodeRef = ref(rtdb, universityMetaPath(claims.universityId))
    return onValue(nodeRef, (snap) => {
      setUniversity(snap.exists() ? { id: claims.universityId!, ...snap.val() } : null)
    })
  }, [claims?.universityId])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    setSignOutMessage(null)
    try {
      sessionStorage.removeItem(SIGN_OUT_REASON_KEY)
    } catch {
      // Stockage indisponible : rien à effacer.
    }
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      // Jamais le mot de passe : uniquement le code et le message Firebase.
      const { code, message } = err as { code?: string; message?: string }
      console.error('signIn', { code, message })
      // Erreur d'origine relancée : LoginPage traduit le code en message.
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email)
  }, [])

  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return
    setLoading(true)
    try {
      await auth.currentUser.getIdToken(true)
    } catch (err) {
      // Sinon loading resterait bloqué : onIdTokenChanged ne se déclenche pas.
      setLoading(false)
      throw err
    }
  }, [])

  const appUser: AppUser | null =
    profile && claims ? { ...profile, role: claims.role, universityId: claims.universityId } : null

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        appUser,
        university,
        loading,
        error,
        signOutMessage,
        signupRequest,
        signIn,
        signOut,
        resetPassword,
        refreshClaims,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>')
  return ctx
}
