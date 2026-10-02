// Gives the mocked ZweefApp something to return for the module's pull, so it has a flight to import:
// one guest flight changed today, and nothing deleted. Re-run to reset (stubs are runtime-only and
// disappear when the container restarts). Edit `guestFlight` to try other shapes.
//   npm run mock:seed
const base = process.env.MOCK_URL ?? 'http://localhost:9998';
const today = new Date().toISOString().substring(0, 10);

const guestFlight = {
  uuid: 'za-guest-4',
  datum: today,
  vertrek_vliegveld: 'EBGG',
  aankomst_vliegveld: 'EBGG',
  gezagvoerder_id: 67,
  gezagvoerder_naam: 'Jan Janssens',
  tweede_inzittende_id: 999,
  tweede_inzittende_naam: 'Gast Passagier',
  start_methode: 'lier',
  kist_id: 7,
  registratie: 'OO-TST',
  start_tijd: '10:00',
  landings_tijd: '10:20',
  vluchtduur: 20,
  is_fis: false,
  is_training: true,
  is_examen: false,
  is_profcheck: false,
  is_deleted: false,
};

const stub = (request, body) => fetch(`${base}/__admin/mappings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ priority: 1, request, response: { status: 200, headers: { 'Content-Type': 'application/json' }, jsonBody: body } }),
});

// WireMock: more specific stubs (query parameters) win over mappings/flights-get.json's catch-all.
await stub({ method: 'GET', urlPath: '/club/test/api/flights.json', queryParameters: { date_updated: { equalTo: today } } }, [guestFlight]);
await stub({ method: 'GET', urlPath: '/club/test/api/flights.json', queryParameters: { deleted: { equalTo: '1' } } }, []);
console.log(`Mock now returns guest flight "${guestFlight.uuid}" for date_updated=${today}.`);
