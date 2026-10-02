// Live view of every request the mocked ZweefApp (WireMock, docker-compose.yml) receives:
//   node dev/mock/watch.mjs            show new requests as they arrive (Ctrl+C to stop)
//   node watch.mjs --all      also print the requests already in the journal
//   node watch.mjs --reset    empty the journal first
// Polls WireMock's admin API (http://localhost:9998/__admin/requests); override with MOCK_URL.
const base = process.env.MOCK_URL ?? 'http://localhost:9998';
const args = process.argv.slice(2);
const seen = new Set();

async function journal() {
  const response = await fetch(`${base}/__admin/requests`);
  const { requests } = await response.json();
  return requests.sort((a, b) => a.request.loggedDate - b.request.loggedDate);
}

function print({ request, response, wasMatched }) {
  const time = new Date(request.loggedDate).toLocaleTimeString();
  const apiKey = request.headers?.['X-API-KEY'];
  console.log(`\n${time}  ${request.method} ${request.url}  ->  ${response.status}${wasMatched ? '' : '  (NO MATCHING STUB)'}`);
  if (apiKey) console.log(`   X-API-KEY: ${apiKey}`);
  if (request.body) {
    try { console.log('   ' + JSON.stringify(JSON.parse(request.body), null, 2).replace(/\n/g, '\n   ')); }
    catch { console.log('   ' + request.body); }
  }
}

if (args.includes('--reset')) await fetch(`${base}/__admin/requests`, { method: 'DELETE' });
for (const entry of await journal()) {
  seen.add(entry.id);
  if (args.includes('--all')) print(entry);
}
console.log(`Watching ${base}/__admin/requests ... (Ctrl+C to stop)`);
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  try {
    for (const entry of await journal()) {
      if (!seen.has(entry.id)) { seen.add(entry.id); print(entry); }
    }
  } catch (error) {
    console.log(`(mock not reachable: ${error.cause?.code ?? error.message})`);
  }
}
