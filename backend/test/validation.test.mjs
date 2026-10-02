// Tests of the configuration validation (shared/mapping-validation.ts) the settings page shows. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../../shared/validation.ts', import.meta.url));
const modelEntry = fileURLToPath(new URL('../../shared/flights/mapping-model.ts', import.meta.url));
const load = async (path, name) => {
  const out = await build({ entryPoints: [path], bundle: true, write: false, format: 'iife', globalName: name, platform: 'neutral', target: 'es2022' });
  const sandbox = { Intl, Date, Function, SyntaxError, Set, Map, Number, String, Array, Object, JSON };
  vm.createContext(sandbox);
  vm.runInContext(out.outputFiles[0].text, sandbox);
  return sandbox[name];
};
const { validateConfiguration } = await load(entry, 'v');
// The old call shape (settings + a mapping) over the split connection / flights settings.
const check = (s, m, catalog) => validateConfiguration(
  { enabled: s.enabled, zweefAppClubCode: s.zweefAppClubCode, apiKeyGiven: s.apiKeyGiven, timeZone: m.timeZone },
  { enabled: true, idField: m.flightIdField, lookbackDays: s.lookbackDays, mapping: m.rows },
  catalog,
);
const { DEFAULT_MAPPING } = await load(modelEntry, 'm');
const plain = (value) => JSON.parse(JSON.stringify(value));

const f = (name, type, targetEntity) => ({ name, type, targetEntity });
const catalog = {
  flight: [
    f('date', 'DATE'), f('start', 'DATETIME'), f('landing', 'DATETIME'), f('flightDurationInMinutes', 'INTEGER'),
    f('startField', 'TEXT'), f('landingField', 'TEXT'), f('Toestel', 'ENTITY', 'airplane'), f('PIC', 'ENTITY', 'person'),
    f('Piloot', 'ENTITY', 'person'), f('Passagier/instructeur', 'ENTITY', 'person'), f('Startwijze', 'TEXT'),
    f('Classificatie', 'TEXT'), f('Vluchtsoort', 'TEXT'), f('ZA_id', 'TEXT'), f('Overland', 'BOOL'),
  ],
  person: [f('ZA_id', 'INTEGER'), f('VolledigeNaam', 'TEXT')],
  airplane: [f('ZA_id', 'INTEGER'), f('immatriculation', 'TEXT')],
};
const settings = { enabled: true, zweefAppClubCode: 'testclub', apiKeyGiven: true, lookbackDays: 7 };
const mapping = () => plain({ ...DEFAULT_MAPPING });
const codes = (issues) => plain(issues).map((issue) => `${issue.severity}:${issue.code}`);

test('the default mapping is valid for a club that has the fields it names', () => {
  assert.deepEqual(codes(check(settings, mapping(), catalog)), []);
});

test('unknown field, wrong type and wrong entity are errors on that row', () => {
  const m = mapping();
  m.rows[0].tabbrField = 'Bestaat niet';
  m.rows[1].tabbrField = 'startField'; // time -> text field
  m.rows[7].tabbrField = 'Toestel'; // a person row pointing at an airplane field
  const issues = plain(check(settings, m, catalog));
  assert.deepEqual(issues.filter((i) => i.row === 0).map((i) => i.code), ['tabbrFieldUnknown']);
  assert.deepEqual(issues.filter((i) => i.row === 1).map((i) => i.code), ['tabbrFieldType']);
  assert.deepEqual(issues.filter((i) => i.row === 7).map((i) => i.code), ['tabbrFieldEntity']);
});

test('without the field catalog only what can be seen locally is checked', () => {
  const m = mapping();
  m.rows[0].tabbrField = 'Bestaat niet';
  assert.deepEqual(codes(check(settings, m, null)), []);
  m.rows[0].tabbrField = '';
  assert.deepEqual(codes(check(settings, m, null)), ['error:tabbrFieldEmpty']);
});

test('flags, value tables, links and own code', () => {
  const m = mapping();
  m.rows.push({ za: 'is_fis', tabbrField: 'Classificatie', push: true, pull: true, flagValue: ' ' });
  m.rows.push({ za: 'start_methode', tabbrField: 'Startwijze', push: true, pull: true, valueMap: [{ tabbr: 'L', za: '' }] });
  m.rows.push({ za: 'gezagvoerder', tabbrField: 'Piloot', push: false, pull: true, link: { entityField: 'Onbekend', by: 'id' } });
  m.rows.push({ za: 'bijzonderheden', tabbrField: 'Vluchtsoort', push: true, pull: false, toZweefApp: 'target.x = (' });
  const issues = plain(check(settings, m, catalog));
  const at = (row) => issues.filter((i) => i.row === row && i.severity === 'error').map((i) => `${i.severity}:${i.code}`);
  const base = DEFAULT_MAPPING.rows.length;
  assert.deepEqual(at(base), ['error:flagValueEmpty']);
  assert.deepEqual(at(base + 1), ['error:valueEmpty']);
  assert.deepEqual(at(base + 2), ['error:linkFieldUnknown']);
  assert.deepEqual(at(base + 3), ['error:codeSyntax']);
});

test('a row without a direction and a repeated row are warnings', () => {
  const m = mapping();
  m.rows[0].push = false;
  m.rows[0].pull = false;
  m.rows.push({ ...m.rows[2] });
  const issues = plain(check(settings, m, catalog));
  assert.deepEqual(issues.filter((i) => i.row === 0).map((i) => `${i.severity}:${i.code}`), ['warning:noDirection']);
  assert.ok(issues.some((i) => i.code === 'duplicateRow' && i.severity === 'warning'));
});

test('general settings', () => {
  const m = mapping();
  m.timeZone = 'Mars/Olympus';
  m.flightIdField = 'Nope';
  const issues = plain(check({ enabled: true, zweefAppClubCode: '', apiKeyGiven: false, lookbackDays: 0 }, m, catalog));
  assert.deepEqual(issues.map((i) => i.code).sort(), ['apiKeyMissing', 'clubCodeMissing', 'flightIdFieldUnknown', 'lookbackRange', 'timeZoneInvalid']);
  // switched off, nothing is required of the connection
  const off = plain(check({ enabled: false, zweefAppClubCode: '', apiKeyGiven: false, lookbackDays: 7 }, mapping(), catalog));
  assert.deepEqual(off, []);
});

test('a selection field: the flag value and the value table must be choices of it; a list field is read as a list', () => {
  const withChoices = {
    ...catalog,
    flight: catalog.flight.map((field) => (field.name === 'Vluchtsoort' ? { ...field, type: 'SINGLE_SELECT', choices: [{ value: 'EXAMEN', name: 'Examen' }, { value: 'TRAINING', name: 'Training' }] }
      : field.name === 'Classificatie' ? { ...field, type: 'SINGLE_SELECT', multi: true, choices: [{ value: 'FIS', name: 'FIS' }] } : field)),
  };
  const m = mapping();
  m.rows.push({ za: 'is_examen', tabbrField: 'Vluchtsoort', push: true, pull: true, flagValue: 'EXAMEN', flagMatch: 'equals' });
  m.rows.push({ za: 'is_training', tabbrField: 'Vluchtsoort', push: true, pull: true, flagValue: 'NOPE', flagMatch: 'equals' });
  m.rows.push({ za: 'is_fis', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'FIS', flagMatch: 'equals' });
  m.rows.push({ za: 'is_profcheck', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'FIS', flagMatch: 'contains', tabbrList: true });
  m.rows.push({ za: 'start_methode', tabbrField: 'Vluchtsoort', push: true, pull: true, valueMap: [{ tabbr: 'ONBEKEND', za: 'lier' }] });
  const issues = plain(check(settings, m, withChoices));
  const base = DEFAULT_MAPPING.rows.length;
  const at = (row) => issues.filter((i) => i.row === row && i.severity === 'error').map((i) => i.code);
  assert.deepEqual(at(base), []);
  assert.deepEqual(at(base + 1), ['flagValueUnknown']);
  assert.deepEqual(at(base + 2), ['flagListMismatch']);
  assert.deepEqual(at(base + 3), []);
  assert.deepEqual(at(base + 4), ['tabbrValueUnknown']);
});

test('a flag that is one of several values: every value must be a choice', () => {
  const withChoices = {
    ...catalog,
    flight: catalog.flight.map((field) => (field.name === 'Classificatie' ? { ...field, type: 'TEXT', kind: 'single-select', choices: [{ value: 'DBO', name: 'DBO' }, { value: 'TRAINING', name: 'Training' }] } : field)),
  };
  const m = mapping();
  m.rows = [
    { za: 'is_fis', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'DBO,TRAINING', flagMatch: 'oneOf' },
    { za: 'is_examen', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'DBO,EXAM', flagMatch: 'oneOf' },
  ];
  const issues = plain(check(settings, { ...m, flightIdField: 'ZA_id' }, withChoices)).filter((i) => i.row != null);
  assert.deepEqual(issues.map((i) => `${i.row}:${i.code}:${i.params.value}`), ['1:flagValueUnknown:EXAM']);
});
