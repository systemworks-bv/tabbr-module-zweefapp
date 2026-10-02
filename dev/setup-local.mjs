// Points the module's settings in YOUR local club at the mocked ZweefApp (see mock/), so the sync can be tried
// end to end without a real ZweefApp account. Needs the module published to that club first
// (npm run publish-local) and the local backend running.
//   npm run dev:setup                   club from tabbr.config.json
//   npm run dev:setup -- --club TEST    another club
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { getAccessToken } = require('@tabbr/module-cli/src/auth');
const config = JSON.parse(readFileSync(new URL('../tabbr.config.json', import.meta.url), 'utf8'));

const args = process.argv.slice(2);
const club = (args.includes('--club') ? args[args.indexOf('--club') + 1] : config.club || '').toUpperCase();
if (!club) throw new Error('No club: set "club" in tabbr.config.json (npm run setup) or pass --club <CODE>.');
const apiHost = config.localApiHost ?? 'https://api.local.tabbr.be';

// The mock answers on any club path; "test" is what mock/seed.mjs stubs.
const settings = {
  moduleId: config.moduleId,
  enabled: true,
  zweefAppClubCode: 'test',
  baseUrl: 'http://localhost:9998/club/test/api',
  apiKey: 'test-key',
  flights: { enabled: true, lookbackDays: 1 },
};

const response = await fetch(`${apiHost}/api/club/${club}/modulesettings/${config.moduleId}`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${await getAccessToken()}`, 'X-club': club, 'Content-Type': 'application/json' },
  body: JSON.stringify(settings),
});
if (!response.ok) throw new Error(`Saving settings failed: ${response.status} ${await response.text()}`);
console.log(`Club ${club} (${apiHost}): module "${config.moduleId}" enabled, pointing at the mock on ${settings.baseUrl}.`);
