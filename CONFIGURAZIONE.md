# Configurazione prima di GitHub

## 1. Google Apps Script

Aprire il progetto **CRM Reclutamento** collegato al foglio database e verificare che il file `Codice.gs` contenga il contenuto di `backend/Code.gs`.

## 2. Accessi

In fondo al file, nella funzione `configuraAccessi`, sostituire soltanto:

- `INSERISCI_PASSWORD_STEFANO`
- `INSERISCI_PASSWORD_ADMIN`

Lasciare lo username operatore impostato su `stefano`.

Selezionare `configuraAccessi` dal menu delle funzioni, premere **Esegui** e autorizzare lo script. Dopo l'esecuzione, togliere nuovamente le password dal codice e salvare: le impronte cifrate resteranno nelle proprietà private del progetto.

## 3. Distribuzione Apps Script

Selezionare **Esegui il deployment → Nuovo deployment → Applicazione web**.

- Esegui come: **Me**
- Chi ha accesso: **Chiunque**

Copiare l'indirizzo che termina con `/exec`.

## 4. Collegamento della web app

In `index.html` sostituire `__APPS_SCRIPT_URL__` con l'indirizzo `/exec` copiato al punto precedente.

## 5. Verifica prima del caricamento

- Accesso operatore con user `stefano`.
- Accesso amministrazione con la sola password.
- Visualizzazione appuntamenti.
- Visualizzazione dei contatti dell'ultimo Bootcamp.
- Ordinamento con i nuovi contatti **Da lavorare** in alto.
- Tap su un evento e controllo della nuova riga nella scheda `EVENTI`.
- Scelta del prossimo step e controllo nella scheda `PROSSIMI_STEP`.
- Creazione dell'appuntamento nel Google Calendar di Stefano.

Solo dopo questa verifica caricare i file su GitHub e attivare GitHub Pages.
