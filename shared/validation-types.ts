/** What the settings page and the validation of every area (connection, flights, later persons, ...) have in common. */

/** A field of one of the club's entities, as far as validating a mapping needs to know. */
export interface FieldInfo {
  name: string;
  /** Tabbr field type: 'TEXT', 'DATE', 'DATETIME', 'INTEGER', 'DECIMAL', 'BOOL', 'ENTITY', ... */
  type: string;
  /** For an ENTITY field: the entity it points at ('person', 'airplane', ...). */
  targetEntity?: string;
  /** What the club made it: 'single-select', 'text', 'paragraph', 'entity', ... (the stored type above says less: a single select is stored as TEXT). */
  kind?: string;
  /** For a selection field: the values the club offers (what is stored is `value`, `name` is what people see). */
  choices?: { value: string; name: string }[];
  /** The field holds a list of values rather than one. */
  multi?: boolean;
}

export interface FieldCatalog {
  flight: FieldInfo[];
  person: FieldInfo[];
  airplane: FieldInfo[];
}

/** The parts of the settings page, each with its own tab. */
export type Area = 'connection' | 'flights';

/** One thing wrong (error) or doubtful (warning) in the configuration. `code` is a translation key under `issue.`. */
export interface Issue {
  severity: 'error' | 'warning';
  code: string;
  /** Which tab of the settings page it belongs to. */
  area: Area;
  params?: Record<string, string>;
  /** Index of the mapping row, when it concerns one. */
  row?: number;
  /** Which part of that row, so the page can put the message where it belongs. */
  part?: 'tabbrField' | 'flag' | 'link' | 'values' | 'code';
  /** A general setting, when it concerns one. */
  setting?: 'timeZone' | 'flightIdField' | 'zweefAppClubCode' | 'apiKey' | 'lookbackDays';
}
