import type { FieldCatalog, FieldInfo } from '../validation-types';

/**
 * TypeScript declarations for the code editor of a mapping row, so editing code is checked: the ZweefApp side is fixed
 * (known fields and their types), the Tabbr side is built from the club's own fields (names and types), so a misspelled
 * field name or a wrongly typed value is flagged in the editor. Two parts of a row's code function (see mapping-code.ts)
 * are typed through these - push: `source` is a TabbrFlight and `target` a ZweefAppPayload; pull: `source` is a
 * ZweefAppFlight and `target` TabbrFieldValues.
 */

const STATIC_DECLARATIONS = `
interface EntityRefValue {
  $ref: { entity: 'person' | 'airplane'; id: string };
}
type TabbrFieldValue = string | string[] | number | boolean | null | EntityRefValue;

/** A flight as ZweefApp has it (what a pull reads). */
interface ZweefAppFlight {
  uuid: string;
  is_deleted?: boolean;
  datum: string;
  start_tijd: string | null;
  landings_tijd: string | null;
  vluchtduur: number | null;
  vertrek_vliegveld: string | null;
  aankomst_vliegveld: string | null;
  kist_id: number | null;
  registratie: string | null;
  callsign: string | null;
  type: string | null;
  gezagvoerder_id: number | null;
  gezagvoerder_naam: string | null;
  tweede_inzittende_id: number | null;
  tweede_inzittende_naam: string | null;
  start_methode: string | null;
  is_fis: boolean;
  is_training: boolean;
  is_examen: boolean;
  is_profcheck: boolean;
  is_overland: boolean;
  afstand: number | null;
  bijzonderheden: string | null;
  category: string | null;
}

/** What a push sends to ZweefApp: the same fields, filled in as the rows write them. */
type ZweefAppPayload = Partial<Omit<ZweefAppFlight, 'uuid' | 'is_deleted'>>;

interface MappingHelpers {
  /** Anything -> text ('' for nothing). */
  text(value: unknown): string;
  /** Anything -> number, or null when it is none. */
  number(value: unknown): number | null;
  /** 'FIS,TRAINING' (or a list) -> ['FIS', 'TRAINING']. */
  tokens(value: unknown): string[];
  /** Adds a value to a list (comma separated text, or - with asList - a real list). */
  addToken(list: unknown, token: string): string;
  addToken(list: unknown, token: string, asList: true): string[];
  /** A person's full name. */
  personName(person: { firstname?: unknown; lastname?: unknown } | null | undefined): string;
  /** An instant -> 'HH:mm' on the club's wall clock. */
  toLocalTime(instant: unknown): string;
  /** '2026-10-02' + '10:00' on the club's wall clock -> the instant (ISO). */
  fromLocalTime(date: string, time: string): string;
  /** The id of the Tabbr person/airplane whose field equals the value, if any. */
  findRecord(entity: 'person' | 'airplane', field: string, value: string | number): string | undefined;
  /** A reference to that record, for a Tabbr field that points at one. */
  ref(entity: 'person' | 'airplane', id: string): EntityRefValue;
}
`;

const quote = (name: string) => JSON.stringify(name);

function tsType(field: FieldInfo): string {
  if (field.multi && field.type !== 'ENTITY') return 'string[] | null';
  switch (field.type) {
    case 'INTEGER':
    case 'DECIMAL':
      return 'number | null';
    case 'BOOL':
      return 'boolean | null';
    case 'ENTITY':
      return field.targetEntity === 'person' ? 'TabbrPerson | null' : field.targetEntity === 'airplane' ? 'TabbrAirplane | null' : 'any';
    case 'DATE':
    case 'DATETIME':
    case 'TEXT':
    case 'PARAGRAPH':
    case 'RICH_TEXT':
    case 'SINGLE_SELECT':
    case 'EMAIL':
    case 'PHONE':
      return 'string | null';
    default:
      return 'any';
  }
}

function entityInterface(name: string, fields: FieldInfo[] | undefined): string {
  if (!fields) return `interface ${name} { readonly [field: string]: any }`;
  return `interface ${name} {\n${fields.map((field) => `  readonly ${quote(field.name)}: ${tsType(field)};`).join('\n')}\n}`;
}

/** The declarations for the editor of a row's code; `catalog` is the club's fields (null until loaded: then any field name is accepted). */
export function mappingDeclarations(catalog: FieldCatalog | null): string {
  const flightFields = catalog?.flight;
  const writable = flightFields
    ? `interface TabbrFieldValues {\n${flightFields.map((field) => `  ${quote(field.name)}?: TabbrFieldValue;`).join('\n')}\n}`
    : 'interface TabbrFieldValues { [field: string]: TabbrFieldValue | undefined }';
  return [
    STATIC_DECLARATIONS,
    entityInterface('TabbrPerson', catalog?.person),
    entityInterface('TabbrAirplane', catalog?.airplane),
    entityInterface('TabbrFlight', flightFields),
    writable,
  ].join('\n');
}
