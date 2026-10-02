import { FlightSettings, RunStatus } from '../../../shared/settings';

/**
 * What the settings page edits: the connection to ZweefApp on top, and one object per thing that is synchronised
 * (flights now, persons and memberships later). The parts are plain objects edited in place by their own components;
 * the page loads, validates and saves the whole.
 */
export interface SettingsModel {
  enabled: boolean;
  zweefAppClubCode: string;
  /** A newly typed key; blank keeps the stored one (which the page never gets to see, only `apiKeyConfigured`). */
  apiKey: string;
  apiKeyConfigured: boolean;
  /** The club's time zone: the wall clock times are read and written in. */
  timeZone: string;
  flights: FlightSettings;
  flightsPushStatus: RunStatus;
  flightsPullStatus: RunStatus;
}
