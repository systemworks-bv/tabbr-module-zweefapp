import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideTabbrDevBridge } from '@tabbr/module-sdk/dev-bridge';
import { provideModuleI18n } from '@tabbr/module-sdk/i18n';
import config from '../../tabbr.config.json';
import { I18N_BUNDLES } from './module/i18n-bundles';

/**
 * The dev preview (`npm start`), NOT what runs inside tabbr: tabbr only loads src/app/module/.
 * The dev bridge logs you in to your club (from tabbr.config.json) and provides what tabbr would
 * provide (TABBR_API_HOST, PERSON_PUBLIC_API, ...), so your pages work here against real data.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideRouter([]),
    ...provideModuleI18n({ bundles: I18N_BUNDLES }),
    ...(isDevMode() && config.club ? [provideTabbrDevBridge({ clubCode: config.club, apiHost: config.apiHost })] : []),
  ],
};
