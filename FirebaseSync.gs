/**
 * CRM Reclutamento - sincronizzazione Google Sheets -> Firebase Firestore
 * Aggiungere questo file al progetto Apps Script esistente.
 * Non sostituisce Code.gs.
 */
const FBSYNC_CONFIG = Object.freeze({
  projectId: 'crm-reclutamento',
  spreadsheetId: '1sxMGwQEDC3-vKddo2rQeMT3aNExVZ1U091fybJTQptQ',
  sheetName: 'CONTATTI',
  directSpreadsheetId: '1oFpqU0RciF6ftmcS0JXYQlZB2FcVKjfpkpivafvjGOc',
  directSheetName: 'DESTINAZIONE',
  eventsSpreadsheetId: '1ZCj-OLlc-KcKEZoT5HWg4_SwDWSHLC2VfQ-37rcQetU',
  eventsSheetName: 'Foglio1',
  timeZone: 'Europe/Rome',
  hashProperty: 'FIREBASE_CONTACT_HASHES_V1',
  eventHashProperty: 'FIREBASE_SHIP_EVENT_HASHES_V1'
});

function sincronizzaContattiFirebase() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {ok: false, message: 'Sincronizzazione già in corso'};
  try {
    const sheet = SpreadsheetApp.openById(FBSYNC_CONFIG.spreadsheetId)
      .getSheetByName(FBSYNC_CONFIG.sheetName);
    if (!sheet) throw new Error('Scheda CONTATTI non trovata');
    if (sheet.getLastRow() < 2) return {ok: true, aggiornati: 0, ignorati: 0};

    const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
    const values = range.getValues();
    const headers = values.shift().map(fbNorm_);
    const columns = {};
    headers.forEach((header, index) => { if (header) columns[header] = index; });
    const leadColumn = fbColumn_(columns, ['LEAD ID', 'ID CONTATTO', 'ID']);
    if (leadColumn < 0) throw new Error('Colonna LEAD ID non trovata');

    const previousHashes = fbReadHashes_();
    const nextHashes = Object.assign({}, previousHashes);
    const existingIds = fbExistingContactIds_();
    const pending = [];
    let ignored = 0;

    values.forEach((row, index) => {
      if (!row.some(value => value !== '' && value != null)) return;
      let leadId = String(row[leadColumn] || '').trim();
      if (!leadId) {
        const assigned = String(fbPick_(row, columns, ['OPERATORE', 'ASSEGNATO A', 'REFERENTE']) || 'Stefano');
        const prefix = fbNorm_(assigned).indexOf('FABIO') >= 0 ? 'FB' : 'ST';
        leadId = prefix + '-' + Utilities.formatDate(new Date(), FBSYNC_CONFIG.timeZone, 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 8).toUpperCase();
        row[leadColumn] = leadId;
        sheet.getRange(index + 2, leadColumn + 1).setValue(leadId);
      }

      const operatorCode = fbNorm_(leadId).indexOf('FB-') === 0 ? 'FB' : 'ST';
      const firstName = String(fbPick_(row, columns, ['NOME']) || '').trim();
      const lastName = String(fbPick_(row, columns, ['COGNOME']) || '').trim();
      const fullName = String(fbPick_(row, columns, ['NOME E COGNOME', 'NOME COMPLETO']) || '').trim() || (firstName + ' ' + lastName).trim();
      const phone = fbPhone_(fbPick_(row, columns, ['CELLULARE', 'TELEFONO', 'PHONE']));
      const email = String(fbPick_(row, columns, ['EMAIL', 'E-MAIL']) || '').trim().toLowerCase();
      if (!fullName || (!phone && !email)) { ignored++; return; }

      const sourceData = {
        leadId: leadId,
        operatorCode: operatorCode,
        operatorName: operatorCode === 'FB' ? 'Fabio' : 'Stefano',
        contactType: 'BOOTCAMP',
        firstName: firstName,
        lastName: lastName,
        name: fullName,
        email: email,
        phone: phone,
        region: String(fbPick_(row, columns, ['REGIONE', 'PROVINCIA']) || '').trim(),
        source: String(fbPick_(row, columns, ['AFFILIATO', 'FONTE', 'SOURCE']) || '').trim(),
        bootcampDate: fbDate_(fbPick_(row, columns, ['DATA BOOTCAMP', 'BOOTCAMP', 'DATA DEL BOOTCAMP'])),
        registrationDate: fbDate_(fbPick_(row, columns, ['DATA REGISTRAZIONE', 'DATA INSERIMENTO', 'INSERITO IL']))
      };
      const hash = fbHash_(sourceData);
      if (previousHashes[leadId] === hash) return;
      nextHashes[leadId] = hash;
      pending.push({leadId: leadId, data: sourceData, isNew: !existingIds[leadId]});
    });

    const directSheet = SpreadsheetApp.openById(FBSYNC_CONFIG.directSpreadsheetId)
      .getSheetByName(FBSYNC_CONFIG.directSheetName);
    if (!directSheet) throw new Error('Scheda DESTINAZIONE dei contatti diretti non trovata');
    if (directSheet.getLastRow() >= 2) {
      const directValues = directSheet.getRange(1, 1, directSheet.getLastRow(), directSheet.getLastColumn()).getValues();
      const directHeaders = directValues.shift().map(fbNorm_);
      const directColumns = {};
      directHeaders.forEach((header, index) => { if (header) directColumns[header] = index; });
      directValues.forEach(row => {
        if (!row.some(value => value !== '' && value != null)) return;
        const firstName = fbText_(fbPick_(row, directColumns, ['NOME']));
        const lastName = fbText_(fbPick_(row, directColumns, ['COGNOME']));
        const fullName = (firstName + ' ' + lastName).trim();
        const phone = fbPhone_(fbPick_(row, directColumns, ['CELLULARE', 'TELEFONO', 'PHONE']));
        const email = String(fbPick_(row, directColumns, ['EMAIL', 'E-MAIL']) || '').trim().toLowerCase();
        if (!fullName || (!phone && !email)) { ignored++; return; }
        const leadId = 'ST-DIR-' + fbHash_(email + '|' + phone).slice(0, 12).toUpperCase();
        const sourceData = {
          leadId: leadId,
          operatorCode: 'ST',
          operatorName: 'Stefano',
          contactType: 'DIRETTO',
          firstName: firstName,
          lastName: lastName,
          name: fullName,
          email: email,
          phone: phone,
          region: String(fbPick_(row, directColumns, ['REGIONE', 'PROVINCIA']) || '').trim(),
          source: String(fbPick_(row, directColumns, ['AFFILIATO', 'FONTE', 'SOURCE']) || 'Diretto').trim(),
          registrationDate: fbDate_(fbPick_(row, directColumns, ['INSERITO IL', 'DATA INSERIMENTO', 'DATA REGISTRAZIONE'])),
          bootcampDate: null
        };
        const hash = fbHash_(sourceData);
        if (previousHashes[leadId] === hash) return;
        nextHashes[leadId] = hash;
        pending.push({leadId: leadId, data: sourceData, isNew: !existingIds[leadId]});
      });
    }

    for (let start = 0; start < pending.length; start += 400) {
      fbCommitContacts_(pending.slice(start, start + 400));
    }
    const eventResult = fbSyncShipEvents_();
    PropertiesService.getScriptProperties().setProperty(FBSYNC_CONFIG.hashProperty, JSON.stringify(nextHashes));
    return {ok: true, aggiornati: pending.length, ignorati: ignored, partecipantiEventi: eventResult.aggiornati};
  } finally {
    lock.releaseLock();
  }
}

function attivaSincronizzazioneFirebase() {
  ScriptApp.getProjectTriggers()
    .filter(trigger => trigger.getHandlerFunction() === 'sincronizzaContattiFirebase')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('sincronizzaContattiFirebase').timeBased().everyMinutes(5).create();
  const result = sincronizzaContattiFirebase();
  return 'Trigger ogni 5 minuti attivato. Contatti aggiornati: ' + result.aggiornati;
}

function testConnessioneFirebase() {
  const url = 'https://firestore.googleapis.com/v1/projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents/contacts?pageSize=1';
  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Firestore HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
  return 'Connessione Firebase riuscita';
}

function forzaProssimaSincronizzazioneFirebase() {
  PropertiesService.getScriptProperties().deleteProperty(FBSYNC_CONFIG.hashProperty);
  PropertiesService.getScriptProperties().deleteProperty(FBSYNC_CONFIG.eventHashProperty);
  return sincronizzaContattiFirebase();
}

function fbSyncShipEvents_() {
  const sheet = SpreadsheetApp.openById(FBSYNC_CONFIG.eventsSpreadsheetId).getSheetByName(FBSYNC_CONFIG.eventsSheetName);
  if (!sheet) throw new Error('Scheda eventi ' + FBSYNC_CONFIG.eventsSheetName + ' non trovata');
  if (sheet.getLastRow() < 2) return {aggiornati: 0};
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(fbNorm_);
  const columns = {};
  headers.forEach((header, index) => { if (header) columns[header] = index; });
  const previousHashes = fbReadPropertyJson_(FBSYNC_CONFIG.eventHashProperty);
  const nextHashes = Object.assign({}, previousHashes);
  const pending = [];
  values.forEach(row => {
    if (!row.some(value => value !== '' && value != null)) return;
    const eventName = fbText_(fbPick_(row, columns, ['VISITA NAVE']));
    const lastName = fbText_(fbPick_(row, columns, ['COGNOME']));
    const firstName = fbText_(fbPick_(row, columns, ['NOME']));
    const phone = fbPhone_(fbPick_(row, columns, ['CELLULARE']));
    const email = fbText_(fbPick_(row, columns, ['MAIL @BORSAVIAGGI.NET', 'EMAIL', 'MAIL'])).toLowerCase();
    const consultantSurname = fbText_(fbPick_(row, columns, ['COGNOME CONSULENTE']));
    if (!eventName || !lastName || !firstName) return;
    const lastKey = fbPersonKey_(lastName);
    const consultantKey = fbPersonKey_(consultantSurname);
    const isConsultant = consultantKey === lastKey || consultantKey.indexOf(lastKey + ' ') === 0;
    const participantId = 'SHIP-' + fbHash_(eventName + '|' + lastName + '|' + firstName + '|' + phone + '|' + consultantSurname).slice(0, 28).toUpperCase();
    const data = {participantId, eventName, lastName, firstName, phone, email, consultantSurname, isConsultant};
    const hash = fbHash_(data);
    if (previousHashes[participantId] === hash) return;
    nextHashes[participantId] = hash;
    pending.push({participantId, data});
  });
  for (let start = 0; start < pending.length; start += 400) {
    const now = new Date();
    const writes = pending.slice(start, start + 400).map(item => {
      const fields = Object.assign({}, item.data, {updatedAt: now});
      return {
        update: {name:'projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents/shipParticipants/' + encodeURIComponent(item.participantId), fields:fbFirestoreFields_(fields)},
        updateMask: {fieldPaths:Object.keys(fields)}
      };
    });
    fbFetchJson_('https://firestore.googleapis.com/v1/projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents:commit', {method:'post', payload:JSON.stringify({writes:writes})});
  }
  PropertiesService.getScriptProperties().setProperty(FBSYNC_CONFIG.eventHashProperty, JSON.stringify(nextHashes));
  return {aggiornati:pending.length};
}

function fbReadPropertyJson_(key) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  try { return value ? JSON.parse(value) : {}; } catch (error) { return {}; }
}

function fbPersonKey_(value) {
  return fbNorm_(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
}

function fbExistingContactIds_() {
  const ids = {};
  let token = '';
  do {
    let url = 'https://firestore.googleapis.com/v1/projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents/contacts?pageSize=1000&mask.fieldPaths=leadId';
    if (token) url += '&pageToken=' + encodeURIComponent(token);
    const result = fbFetchJson_(url, {method: 'get'});
    (result.documents || []).forEach(document => {
      const id = decodeURIComponent(document.name.split('/').pop());
      ids[id] = true;
    });
    token = result.nextPageToken || '';
  } while (token);
  return ids;
}

function fbCommitContacts_(contacts) {
  const now = new Date();
  const writes = contacts.map(contact => {
    const fields = Object.assign({}, contact.data, {updatedAt: now});
    if (contact.isNew) {
      fields.status = 'Da lavorare';
      fields.importedAt = now;
    }
    const fieldPaths = Object.keys(fields);
    return {
      update: {
        name: 'projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents/contacts/' + encodeURIComponent(contact.leadId),
        fields: fbFirestoreFields_(fields)
      },
      updateMask: {fieldPaths: fieldPaths}
    };
  });
  const url = 'https://firestore.googleapis.com/v1/projects/' + FBSYNC_CONFIG.projectId + '/databases/(default)/documents:commit';
  fbFetchJson_(url, {method: 'post', payload: JSON.stringify({writes: writes})});
}

function fbFetchJson_(url, options) {
  const request = Object.assign({}, options || {}, {
    headers: Object.assign({}, (options && options.headers) || {}, {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    }),
    muteHttpExceptions: true
  });
  const response = UrlFetchApp.fetch(url, request);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Firestore HTTP ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function fbFirestoreFields_(object) {
  const fields = {};
  Object.keys(object).forEach(key => { fields[key] = fbFirestoreValue_(object[key]); });
  return fields;
}

function fbFirestoreValue_(value) {
  if (value instanceof Date && !isNaN(value)) return {timestampValue: value.toISOString()};
  if (value === null || value === undefined || value === '') return {nullValue: null};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
  return {stringValue: String(value)};
}

function fbReadHashes_() {
  const value = PropertiesService.getScriptProperties().getProperty(FBSYNC_CONFIG.hashProperty);
  try { return value ? JSON.parse(value) : {}; } catch (error) { return {}; }
}

function fbHash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value));
  return bytes.map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
}

function fbColumn_(columns, names) {
  for (let index = 0; index < names.length; index++) {
    const key = fbNorm_(names[index]);
    if (Object.prototype.hasOwnProperty.call(columns, key)) return columns[key];
  }
  return -1;
}

function fbPick_(row, columns, names) {
  const index = fbColumn_(columns, names);
  return index >= 0 ? row[index] : '';
}

function fbNorm_(value) { return String(value == null ? '' : value).trim().toUpperCase(); }

function fbText_(value) {
  return String(value == null ? '' : value).trim()
    .replace(/â€™/g, '’').replace(/â€œ|â€/g, '"').replace(/Ã /g, 'à')
    .replace(/Ã¨/g, 'è').replace(/Ã©/g, 'é').replace(/Ã¬/g, 'ì')
    .replace(/Ã²/g, 'ò').replace(/Ã¹/g, 'ù');
}

function fbPhone_(value) {
  let phone = String(value == null ? '' : value).replace(/\.0$/, '').replace(/\D/g, '');
  if (phone.indexOf('39') === 0 && phone.length > 10) phone = phone.slice(2);
  return phone;
}

function fbDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed;
}
