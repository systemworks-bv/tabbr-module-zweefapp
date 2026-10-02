// COPY of @tabbr/module-sdk's backend-globals.d.ts (tabbr-module-sdk/ in the tabbr repo). Vendored so this
// workspace type-checks without a released @tabbr/module-sdk that exports "./backend"; once one is
// released, delete this file and use `"types": ["@tabbr/module-sdk/backend"]` instead.

/**
 * Ambient globals available inside a backend module's sandbox at runtime (see
 * `BackendModuleRuntimeService`/`FetchScriptContributor`/`BackendModuleSettingsContributor` in
 * tabbr-api-server). Reference this from your backend workspace's tsconfig (`"types":
 * ["@tabbr/module-sdk/backend"]`, or a triple-slash `/// <reference types="@tabbr/module-sdk/backend" />`)
 * - it declares no imports, so it never pulls in this package's Angular/Keycloak peer
 * dependencies, which a backend-only workspace has no reason to install.
 *
 * These are GLOBALS, not exports - nothing here is `import`ed; `esbuild` bundles your module's
 * `export function foo() {}` into a single `__module.foo` global (see tabbr-module-cli), and these
 * declarations describe what the *host* additionally injects into that same global scope before
 * your bundle runs.
 *
 * For an ENTITY_HOOK trigger's bound entity (e.g. `flight` for a `{entity: "flight", ...}`
 * trigger), fetch the club's own generated types instead - `tabbr-module fetch-types --entity
 * flight --kind HOOK` - the entity-hook execution context is the exact same one a club's own
 * onCreate/onUpdate hook scripts run in.
 */

interface FetchJsonOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers?: Record<string, string>;
    body?: unknown;
}

interface FetchJsonResult<T = unknown> {
    status: number;
    ok: boolean;
    body: T;
}

/** Network access, restricted to this module's manifest.json `allowedHosts`. */
declare const http: {
    fetchJson<T = unknown>(url: string, options?: FetchJsonOptions): FetchJsonResult<T>;
};

type ScalarFieldValue = string | number | boolean | null;

/** A field value that points at an existing record: sets an ENTITY field (e.g. a flight's pilot) to that person/airplane. */
interface EntityRef {
    $ref: { entity: 'person' | 'airplane'; id: string };
}

/** A record found by a field's value - just its id. */
interface FoundRecord {
    id: string;
}

/**
 * Flight access for a sync module: find by a field's value, create, patch fields, delete. Field values are
 * addressed by their configured display name (e.g. "ZA_id"), exactly like a club's own hook scripts read/write them.
 * A value may be a plain scalar or an {@link EntityRef}. Not a generic any-entity bridge, see `EntityBridgeContributor`
 * on the server.
 */
interface FlightEntityBridge {
    findByFieldEquals(fieldName: string, value: string | number | boolean): FoundRecord[];
    create(fieldsByName: Record<string, ScalarFieldValue | EntityRef>): { id: string };
    updateFields(id: string, fieldsByName: Record<string, ScalarFieldValue | EntityRef>): void;
    delete(id: string): void;
}

/** Read-only lookup of persons / airplanes, to link a flight to the right record (see {@link EntityRef}). */
interface FindableEntityBridge {
    findByFieldEquals(fieldName: string, value: string | number | boolean): FoundRecord[];
}

/**
 * This module's own per-club settings - including its own secrets (manifest.json
 * `secretFieldNames`), which are only ever readable from inside this sandbox, never returned by
 * any settings GET response once saved.
 */
declare const tabbr: {
    settings: {
        get<T = unknown>(key: string): T | undefined;
        set(key: string, value: unknown): void;
    };
    entities: {
        flight: FlightEntityBridge;
        person: FindableEntityBridge;
        airplane: FindableEntityBridge;
    };
};

/**
 * Only used by the Hook/JobType stub scripts the server auto-provisions for this module's
 * declared triggers - not something your module's own code calls.
 */
declare const backendModuleUtils: {
    invokeEntityHook(moduleId: string, handler: string, entity: unknown): void;
    invokeCronTrigger(moduleId: string, handler: string): void;
};
