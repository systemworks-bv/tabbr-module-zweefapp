import { initFederation } from '@angular-architects/native-federation';

initFederation().then(() => import('./bootstrap'));
