import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { Issue } from '../../../../shared/validation-types';
import { MODULE_ID } from '../module-config';
import { SettingsModel } from '../settings.model';

/**
 * The connection to ZweefApp, shared by everything that is synchronised: whether the module is on, the ZweefApp club,
 * the API key and the club's time zone. Edits `model` in place; the settings page saves it.
 */
@Component({
  selector: 'app-connection-settings',
  standalone: true,
  imports: [FormsModule, TranslocoDirective],
  templateUrl: './connection-settings.component.html',
  styleUrl: '../form.css',
})
export class ConnectionSettingsComponent {
  @Input({ required: true }) model!: SettingsModel;
  /** What is wrong with the connection (the issues of this area). */
  @Input() issues: Issue[] = [];

  protected readonly moduleId = MODULE_ID;

  protected issuesOf(setting: NonNullable<Issue['setting']>): Issue[] {
    return this.issues.filter((issue) => issue.setting === setting);
  }
}
