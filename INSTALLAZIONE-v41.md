# CRM Reclutamento — versione 41

Questa versione include l'esportazione PDF delle visite nave e la PWA installabile.

## Caricamento su GitHub

1. Estrai questo ZIP sul computer.
2. Apri il repository CRM-RECLUTAMENTO, poi Add file → Upload files.
3. Carica tutti i file e la cartella icons nella radice del repository. index.html e firebase-crm.js sostituiscono quelli esistenti. Non caricare lo ZIP né una cartella release-v41 che li contenga.
4. Conferma con Commit changes e attendi la pubblicazione riuscita in Actions.
5. Apri https://consulentidiviaggio.github.io/CRM-RECLUTAMENTO/?v=41 e ricarica la pagina.

Non occorre sostituire FirebaseSync.gs, modificare le regole Firebase o fare un deployment Apps Script per questo aggiornamento.

## Installazione iPhone

Apri il link in Safari → Condividi → Aggiungi alla schermata Home → Aggiungi. Se disponibile attiva Apri come app web. Apri l'icona e accedi con l'account Firebase abituale. La sessione della nuova app potrebbe essere distinta da quella di Safari.

Su Android/PC usa Installa app oppure l'opzione di installazione nel menu del browser.

## PDF ed Excel eventi

Apri Eventi → visita nave → Esporta PDF. Il PDF ha logo, data/località, Nome, Cognome, Valore, Presente e Assente. Prima i consulenti, poi gli ospiti; ogni gruppo è ordinato per cognome e nome. Valore è Consulente oppure Ospite (cognome consulente). Il ruolo scelto nella scheda prevale su quello importato. L'Excel usa lo stesso ordine e aggiunge Valore.

## Verifica dopo pubblicazione

Prova login Stefano e Fabio, apertura contatti/eventi, salvataggio e riapertura di una scheda, WhatsApp Business e download PDF/Excel. Ripeti dalla nuova icona su iPhone. Se il browser propone Apri/Condividi invece del download per il PDF, usa Salva su File.

La PWA resta online: nessuna sincronizzazione offline è stata aggiunta. Il service worker non conserva codice o dati CRM in Cache Storage e chiede le risorse locali alla rete. Le librerie Firebase/PDF/Excel provengono dai CDN già utilizzati dall'app.
