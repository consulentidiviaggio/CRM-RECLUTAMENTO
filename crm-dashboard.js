/* Regole pure della dashboard: nessuna lettura o scrittura remota. */
(function(root) {
  'use strict';
  const first = 'Primo messaggio inviato', call = 'Proposta chiamata WhatsApp';
  const material = 'Materiale inviato', followup = 'Follow-up WhatsApp inviato';
  function millis(value) {
    if (value?.toDate) value = value.toDate();
    if (value == null) return 0;
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : 0;
  }
  function romeDay(value) {
    const n = millis(value);
    return n ? new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n)) : '';
  }
  function nextRomeMidnight(now = Date.now()) {
    const day = romeDay(now);
    let low = now, high = now + 26*60*60*1000;
    while(high-low > 1) {
      const mid = Math.floor((low+high)/2);
      if(romeDay(mid) === day) low=mid; else high=mid;
    }
    return high;
  }
  function ordered(events) {
    return events.filter(e => !e.deleted).slice().sort((a,b) => millis(a.createdAt)-millis(b.createdAt) || String(a.id||'').localeCompare(String(b.id||'')));
  }
  function eventType(value) {
    const normalized = String(value || '').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('it');
    const aliases = {
      'iscritto il giorno prima':'Messaggio iscritto giorno prima',
      'messaggio iscritto il giorno prima':'Messaggio iscritto giorno prima',
      'iscritto giorno prima':'Messaggio iscritto giorno prima',
      'iscritto il giorno stesso':'Messaggio iscritto giorno stesso',
      'messaggio iscritto il giorno stesso':'Messaggio iscritto giorno stesso',
      'iscritto giorno stesso':'Messaggio iscritto giorno stesso',
      'link partecipazione':'Link Bootcamp inviato',
      'link partecipazione inviato':'Link Bootcamp inviato',
      'link zoom inviato':'Link Bootcamp inviato'
    };
    if(aliases[normalized]) return aliases[normalized];
    const known=[first,call,material,followup,'Messaggio iscritto giorno prima','Messaggio iscritto giorno stesso','Link Bootcamp inviato','Reminder Bootcamp inviato','Non interessato','Attivo come consulente','Attivazione completata'];
    return known.find(type => type.toLocaleLowerCase('it') === normalized) || String(value || '').trim();
  }
  function linkDelivered(type) {
    return ['Messaggio iscritto giorno prima','Messaggio iscritto giorno stesso','Link Bootcamp inviato','Reminder Bootcamp inviato'].includes(eventType(type));
  }
  function phase(type) {
    if(linkDelivered(type)) return 'Link partecipazione';
    if(type === 'Richiesta offerta Bootcamp') return 'Richiesta promo Bootcamp';
    if(type === 'Richiesta app. post Bootcamp') return 'Richiesta chiamata post Bootcamp';
    return type;
  }
  function urgent(contact, events, now = Date.now()) {
    const history = ordered(events).map(event => ({...event,type:eventType(event.type)}));
    if (history.some(e => [material,'Messaggio iscritto giorno prima','Messaggio iscritto giorno stesso','Link Bootcamp inviato','Reminder Bootcamp inviato','Non interessato','Attivo come consulente','Attivazione completata'].includes(e.type))) return [];
    // Queste fasi usano i messaggi Bootcamp; il flusso dei diretti resta invariato.
    if (String(contact.contactType || '').toUpperCase() === 'DIRETTO') return [];
    const progress = new Set([call,'Primo appuntamento fissato','Appuntamento fissato','Chiamata fissata','Chiamata effettuata','Telefonata effettuata','Interesse confermato','Zoom proposta','Bootcamp confermato','Link Bootcamp inviato','Reminder Bootcamp inviato','Messaggio iscritto giorno prima','Messaggio iscritto giorno stesso','Post Bootcamp 1','Post Bootcamp 2']);
    const result = [];
    for (const [phase,type,reason] of [['first',first,'Primo messaggio senza passaggio successivo'],['call',call,'Chiamata non effettuata']]) {
      // Un solo ciclo per fase: clic ripetuti non spostano la scadenza.
      const start = history.find(e => e.type === type && millis(e.createdAt));
      if (!start) continue;
      const startAt = millis(start.createdAt);
      if (now-startAt < 5*24*60*60*1000) continue;
      const later = history.filter(e => millis(e.createdAt) >= startAt && e.id !== start.id);
      if (later.some(e => e.type === followup && (e.alertPhase === phase || !e.alertPhase))) continue;
      if (phase === 'first' && later.some(e => progress.has(e.type))) continue;
      result.push({phase,reason,sourceEventId:start.id,startedAt:startAt});
    }
    return result;
  }
  function appointmentVisible(step, now = Date.now()) {
    return !!romeDay(step.when) && romeDay(step.when) >= romeDay(now) && !['COMPLETATO','CANCELLATO'].includes(String(step.status||'').toUpperCase());
  }
  const api = {millis,romeDay,nextRomeMidnight,ordered,urgent,appointmentVisible,linkDelivered,phase};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CRM_DASHBOARD = api;
})(typeof window !== 'undefined' ? window : globalThis);
