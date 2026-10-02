// Tests of the mapping interpreter (backend/src/mapping.ts) without a server: it is bundled with esbuild like the real
// module and run in a Node vm with a stubbed `tabbr` global. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../src/flights/mapping.ts', import.meta.url));
const bundled = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: '__m', platform: 'neutral', target: 'es2022' });

/** Loads the interpreter with the given stub records: found[entity][field=value] -> id. */
function load(found = {}, settings = {}) {
  const sandbox = {
    Intl, Date, Number, String, Array, Object, JSON, Function, Math,
    tabbr: {
      settings: { get: (key) => settings[key] },
      entities: {
        person: { findByFieldEquals: (f, v) => (found.person?.[`${f}=${v}`] ? [{ id: found.person[`${f}=${v}`] }] : []) },
        airplane: { findByFieldEquals: (f, v) => (found.airplane?.[`${f}=${v}`] ? [{ id: found.airplane[`${f}=${v}`] }] : []) },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(bundled.outputFiles[0].text, sandbox);
  return sandbox.__m;
}

/** Objects built inside the vm have another realm's prototypes; compare their plain form. */
const plain = (value) => JSON.parse(JSON.stringify(value));
const proxy = (props) => Object.assign(Object.create({ toString: () => props.__text ?? '' }), props);

test('push: scalar, time zone, start method, flags, person and airplane', () => {
  const m = load();
  const flight = {
    date: '2026-10-02',
    start: '2026-10-02T08:30:00Z',
    landing: '2026-10-02T09:05:00Z',
    flightDurationInMinutes: 35,
    startField: 'EBGG',
    landingField: 'EBGG',
    Startwijze: 'S-750',
    Vluchtsoort: null,
    Classificatie: 'TRAINING', // a training flight is a FIS flight and a training flight
    PIC: proxy({ firstname: 'Piet', lastname: 'Pilot', ZA_id: 42 }),
    'Passagier/instructeur': proxy({ __text: 'Gast Passagier' }),
    Toestel: proxy({ immatriculation: 'OO-ABC', tailNumber: 'AB', type: 'LS4', ZA_id: 7 }),
  };
  const payload = m.buildPushPayload(flight, m.loadMapping());
  assert.equal(payload.datum, '2026-10-02');
  assert.equal(payload.start_tijd, '10:30'); // 08:30Z is 10:30 in Brussels (summer time)
  assert.equal(payload.landings_tijd, '11:05');
  assert.equal(payload.vluchtduur, 35);
  assert.equal(payload.start_methode, 'sleep');
  assert.equal(payload.is_training, true);
  assert.equal(payload.is_profcheck, false);
  assert.equal(payload.is_fis, true); // DBO and TRAINING both are FIS flights
  assert.equal(payload.is_examen, false);
  assert.equal(payload.gezagvoerder_id, 42);
  assert.equal(payload.gezagvoerder_naam, 'Piet Pilot');
  assert.equal(payload.tweede_inzittende_id, null);
  assert.equal(payload.tweede_inzittende_naam, 'Gast Passagier');
  assert.deepEqual([payload.kist_id, payload.registratie, payload.callsign, payload.type], [7, 'OO-ABC', 'AB', 'LS4']);
});

test('push: an unknown start method falls back, a script row overrides the default', () => {
  const m = load();
  const mapping = m.loadMapping();
  const flight = { Startwijze: 'XX' };
  assert.equal(m.buildPushPayload(flight, mapping).start_methode, 'overig');

  mapping.rows = [{ za: 'bijzonderheden', tabbrField: 'x', push: true, pull: false, toZweefApp: 'target.bijzonderheden = helpers.text(source.Opmerkingen).toUpperCase()' }];
  assert.equal(m.buildPushPayload({ Opmerkingen: 'hallo' }, mapping).bijzonderheden, 'HALLO');
});

test('pull: times are local to the club, start method and flags are translated, records linked', () => {
  const m = load({ person: { 'ZA_id=42': 'person-uuid-42' }, airplane: { 'ZA_id=7': 'plane-uuid-7' } });
  const fields = m.buildPullFields({
    uuid: 'za-1', datum: '2026-10-02', start_tijd: '10:30', landings_tijd: '11:05',
    vertrek_vliegveld: 'EBGG', aankomst_vliegveld: 'EBGG', start_methode: 'lier',
    is_training: true, is_profcheck: false, is_fis: true,
    gezagvoerder_id: 42, gezagvoerder_naam: 'Piet Pilot', tweede_inzittende_id: 99, tweede_inzittende_naam: 'Gast Passagier',
    kist_id: 7, registratie: 'OO-ABC',
  }, m.loadMapping());
  assert.equal(fields.date, '2026-10-02');
  assert.equal(fields.start, '2026-10-02T08:30:00.000Z');
  assert.equal(fields.landing, '2026-10-02T09:05:00.000Z');
  assert.equal(fields.Startwijze, 'L');
  assert.equal(fields.Classificatie, 'TRAINING'); // a flag that is yes writes its value; a later row (training) overrides DBO from the FIS row
  assert.equal('Vluchtsoort' in fields, false); // a field no row maps is left alone
  assert.equal(m.buildPullFields({ is_fis: true, is_training: false }, m.loadMapping()).Classificatie, 'DBO'); // FIS alone: the first of its values
  assert.deepEqual(plain(fields.Piloot), { $ref: { entity: 'person', id: 'person-uuid-42' } });
  assert.equal(fields['Passagier/instructeur'], 'Gast Passagier'); // person 99 unknown: the name, as free text
  assert.deepEqual(plain(fields.Toestel), { $ref: { entity: 'airplane', id: 'plane-uuid-7' } });
});

test('pull: winter time and the DST change', () => {
  const m = load();
  const fromLocal = (date, time) => m.fromLocalTime(date, time, 'Europe/Brussels');
  assert.equal(fromLocal('2026-01-15', '10:00'), '2026-01-15T09:00:00.000Z');
  assert.equal(fromLocal('2026-07-15', '10:00'), '2026-07-15T08:00:00.000Z');
  assert.equal(fromLocal('2026-10-25', '10:00'), '2026-10-25T09:00:00.000Z'); // after the clocks went back that morning
  assert.equal(m.toLocalTime('2026-10-25T09:00:00Z', 'Europe/Brussels'), '10:00');
});

test('a saved mapping replaces the default, and a club can map flags onto a yes/no field', () => {
  const rows = [{ za: 'is_overland', tabbrField: 'Overland', push: true, pull: true }];
  const m = load({}, { mapping: rows, flightIdField: 'ZweefAppId', timeZone: 'UTC' });
  const mapping = m.loadMapping();
  assert.equal(mapping.flightIdField, 'ZweefAppId');
  assert.equal(m.buildPushPayload({ Overland: true }, mapping).is_overland, true);
  assert.equal(m.buildPullFields({ is_overland: true }, mapping).Overland, true);
});

test('flags on a list field: pushing checks the list, pulling adds to it', () => {
  const m = load();
  const mapping = m.loadMapping();
  mapping.rows = [
    { za: 'is_fis', tabbrField: 'Lijst', push: true, pull: true, flagValue: 'FIS', flagMatch: 'contains' },
    { za: 'is_training', tabbrField: 'Lijst', push: true, pull: true, flagValue: 'TRAINING', flagMatch: 'contains' },
  ];
  const payload = m.buildPushPayload({ Lijst: 'FIS, EXAMEN' }, mapping);
  assert.equal(payload.is_fis, true);
  assert.equal(payload.is_training, false);
  assert.equal(m.buildPullFields({ is_fis: true, is_training: true }, mapping).Lijst, 'FIS,TRAINING');
  assert.equal('Lijst' in m.buildPullFields({ is_fis: false, is_training: false }, mapping), false);
});

test('the generated code is what runs, and a row can bring its own', () => {
  const m = load();
  const row = { za: 'vertrek_vliegveld', tabbrField: 'startField', push: true, pull: true };
  assert.ok(m.generatedCode(row, 'push').includes('target.vertrek_vliegveld = helpers.text(source["startField"]);'));
  assert.equal(m.effectiveCode({ ...row, toTabbr: 'target.x = 1;' }, 'pull'), 'target.x = 1;');
  assert.equal(m.effectiveCode({ ...row, toTabbr: 'target.x = 1;' }, 'push'), m.generatedCode(row, 'push'));
});

test('rows run from top to bottom: when several pull into one field, the lower row wins', () => {
  const m = load();
  const rows = [
    { za: 'is_fis', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'DBO,TRAINING', flagMatch: 'oneOf' },
    { za: 'is_training', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'TRAINING' },
  ];
  const mapping = m.loadMapping();
  mapping.rows = rows;
  assert.equal(m.buildPullFields({ is_fis: true, is_training: true }, mapping).Classificatie, 'TRAINING');
  mapping.rows = [rows[1], rows[0]];
  assert.equal(m.buildPullFields({ is_fis: true, is_training: true }, mapping).Classificatie, 'DBO');
});
