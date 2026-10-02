// Tests of how the module reads its settings (shared/settings.ts). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const out = await build({ entryPoints: [fileURLToPath(new URL('../../shared/settings.ts', import.meta.url))], bundle: true, write: false, format: 'iife', globalName: 's', platform: 'neutral', target: 'es2022' });
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(out.outputFiles[0].text, sandbox);
const { flightSettingsOf, DEFAULT_FLIGHT_SETTINGS } = sandbox.s;
const plain = (value) => JSON.parse(JSON.stringify(value));
const reader = (settings) => (key) => settings[key];

test('nothing saved: the defaults, flights switched on', () => {
  assert.deepEqual(plain(flightSettingsOf(reader({}))), plain(DEFAULT_FLIGHT_SETTINGS));
  assert.equal(flightSettingsOf(reader({})).enabled, true);
});

test('the flights object wins, with defaults for what it leaves out', () => {
  const flights = flightSettingsOf(reader({ flights: { enabled: false, idField: 'MyId' } }));
  assert.equal(flights.enabled, false);
  assert.equal(flights.idField, 'MyId');
  assert.equal(flights.lookbackDays, DEFAULT_FLIGHT_SETTINGS.lookbackDays);
  assert.equal(flights.mapping.length, DEFAULT_FLIGHT_SETTINGS.mapping.length);
});

test('settings from before the flights object (flat keys) are still understood', () => {
  const rows = [{ za: 'bijzonderheden', tabbrField: 'Opmerkingen', push: true, pull: false }];
  const flights = flightSettingsOf(reader({ mapping: rows, flightIdField: 'ZweefAppId', lookbackDays: 14 }));
  assert.equal(flights.idField, 'ZweefAppId');
  assert.equal(flights.lookbackDays, 14);
  assert.deepEqual(plain(flights.mapping), rows);
  // ... and the flights object takes precedence once there is one
  assert.equal(flightSettingsOf(reader({ flightIdField: 'Old', flights: { idField: 'New' } })).idField, 'New');
});
