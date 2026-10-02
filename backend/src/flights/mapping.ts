/// <reference path="../../tabbr-backend.d.ts" />

/**
 * Runs the club's Mapping (see shared/flights/mapping-model.ts) in both directions: a Tabbr flight -> the payload ZweefApp
 * expects (push), and a ZweefApp flight -> the Tabbr flight fields to write (pull). Every row runs as code - the
 * generated code of shared/flights/mapping-code.ts, or the row's own - so what the settings page shows is what happens. No
 * club specifics live here.
 */

import { Direction, effectiveCode, runnable } from '../../../shared/flights/mapping-code';
import { DEFAULT_MAPPING, Mapping } from '../../../shared/flights/mapping-model';
import { flightSettingsOf } from '../../../shared/settings';

// --- loading -----------------------------------------------------------------------------------

export function loadMapping(): Mapping {
  const flights = flightSettingsOf((key) => tabbr.settings.get(key));
  return {
    rows: flights.mapping,
    flightIdField: flights.idField,
    timeZone: tabbr.settings.get<string>('timeZone') || DEFAULT_MAPPING.timeZone,
  };
}

// --- helpers available to row code -------------------------------------------------------------

/**
 * Properties of the entity bound in the sandbox can come back as host objects (typeof "function" for the hardcoded
 * date/time ones), which JSON.stringify silently drops - their string form is the ISO value.
 */
export function asText(value: unknown): string {
  return value == null ? '' : String(value);
}

/** "FIS,TRAINING" (or a multi-value field's array) -> ["FIS", "TRAINING"]. */
export function tokensOf(value: unknown): string[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value.map(String) : String(value).split(',');
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function personName(person: any): string {
  if (person == null) return '';
  const full = [person.firstname, person.lastname].filter((part) => part != null && String(part) !== '').join(' ');
  return full || asText(person).trim();
}

// --- time zones (ZweefApp logs local times, Tabbr stores instants) ------------------------------

function zonedParts(date: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

/** An instant -> "HH:mm" on the wall clock of `timeZone`. */
export function toLocalTime(instant: unknown, timeZone: string): string {
  const text = asText(instant);
  if (!text) return '';
  const parts = zonedParts(new Date(text), timeZone);
  return `${String(parts['hour']).padStart(2, '0')}:${String(parts['minute']).padStart(2, '0')}`;
}

/** "2026-10-02" + "10:00" on the wall clock of `timeZone` -> that instant as an ISO string. */
export function fromLocalTime(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (instantMs: number) => {
    const p = zonedParts(new Date(instantMs), timeZone);
    return Date.UTC(p['year'], p['month'] - 1, p['day'], p['hour'], p['minute'], p['second']) - Math.floor(instantMs / 1000) * 1000;
  };
  let instantMs = wallAsUtc - offsetAt(wallAsUtc);
  // The offset at the guessed instant can differ from the one at the wall time across a DST change: settle on it.
  instantMs = wallAsUtc - offsetAt(instantMs);
  return new Date(instantMs).toISOString();
}

function makeHelpers(mapping: Mapping) {
  return {
    text: asText,
    number: numberOrNull,
    tokens: tokensOf,
    addToken: (list: unknown, token: string, asList?: boolean) => {
      const tokens = [...tokensOf(list), token].filter((value, index, all) => all.indexOf(value) === index);
      return asList ? tokens : tokens.join(',');
    },
    personName,
    toLocalTime: (instant: unknown) => toLocalTime(instant, mapping.timeZone),
    fromLocalTime: (date: string, time: string) => fromLocalTime(date, time, mapping.timeZone),
    findRecord: (entity: 'person' | 'airplane', field: string, value: string | number): string | undefined => {
      const matches = tabbr.entities[entity].findByFieldEquals(field, value);
      return matches.length > 0 ? matches[0].id : undefined;
    },
    ref: (entity: 'person' | 'airplane', id: string) => ({ $ref: { entity, id } }),
  };
}

// --- running a mapping ---------------------------------------------------------------------------

function run(mapping: Mapping, direction: Direction, source: unknown): Record<string, any> {
  const helpers = makeHelpers(mapping);
  const target: Record<string, any> = {};
  for (const row of mapping.rows) {
    if (!(direction === 'push' ? row.push : row.pull)) continue;
    try {
      new Function('source', 'target', 'helpers', runnable(effectiveCode(row, direction), direction))(source, target, helpers);
    } catch (e: any) {
      throw new Error(`Mapping row ${row.za} <-> ${row.tabbrField} (${direction}) failed: ${e?.message || e}`);
    }
  }
  return target;
}

/** A Tabbr flight -> the payload to send to ZweefApp. */
export function buildPushPayload(flight: any, mapping: Mapping): Record<string, any> {
  return run(mapping, 'push', flight);
}

/** A ZweefApp flight -> the Tabbr field values to write (by Tabbr field name; a value may be a `$ref` to a record). */
export function buildPullFields(za: any, mapping: Mapping): Record<string, ScalarFieldValue | EntityRef> {
  return run(mapping, 'pull', za);
}

// Re-exported for the tests (and anything else that wants the code a row runs).
export { effectiveCode, generatedCode } from "../../../shared/flights/mapping-code";
