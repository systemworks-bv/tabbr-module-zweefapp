import { AfterViewInit, Component, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ACTIVE_CLUB_CODE, SETTINGS_PAGE_HOST, TABBR_API_HOST, injectModuleApi } from '@tabbr/module-sdk';
import { TranslocoDirective } from '@jsverse/transloco';
import { asFunctionForm } from '../../../shared/flights/mapping-code';
import { MappingRow } from '../../../shared/flights/mapping-model';
import { DEFAULT_MAPPING } from '../../../shared/flights/mapping-model';
import { DEFAULT_FLIGHT_SETTINGS, LEGACY_KEYS, flightSettingsOf } from '../../../shared/settings';
import { validateConfiguration } from '../../../shared/validation';
import { Area, FieldCatalog, Issue } from '../../../shared/validation-types';
import { ConnectionSettingsComponent } from './connection/connection-settings.component';
import { loadFieldCatalog } from './field-catalog';
import { FlightsSettingsComponent } from './flights/flights-settings.component';
import { MODULE_ID } from './module-config';
import { SettingsModel } from './settings.model';

/**
 * Own code saved before rows had the function form (a bare body) becomes a typed `push`/`pull` function, so the editor
 * can check it. It runs exactly as before; the stored value is only rewritten when the user saves.
 */
function upgradeOwnCode(rows: MappingRow[]): MappingRow[] {
  for (const row of rows) {
    if (row.toZweefApp?.trim()) row.toZweefApp = asFunctionForm(row.toZweefApp, 'push', `Tabbr "${row.tabbrField}" -> ZweefApp "${row.za}"`);
    if (row.toTabbr?.trim()) row.toTabbr = asFunctionForm(row.toTabbr, 'pull', `ZweefApp "${row.za}" -> Tabbr "${row.tabbrField}"`);
  }
  return rows;
}

/** The tabs of the page, in order. Persons and memberships get theirs here when they are added. */
const AREAS: readonly Area[] = ['connection', 'flights'];

/**
 * Settings/status page of the ZweefApp backend module (see ../../backend/src/index.ts). This page is the only thing
 * published as a Native Federation FRONTEND remote - the sync logic runs server-side (BackendModuleRuntimeService), this
 * configures and observes it, through the SDK's injectModuleApi() (which knows the club and takes care of masking the
 * API key). One tab per part (connection, flights, ...), each its own component; this component loads, validates and
 * saves the whole, and tells the settings screen when there is something to save.
 */
@Component({
  selector: 'app-zweefapp-settings',
  standalone: true,
  imports: [TranslocoDirective, ConnectionSettingsComponent, FlightsSettingsComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements AfterViewInit {
  protected readonly moduleId = MODULE_ID;
  protected readonly areas = AREAS;

  private readonly api = injectModuleApi<Record<string, any>>(MODULE_ID);
  private readonly http = inject(HttpClient);
  private readonly apiHost = inject(TABBR_API_HOST);
  private readonly activeClubCode = inject(ACTIVE_CLUB_CODE, { optional: true });

  /** The settings screen shows a template handed over by the page, not the routed component itself. */
  private readonly settingsPageHost = inject(SETTINGS_PAGE_HOST, { optional: true });
  @ViewChild('settingsTemplate', { static: true }) private settingsTemplate!: TemplateRef<unknown>;

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly tab = signal<Area>('connection');

  /** Bumped on every edit: the form is plain objects edited in place, so this is what makes `dirty` re-evaluate. */
  private readonly edits = signal(0);
  private saved = '';
  /** Everything the module has stored, as loaded: a save keeps what this page does not edit (another part's settings). */
  private stored: Record<string, any> = {};

  /** The club's flight, person and airplane fields (null until loaded): what the mapping is validated against. */
  protected readonly fieldCatalog = signal<FieldCatalog | null>(null);

  protected model: SettingsModel = this.emptyModel();

  /** Everything wrong or doubtful in the configuration as it is now, including unsaved edits. */
  protected readonly issues = computed<Issue[]>(() => {
    this.edits();
    return validateConfiguration(
      {
        enabled: this.model.enabled,
        zweefAppClubCode: this.model.zweefAppClubCode ?? '',
        apiKeyGiven: this.model.apiKeyConfigured || !!this.model.apiKey,
        timeZone: this.model.timeZone ?? '',
      },
      { ...this.model.flights, lookbackDays: Number(this.model.flights.lookbackDays) },
      this.fieldCatalog(),
    );
  });
  protected readonly errorCount = computed(() => this.issues().filter((issue) => issue.severity === 'error').length);
  protected readonly warningCount = computed(() => this.issues().filter((issue) => issue.severity === 'warning').length);
  /** False while there is an error: the settings screen then keeps Save disabled. */
  protected readonly valid = computed(() => this.errorCount() === 0);

  /** True while the form differs from what was last loaded/saved - the settings screen then shows Save / Cancel. */
  protected readonly dirty = computed(() => {
    this.edits();
    return this.snapshot() !== this.saved;
  });

  constructor() {
    this.load();
    loadFieldCatalog(this.http, this.apiHost, this.activeClubCode?.()).then((catalog) => {
      // Without them the dropdowns only show the current values and nothing is checked against the club's fields.
      if (catalog) this.fieldCatalog.set(catalog);
    });
  }

  ngAfterViewInit(): void {
    this.settingsPageHost?.show(this.settingsTemplate);
    this.settingsPageHost?.bindForm({ dirty: this.dirty, valid: this.valid, save: () => this.save(), cancel: () => { this.load(); } });
  }

  protected issuesOf(area: Area): Issue[] {
    return this.issues().filter((issue) => issue.area === area);
  }

  protected errorsOf(area: Area): number {
    return this.issuesOf(area).filter((issue) => issue.severity === 'error').length;
  }

  protected touch(): void {
    this.edits.update((count) => count + 1);
  }

  private emptyModel(): SettingsModel {
    return {
      enabled: false,
      zweefAppClubCode: '',
      apiKey: '',
      apiKeyConfigured: false,
      timeZone: DEFAULT_MAPPING.timeZone,
      flights: structuredClone(DEFAULT_FLIGHT_SETTINGS),
      flightsPushStatus: {},
      flightsPullStatus: {},
    };
  }

  /** What would be saved, as text - compared with the loaded state to tell whether anything changed. */
  private snapshot(): string {
    const { flightsPushStatus, flightsPullStatus, apiKeyConfigured, apiKey, ...edited } = this.model;
    return JSON.stringify([edited, apiKey ? 'new key' : '']);
  }

  protected async load(): Promise<void> {
    try {
      const stored = await this.api.loadSettings();
      this.stored = stored;
      const flights = flightSettingsOf((key) => stored[key]);
      flights.mapping = upgradeOwnCode(structuredClone(flights.mapping));
      this.model = {
        enabled: stored['enabled'] === true,
        zweefAppClubCode: stored['zweefAppClubCode'] ?? '',
        apiKey: '',
        apiKeyConfigured: stored['apiKeyConfigured'] === true,
        timeZone: stored['timeZone'] ?? DEFAULT_MAPPING.timeZone,
        flights,
        flightsPushStatus: stored['flightsPushStatus'] ?? {},
        flightsPullStatus: stored['flightsPullStatus'] ?? {},
      };
      this.saved = this.snapshot();
      this.touch();
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saveError.set(null);
    try {
      // Start from everything stored, so what this page does not edit (another part's settings, the status of the last
      // runs) survives; the keys from before the flight settings had their own object are dropped.
      const next: Record<string, any> = { ...this.stored };
      for (const key of LEGACY_KEYS) delete next[key];
      delete next['apiKeyConfigured'];
      Object.assign(next, {
        enabled: this.model.enabled,
        zweefAppClubCode: this.model.zweefAppClubCode || '',
        timeZone: this.model.timeZone || DEFAULT_MAPPING.timeZone,
        flights: { ...this.model.flights, lookbackDays: this.model.flights.lookbackDays || DEFAULT_FLIGHT_SETTINGS.lookbackDays, idField: this.model.flights.idField || DEFAULT_FLIGHT_SETTINGS.idField },
        // Blank keeps the stored key - only a newly typed one replaces it.
        apiKey: this.model.apiKey || undefined,
      });
      await this.api.saveSettings(next);
      this.model.apiKey = '';
      await this.load();
    } catch (e: any) {
      this.saveError.set(e?.message || String(e));
    } finally {
      this.saving.set(false);
    }
  }
}
