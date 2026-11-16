import { test } from 'node:test'
import assert from 'node:assert/strict'
import { profileTriggerRegion } from '../src/auth/triggerRegion'

test('région : europe-west1 hors émulateur (production, analyse au déploiement)', () => {
  assert.equal(profileTriggerRegion({}), 'europe-west1')
  assert.equal(profileTriggerRegion({ FUNCTIONS_EMULATOR: 'false' }), 'europe-west1')
  assert.equal(profileTriggerRegion({ FUNCTIONS_EMULATOR: '' }), 'europe-west1')
  assert.equal(profileTriggerRegion({ FUNCTIONS_EMULATOR: '1' }), 'europe-west1')
})

test('région : la variable de surcharge est ignorée hors émulateur', () => {
  assert.equal(profileTriggerRegion({ PROFILE_TRIGGER_EMULATOR_REGION: 'us-east1' }), 'europe-west1')
})

test('région : us-central1 sous l’émulateur, surchargeable', () => {
  assert.equal(profileTriggerRegion({ FUNCTIONS_EMULATOR: 'true' }), 'us-central1')
  assert.equal(
    profileTriggerRegion({ FUNCTIONS_EMULATOR: 'true', PROFILE_TRIGGER_EMULATOR_REGION: 'europe-west1' }),
    'europe-west1'
  )
})
