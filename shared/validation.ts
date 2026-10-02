import { ConnectionToValidate, validateConnection } from './connection-validation';
import { FlightSettings } from './settings';
import { validateFlights } from './flights/mapping-validation';
import { FieldCatalog, Issue } from './validation-types';

/** Everything wrong or doubtful in the whole configuration. */
export function validateConfiguration(connection: ConnectionToValidate, flights: FlightSettings, fields: FieldCatalog | null): Issue[] {
  return [...validateConnection(connection), ...validateFlights(flights, fields)];
}
