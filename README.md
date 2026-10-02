# tabbr-module-zweefapp

Two-way flight synchronisation between [Tabbr](https://tabbr.be) and [ZweefApp](https://gliding.app), for gliding clubs.
A [Tabbr](https://tabbr.be) module with a server-side part, built and published like any federated club module (via
`@tabbr/module-sdk` and `@tabbr/module-cli`). ZweefApp's API: <https://documenter.getpostman.com/view/25434528/2s8ZDX5PRi>.

- **Push**: a Tabbr flight is pushed to ZweefApp when it is created or updated (`backend/src/flights/sync.ts`, `onFlightSaved`).
- **Pull**: ZweefApp is polled every few minutes (`pollFlights`; it has no webhooks) for changes, additions and deletions, and they
  are reflected back into Tabbr: edits made in ZweefApp after the fact, and flights Tabbr never pushed (a visiting pilot's flight,
  logged directly on the ZweefApp tablet).
- **Per club, per field, per direction**: each club maps ZweefApp's flight fields onto its own Tabbr flight fields on the module's
  settings page - with real links to person and airplane records, value tables, yes/no flags derived from a selection field, the
  club's time zone, and the code that runs for each row shown (and editable, with type checking) next to it.

It needs a Tabbr environment that supports modules with a server-side part (they run in Tabbr's script sandbox). Flights only for
now; persons (with their groups) and memberships are planned (see "Adding an area").

> **Never put an API key or a club code in this repository.** They are entered on the module's settings page, per club; the key is
> stored server-side, write-only, and never returned to the browser. `tabbr.config.json` keeps `"club"` empty - set it locally with
> `npm run setup`, and don't commit it.

## Layout

Each thing that is synchronised (flights now; persons with their groups, and memberships later) is its own area, in
the same place on each side: the backend, the settings page and the code both share.

| Path | What it is |
|---|---|
| `backend/src/index.ts` | The handlers the triggers call (`onFlightSaved`, `pollFlights`) - one export per area. Runs server-side (GraalVM sandbox), not in the browser. Tabbr's backend module runtime executes it. |
| `backend/src/connection.ts` | What every area shares: the connection to ZweefApp (on/off, club, API key) and how a run reports its status. |
| `backend/src/flights/` | Flights: `sync.ts` (push and poll) and `mapping.ts` (runs the club's field mapping). |
| `shared/settings.ts` | The shape of the module's settings (`flights: {...}`, later `persons: {...}`), read by both the backend and the page. |
| `shared/flights/` | The flight mapping model, the code generated per row, the editor declarations and the validation - used by both sides. |
| `src/app/module/settings.component.*` | The admin-facing settings/status page: loads, validates and saves everything, one tab per area - the only part that's an actual Native Federation frontend remote. |
| `src/app/module/connection/` | The *Connection* tab (enable toggle, club code, API key, time zone). |
| `src/app/module/flights/` | The *Flights* tab (mapping editor, id field, "resync now", status). |
| `tabbr.config.json` | One config for both parts - `backend.triggers` declares the cron (`pollFlights`) and entity-hook (`onFlightSaved`) wiring; see `tabbr-module-cli`'s README for the full shape. |

### Adding an area (persons, memberships, ...)

1. `shared/settings.ts`: add its settings object (with its own `enabled`) and status key.
2. `backend/src/<area>/`: its sync; export the handlers from `backend/src/index.ts` and declare the triggers in `tabbr.config.json`.
3. `src/app/module/<area>/`: a settings component (own `.ts` + `.html`); add it to `AREAS` and the tabs in `settings.component.*`, and its issues to `shared/validation.ts`.

## Get started

```bash
cd tabbr-zweefapp-module
npm install
npm run setup           # asks for your club code, writes tabbr.config.json
npm run publish-module  # builds frontend + backend, logs you in (browser), uploads both
```

You need the **ADMIN** role in the club. After publishing, open **ZweefApp** in that club's menu to
fill in the ZweefApp club code and API key, enable it, and hit *Resync now*. Publishing again
replaces the previous version.

### Try it against a local backend first

```bash
npm run publish-local                        # same, but into your own <club>.local.tabbr.be environment
npm run publish-local -- --club <TESTCLUB>   # a different (test) club code than tabbr.config.json's
```

Start your local Tabbr backend and its local proxy first - the CLI uploads to
`https://api.local.tabbr.be`, the same backend `<club>.local.tabbr.be` talks to (override with
`"localApiHost"` in `tabbr.config.json`). Your mkcert root CA is trusted automatically; login still
goes through the real Keycloak, which a local backend validates too. The module is published into
that one club only.

Other scripts: `npm start` (settings page dev preview - frontend only, the backend part only runs on
a server), `npm run typecheck` (backend TypeScript), `npm run build`.

### Develop and test without a real ZweefApp

`dev/mock/` is a fake ZweefApp (WireMock in Docker, port 9998), so the sync can be tried end to end in your
own local club:

```bash
npm run mock:up                          # start the fake ZweefApp
npm run mock:seed                        # give it a guest flight to pull
npm run publish-local -- --club <CLUB>   # also allows `localhost` (localAllowedHosts in tabbr.config.json) - local publishes only
npm run dev:setup -- --club <CLUB>       # enable the module in that club and point it at the mock
npm run mock:watch                       # live view of every request the fake ZweefApp receives
```

Then press *Resync now* on the module's settings page (or create/edit a flight in that club) and watch what is
sent. `npm run mock:down` stops it. The mock's stubs live in `dev/mock/mappings/` (static) and `dev/mock/seed.mjs`
(runtime, per run); `http://localhost:9998/__admin/requests` shows the raw journal.

### Local CLI and SDK (yalc)

This workspace needs a `@tabbr/module-cli` with backend support (>= 0.2.0) and a `@tabbr/module-sdk`
with `injectModuleApi` (>= 0.3.0). `publish-module`/`publish-local` refuse to
run without them rather than silently publishing only the frontend. If your installed versions are older - or whenever you
change the CLI/SDK itself - use your local copies via [yalc](https://github.com/wclr/yalc):

```bash
# in tabbr-module-cli/ and tabbr-module-sdk/
npm install && npm run publish:local      # publishes to the yalc store (and pushes to linked workspaces)

# in this workspace
npm run link-local                        # yalc add @tabbr/module-cli @tabbr/module-sdk (+ install-links in .npmrc)
npm run unlink-local                      # back to the npm versions
```

`link-local` rewrites those two lines in `package.json` to `file:.yalc/...` - don't commit that
(`.yalc/` and `yalc.lock` are gitignored; run `unlink-local` first). After changing the CLI/SDK,
re-run `npm run publish:local` there and the linked copy here updates itself.

`backend/tabbr-backend.d.ts` is a vendored copy of `@tabbr/module-sdk`'s `backend-globals.d.ts`; drop it
once an SDK exporting `@tabbr/module-sdk/backend` is released.

## Known limitations

- A guest flight (one Tabbr never had) is created and then written once more, because a free-text second occupant did not survive
  the create in the club's own calculations (see `reconcileFlight` in `backend/src/flights/sync.ts`).
- Changes made in ZweefApp to a flight that is already linked, and deletions, are covered by tests and the mapping engine but have
  had less real-world use than the push and the import of new flights - try them against your own club before relying on them.
- A ZweefApp yes/no flag that is "no" leaves the Tabbr field as it is (it never wipes a field).
- The ZweefApp field labels and the field descriptions are Dutch; the settings page itself is available in Dutch and English
  (`src/app/module/i18n/`).

## License

[MIT](LICENSE) - use it, change it, run it for your club. Two notes:

- `@tabbr/module-sdk` and `@tabbr/module-cli`, which this module is built with, have their own license (free to use to build modules for
  Tabbr). `backend/tabbr-backend.d.ts` is a copy of the SDK's backend typings and stays under the SDK's license.
- "Tabbr" and "ZweefApp" are names of their owners; the license does not give you any rights to them.
