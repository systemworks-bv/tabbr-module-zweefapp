import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { injectModuleApi } from '@tabbr/module-sdk';
import { Issue, FieldCatalog } from '../../../../shared/validation-types';
import { MODULE_ID } from '../module-config';
import { SettingsModel } from '../settings.model';
import { MappingEditorComponent } from './mapping-editor.component';

/**
 * Everything about synchronising flights: whether to, how far back to look, which Tabbr field holds the ZweefApp id,
 * how the fields correspond (the mapping editor), a "resync now" and how the last runs went. Edits `model.flights` in
 * place; the settings page saves it.
 */
@Component({
  selector: 'app-flights-settings',
  standalone: true,
  imports: [FormsModule, TranslocoDirective, MappingEditorComponent],
  templateUrl: './flights-settings.component.html',
  styleUrl: '../form.css',
})
export class FlightsSettingsComponent {
  @Input({ required: true }) model!: SettingsModel;
  /** The club's fields (null until loaded), for the mapping editor. */
  @Input() fields: FieldCatalog | null = null;
  /** What is wrong with the flight settings (the issues of this area). */
  @Input() issues: Issue[] = [];
  /** Unsaved changes: a resync would not see them. */
  @Input() dirty = false;
  /** Fires on every edit in the mapping editor (typing in the plain inputs is seen by the page itself). */
  @Output() modified = new EventEmitter<void>();
  /** Fires after a resync, so the page can show its new status. */
  @Output() resynced = new EventEmitter<void>();

  protected readonly moduleId = MODULE_ID;
  private readonly api = injectModuleApi(MODULE_ID);

  protected readonly resyncing = signal(false);
  protected readonly resyncError = signal<string | null>(null);

  protected issuesOf(setting: NonNullable<Issue['setting']>): Issue[] {
    return this.issues.filter((issue) => issue.setting === setting);
  }

  protected async resyncNow(): Promise<void> {
    this.resyncing.set(true);
    this.resyncError.set(null);
    try {
      await this.api.trigger('pollFlights');
      this.resynced.emit();
    } catch (e: any) {
      this.resyncError.set(e?.message || String(e));
    } finally {
      this.resyncing.set(false);
    }
  }
}
