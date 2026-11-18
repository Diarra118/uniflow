/**
 * Région du déclencheur onUserProfileWritten.
 *
 * Production (et analyse au déploiement) : toujours europe-west1, la région
 * de la base Realtime Database. Aucune variable ne peut la changer.
 *
 * Émulateur Functions uniquement (FUNCTIONS_EMULATOR=true, posé par
 * l'émulateur lui-même dès l'analyse du code, jamais en production) :
 * l'émulateur Realtime Database n'exécute un déclencheur v2 que s'il est
 * déclaré en us-central1 (« function region is defined outside the database
 * region, will not trigger »). La région y vaut donc us-central1 par défaut,
 * ou PROFILE_TRIGGER_EMULATOR_REGION si cette variable est définie.
 */
export const PROFILE_TRIGGER_REGION = 'europe-west1'
export const EMULATOR_DATABASE_TRIGGER_REGION = 'us-central1'

export function profileTriggerRegion(env: NodeJS.ProcessEnv = process.env): string {
  if (env.FUNCTIONS_EMULATOR !== 'true') return PROFILE_TRIGGER_REGION
  return env.PROFILE_TRIGGER_EMULATOR_REGION || EMULATOR_DATABASE_TRIGGER_REGION
}

/** Même règle pour tout déclencheur Realtime Database du projet (ex :
 * onUniversityMetaWritten) : europe-west1 en production, us-central1 sous
 * l'émulateur uniquement. */
export const databaseTriggerRegion = profileTriggerRegion
