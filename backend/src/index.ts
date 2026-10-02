/**
 * ZweefApp synchronisation - the backend part of this module (see ../../README.md and tabbr.config.json for the
 * triggers that call into this). Each thing that is synchronised lives in its own folder (flights/ now; persons and
 * memberships get theirs later) and is exported here under the handler names tabbr.config.json refers to; what the
 * parts share - the connection to ZweefApp - is in connection.ts.
 *
 * ZweefApp's public API: https://documenter.getpostman.com/view/25434528/2s8ZDX5PRi
 */

export { onFlightSaved, pollFlights } from './flights/sync';
