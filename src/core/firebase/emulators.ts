/**
 * Mode émulateurs Firebase (tests en local, voir README « Tester en local »).
 *
 * Actif UNIQUEMENT si les deux conditions sont réunies :
 * - serveur de développement Vite (`import.meta.env.DEV`, toujours false
 *   dans un build de production : ce code y est éliminé) ;
 * - VITE_USE_EMULATORS=true dans .env.local.
 */
export const USE_EMULATORS = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true'

/** Projet « demo- » : les émulateurs n'accèdent à aucun service réel. Doit
 * correspondre à `--project` du script `npm run emulators`. */
export const EMULATOR_PROJECT_ID = 'demo-uniflow'

export const EMULATOR_HOST = '127.0.0.1'

/** Doivent correspondre à la section "emulators" de firebase.json. */
export const EMULATOR_PORTS = { auth: 9099, database: 9000, functions: 5001 } as const
