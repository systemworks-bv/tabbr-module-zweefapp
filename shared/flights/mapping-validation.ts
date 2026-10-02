import { effectiveCode, runnable } from './mapping-code';
import { MappingRow, ZaFieldType, zaField } from './mapping-model';
import { FlightSettings } from '../settings';
import { FieldCatalog, Issue } from '../validation-types';

const TEXT_TYPES = ['TEXT', 'PARAGRAPH', 'RICH_TEXT', 'SINGLE_SELECT', 'EMAIL', 'PHONE'];

/** The Tabbr field types a ZweefApp field can sensibly be mapped onto. */
function acceptedTypes(row: MappingRow, type: ZaFieldType): string[] | null {
  switch (type) {
    case 'text': case 'startMethod': return TEXT_TYPES;
    case 'date': return ['DATE', ...TEXT_TYPES];
    case 'time': return ['DATETIME'];
    case 'number': return ['INTEGER', 'DECIMAL'];
    case 'bool': return row.flagValue != null ? TEXT_TYPES : ['BOOL'];
    case 'person': case 'airplane': return ['ENTITY'];
  }
}

function compiles(code: string): string | null {
  try {
    new Function('source', 'target', 'helpers', code);
    return null;
  } catch (e: any) {
    // Only a real syntax error counts: a page that does not allow building functions at all (CSP) must not flag every row.
    return e instanceof SyntaxError ? e.message : null;
  }
}

/** The values a flag row compares with: one, or several for 'oneOf'. */
function flagValues(row: MappingRow): string[] {
  return row.flagMatch === 'oneOf' ? (row.flagValue ?? '').split(',').map((value) => value.trim()).filter(Boolean) : [row.flagValue ?? ''];
}

function validateRow(row: MappingRow, index: number, fields: FieldCatalog | null, issues: Issue[]): void {
  const za = zaField(row.za);
  const add = (severity: Issue['severity'], code: string, part?: Issue['part'], params?: Record<string, string>) =>
    issues.push({ severity, code, area: 'flights', row: index, part, params });

  if (!row.push && !row.pull) add('warning', 'noDirection');

  // The Tabbr field
  if (!row.tabbrField?.trim()) {
    add('error', 'tabbrFieldEmpty', 'tabbrField');
  } else if (fields) {
    const field = fields.flight.find((candidate) => candidate.name === row.tabbrField);
    if (!field) {
      add('error', 'tabbrFieldUnknown', 'tabbrField', { field: row.tabbrField });
    } else {
      const accepted = acceptedTypes(row, za.type);
      if (accepted && !accepted.includes(field.type)) {
        add('error', 'tabbrFieldType', 'tabbrField', { field: field.name, type: field.type, expected: accepted.slice(0, 3).join(' / ') });
      } else if ((za.type === 'person' || za.type === 'airplane') && field.targetEntity && field.targetEntity !== za.type) {
        add('error', 'tabbrFieldEntity', 'tabbrField', { field: field.name, entity: field.targetEntity, expected: za.type });
      }
    }
  }

  // Yes/no flags on a text field
  const tabbrField = fields?.flight.find((candidate) => candidate.name === row.tabbrField);
  const choices = tabbrField?.choices?.length ? tabbrField.choices.map((choice) => choice.value) : null;
  if (za.type === 'bool' && row.flagValue != null) {
    if (!row.flagValue.trim()) add('error', 'flagValueEmpty', 'flag');
    else {
      const unknown = choices && flagValues(row).find((value) => !choices.includes(value));
      if (unknown) add('error', 'flagValueUnknown', 'flag', { value: unknown, field: row.tabbrField });
    }
    if (tabbrField?.multi && !(row.flagMatch === 'contains' && row.tabbrList)) add('error', 'flagListMismatch', 'flag', { field: row.tabbrField });
  }

  // Value tables
  for (const entry of row.valueMap || []) {
    if (!entry.tabbr.trim() || !entry.za.trim()) {
      add('error', 'valueEmpty', 'values');
      break;
    }
  }
  const unknownValue = choices && (row.valueMap || []).find((entry) => entry.tabbr.trim() && !choices.includes(entry.tabbr));
  if (unknownValue) add('error', 'tabbrValueUnknown', 'values', { value: unknownValue.tabbr, field: row.tabbrField });

  // Links to person / airplane records
  if ((za.type === 'person' || za.type === 'airplane') && row.link) {
    if (!row.link.entityField.trim()) {
      add('error', 'linkFieldEmpty', 'link');
    } else if (fields && !fields[za.type].some((candidate) => candidate.name === row.link!.entityField)) {
      add('error', 'linkFieldUnknown', 'link', { field: row.link.entityField, entity: za.type });
    }
  }

  // Own code
  for (const [direction, code] of [['push', row.toZweefApp], ['pull', row.toTabbr]] as const) {
    if (code?.trim()) {
      const problem = compiles(runnable(effectiveCode(row, direction), direction));
      if (problem) add('error', 'codeSyntax', 'code', { direction, message: problem });
    }
  }
}

/** What is wrong or doubtful about the flight synchronisation: its general settings and every row of its mapping. */
export function validateFlights(flights: FlightSettings, fields: FieldCatalog | null): Issue[] {
  const issues: Issue[] = [];

  if (!(flights.lookbackDays >= 1 && flights.lookbackDays <= 60)) issues.push({ severity: 'error', code: 'lookbackRange', area: 'flights', setting: 'lookbackDays' });

  if (!flights.idField.trim()) {
    issues.push({ severity: 'error', code: 'flightIdFieldEmpty', area: 'flights', setting: 'flightIdField' });
  } else if (fields && !fields.flight.some((candidate) => candidate.name === flights.idField)) {
    issues.push({ severity: 'error', code: 'flightIdFieldUnknown', area: 'flights', setting: 'flightIdField', params: { field: flights.idField } });
  }

  flights.mapping.forEach((row, index) => validateRow(row, index, fields, issues));

  // The same Tabbr field written from the same ZweefApp field twice, in the same direction, is almost certainly a slip.
  const seen = new Map<string, number>();
  flights.mapping.forEach((row, index) => {
    for (const direction of ['push', 'pull'] as const) {
      if (!(direction === 'push' ? row.push : row.pull)) continue;
      const key = `${direction}|${row.za}|${row.tabbrField}`;
      if (seen.has(key) && !row.flagValue) issues.push({ severity: 'warning', code: 'duplicateRow', area: 'flights', row: index, params: { za: zaField(row.za).label, field: row.tabbrField } });
      seen.set(key, index);
    }
  });

  return issues;
}
