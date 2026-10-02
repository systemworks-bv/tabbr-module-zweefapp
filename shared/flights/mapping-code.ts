import { MappingRow, zaField } from './mapping-model';

/**
 * The code behind a mapping row. A row says WHAT corresponds to what; this turns it into plain code per direction,
 * and that code is what actually runs (backend/src/mapping.ts) and what the settings page shows - so what you read is
 * what happens. A row's own code (`toZweefApp` / `toTabbr`) replaces the generated code for that direction.
 *
 * The code of a row in a direction is one function, `push(source, target, helpers)` or `pull(source, target, helpers)`,
 * written `export function` so the editor treats each row's code as its own module (several rows' functions do not
 * clash) - the engine strips the `export`. Push reads the Tabbr flight (`source`) and fills the ZweefApp payload
 * (`target`); pull reads the ZweefApp flight (`source`) and fills the Tabbr field values (`target`, keyed by Tabbr field
 * name). The parameters are typed with JSDoc against shared/mapping-declarations.ts, so the editor checks the code.
 */

export type Direction = 'push' | 'pull';

const q = (value: string) => JSON.stringify(value);
const field = (name: string) => `source[${q(name)}]`;
const targetField = (name: string) => `target[${q(name)}]`;

function valueMapLiteral(row: MappingRow, direction: Direction): string {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const { tabbr, za } of row.valueMap || []) {
    const key = direction === 'push' ? tabbr : za;
    if (seen.has(key)) continue; // several Tabbr values can map to one ZweefApp value: the first one is used back
    seen.add(key);
    entries.push(`${q(key)}: ${q(direction === 'push' ? za : tabbr)}`);
  }
  return `{ ${entries.join(', ')} }`;
}

function personPrefix(row: MappingRow): string {
  return row.za === 'gezagvoerder' ? 'gezagvoerder' : 'tweede_inzittende';
}

/** The generated code of one row in one direction (without the row's own override). */
export function generatedCode(row: MappingRow, direction: Direction): string {
  const za = zaField(row.za);
  const tabbr = row.tabbrField;
  const header = direction === 'push'
    ? `// Tabbr ${q(tabbr)} -> ZweefApp ${q(row.za)}`
    : `// ZweefApp ${q(row.za)} -> Tabbr ${q(tabbr)}`;
  const hasValueMap = !!row.valueMap && row.valueMap.length > 0;
  const lines: string[] = [];

  switch (za.type) {
    case 'text':
    case 'date':
      if (direction === 'push') {
        if (hasValueMap) {
          lines.push(`/** @type {Record<string, string>} */ const values = ${valueMapLiteral(row, 'push')};`, `const value = helpers.text(${field(tabbr)});`, `target.${row.za} = value in values ? values[value] : value;`);
        } else {
          lines.push(`target.${row.za} = helpers.text(${field(tabbr)});`);
        }
      } else if (hasValueMap) {
        lines.push(`/** @type {Record<string, string>} */ const values = ${valueMapLiteral(row, 'pull')};`, `const value = helpers.text(source.${row.za});`, `if (source.${row.za} != null) ${targetField(tabbr)} = value in values ? values[value] : value;`);
      } else {
        lines.push(`if (source.${row.za} != null) ${targetField(tabbr)} = helpers.text(source.${row.za});`);
      }
      break;

    case 'number':
      lines.push(direction === 'push'
        ? `target.${row.za} = helpers.number(${field(tabbr)}) ?? 0;`
        : `if (source.${row.za} != null) ${targetField(tabbr)} = helpers.number(source.${row.za});`);
      break;

    case 'time':
      lines.push(direction === 'push'
        ? `target.${row.za} = helpers.toLocalTime(${field(tabbr)});`
        : `if (source.${row.za} && source.datum) ${targetField(tabbr)} = helpers.fromLocalTime(source.datum, source.${row.za});`);
      break;

    case 'bool':
      if (!row.flagValue) {
        lines.push(direction === 'push'
          ? `target.${row.za} = ${field(tabbr)} === true;`
          : `if (source.${row.za} != null) ${targetField(tabbr)} = source.${row.za} === true;`);
      } else if (row.flagMatch === 'oneOf') {
        const values = row.flagValue.split(',').map((value) => value.trim()).filter(Boolean);
        lines.push(direction === 'push'
          ? `target.${row.za} = [${values.map(q).join(', ')}].includes(helpers.text(${field(tabbr)}));`
          : `// A flag that is "no" leaves the Tabbr field alone.`,
        ...(direction === 'pull' ? [`if (source.${row.za}) ${targetField(tabbr)} = ${q(values[0] ?? '')};`] : []));
      } else if (row.flagMatch === 'contains') {
        lines.push(direction === 'push'
          ? `target.${row.za} = helpers.tokens(${field(tabbr)}).includes(${q(row.flagValue)});`
          : `// A flag that is "no" leaves the Tabbr field alone.`,
        ...(direction === 'pull' ? [`if (source.${row.za}) ${targetField(tabbr)} = helpers.addToken(${targetField(tabbr)}, ${q(row.flagValue)}${row.tabbrList ? ', true' : ''});`] : []));
      } else {
        lines.push(direction === 'push'
          ? `target.${row.za} = helpers.text(${field(tabbr)}) === ${q(row.flagValue)};`
          : `// A flag that is "no" leaves the Tabbr field alone.`,
        ...(direction === 'pull' ? [`if (source.${row.za}) ${targetField(tabbr)} = ${q(row.flagValue)};`] : []));
      }
      break;

    case 'startMethod':
      if (direction === 'push') {
        lines.push(`/** @type {Record<string, string>} */ const values = ${valueMapLiteral(row, 'push')};`, `const value = helpers.text(${field(tabbr)});`, `target.${row.za} = value in values ? values[value] : ${q(row.fallback || 'overig')};`);
      } else if (hasValueMap) {
        lines.push(`/** @type {Record<string, string>} */ const values = ${valueMapLiteral(row, 'pull')};`, `if (source.${row.za} in values) ${targetField(tabbr)} = values[source.${row.za}];`);
      } else {
        lines.push(`if (source.${row.za} != null) ${targetField(tabbr)} = helpers.text(source.${row.za});`);
      }
      break;

    case 'person': {
      const prefix = personPrefix(row);
      if (direction === 'push') {
        lines.push(`const person = ${field(tabbr)};`);
        lines.push(row.link?.by === 'id'
          ? `target.${prefix}_id = person ? helpers.number(person[${q(row.link.entityField)}]) : null;`
          : `target.${prefix}_id = null;`);
        lines.push(`target.${prefix}_naam = helpers.personName(person);`);
      } else {
        const key = row.link?.by === 'name' ? `source.${prefix}_naam` : `source.${prefix}_id`;
        if (row.link && row.link.by !== 'registratie') {
          lines.push(`const id = ${key} ? helpers.findRecord('person', ${q(row.link.entityField)}, ${key}) : undefined;`,
            `${targetField(tabbr)} = id ? helpers.ref('person', id) : (helpers.text(source.${prefix}_naam) || null);`);
        } else {
          lines.push(`${targetField(tabbr)} = helpers.text(source.${prefix}_naam) || null;`);
        }
      }
      break;
    }

    case 'airplane':
      if (direction === 'push') {
        lines.push(`const airplane = ${field(tabbr)};`, 'if (airplane) {');
        if (row.link?.by === 'id') lines.push(`  target.kist_id = helpers.number(airplane[${q(row.link.entityField)}]);`);
        lines.push(`  target.registratie = helpers.text(airplane['immatriculation']);`, `  target.callsign = helpers.text(airplane['tailNumber']);`, `  target.type = helpers.text(airplane['type']);`, '}');
      } else if (row.link && row.link.by !== 'name') {
        const key = row.link.by === 'registratie' ? 'source.registratie' : 'source.kist_id';
        lines.push(`const id = ${key} ? helpers.findRecord('airplane', ${q(row.link.entityField)}, ${key}) : undefined;`,
          `${targetField(tabbr)} = id ? helpers.ref('airplane', id) : (helpers.text(source.registratie) || null);`);
      } else {
        lines.push(`${targetField(tabbr)} = helpers.text(source.registratie) || null;`);
      }
      break;
  }
  return wrap(direction, header.replace(/^\/\/ /, ''), lines);
}

const PARAMETER_TYPES: Record<Direction, [string, string]> = {
  push: ['TabbrFlight', 'ZweefAppPayload'],
  pull: ['ZweefAppFlight', 'TabbrFieldValues'],
};

/** A row's code as the function the editor shows and the engine runs. */
function wrap(direction: Direction, description: string, body: string[]): string {
  const [sourceType, targetType] = PARAMETER_TYPES[direction];
  return [
    '/**',
    ` * ${description}`,
    ` * @param {${sourceType}} source`,
    ` * @param {${targetType}} target`,
    ' * @param {MappingHelpers} helpers',
    ' */',
    `export function ${direction}(source, target, helpers) {`,
    ...body.map((line) => (line ? `  ${line}` : line)),
    '}',
  ].join('\n');
}

/**
 * Own code from before rows had the function form (just the body, with `source`, `target` and `helpers` in scope):
 * the same code as a function, so the editor can check it. Code that already is a function is returned unchanged.
 */
export function asFunctionForm(code: string, direction: Direction, description: string): string {
  return isFunctionForm(code, direction) ? code : wrap(direction, description, code.split('\n'));
}

function isFunctionForm(code: string, direction: Direction): boolean {
  return new RegExp(`\\bfunction\\s+${direction}\\s*\\(`).test(code);
}

/**
 * The body to hand to `new Function('source', 'target', 'helpers', body)` for a row's code: the function form is
 * stripped of its `export` and called; a bare body (the old form) runs as it is.
 */
export function runnable(code: string, direction: Direction): string {
  return isFunctionForm(code, direction)
    ? `${code.replace(new RegExp(`\\bexport\\s+(?=function\\s+${direction}\\b)`), '')}\nreturn ${direction}(source, target, helpers);`
    : code;
}

/** What runs for a row in a direction: its own code if it has any, else the generated code. */
export function effectiveCode(row: MappingRow, direction: Direction): string {
  const own = direction === 'push' ? row.toZweefApp : row.toTabbr;
  return own && own.trim() ? own : generatedCode(row, direction);
}

/** A plain-language account (Dutch, like the ZweefApp field labels) of what a yes/no row does in each direction. */
export function describeRow(row: MappingRow): { push: string; pull: string } {
  const label = zaField(row.za).label;
  const field = row.tabbrField || '…';
  if (!row.flagValue) {
    return {
      push: `Tabbr → ZweefApp: "${label}" wordt ja of nee, net als het ja/nee-veld "${field}".`,
      pull: `ZweefApp → Tabbr: "${field}" wordt ja of nee, net als "${label}".`,
    };
  }
  if (row.flagMatch === 'oneOf') {
    const values = row.flagValue.split(',').map((value) => value.trim()).filter(Boolean);
    return {
      push: `Tabbr → ZweefApp: "${label}" is ja als "${field}" een van ${values.map((value) => `"${value}"`).join(', ')} is, anders nee.`,
      pull: `ZweefApp → Tabbr: staat "${label}" op ja, dan wordt "${field}" gezet op "${values[0] ?? ''}" (een latere rij kan dat nog overschrijven). Staat het op nee, dan blijft "${field}" zoals het is.`,
    };
  }
  if (row.flagMatch === 'contains') {
    return {
      push: `Tabbr → ZweefApp: "${label}" is ja als de lijst in "${field}" de waarde "${row.flagValue}" bevat, anders nee.`,
      pull: `ZweefApp → Tabbr: staat "${label}" op ja, dan wordt "${row.flagValue}" aan de lijst in "${field}" toegevoegd. Staat het op nee, dan blijft "${field}" zoals het is.`,
    };
  }
  return {
    push: `Tabbr → ZweefApp: "${label}" is ja als "${field}" gelijk is aan "${row.flagValue}", anders nee.`,
    pull: `ZweefApp → Tabbr: staat "${label}" op ja, dan wordt "${field}" gezet op "${row.flagValue}" (de bestaande waarde wordt vervangen). Staat het op nee, dan blijft "${field}" zoals het is.`,
  };
}
