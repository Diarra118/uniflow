import {
  createContext,
  useContext,
  useEffect,
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
import { userPath, universityMetaPath } from './paths'
import type { AppUser, Role, UniversityMeta } from '@/core/types'

interface AuthContextValue {
  firebaseUser: FirebaseUser | null
  appUser: AppUser | null
  university: UniversityMeta | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  refreshClaims: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [claims, setClaims] = useState<{ role: Role; universityId: string | null } | null>(null)
  const [profile, setProfile] = useState<Omit<AppUser, 'role' | 'universityId'> | null>(null)
  const [university, setUniversity] = useState<UniversityMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Session Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user)
      if (!user) {
        setClaims(null)
        setProfile(null)
        setUniversity(null)
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
          setClaims(null)
          setError(
            "Votre compte est en cours d'activation. Réessayez dans quelques instants."
          )
          setLoading(false)
          return
        }

        setError(null)
        setClaims({ role, universityId })
      } catch {
        setError('Impossible de vérifier vos autorisations.')
        setLoading(false)
      }
    })

    return unsubscribe
  }, [firebaseUser])

  // Profil affichable (/users/{uid}) — écrit uniquement par Cloud Functions,
  // lu ici pour le nom, l'email, le statut.
  useEffect(() => {
    if (!firebaseUser || !claims) {
      setProfile(null)
      return
    }

    const nodeRef = ref(rtdb, userPath(firebaseUser.uid))
    return onValue(
      nodeRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.val()
          setProfile({
            uid: firebaseUser.uid,
            name: data.name,
            email: data.email,
            status: data.status,
            createdAt: data.createdAt,
            linkedRecordId: data.linkedRecordId,
            linkedRecordType: data.linkedRecordType,
          })
        } else {
          setProfile(null)
          setError('Profil introuvable. Contactez votre administrateur.')
        }
        setLoading(false)
      },
      () => {
        setError('Impossible de charger le profil.')
        setLoading(false)
      }
    )
  }, [firebaseUser, claims])

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
