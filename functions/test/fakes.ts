import type { AccountDeps } from '../src/auth/accountShared'

/**
 * Doubles en mémoire d'Auth et de Realtime Database pour les tests des
 * cores. Les transactions reproduisent le comportement réel du SDK : premier
 * passage avec le cache local (null), puis nouveau passage avec la vraie
 * valeur si elle diffère.
 */

type Tree = Record<string, unknown>

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

function segments(path: string) {
  return path.split('/').filter(Boolean)
}

export function getAt(root: Tree, path: string): unknown {
  let node: unknown = root
  for (const s of segments(path)) {
    if (typeof node !== 'object' || node === null || !(s in node)) return null
    node = (node as Tree)[s]
  }
  return node === undefined ? null : clone(node)
}

export function setAt(root: Tree, path: string, value: unknown) {
  const segs = segments(path)
  const last = segs.pop()!
  let node: Tree = root
  const chain: Array<[Tree, string]> = []
  for (const s of segs) {
    if (typeof node[s] !== 'object' || node[s] === null) {
      if (value === null) return
      node[s] = {}
    }
    chain.push([node, s])
    node = node[s] as Tree
  }
  if (value === null) {
    delete node[last]
    // RTDB supprime les parents devenus vides.
    for (let i = chain.length - 1; i >= 0; i--) {
      const [parent, key] = chain[i]
      if (Object.keys(parent[key] as Tree).length === 0) delete parent[key]
      else break
    }
  } else {
    node[last] = clone(value)
  }
}

export interface FakeUser {
  email: string
  password: string
  disabled: boolean
  displayName?: string
  emailVerified?: boolean
}

/** Noms des opérations qu'on peut faire échouer. */
export type FailPoint =
  | 'createUser'
  | 'setUsers'
  | 'claimRecord'
  | 'claimRecordAfterCommit'
  | 'activate'
  | 'setClaims'
  | 'clearClaims'
  | 'disableUser'
  | 'removeUsers'
  | 'releaseRecord'
  | 'deleteUser'
  | 'sendInvite'

export function makeDeps(initial: Tree = {}, failAt: FailPoint[] = []) {
  const db: Tree = clone(initial)
  const users = new Map<string, FakeUser>()
  const claims = new Map<string, Record<string, unknown>>()
  const ops: string[] = []
  const logs: Array<{ message: string; data?: Record<string, unknown> }> = []
  const sentInvitations: string[] = []
  let seq = 0
  let clock = 1_700_000_000_000

  const fail = (p: FailPoint) => {
    if (failAt.includes(p)) {
      throw Object.assign(new Error(`panne simulée: ${p}`), { code: 'test/failure' })
    }
  }

  const transactionPoint = (path: string): FailPoint | null => {
    if (path.endsWith('/uid')) return 'releaseRecord'
    if (/^universities\/[^/]+\/(students|teachers|parents)\/[^/]+$/.test(path)) return 'claimRecord'
    return null
  }

  const deps: AccountDeps = {
    auth: {
      async createUser(props) {
        fail('createUser')
        for (const u of users.values()) {
          if (u.email === props.email) {
            throw Object.assign(new Error('exists'), { code: 'auth/email-already-exists' })
          }
        }
        const uid = `uid-${++seq}`
        users.set(uid, {
          email: props.email,
          password: props.password,
          disabled: props.disabled,
          displayName: props.displayName,
        })
        ops.push('createUser')
        return { uid }
      },
      async updateUser(uid, props) {
        fail('disableUser')
        const u = users.get(uid)
        if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' })
        u.disabled = props.disabled
        ops.push(props.disabled ? 'disableUser' : 'enableUser')
      },
      async getUser(uid) {
        const u = users.get(uid)
        if (!u) return null
        return {
          email: u.email,
          emailVerified: u.emailVerified ?? false,
          disabled: u.disabled,
          customClaims: clone(claims.get(uid) ?? {}),
        }
      },
      async setCustomUserClaims(uid, c) {
        const empty = Object.keys(c).length === 0
        fail(empty ? 'clearClaims' : 'setClaims')
        if (!users.has(uid)) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' })
        claims.set(uid, c)
        ops.push(empty ? 'clearClaims' : 'setClaims')
      },
      async deleteUser(uid) {
        fail('deleteUser')
        users.delete(uid)
        claims.delete(uid)
        ops.push('deleteUser')
      },
    },
    invitations: {
      async sendPasswordSetupEmail(email) {
        fail('sendInvite')
        sentInvitations.push(email)
      },
    },
    db: {
      async get(path) {
        return getAt(db, path)
      },
      async set(path, value) {
        if (path.startsWith('users/')) fail('setUsers')
        setAt(db, path, value)
        ops.push(`set:${path}`)
      },
      async update(path, values) {
        if (path.startsWith('users/')) fail('activate')
        for (const [k, v] of Object.entries(values)) setAt(db, `${path}/${k}`, v)
        ops.push(`update:${path}`)
      },
      async remove(path) {
        if (path.startsWith('users/')) fail('removeUsers')
        setAt(db, path, null)
        ops.push(`remove:${path}`)
      },
      async transaction(path, update) {
        const point = transactionPoint(path)
        if (point) fail(point)
        const actual = getAt(db, path)
        // Premier passage : cache local vide.
        let next = update(null)
        // Le serveur rejette si la valeur réelle diffère : nouveau passage.
        if (actual !== null) next = update(clone(actual))
        if (next === undefined) return { committed: false, value: actual }
        setAt(db, path, next)
        ops.push(`tx:${path}`)
        if (point === 'claimRecord') fail('claimRecordAfterCommit')
        return { committed: true, value: getAt(db, path) }
      },
    },
    logger: {
      info: (message, data) => logs.push({ message, data }),
      error: (message, data) => logs.push({ message, data }),
    },
    now: () => clock,
  }

  return {
    deps,
    db,
    users,
    claims,
    ops,
    logs,
    sentInvitations,
    advance: (ms: number) => {
      clock += ms
    },
    get: (path: string) => getAt(db, path),
  }
}

export const NOW = 1_700_000_000_000
