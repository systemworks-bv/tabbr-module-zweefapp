// This workspace needs a @tabbr/module-cli that can bundle the backend part (older CLIs ignore the
// "backend" block in tabbr.config.json and would silently publish only the frontend) and a
// @tabbr/module-sdk with injectModuleApi (without it the settings page doesn't compile).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Not require.resolve(): packages with an "exports" map (the SDK) don't export their package.json.
const pkgDir = (name) => join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', name);

const problems = [];
if (!existsSync(join(pkgDir('@tabbr/module-cli'), 'src', 'backend-build.js'))) {
  problems.push('@tabbr/module-cli does not support backend modules yet (only the frontend would be published)');
}
if (!existsSync(join(pkgDir('@tabbr/module-sdk'), 'dist', 'module-api.js'))) {
  problems.push('@tabbr/module-sdk does not export injectModuleApi yet');
}
if (problems.length) {
  console.error(
    `\n✖ ${problems.join('\n✖ ')}\n\n` +
    '  Until releases with these exist (CLI >= 0.2.0, SDK >= 0.3.0), use your local copies via yalc:\n' +
    '    (in tabbr-module-cli and tabbr-module-sdk)   npm install && npm run publish:local\n' +
    '    (in this workspace)                          npm run link-local\n'
  );
  process.exit(1);
}
