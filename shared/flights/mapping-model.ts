/**
 * What ZweefApp's flight looks like, and how a club maps it onto its own Tabbr flight fields - shared by the
 * backend sync (backend/src/mapping.ts interprets it) and the settings page (src/app/module edits it), so the
 * two can't disagree about the shape. Pure types and constants: no imports, usable on both sides.
 */

export type ZaFieldType = 'text' | 'number' | 'bool' | 'date' | 'time' | 'startMethod' | 'person' | 'airplane';

export type ZaFieldKey =
  | 'datum' | 'start_tijd' | 'landings_tijd' | 'vluchtduur'
  | 'vertrek_vliegveld' | 'aankomst_vliegveld'
  | 'kist' | 'gezagvoerder' | 'tweede_inzittende'
  | 'start_methode'
  | 'is_fis' | 'is_training' | 'is_examen' | 'is_profcheck' | 'is_overland'
  | 'afstand' | 'bijzonderheden' | 'category';

export interface ZaField {
  key: ZaFieldKey;
  label: string;
  type: ZaFieldType;
}

/** The ZweefApp flight fields a mapping can address (https://documenter.getpostman.com/view/25434528/2s8ZDX5PRi, "Create flight"). */
export const ZA_FIELDS: readonly ZaField[] = [
  { key: 'datum', label: 'Datum', type: 'date' },
  { key: 'start_tijd', label: 'Starttijd', type: 'time' },
  { key: 'landings_tijd', label: 'Landingstijd', type: 'time' },
  { key: 'vluchtduur', label: 'Vluchtduur (minuten)', type: 'number' },
  { key: 'vertrek_vliegveld', label: 'Vertrekvliegveld', type: 'text' },
  { key: 'aankomst_vliegveld', label: 'Aankomstvliegveld', type: 'text' },
  { key: 'kist', label: 'Toestel', type: 'airplane' },
  { key: 'gezagvoerder', label: 'Gezagvoerder', type: 'person' },
  { key: 'tweede_inzittende', label: 'Tweede inzittende', type: 'person' },
  { key: 'start_methode', label: 'Startmethode', type: 'startMethod' },
  { key: 'is_fis', label: 'FIS-vlucht', type: 'bool' },
  { key: 'is_training', label: 'Trainingsvlucht', type: 'bool' },
  { key: 'is_examen', label: 'Examenvlucht', type: 'bool' },
  { key: 'is_profcheck', label: 'Proficiency check', type: 'bool' },
  { key: 'is_overland', label: 'Overlandvlucht', type: 'bool' },
  { key: 'afstand', label: 'Afstand (km)', type: 'number' },
  { key: 'bijzonderheden', label: 'Bijzonderheden', type: 'text' },
  { key: 'category', label: 'Categorie', type: 'text' },
];

/** ZweefApp's `start_methode` values. */
export const ZA_START_METHODS: readonly string[] = ['lier', 'sleep', 'zelf', 'tmg', 'tmg-a', 'sep', 'sep-a', 'car', 'bungee', 'overig'];

export function zaField(key: ZaFieldKey): ZaField {
  const field = ZA_FIELDS.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Unknown ZweefApp field '${key}'`);
  return field;
}

/**
 * One line of the mapping: a ZweefApp field, the Tabbr flight field it corresponds to, and in which directions
 * it is synchronized. The same ZweefApp field may appear in several rows (e.g. pushed from one Tabbr field and
 * pulled into another). Which of the optional parts applies depends on the ZweefApp field's type.
 */
export interface MappingRow {
  za: ZaFieldKey;
  /** The Tabbr flight field, by its configured name; hardcoded fields (date, start, landing, startField, ...) included. */
  tabbrField: string;
  /** Tabbr -> ZweefApp. */
  push: boolean;
  /** ZweefApp -> Tabbr. */
  pull: boolean;

  /**
   * ZweefApp yes/no fields only. Empty: the Tabbr field is a yes/no field too. Set: the Tabbr field is a text field and
   * the flag is "yes" when that field holds this value (see flagMatch); pulling a "yes" writes the value into the field.
   */
  flagValue?: string;
  /**
   * With flagValue: the Tabbr field must be equal to it (default), contain it in a list, or - 'oneOf' - be any of several
   * values (flagValue is then those values separated by commas; pulling a "yes" writes the first one).
   */
  flagMatch?: 'equals' | 'contains' | 'oneOf';
  /** With flagMatch 'contains': the Tabbr field holds a real list (a multi-value field) and is written as one; otherwise comma separated text. */
  tabbrList?: boolean;

  /** Text values that differ between the two sides (e.g. startwijze "L" in Tabbr, "lier" in ZweefApp). */
  valueMap?: Array<{ tabbr: string; za: string }>;
  /** Push: the ZweefApp value to send when no valueMap entry matches (e.g. "overig" for a start method). */
  fallback?: string;

  /**
   * Person and airplane fields: which field of the linked Tabbr record identifies it, and what ZweefApp identifies it
   * by. Person: by 'id' (the ZweefApp account id, kept in Tabbr field `entityField`) or 'name' (full name). Airplane:
   * by 'id' (ZweefApp's material id) or 'registratie' (registration). A pull that finds no record falls back to the
   * ZweefApp name as free text.
   */
  link?: { entityField: string; by: 'id' | 'name' | 'registratie' };

  /**
   * Own code for a direction, replacing what shared/mapping-code.ts generates for this row (which is what runs, and
   * what the settings page shows, when these are empty). A function body with `source` (the flight being read),
   * `target` (the object being filled: ZweefApp payload when pushing, Tabbr field values when pulling) and `helpers`.
   */
  toZweefApp?: string;
  toTabbr?: string;
}

export interface Mapping {
  rows: MappingRow[];
  /** The Tabbr flight field that stores ZweefApp's id of the flight; links the two sides' records. */
  flightIdField: string;
  /** IANA time zone the club's flights are logged in: ZweefApp has local times, Tabbr stores instants. */
  timeZone: string;
}

/** What a club gets until it changes something: the mapping of a typical gliding club (Dutch field names, a classification field that decides the flags). */
export const DEFAULT_MAPPING: Mapping = {
  flightIdField: 'ZA_id',
  timeZone: 'Europe/Brussels',
  rows: [
    { za: 'datum', tabbrField: 'date', push: true, pull: true },
    { za: 'start_tijd', tabbrField: 'start', push: true, pull: true },
    { za: 'landings_tijd', tabbrField: 'landing', push: true, pull: true },
    { za: 'vluchtduur', tabbrField: 'flightDurationInMinutes', push: true, pull: false },
    { za: 'vertrek_vliegveld', tabbrField: 'startField', push: true, pull: true },
    { za: 'aankomst_vliegveld', tabbrField: 'landingField', push: true, pull: true },
    { za: 'kist', tabbrField: 'Toestel', push: true, pull: true, link: { entityField: 'ZA_id', by: 'id' } },
    { za: 'gezagvoerder', tabbrField: 'PIC', push: true, pull: false, link: { entityField: 'ZA_id', by: 'id' } },
    { za: 'gezagvoerder', tabbrField: 'Piloot', push: false, pull: true, link: { entityField: 'ZA_id', by: 'id' } },
    { za: 'tweede_inzittende', tabbrField: 'Passagier/instructeur', push: true, pull: true, link: { entityField: 'ZA_id', by: 'id' } },
    {
      za: 'start_methode', tabbrField: 'Startwijze', push: true, pull: true, fallback: 'overig',
      valueMap: [
        { tabbr: 'L', za: 'lier' },
        { tabbr: 'S-500', za: 'sleep' },
        { tabbr: 'S-750', za: 'sleep' },
        { tabbr: 'S-1000', za: 'sleep' },
        { tabbr: 'TMG', za: 'tmg' },
        { tabbr: 'SL', za: 'zelf' },
      ],
    },
    // The classification decides the flags: DBO and training flights are FIS flights, training is also a training flight.
    // Pulled in this order, a later "yes" overrides an earlier one (training over DBO).
    { za: 'is_fis', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'DBO,TRAINING', flagMatch: 'oneOf' },
    { za: 'is_training', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'TRAINING' },
    { za: 'is_examen', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'EXAM' },
    { za: 'is_profcheck', tabbrField: 'Classificatie', push: true, pull: true, flagValue: 'PROFCHECK' },
  ],
};
