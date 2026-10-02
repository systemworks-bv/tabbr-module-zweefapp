import { Component, inject } from '@angular/core';
import { KeycloakService } from 'keycloak-angular';
import config from '../../tabbr.config.json';
import { SettingsComponent } from './module/settings.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [SettingsComponent],
  template: `
    @if (!club) {
      <h2>Almost there</h2>
      <p>Run <code>npm run setup</code> to choose your club, then restart <code>npm start</code>.</p>
    } @else if (keycloak?.isLoggedIn()) {
      <p><small>Dev preview for club <strong>{{ club }}</strong></small></p>
      <app-zweefapp-settings />
    } @else {
      <p>Log in with your tabbr account to preview your module against club <strong>{{ club }}</strong>.</p>
      <button (click)="keycloak?.login()">Log in</button>
    }
  `,
})
export class AppComponent {
  protected readonly club = config.club;
  protected readonly keycloak = inject(KeycloakService, { optional: true });
}
