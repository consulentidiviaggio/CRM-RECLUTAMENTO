// v47: online only. No contact data, credentials or app code stored in Cache Storage.
const RELEASE = 'crm-reclutamento-v47';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => {
    if (event.request.mode === 'navigate') {
      return new Response('<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM Reclutamento</title><body style="font-family:sans-serif;padding:32px"><h1>Connessione non disponibile</h1><p>Il CRM richiede una connessione Internet. Riconnettiti e riapri l’app.</p><button onclick="location.reload()">Riprova</button></body></html>', {status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});
    }
    return Response.error();
  }));
});
