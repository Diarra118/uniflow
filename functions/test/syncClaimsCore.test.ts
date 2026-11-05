import { test } from 'node:test'
import assert from 'node:assert/strict'
import { syncClaimsCore, type ClaimsDeps } from '../src/auth/syncClaimsCore'

interface State {
  profile: Record<string, unknown> | null
  user: { disabled: boolean } | null
  claims: Record<string, unknown> | undefined
  revoked: number
  calls: string[]
}

function makeDeps(state: State, hooks: { beforeGetProfile?: () => void } = {}): ClaimsDeps {
  const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' })
  return {
    async getProfile() {
      hooks.beforeGetProfile?.()
      state.calls.push('getProfile')
      return state.profile
    },
    async getUser() {
      state.calls.push('getUser')
      return state.user
    },
    async setCustomUserClaims(_uid, claims) {
      if (!state.user) throw notFound()
      state.calls.push(Object.keys(claims).length ? 'setClaims' : 'clearClaims')
      state.claims = claims
    },
    async revokeRefreshTokens() {
      if (!state.user) throw notFound()
      state.calls.push('revoke')
      state.revoked++
    },
    logger: { info: () => {}, warn: () => {} },
  }
}

const ACTIVE = { uid: 'u1', role: 'student', universityId: 'A', status: 'active' }

function state(overrides: Partial<State> = {}): State {
  return { profile: { ...ACTIVE }, user: { disabled: false }, claims: undefined, revoked: 0, calls: [], ...overrides }
}

test('(d) nominal : profil actif et compte actif → claims posés depuis l’état courant', async () => {
  const s = state()
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'set')
  assert.deepEqual(s.claims, { role: 'student', universityId: 'A' })
  assert.deepEqual(s.calls, ['getProfile', 'getUser', 'setClaims'], 'profil relu AVANT de poser')
})

test('(a) profil supprimé par un rollback pendant l’exécution → rien n’est posé', async () => {
  const s = state()
  // L'événement était une écriture « active », mais le rollback supprime le
  // profil avant que le déclencheur ne le relise.
  const deps = makeDeps(s, { beforeGetProfile: () => (s.profile = null) })
  assert.equal(await syncClaimsCore(deps, 'u1', false), 'skipped-profile-missing')
  assert.equal(s.claims, undefined)
  assert.ok(!s.calls.includes('setClaims'))
})

test('(a bis) suppression : claims vidés, même si le compte Auth est déjà supprimé', async () => {
  const s = state({ profile: null, claims: { role: 'student' } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', true), 'cleared')
  assert.deepEqual(s.claims, {})

  const gone = state({ profile: null, user: null })
  assert.equal(await syncClaimsCore(makeDeps(gone), 'u1', true), 'cleared', 'user-not-found toléré')
})

test('(a ter) suppression puis recréation avant exécution → claims inchangés', async () => {
  const s = state({ claims: { role: 'student', universityId: 'A' } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', true), 'skipped-profile-recreated')
  assert.deepEqual(s.claims, { role: 'student', universityId: 'A' })
})

test('(b) compte Auth désactivé → aucun claim posé', async () => {
  const s = state({ user: { disabled: true } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-user-disabled')
  assert.equal(s.claims, undefined)
})

test('(b bis) compte Auth introuvable → aucun claim, pas d’erreur', async () => {
  const s = state({ user: null })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-user-missing')
})

test('(c) status pending → aucune écriture (ni pose ni effacement)', async () => {
  const s = state({ profile: { ...ACTIVE, status: 'pending' }, claims: { role: 'student', universityId: 'A' } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-not-active')
  assert.deepEqual(s.claims, { role: 'student', universityId: 'A' }, 'claims existants non effacés')
  assert.deepEqual(s.calls, ['getProfile'])
})

test('(c bis) status absent ou inconnu → aucun claim posé', async () => {
  for (const status of [undefined, 'archived', '']) {
    const s = state({ profile: { ...ACTIVE, status } })
    assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-not-active')
    assert.equal(s.claims, undefined)
  }
})

test('(e) suspension : claims vidés et sessions révoquées', async () => {
  const s = state({ profile: { ...ACTIVE, status: 'suspended' }, claims: { role: 'student', universityId: 'A' } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'revoked')
  assert.deepEqual(s.claims, {})
  assert.equal(s.revoked, 1)
  assert.deepEqual(s.calls, ['getProfile', 'clearClaims', 'revoke'])
})

test('(e bis) suspension d’un compte Auth déjà supprimé → pas d’erreur', async () => {
  const s = state({ profile: { ...ACTIVE, status: 'suspended' }, user: null })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-user-missing')
})

test('événement « actif » mais profil suspendu entre-temps → révocation (état courant prioritaire)', async () => {
  const s = state()
  const deps = makeDeps(s, { beforeGetProfile: () => (s.profile = { ...ACTIVE, status: 'suspended' }) })
  assert.equal(await syncClaimsCore(deps, 'u1', false), 'revoked')
  assert.equal(s.revoked, 1)
})

test('profil actif sans role → rien', async () => {
  const s = state({ profile: { ...ACTIVE, role: undefined } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'skipped-no-role')
  assert.equal(s.claims, undefined)
})

test('super_admin sans universityId → claim universityId null', async () => {
  const s = state({ profile: { uid: 'u1', role: 'super_admin_plateforme', status: 'active' } })
  assert.equal(await syncClaimsCore(makeDeps(s), 'u1', false), 'set')
  assert.deepEqual(s.claims, { role: 'super_admin_plateforme', universityId: null })
})
