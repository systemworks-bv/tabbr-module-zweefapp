/// <reference path="../tabbr-backend.d.ts" />

/**
 * The connection to ZweefApp, shared by everything this module synchronises (flights now; persons and memberships
 * later): whether the module is on, which ZweefApp club it talks to and with which key.
 */

export function isEnabled(): boolean {
  return tabbr.settings.get<boolean>('enabled') === true;
}

export function baseUrl(): string {
  // Optional override (another ZweefApp environment, or a mock when testing) - its host must still
  // be in this module's manifest "allowedHosts", so this can't be used to reach anywhere else.
  const override = tabbr.settings.get<string>('baseUrl');
  if (override) {
    return override.replace(/\/+$/, '');
  }
  const zweefAppClubCode = tabbr.settings.get<string>('zweefAppClubCode');
  if (!zweefAppClubCode) {
    throw new Error('ZweefApp settings incomplete: "zweefAppClubCode" is not set');
  }
  return `https://admin.gliding.app/club/${zweefAppClubCode}/api`;
}

export function authHeaders(): Record<string, string> {
  const apiKey = tabbr.settings.get<string>('apiKey');
  if (!apiKey) {
    throw new Error('ZweefApp settings incomplete: "apiKey" is not set');
  }
  return { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };
}

/** Records how the last run of a synchronisation went, for the settings page. Each key belongs to one handler. */
export function reportRun(key: string, status: { attemptAt?: string; at?: string; error?: string | null }): void {
  const previous = (tabbr.settings.get<Record<string, unknown>>(key) ?? {}) as Record<string, unknown>;
  tabbr.settings.set(key, { ...previous, ...status });
}
