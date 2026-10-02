// The code of a mapping row is checked in the editor against typed declarations (shared/mapping-declarations.ts).
// These tests run the same kind of check (TypeScript over JS with JSDoc): the generated code of every row of the default
// mapping must pass for a club that has the fields, and a misspelled Tabbr field name must not. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ts from 'typescript';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const load = async (relative, name) => {
  const out = await build({ entryPoints: [fileURLToPath(new URL(relative, import.meta.url))], bundle: true, write: false, format: 'iife', globalName: name, platform: 'neutral', target: 'es2022' });
  const sandbox = { Intl, Date, Function, SyntaxError, Set, Map, Number, String, Array, Object, JSON, RegExp };
  vm.createContext(sandbox);
  vm.runInContext(out.outputFiles[0].text, sandbox);
  return sandbox[name];
};
const { generatedCode, asFunctionForm, runnable } = await load('../../shared/flights/mapping-code.ts', 'code');
const { mappingDeclarations } = await load('../../shared/flights/mapping-declarations.ts', 'decl');
const { DEFAULT_MAPPING } = await load('../../shared/flights/mapping-model.ts', 'model');
const plain = (value) => JSON.parse(JSON.stringify(value));

const f = (name, type, targetEntity) => ({ name, type, targetEntity });
const catalog = {
  flight: [
    f('date', 'DATE'), f('start', 'DATETIME'), f('landing', 'DATETIME'), f('flightDurationInMinutes', 'INTEGER'),
    f('startField', 'TEXT'), f('landingField', 'TEXT'), f('Toestel', 'ENTITY', 'airplane'), f('PIC', 'ENTITY', 'person'),
    f('Piloot', 'ENTITY', 'person'), f('Passagier/instructeur', 'ENTITY', 'person'), f('Startwijze', 'TEXT'),
    f('Classificatie', 'TEXT'), f('Vluchtsoort', 'TEXT'), f('ZA_id', 'TEXT'),
  ],
  person: [f('firstname', 'TEXT'), f('lastname', 'TEXT'), f('ZA_id', 'INTEGER')],
  airplane: [f('immatriculation', 'TEXT'), f('tailNumber', 'TEXT'), f('type', 'TEXT'), f('ZA_id', 'INTEGER')],
};

// The same options and ignored codes as the shell's script editor (script-editor-monaco.service.ts).
const IGNORED = [7005, 7006, 7008, 7010, 7015, 7016, 7017, 7018, 7019, 7022, 7023, 7024, 7031, 7034, 7043];
function diagnose(code, declarations) {
  const files = { '/declarations.d.ts': declarations, '/row.js': code };
  const options = { allowJs: true, checkJs: true, noEmit: true, noImplicitAny: true, target: ts.ScriptTarget.ES2020, lib: ['lib.es2020.d.ts'] };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language) => (name in files ? ts.createSourceFile(name, files[name], language) : getSourceFile(name, language));
  host.fileExists = (name) => name in files || ts.sys.fileExists(name);
  host.readFile = (name) => (name in files ? files[name] : ts.sys.readFile(name));
  const program = ts.createProgram(Object.keys(files), options, host);
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName === '/row.js' && !IGNORED.includes(d.code))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
}

test('the generated code of every default row passes the editor check, in both directions', () => {
  const declarations = mappingDeclarations(catalog);
  for (const row of plain(DEFAULT_MAPPING).rows) {
    for (const direction of ['push', 'pull']) {
      assert.deepEqual(diagnose(generatedCode(row, direction), declarations), [], `${row.za} <-> ${row.tabbrField} (${direction})`);
    }
  }
});

test('a misspelled Tabbr field, a wrong ZweefApp field and a wrong value type are flagged', () => {
  const declarations = mappingDeclarations(catalog);
  const row = { za: 'aankomst_vliegveld', tabbrField: 'landingField', push: true, pull: true };
  const typo = generatedCode(row, 'push').replace('source["landingField"]', 'source["landingFieldd"]');
  assert.ok(diagnose(typo, declarations).some((message) => message.includes('landingFieldd')));

  const wrongTarget = generatedCode(row, 'push').replace('target.aankomst_vliegveld', 'target.aankomst_vliegveldd');
  assert.ok(diagnose(wrongTarget, declarations).some((message) => message.includes('aankomst_vliegveldd')));

  const wrongType = generatedCode(row, 'push').replace('helpers.text(source["landingField"])', '12');
  assert.ok(diagnose(wrongType, declarations).length > 0);

  const wrongPull = generatedCode(row, 'pull').replace('target["landingField"]', 'target["nope"]');
  assert.ok(diagnose(wrongPull, declarations).some((message) => message.includes('nope')));
});

test('without the club fields any Tabbr field name is accepted', () => {
  const row = { za: 'aankomst_vliegveld', tabbrField: 'iets', push: true, pull: true };
  assert.deepEqual(diagnose(generatedCode(row, 'push'), mappingDeclarations(null)), []);
});

test('own code in the old form (a bare body) is turned into the function form, and runs the same', () => {
  const body = 'target.bijzonderheden = helpers.text(source.Opmerkingen).toUpperCase();';
  const converted = asFunctionForm(body, 'push', 'Tabbr "Opmerkingen" -> ZweefApp "bijzonderheden"');
  assert.ok(converted.includes('export function push(source, target, helpers)'));
  assert.deepEqual(diagnose(converted, mappingDeclarations(catalog)).filter((m) => !m.includes('Opmerkingen')), []);
  for (const code of [body, converted]) {
    const target = {};
    new Function('source', 'target', 'helpers', runnable(code, 'push'))({ Opmerkingen: 'hallo' }, target, { text: String });
    assert.equal(target.bijzonderheden, 'HALLO');
  }
  assert.equal(asFunctionForm(converted, 'push', 'x'), converted);
});
