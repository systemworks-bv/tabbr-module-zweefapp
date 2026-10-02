import { TranslationBundleMap } from '@tabbr/module-sdk/i18n';

// One entry per language; the first one is the default. Used by module.ts (inside tabbr) and by
// app.config.ts (the dev preview).
export const I18N_BUNDLES: TranslationBundleMap = {
  nl: () => import('./i18n/nl'),
  en: () => import('./i18n/en'),
};
