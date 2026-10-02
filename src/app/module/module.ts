import { computed } from '@angular/core';
import { SimpleModuleBase } from '@tabbr/module-sdk';
import { provideModuleI18n } from '@tabbr/module-sdk/i18n';
import { MODULE_ID } from './module-config';
import { I18N_BUNDLES } from './i18n-bundles';
import { SettingsComponent } from './settings.component';

/**
 * ZweefApp module, as tabbr sees it: one settings/status page, shown with the other module
 * settings under /admin/settings/<moduleId>. The actual sync logic is the backend part of this same
 * published module (../../backend/src/index.ts) - this is only the admin-facing configuration
 * screen, see SettingsComponent's own doc comment.
 */
export class Module extends SimpleModuleBase {
  /**
   * The module's translations, for the shell too: it translates the module's title (tabbr.config.json "title" is the key,
   * e.g. "title") in its settings list and page header from these, like it does for its own modules.
   */
  static override readonly i18nBundles = I18N_BUNDLES;

  constructor() {
    // No club-facing pages (routes) or menu entries - settings only.
    super(MODULE_ID, []);

    this.settingsRoutes = computed(() => [
      {
        path: MODULE_ID,
        component: SettingsComponent,
        // Route-level, because provideModuleI18n() returns environment providers, which a
        // component's `providers` can't hold.
        providers: [...provideModuleI18n({ bundles: I18N_BUNDLES })],
      },
    ]);
  }
}
