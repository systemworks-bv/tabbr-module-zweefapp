const { withNativeFederation, share } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: 'tabbrModule',

  // What tabbr loads: the "exposedModule" key in tabbr.config.json must match the key here.
  // (No leading './' on the file path: native-federation drops entry paths starting with '.'.)
  exposes: {
    './Module': 'src/app/module/module.ts',
  },

  // Packages that must be the SAME instance as tabbr's own at runtime. tabbr reuses its own copy
  // for every version it is compatible with (same major, tabbr not older than your version), so
  // don't upgrade Angular or rxjs past the versions in package.json - those match tabbr.
  //
  // @tabbr/module-sdk is deliberately NOT shared: its tokens get their identity by name, so your
  // module works whatever SDK version tabbr itself runs.
  //
  // keycloak-angular and @jsverse/transloco are shared so the dev preview (npm start) and the SDK's
  // dev bridge / i18n helpers all use one copy of them.
  shared: {
    ...share({
      '@angular/core': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      '@angular/common': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      '@angular/router': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      '@angular/platform-browser': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      'rxjs': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      'keycloak-angular': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
      '@jsverse/transloco': { singleton: true, strictVersion: true, requiredVersion: 'auto', includeSecondaries: true },
    }),
  },

  sharedMappings: [],
});
