# CRM Reclutamento

Web app mobile per la gestione dei contatti Bootcamp di Stefano.

## Architettura

- GitHub Pages ospita `index.html` e il logo ufficiale.
- Google Apps Script in `backend/Code.gs` gestisce accessi, lettura e scrittura.
- Google Sheets conserva contatti, risposte, eventi e prossimi passi.
- Google Calendar riceve gli appuntamenti creati dalla scheda contatto.

## Pubblicazione

1. Copiare `backend/Code.gs` nel progetto Google Apps Script collegato al database.
2. Impostare le due password nella funzione `configuraAccessi`, eseguirla una volta e rimuovere i valori dal sorgente.
3. Distribuire Apps Script come web app e copiare il relativo indirizzo `/exec`.
4. L'indirizzo della distribuzione Apps Script è già collegato in `index.html`.
5. Pubblicare il repository con GitHub Pages dalla root del branch `main`.

Le password vengono confrontate nel backend e non devono essere pubblicate nel repository.
