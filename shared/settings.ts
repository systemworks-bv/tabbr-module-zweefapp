import { DEFAULT_MAPPING, MappingRow } from './flights/mapping-model';

/**
 * What this module keeps in the club's module settings, shared by the backend (reads it through tabbr.settings) and the
 * settings page (reads and writes it as JSON). Everything every part needs - the connection to ZweefApp - is at the top;
 * each thing that is synchronised has its own object (`flights` now; persons and memberships get theirs later), with its
 * own on/off switch, so the parts can be set up, switched off and extended independently.
 */

export interface FlightSettings {
  /** Synchronise flights (needs the connection to be enabled as well). */
  enabled: boolean;
  /** The Tabbr flight field that holds the ZweefApp flight's id. */
  idField: string;
  /** How many days back each poll looks for changes in ZweefApp. */
  lookbackDays: number;
  /** How ZweefApp fields correspond to Tabbr flight fields - see flights/mapping-model.ts. */
  mapping: MappingRow[];
}

/** What a synchronisation reports about its last run, so the page can show it. Each key is written by one handler only. */
export interface RunStatus {
  /** When a push was last tried (it may have failed). */
  attemptAt?: string | null;
  /** When it last succeeded. */
  at?: string | null;
  error?: string | null;
}

/** The keys of the settings object. */
export const STATUS_KEYS = { flightsPush: 'flightsPushStatus', flightsPull: 'flightsPullStatus' } as const;

export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = {
  enabled: true,
  idField: DEFAULT_MAPPING.flightIdField,
  lookbackDays: 7,
  mapping: DEFAULT_MAPPING.rows,
};

/**
 * The flight settings out of the module settings, with defaults for what is missing. `read` returns a top-level key.
 * Settings saved before the flight settings had their own object (flat `mapping`, `flightIdField`, `lookbackDays`) are
 * still understood, until the settings are saved once from the page.
 */
export function flightSettingsOf(read: (key: string) => unknown): FlightSettings {
  const stored = (read('flights') ?? {}) as Partial<FlightSettings>;
  const mapping = stored.mapping ?? (read('mapping') as MappingRow[] | undefined);
  return {
    enabled: stored.enabled !== false,
    idField: stored.idField || (read('flightIdField') as string | undefined) || DEFAULT_FLIGHT_SETTINGS.idField,
    lookbackDays: stored.lookbackDays || (read('lookbackDays') as number | undefined) || DEFAULT_FLIGHT_SETTINGS.lookbackDays,
    mapping: Array.isArray(mapping) && mapping.length > 0 ? mapping : DEFAULT_FLIGHT_SETTINGS.mapping,
  };
}

/** The keys of settings from before the flight settings had their own object; a save from the page drops them. */
export const LEGACY_KEYS = ['mapping', 'flightIdField', 'lookbackDays', 'lastPushAt', 'lastPushAttemptAt', 'lastPushError', 'lastPullAt', 'lastPullError'];
