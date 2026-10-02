import { Issue } from './validation-types';

export interface ConnectionToValidate {
  enabled: boolean;
  zweefAppClubCode: string;
  apiKeyGiven: boolean;
  timeZone: string;
}

/** What is wrong or doubtful about the connection to ZweefApp (and the club-wide time zone). */
export function validateConnection(connection: ConnectionToValidate): Issue[] {
  const issues: Issue[] = [];
  const add = (code: string, setting: Issue['setting'], params?: Record<string, string>) => issues.push({ severity: 'error', code, area: 'connection', setting, params });

  if (connection.enabled && !connection.zweefAppClubCode.trim()) add('clubCodeMissing', 'zweefAppClubCode');
  if (connection.enabled && !connection.apiKeyGiven) add('apiKeyMissing', 'apiKey');
  try {
    new Intl.DateTimeFormat('en', { timeZone: connection.timeZone });
  } catch {
    add('timeZoneInvalid', 'timeZone', { value: connection.timeZone });
  }
  return issues;
}
