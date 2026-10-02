/// <reference path="../../tabbr-backend.d.ts" />

/**
 * Flight synchronisation. Two directions; WHAT is exchanged and how fields correspond is the club's own mapping
 * (shared/flights/mapping-model.ts, edited on the module's settings page, interpreted by ./mapping.ts):
 *
 * - `onFlightSaved(flight)` (ENTITY_HOOK, onCreate/onUpdate on "flight"): pushes the just-saved Tabbr flight to
 *   ZweefApp (POST if new, PUT if already linked).
 * - `pollFlights()` (CRON, every 5 minutes by default): pulls ZweefApp's own changes back into Tabbr - flights
 *   ZweefApp has that Tabbr doesn't (e.g. a visiting/guest pilot's flight, logged directly in ZweefApp), edits made
 *   in ZweefApp after the initial push, and deletions.
 */

import { STATUS_KEYS, flightSettingsOf } from '../../../shared/settings';
import { authHeaders, baseUrl, isEnabled, reportRun } from '../connection';
import { buildPullFields, buildPushPayload, loadMapping } from './mapping';

function flightsEnabled(): boolean {
  return isEnabled() && flightSettingsOf((key) => tabbr.settings.get(key)).enabled;
}

// --- outbound: push a Tabbr flight to ZweefApp ---------------------------------------------

export function onFlightSaved(flight: any) {
  if (!flightsEnabled()) {
    return;
  }
  reportRun(STATUS_KEYS.flightsPush, { attemptAt: new Date().toISOString() });
  try {
    pushFlight(flight);
  } catch (e: any) {
    // Surface it on the settings/status page - a hook has nowhere else to show an error.
    reportRun(STATUS_KEYS.flightsPush, { error: e?.message || String(e) });
    throw e;
  }
}

function pushFlight(flight: any) {
  const mapping = loadMapping();
  const existingId = flight[mapping.flightIdField];
  const payload = buildPushPayload(flight, mapping);

  const url = `${baseUrl()}/flights.json`;
  const result = existingId
    ? http.fetchJson<any>(url, { method: 'PUT', headers: authHeaders(), body: { uuid: String(existingId), ...payload } })
    : http.fetchJson<any>(url, { method: 'POST', headers: authHeaders(), body: payload });

  if (!result.ok) {
    throw new Error(`ZweefApp push failed: HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }
  reportRun(STATUS_KEYS.flightsPush, { at: new Date().toISOString(), error: null });

  if (!existingId && result.body && result.body.uuid) {
    // Link the freshly-created ZweefApp flight back onto this Tabbr flight, so the next edit is a
    // PUT (update) instead of creating a duplicate. `flight` is the SAME entity instance the
    // triggering onCreate/onUpdate hook is about to save - assigning here rides along with that
    // save (see FlightModuleService's own hooks for the same pattern), no extra write needed.
    flight[mapping.flightIdField] = result.body.uuid;
  }
}

// --- inbound: poll ZweefApp for changes, reflect them back into Tabbr --------------------

export function pollFlights() {
  if (!flightsEnabled()) {
    return;
  }

  const mapping = loadMapping();
  const lookbackDays = flightSettingsOf((key) => tabbr.settings.get(key)).lookbackDays;

  try {
    for (let i = 0; i < lookbackDays; i++) {
      const date = isoDateDaysAgo(i);
      syncDay(date, mapping, false);
      syncDay(date, mapping, true);
    }
    reportRun(STATUS_KEYS.flightsPull, { at: new Date().toISOString(), error: null });
  } catch (e: any) {
    reportRun(STATUS_KEYS.flightsPull, { error: e?.message || String(e) });
    throw e;
  }
}

function syncDay(date: string, mapping: ReturnType<typeof loadMapping>, deletedOnly: boolean) {
  const url = `${baseUrl()}/flights.json?date_updated=${date}${deletedOnly ? '&deleted=1' : ''}`;
  const result = http.fetchJson<any[]>(url, { headers: authHeaders() });
  if (!result.ok) {
    throw new Error(`ZweefApp poll failed for ${date}: HTTP ${result.status}`);
  }
  const flights: any[] = Array.isArray(result.body) ? result.body : [];
  for (const zaFlight of flights) {
    reconcileFlight(zaFlight, mapping);
  }
}

function reconcileFlight(zaFlight: any, mapping: ReturnType<typeof loadMapping>) {
  const matches = tabbr.entities.flight.findByFieldEquals(mapping.flightIdField, zaFlight.uuid);
  const existingId: string | undefined = matches.length > 0 ? matches[0].id : undefined;

  if (zaFlight.is_deleted) {
    if (existingId) {
      tabbr.entities.flight.delete(existingId);
    }
    return;
  }

  // Only the fields the mapping pulls - never anything else this Tabbr flight carries (accounting/ledger links,
  // other custom fields, ...).
  const fields = buildPullFields(zaFlight, mapping);

  if (existingId) {
    tabbr.entities.flight.updateFields(existingId, fields);
  } else {
    // A flight ZweefApp has that Tabbr never pushed - a guest/visiting pilot's flight, or one entered directly on
    // the ZweefApp tablet.
    const created = tabbr.entities.flight.create({ ...fields, [mapping.flightIdField]: zaFlight.uuid });
    // Observed: a free-text second occupant written while the flight is being created did not survive its create
    // (the club's PIC calculation and validation hook saw it empty), whereas the same write to the saved flight
    // sticks. So write the mapped fields once more now that it exists; the update re-runs the club's calculations.
    tabbr.entities.flight.updateFields(created.id, fields);
  }
}

function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().substring(0, 10);
}
