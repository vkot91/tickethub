import type { Config } from 'jest';

import base from './nest';

// Nest preset for services that hit the database. Adds the shared db lifecycle
// (fresh emulated Postgres per test) via setupFilesAfterEnv. The setup module is
// resolved from the consuming app's node_modules at run time, so this package
// needs no dependency on @tickethub/db.
// Consume via: export { default } from '@tickethub/jest-config/nest-db'
const config: Config = {
  ...base,
  setupFilesAfterEnv: ['@tickethub/db/testing/jest.setup'],
};

export default config;
