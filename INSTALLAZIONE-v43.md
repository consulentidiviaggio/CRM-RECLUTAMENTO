# CRM Reclutamento — versione 43

## 1. Firebase
Apri Firestore → Regole. Aggiungi il blocco di REGOLE-BOOTCAMP.txt dentro match /databases/{database}/documents, accanto agli altri match, poi Pubblica. Conserva tutte le regole esistenti. Usa gli helper isAdmin e ownCode già presenti nel CRM. La nuova raccolta bootcamps sarà creata al primo salvataggio dall'app: non crearla manualmente.

## 2. GitHub
Estrai lo ZIP e carica nella radice del repository tutti i file e la cartella icons, sostituendo quelli esistenti. Non caricare lo ZIP né una cartella release-v43. Conferma Commit changes e attendi la pubblicazione riuscita in Actions.

Apri https://consulentidiviaggio.github.io/CRM-RECLUTAMENTO/?v=43

Non occorre sostituire FirebaseSync.gs o fare deployment Apps Script.

## 3. Ora e link Zoom
Con Stefano, apri un contatto Bootcamp → Messaggi WhatsApp Bootcamp → Configurazione Bootcamp. La data viene dal contatto: imposta ora italiana e link Zoom completo, poi Salva configurazione Bootcamp. Configurazione condivisa per la stessa data, visibile anche a Fabio. Per la nuova edizione apri un contatto associato alla nuova data e salva una nuova configurazione. Le configurazioni precedenti restano distinte.

Fabio può usare i messaggi ma la configurazione è modificabile solo da Stefano/amministratore. Dopo una modifica, riapri la scheda già aperta sull'altro dispositivo per caricare la configurazione aggiornata.

## 4. Messaggi
Otto pulsanti, con tre varianti per il secondo: mattina 11–13, pomeriggio 15–17, weekend (lunedì 15–17). La scelta del momento di utilizzo resta manuale: 24 ore prima, giorno stesso e weekend sono varianti di testo, non invii programmati.

Tutti i messaggi includono nome, operatore, data, ora e link Zoom. Nei testi che non contenevano questi dati, sono aggiunti in fondo. Data/giorno e orario provengono dal Bootcamp associato. Il messaggio primo contatto è identico per Stefano e Fabio, incluso l'uso delle emoji. Il flusso dei contatti diretti resta quello esistente.

Il click salva risposte e evento, poi apre WhatsApp Business su iPhone; su PC apre WhatsApp Web in una nuova scheda. Consenti i popup del CRM. L'invio effettivo viene confermato dall'operatore dentro WhatsApp. Un errore di salvataggio impedisce l'apertura. Ogni nuovo click registra un'altra voce in cronologia; il riepilogo resta 0/1 per tipo di evento.

La proposta di chiamata registra Proposta chiamata WhatsApp, non Chiamata fissata. L'appuntamento e la telefonata vanno segnati con le azioni corrispondenti quando realmente avvenuti.

## 5. Riepilogo
Riepilogo Bootcamp crea Excel con tutti i tipi di eventi, nuove colonne 0/1, fonte, note chiamata come ultima colonna e foglio CRONOLOGIA. Ogni esportazione rilegge contatti ed eventi. Il file già scaricato non si aggiorna automaticamente. Fabio esporta solo i propri contatti.

PDF visite nave, presenze automatiche ospiti, PWA e favicon della versione 42 sono inclusi.

## Verifica dopo pubblicazione
Accedi con entrambi gli operatori; salva configurazione con Stefano e riapri una scheda con Fabio; verifica nome, data, ora e Zoom nel testo WhatsApp; verifica evento in timeline ed Excel. Ripeti da iPhone e dall'icona PWA. I test locali non sostituiscono questa verifica sugli account reali.
