(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyDR-CdASKdUqH_8YFt8E8cY3__aqGkCexs",
    authDomain: "crm-reclutamento.firebaseapp.com",
    projectId: "crm-reclutamento",
    storageBucket: "crm-reclutamento.firebasestorage.app",
    messagingSenderId: "5195788980",
    appId: "1:5195788980:web:4a3b54b19301278a5ddde1"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  const eventNames = [
    "Primo messaggio inviato", "Primo appuntamento fissato",
    "Non risponde", "Numero non raggiungibile", "Materiale inviato", "Interesse confermato",
    "Zoom proposta", "Bootcamp confermato", "Da richiamare",
    "Non interessato", "Attivo come consulente"
  ];
  const answerFields = [
    "MOTIVAZIONE PRINCIPALE", "ESPERIENZA TURISMO", "ORGANIZZA GIÀ VIAGGI",
    "OBIETTIVO", "TEMPO DISPONIBILE", "RISULTATO ATTESO",
    "OSTACOLO INIZIALE", "PROFILO", "CERTEZZA ATTIVITÀ 1-10",
    "CERTEZZA STRUTTURA 1-10", "CERTEZZA CAPACITÀ 1-10",
    "INTENZIONE DI PARTIRE 1-10", "FIDUCIA NEL REFERENTE", "NOTE CHIAMATA"
  ];

  let requestedLevel = "operator";
  let profile = null;
  let leads = [];
  let appointments = [];
  let current = null;
  let currentEvents = [];
  let savedEvents = new Set();
  let shipParticipants = [];
  let selectedShipEvent = "";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function esc(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[c]);
  }
  function norm(v) { return String(v ?? "").trim().toUpperCase(); }
  function phone(v) { return String(v || "").replace(/\.0$/, "").replace(/\D/g, "").replace(/^39(?=3)/, ""); }
  function jsDate(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === "number" && window.XLSX) {
      const x = XLSX.SSF.parse_date_code(v);
      return x ? new Date(x.y, x.m - 1, x.d, x.H || 0, x.M || 0, x.S || 0) : null;
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function dayKey(v) {
    const d = jsDate(v);
    return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
  }
  function formatDate(v, time = true) {
    const d = jsDate(v);
    if (!d) return "";
    return new Intl.DateTimeFormat("it-IT", time
      ? { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }
      : { day:"2-digit", month:"long", year:"numeric" }).format(d);
  }
  function toast(message, error = false) {
    const box = $("#toast");
    box.textContent = message;
    box.style.background = error ? "#a92f2f" : "#171717";
    box.classList.add("show");
    setTimeout(() => box.classList.remove("show"), error ? 7000 : 2400);
  }
  function statusClass(value) {
    const s = String(value || "").toLowerCase();
    if (s.includes("non interess") || s.includes("non lavorat")) return "rejected";
    if (s === "da lavorare") return "todo";
    return "done";
  }
  function eventStatus(type) {
    const t = norm(type);
    if (["ATTIVO COME CONSULENTE","ATTIVAZIONE COMPLETATA"].includes(t)) return "Attivato";
    if (t === "NON INTERESSATO") return "Non interessato";
    if (["NON RISPONDE","NUMERO NON RAGGIUNGIBILE","DA RICHIAMARE"].includes(t)) return "Da richiamare";
    if (["PRIMO APPUNTAMENTO FISSATO","APPUNTAMENTO FISSATO","CHIAMATA FISSATA"].includes(t)) return "Appuntamento fissato";
    return "Lavorato";
  }
  function combinedStatus(events, fallback, answers) {
    const statuses = events.map(eventStatus);
    for (const s of ["Attivato","Non interessato","Appuntamento fissato","Da richiamare","Lavorato"])
      if (statuses.includes(s)) return s;
    if (norm(fallback) === "DA LAVORARE" && Object.values(answers).some(v => String(v || "").trim())) return "Lavorato";
    return fallback || "Da lavorare";
  }
  function stepStatus(type) {
    const t = norm(type);
    if (t === "ATTIVATO") return "Attivato";
    if (t === "CHIUDERE NON INTERESSATO") return "Non interessato";
    if (["FISSARE ZOOM","CHIAMATA FISSATA","PRIMO APPUNTAMENTO FISSATO"].includes(t)) return "Appuntamento fissato";
    if (["RICHIAMARE","ZOOM DA FISSARE"].includes(t)) return "Da richiamare";
    if (["ATTENDERE DECISIONE","INVIARE CONTRATTO","INVIARE PROMOZIONE"].includes(t)) return "Interessato";
    return "Lavorato";
  }

  async function loadProfile(user) {
    const snap = await db.collection("users").doc(user.uid).get();
    if (!snap.exists) throw Error("Profilo operatore non configurato");
    profile = { uid: user.uid, ...snap.data() };
    return profile;
  }
  function applyOperator(name) {
    $("#operatorLabel").textContent = "Operatore " + name;
    $("#operatorAvatar").textContent = name.slice(0, 2).toUpperCase();
    $("#operatorGreeting").textContent = "Buongiorno, " + name;
    $("#contactsMenuButton").classList.toggle("hidden", String(profile?.operatorCode || "").toUpperCase() !== "ST");
  }
  function isStefano() {
    return String(profile?.operatorCode || "").toUpperCase() === "ST";
  }
  function hideWorkAreas() {
    $("#workspaceChoice").classList.add("hidden");
    $("#operatorApp").classList.add("hidden");
    $("#eventsApp").classList.add("hidden");
    $("#adminApp").classList.add("hidden");
  }
  function openWorkspaceChoice() {
    hideWorkAreas();
    $("#workspaceChoice").classList.remove("hidden");
  }

  async function loadShipEvents() {
    const cards = $("#shipEventCards");
    $("#shipEventDetail").classList.add("hidden");
    cards.classList.remove("hidden");
    cards.innerHTML = '<div class="empty">Caricamento eventi…</div>';
    try {
      const snap = await db.collection("shipParticipants").get();
      shipParticipants = snap.docs.map(doc => ({ id:doc.id, ...doc.data() }));
      const groups = new Map();
      shipParticipants.forEach(person => {
        const name = String(person.eventName || "").trim();
        if (!name) return;
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(person);
      });
      if (!groups.size) {
        cards.innerHTML = '<div class="empty">Nessun evento sincronizzato. Esegui la sincronizzazione da Google Sheets.</div>';
        return;
      }
      cards.innerHTML = [...groups.entries()].sort((a,b) => a[0].localeCompare(b[0], "it")).map(([name, people]) => `
        <article class="event-card">
          <div><span class="event-date">Visita nave</span><h2>${esc(name)}</h2><p>${people.length} partecipanti</p></div>
          <button type="button" data-ship-event="${esc(name)}">Apri evento</button>
        </article>`).join("");
      $$('[data-ship-event]').forEach(button => button.onclick = () => openShipEvent(button.dataset.shipEvent));
    } catch (error) {
      cards.innerHTML = '<div class="empty">Impossibile caricare gli eventi.</div>';
      toast(error.message, true);
    }
  }

  function openShipEvent(eventName) {
    const changedEvent = selectedShipEvent !== eventName;
    selectedShipEvent = eventName;
    if (changedEvent && $("#shipParticipantSearch")) $("#shipParticipantSearch").value = "";
    $("#shipEventCards").classList.add("hidden");
    $("#shipEventDetail").classList.remove("hidden");
    const allPeople = shipParticipants.filter(person => person.eventName === eventName)
      .sort((a,b) => (`${a.lastName} ${a.firstName}`).localeCompare(`${b.lastName} ${b.firstName}`, "it"));
    const query = norm($("#shipParticipantSearch")?.value || "");
    const people = query ? allPeople.filter(person => norm([
      person.lastName, person.firstName, person.phone, person.email, person.consultantSurname
    ].join(" ")).includes(query)) : allPeople;
    $("#shipEventTitle").textContent = eventName;
    $("#shipEventCount").textContent = query ? `${people.length} di ${allPeople.length} partecipanti` : `${allPeople.length} partecipanti`;
    $("#shipEmbarkTime").value = String(allPeople.find(person => person.embarkTime)?.embarkTime || "10:30");
    $("#shipParticipants").innerHTML = people.map(person => {
      const status = norm(person.attendanceStatus);
      const isConsultant = person.roleOverride ? norm(person.roleOverride) === "CONSULENTE" : Boolean(person.isConsultant);
      const canChooseRole = person.surnameMatches === true || (person.surnameMatches == null && person.isConsultant === true);
      const details = isConsultant
        ? `<span class="participant-kind">Consulente</span><h3>${esc(person.lastName)} ${esc(person.firstName)}</h3><p>${esc(person.phone || "Cellulare non indicato")}</p><p>${esc(person.email || "Email non indicata")}</p>`
        : `<span class="participant-kind">Partecipante</span><h3>${esc(person.lastName)} ${esc(person.firstName)}</h3><p>Consulente: ${esc(person.consultantSurname || "Non indicato")}</p>`;
      const roleChoice = canChooseRole ? `<div class="role-choice">
        <button type="button" class="${isConsultant ? "active" : ""}" data-role="Consulente">Consulente</button>
        <button type="button" class="${!isConsultant ? "active" : ""}" data-role="Partecipante">Partecipante</button>
      </div>` : "";
      const whatsapp = isConsultant ? `<div class="whatsapp-event-actions">
        <button type="button" data-event-whatsapp="MSC">WhatsApp MSC</button>
        <button type="button" data-event-whatsapp="Costa">WhatsApp Costa</button>
        <button type="button" data-event-whatsapp="LIBERO">Messaggio libero</button>
      </div>` : "";
      return `<article class="participant-card" data-participant-id="${esc(person.id)}">
        <div>${details}</div>
        <div class="participant-controls">
          ${roleChoice}${whatsapp}
          <div class="attendance-buttons">
            <button type="button" class="present ${status === "PRESENTE" ? "active" : ""}" data-attendance="Presente">Presente</button>
            <button type="button" class="absent ${status === "ASSENTE" ? "active" : ""}" data-attendance="Assente">Assente</button>
          </div>
        </div>
      </article>`;
    }).join("");
    $$("[data-attendance]").forEach(button => button.onclick = () => saveAttendance(button));
    $$("[data-role]").forEach(button => button.onclick = () => saveParticipantRole(button));
    $$("[data-event-whatsapp]").forEach(button => button.onclick = () => openEventWhatsApp(button));
  }

  async function saveManualConsultant(event) {
    event.preventDefault();
    const firstName = $("#manualFirstName").value.trim();
    const lastName = $("#manualLastName").value.trim();
    const mobile = phone($("#manualPhone").value);
    const email = $("#manualEmail").value.trim().toLowerCase();
    if (!firstName || !lastName || !mobile) return toast("Inserisci nome, cognome e cellulare", true);
    const button = $("#manualConsultantForm .save-manual");
    button.disabled = true;
    button.textContent = "Salvataggio…";
    try {
      const data = {
        eventName:selectedShipEvent, firstName, lastName, phone:mobile, email,
        consultantSurname:lastName, surnameMatches:true, isConsultant:true,
        roleOverride:"Consulente", origin:"INSERIMENTO MANUALE",
        embarkTime:$("#shipEmbarkTime").value || "10:30",
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        createdBy:profile.name
      };
      const reference = await db.collection("shipParticipants").add(data);
      shipParticipants.push({id:reference.id, ...data, createdAt:new Date()});
      $("#manualConsultantForm").reset();
      $("#manualConsultantForm").classList.add("hidden");
      openShipEvent(selectedShipEvent);
      toast("Consulente aggiunto all’evento ✓");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Salva consulente"; }
  }

  async function saveParticipantRole(button) {
    const card = button.closest("[data-participant-id]");
    const person = shipParticipants.find(item => item.id === card.dataset.participantId);
    if (!person) return;
    button.disabled = true;
    try {
      await db.collection("shipParticipants").doc(person.id).update({
        roleOverride:button.dataset.role,
        roleUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        roleUpdatedBy:profile.name
      });
      person.roleOverride = button.dataset.role;
      openShipEvent(selectedShipEvent);
      toast("Tipologia salvata: " + button.dataset.role + " ✓");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  function shipEventDateLabel(eventName) {
    const months = "GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE";
    const match = String(eventName || "").toUpperCase().match(new RegExp("(\\d{1,2})\\s+(" + months + ")"));
    return match ? `${Number(match[1])} ${match[2].toLowerCase()}` : String(eventName || "").trim();
  }

  function shipEventInfo(eventName) {
    const text = String(eventName || "").trim().replace(/\s+/g, " ");
    const months = {GENNAIO:0,FEBBRAIO:1,MARZO:2,APRILE:3,MAGGIO:4,GIUGNO:5,LUGLIO:6,AGOSTO:7,SETTEMBRE:8,OTTOBRE:9,NOVEMBRE:10,DICEMBRE:11};
    const match = text.toUpperCase().match(/^(.*?)\s+(\d{1,2})\s+(GENNAIO|FEBBRAIO|MARZO|APRILE|MAGGIO|GIUGNO|LUGLIO|AGOSTO|SETTEMBRE|OTTOBRE|NOVEMBRE|DICEMBRE)(?:\s+(\d{4}))?\s+(MSC|COSTA)\s+(.+)$/);
    if (!match) return {city:"", date:shipEventDateLabel(text), weekday:"", ship:text};
    const city = match[1].trim();
    const day = Number(match[2]);
    const monthName = match[3];
    const year = Number(match[4] || new Date().getFullYear());
    const company = match[5];
    const ship = `${company} ${match[6].trim()}`;
    const date = new Date(year, months[monthName], day, 12);
    const weekday = new Intl.DateTimeFormat("it-IT", {weekday:"long"}).format(date).toUpperCase();
    return {city, date:`${day} ${monthName}`, weekday, ship};
  }

  function eventWhatsAppMessage(company, eventName, embarkTime) {
    const info = shipEventInfo(eventName);
    const timeParts = String(embarkTime || "10:30").split(":").map(Number);
    const totalMinutes = ((timeParts[0] || 0) * 60 + (timeParts[1] || 0) - 30 + 1440) % 1440;
    const appointmentTime = `${String(Math.floor(totalMinutes / 60)).padStart(2,"0")}:${String(totalMinutes % 60).padStart(2,"0")}`;
    if (company === "Costa") {
      const terminalLink = norm(info.city).includes("VENEZIA") ? "  https://vtp.it/passeggeri/come-raggiungerci/" : "";
      return `📍 *${info.weekday ? info.weekday + " " : ""}${info.date} – ${info.city}*

*Conferma di partecipazione*

🚢 *${info.ship}*

📍 *Appuntamento: ore ${appointmentTime} – Terminal Crociere*${terminalLink}
🕥 *Imbarco: ${embarkTime}*
📸 Visita della nave
🍽️ Pranzo a bordo
☕ Momento caffè
🕒 *Sbarco indicativo: 15:30*

‼️ Porta con te il documento d’identità che hai comunicato
📞 Salva questo numero per eventuali comunicazioni: *320 2932994*

👉 Ci vediamo a bordo 🚢`;
    }
    return `Gentile Consulente, 👋

*Conferma di partecipazione* 🛳️
🚢 *${info.ship}*

👉 *I pass MSC* sono stati inviati alla tua casella di posta *@borsaviaggi.net*
Stampali e portali con te per salire a bordo!

📍 *${info.city} – ${info.date}*
⏰ *Appuntamento sottobordo ore ${appointmentTime}*
➡️ *Imbarco ore ${embarkTime}*

Nel frattempo, ti chiediamo una cosa importante:
👉 *salva subito questo numero in rubrica: 3202932994*

Le prossime comunicazioni verranno inviate tramite *lista broadcast WhatsApp*, che funziona *solo se il numero è salvato nei contatti* 📲

Ci vediamo a bordo! 🚢`;
  }

  function openEventWhatsApp(button) {
    const card = button.closest("[data-participant-id]");
    const person = shipParticipants.find(item => item.id === card.dataset.participantId);
    if (!person || !phone(person.phone)) return toast("Numero di cellulare non disponibile", true);
    const company = button.dataset.eventWhatsapp;
    const embarkTime = String(person.embarkTime || $("#shipEmbarkTime")?.value || "10:30");
    const message = company === "LIBERO" ? "" : eventWhatsAppMessage(company, person.eventName, embarkTime);
    const recipient = "39" + phone(person.phone);
    const query = "phone=" + recipient + (message ? "&text=" + encodeURIComponent(message) : "");
    const isIPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    window.location.href = isIPhone
      ? "whatsapp-smb://send?" + query
      : "https://wa.me/" + recipient + (message ? "?text=" + encodeURIComponent(message) : "");
  }

  let attendanceSaving = false;
  function linkedShipGuests(consultant) {
    const people = shipParticipants.filter(p => p.eventName === consultant.eventName);
    const surname = norm(consultant.lastName);
    if (!surname) return [];
    const sameSurname = people.filter(p => shipPersonIsConsultant(p) && norm(p.lastName) === surname);
    const fullNames = [norm(`${consultant.lastName} ${consultant.firstName}`), norm(`${consultant.firstName} ${consultant.lastName}`)];
    return people.filter(p => !shipPersonIsConsultant(p) && (
      p.consultantId === consultant.id || (!p.consultantId && (
        fullNames.includes(norm(p.consultantSurname)) ||
        (sameSurname.length === 1 && norm(p.consultantSurname) === surname)
      ))
    ));
  }

  async function saveAttendance(button) {
    if (attendanceSaving) return;
    const card = button.closest("[data-participant-id]");
    const person = shipParticipants.find(item => item.id === card.dataset.participantId);
    if (!person) return;
    const status = norm(person.attendanceStatus) === norm(button.dataset.attendance) ? "" : button.dataset.attendance;
    const updates = [{person, status, autoFrom:""}];
    if (shipPersonIsConsultant(person)) {
      const guests = linkedShipGuests(person);
      if (status === "Presente") {
        guests.filter(p => norm(p.attendanceStatus) !== "PRESENTE").forEach(p =>
          updates.push({person:p,status:"Presente",autoFrom:person.id}));
      } else {
        guests.filter(p => p.attendanceAutoFrom === person.id).forEach(p =>
          updates.push({person:p,status:p.attendanceBeforeAuto || "",autoFrom:""}));
      }
    }
    if (updates.length > 500) return toast("Troppi ospiti per un singolo aggiornamento.", true);
    attendanceSaving = true;
    $$("[data-attendance]").forEach(b => b.disabled = true);
    try {
      const batch = db.batch();
      updates.forEach(change => {
        change.previous = change.autoFrom ? (change.person.attendanceStatus || "") : "";
        batch.update(db.collection("shipParticipants").doc(change.person.id), {
          attendanceStatus:change.status,
          attendanceAutoFrom:change.autoFrom,
          attendanceBeforeAuto:change.previous,
          attendanceUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),
          attendanceUpdatedBy:profile.name
        });
      });
      await batch.commit();
      updates.forEach(change => Object.assign(change.person, {
        attendanceStatus:change.status, attendanceAutoFrom:change.autoFrom,
        attendanceBeforeAuto:change.previous
      }));
      openShipEvent(selectedShipEvent);
      toast((status ? status + " salvato" : "Presenza annullata") +
        (updates.length > 1 ? ` · aggiornati ${updates.length-1} ospiti` : "") + " ✓");
    } catch (error) { toast(error.message, true); }
    finally {
      attendanceSaving = false;
      $$("[data-attendance]").forEach(b => b.disabled = false);
    }
  }

  async function saveShipEmbarkTime() {
    const value = $("#shipEmbarkTime").value;
    if (!value) return toast("Inserisci l’orario di imbarco", true);
    const people = shipParticipants.filter(person => person.eventName === selectedShipEvent);
    const button = $("#saveShipEmbarkTime");
    button.disabled = true;
    button.textContent = "Salvataggio…";
    try {
      for (let start = 0; start < people.length; start += 400) {
        const batch = db.batch();
        people.slice(start, start + 400).forEach(person => batch.update(db.collection("shipParticipants").doc(person.id), {
          embarkTime:value,
          eventSettingsUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),
          eventSettingsUpdatedBy:profile.name
        }));
        await batch.commit();
      }
      people.forEach(person => { person.embarkTime = value; });
      toast("Orario di imbarco salvato: " + value + " ✓");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Salva orario"; }
  }

  function shipPersonIsConsultant(person) {
    return person.roleOverride ? norm(person.roleOverride) === "CONSULENTE" : Boolean(person.isConsultant);
  }
  function sortedShipPeople() {
    return shipParticipants.filter(person => person.eventName === selectedShipEvent)
      .sort((a,b) => Number(shipPersonIsConsultant(b))-Number(shipPersonIsConsultant(a)) ||
        `${a.lastName || ""} ${a.firstName || ""}`.localeCompare(`${b.lastName || ""} ${b.firstName || ""}`, "it"));
  }
  function shipPersonValue(person, people) {
    if (shipPersonIsConsultant(person)) return "Consulente";
    const original = String(person.consultantSurname || "").trim();
    const consultant = people.filter(shipPersonIsConsultant).find(p => {
      const surname = norm(p.lastName);
      return surname && (norm(original) === surname || norm(original).startsWith(surname + " "));
    });
    return `Ospite (${consultant ? consultant.lastName : original || "non indicato"})`;
  }

  async function exportShipEventPdf() {
    const button = $("#exportShipEventPdf");
    button.disabled = true;
    try {
      if (!window.jspdf) throw Error("Generatore PDF non caricato. Aggiorna la pagina e riprova.");
      const doc = new window.jspdf.jsPDF();
      if (typeof doc.autoTable !== "function") throw Error("Tabella PDF non caricata. Aggiorna la pagina e riprova.");
      const logo = new Image();
      await new Promise((resolve, reject) => {
        logo.onload = resolve;
        logo.onerror = () => reject(Error("Logo non disponibile: verifica logo-iconsulenti.png su GitHub."));
        logo.src = "logo-iconsulenti.png";
      });
      const width = 65;
      const height = width * logo.naturalHeight / logo.naturalWidth;
      doc.addImage(logo, "PNG", (210-width)/2, 12, width, height);
      const info = shipEventInfo(selectedShipEvent);
      const title = info.city ? `Visita Nave ${info.date} ${info.city}` : `Visita Nave - ${selectedShipEvent}`;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      const titleLines = doc.splitTextToSize(title, 180);
      doc.text(titleLines, 105, 20 + height, {align:"center"});
      const people = sortedShipPeople();
      doc.autoTable({
        startY:27 + height + (titleLines.length-1)*6,
        head:[["Nome", "Cognome", "Valore", "Presente", "Assente"]],
        body:people.map(person => [person.firstName || "", person.lastName || "", shipPersonValue(person, people),
          norm(person.attendanceStatus) === "PRESENTE" ? "X" : "",
          norm(person.attendanceStatus) === "ASSENTE" ? "X" : ""]),
        theme:"grid",
        styles:{font:"helvetica",fontSize:10,cellPadding:3},
        headStyles:{fillColor:[249,124,24],textColor:255},
        columnStyles:{0:{cellWidth:40},1:{cellWidth:40},2:{cellWidth:50},3:{halign:"center",cellWidth:25},4:{halign:"center",cellWidth:25}},
        margin:{left:15,right:15},
        didDrawPage:() => {
          doc.setFontSize(9);
          doc.setTextColor(110);
          doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, 195, 289, {align:"right"});
        }
      });
      const filename = selectedShipEvent.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Evento";
      doc.save(`Presenze-${filename}.pdf`);
      toast("PDF presenze creato ✓");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }

  function exportShipEvent() {
    const people = sortedShipPeople();
    const rows = people.map(person => {
      const isConsultant = person.roleOverride ? norm(person.roleOverride) === "CONSULENTE" : Boolean(person.isConsultant);
      return ({
      "VISITA NAVE":person.eventName,
      "COGNOME":person.lastName,
      "NOME":person.firstName,
      "CELLULARE":isConsultant ? (person.phone || "") : "",
      "MAIL @BORSAVIAGGI.NET":isConsultant ? (person.email || "") : "",
      "COGNOME CONSULENTE":person.consultantSurname || "",
      "TIPO":isConsultant ? "Consulente" : "Partecipante",
      "VALORE":shipPersonValue(person, people),
      "PRESENZA":person.attendanceStatus || "Da registrare"
      });
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "PARTECIPANTI");
    const filename = selectedShipEvent.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "Evento";
    XLSX.writeFile(workbook, `Riepilogo ${filename}.xlsx`);
    toast("Riepilogo Excel creato ✓");
  }
  function showApp(level) {
    $("#loginPage").classList.add("hidden");
    hideWorkAreas();
    if (level === "admin") return $("#adminApp").classList.remove("hidden");
    if (isStefano()) return $("#workspaceChoice").classList.remove("hidden");
    $("#operatorApp").classList.remove("hidden");
  }

  async function login(e) {
    e.preventDefault();
    $("#loginError").textContent = "";
    $("#loginButton").disabled = true;
    try {
      const credential = await auth.signInWithEmailAndPassword(
        $("#username").value.trim(), $("#password").value
      );
      await loadProfile(credential.user);
      if (requestedLevel === "admin" && profile.role !== "admin") {
        await auth.signOut();
        throw Error("Questo utente non ha accesso all’amministrazione");
      }
      applyOperator(profile.name);
      showApp(requestedLevel);
      if (requestedLevel === "admin") renderAdmin();
      else if (!isStefano()) await loadDashboard();
    } catch (error) {
      $("#loginError").textContent = authMessage(error);
    } finally {
      $("#loginButton").disabled = false;
    }
  }
  function authMessage(error) {
    const code = String(error.code || "");
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email o password non corretti";
    if (code.includes("too-many-requests")) return "Troppi tentativi. Attendi qualche minuto";
    return error.message || "Accesso non riuscito";
  }

  async function loadDashboard() {
    try {
      const code = profile.operatorCode;
      const contactSnap = await db.collection("contacts").where("operatorCode", "==", code).get();
      const all = contactSnap.docs.map(d => ({ id:d.id, ...d.data() }));
      let latest = "";
      all.forEach(c => { const k = dayKey(c.bootcampDate); if (k > latest) latest = k; });
      leads = all.filter(c => norm(c.contactType) === "DIRETTO" || !latest || dayKey(c.bootcampDate) === latest).map(c => ({
        ...c,
        contactType: norm(c.contactType) === "DIRETTO" ? "DIRETTO" : "BOOTCAMP",
        name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        dateLabel: formatDate(c.importedAt || c.registrationDate),
        bootcampLabel: norm(c.contactType) === "DIRETTO" ? "Contatto diretto" : (c.bootcampDate ? "Bootcamp " + formatDate(c.bootcampDate, false) : "Bootcamp")
      })).sort((a,b) => {
        if (statusClass(a.status) !== statusClass(b.status)) return statusClass(a.status) === "todo" ? -1 : 1;
        return (jsDate(b.updatedAt)?.getTime() || jsDate(b.registrationDate)?.getTime() || 0) -
          (jsDate(a.updatedAt)?.getTime() || jsDate(a.registrationDate)?.getTime() || 0);
      });
      const stepSnap = await db.collection("nextSteps").where("operatorCode", "==", code).get();
      const now = Date.now();
      appointments = stepSnap.docs.map(d => ({ id:d.id, ...d.data() }))
        .filter(s => jsDate(s.when) && jsDate(s.when).getTime() >= now && !["COMPLETATO","CANCELLATO"].includes(norm(s.status)))
        .sort((a,b) => jsDate(a.when) - jsDate(b.when)).slice(0,9);
      const isStefano = profile.operatorCode === "ST";
      $("#bootcampDate").textContent = isStefano ? "Tutti i contatti" : (latest ? "Bootcamp " + formatDate(new Date(latest + "T12:00:00"), false) : "Ultimo Bootcamp");
      $("#typeFilter").classList.toggle("hidden", !isStefano);
      $("#totalCount").nextElementSibling.textContent = isStefano ? "Contatti" : "Contatti Bootcamp";
      $("#contacts").previousElementSibling.previousElementSibling.querySelector("h3").textContent = isStefano ? "Contatti da lavorare" : "Contatti dell’ultimo Bootcamp";
      const todo = leads.filter(l => statusClass(l.status) === "todo").length;
      $("#totalCount").textContent = leads.length;
      $("#todoCount").textContent = todo;
      $("#workedCount").textContent = leads.length - todo;
      $("#appointmentCount").textContent = appointments.length;
      $("#appointments").innerHTML = appointments.length ? appointments.map(a =>
        `<article class="appointment" data-appointment-contact="${esc(a.leadId)}" role="button" tabindex="0"><strong>${esc(a.type)} · ${esc(a.contactName)}</strong><small>${esc(formatDate(a.when))}${a.note ? " · "+esc(a.note) : ""}</small><div><button data-contact="${esc(a.leadId)}">Apri scheda</button><button data-delete-step="${esc(a.id)}">Elimina</button></div></article>`
      ).join("") : '<div class="empty">Nessun appuntamento programmato.</div>';
      $$('[data-contact]').forEach(b => b.onclick = event => { event.stopPropagation(); openLead(b.dataset.contact); });
      $$('[data-delete-step]').forEach(b => b.onclick = event => { event.stopPropagation(); cancelAppointment(b.dataset.deleteStep); });
      $$('[data-appointment-contact]').forEach(card => {
        card.onclick = () => openLead(card.dataset.appointmentContact);
        card.onkeydown = event => { if (event.key === "Enter" || event.key === " ") openLead(card.dataset.appointmentContact); };
      });
      renderLeads();
    } catch (error) {
      toast(error.message, true);
      $("#contacts").innerHTML = '<div class="empty">Impossibile caricare i contatti.</div>';
    }
  }

  async function cancelAppointment(stepId) {
    const appointment = appointments.find(item => item.id === stepId);
    if (!appointment) return;
    if (!confirm(`Eliminare ${appointment.type} di ${appointment.contactName}?`)) return;
    try {
      const batch = db.batch();
      batch.update(db.collection("nextSteps").doc(stepId), {
        status:"Cancellato", cancelledAt:firebase.firestore.FieldValue.serverTimestamp(),
        cancelledBy:profile.name
      });
      const eventRef = db.collection("events").doc();
      batch.set(eventRef, {
        leadId:appointment.leadId, operatorCode:profile.operatorCode, operatorName:profile.name,
        type:"Appuntamento cancellato", detail:appointment.type || "", note:appointment.note || "",
        origin:"WEBAPP", createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.update(db.collection("contacts").doc(appointment.leadId), {
        nextStep:"", nextStepAt:null, updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      toast("Appuntamento eliminato dalla home ✓");
      await loadDashboard();
    } catch (error) { toast(error.message, true); }
  }
  function renderLeads() {
    const q = $("#search").value.toLowerCase();
    const filter = $("#filter").value;
    const typeFilter = $("#typeFilter").value;
    const list = leads.filter(l => {
      const c = statusClass(l.status);
      const state = filter === "all" || (filter === "todo" && c === "todo") ||
        (filter === "rejected" && c === "rejected") || (filter === "worked" && c !== "todo");
      const typeMatches = typeFilter === "all" || l.contactType === typeFilter;
      return state && typeMatches && (!q || String(l.name).toLowerCase().includes(q) || String(l.phone || "").includes(q));
    });
    $("#resultCount").textContent = `${list.length} di ${leads.length}`;
    $("#contacts").innerHTML = list.length ? list.map(l =>
      `<article class="contact"><div><div class="eyebrow">${esc(l.contactType === "DIRETTO" ? "DIRETTO" : l.bootcampLabel)}</div><h4>${esc(l.name)}</h4><p>${esc(l.region || "")} · ${esc(l.phone || "")}</p><span class="status ${statusClass(l.status)}">${esc(l.status || "Da lavorare")}</span></div><div class="actions"><a class="icon" href="tel:${phone(l.phone)}">☎</a><button class="icon open" data-open="${esc(l.id)}">›</button></div></article>`
    ).join("") : '<div class="empty">Nessun contatto trovato.</div>';
    $$('[data-open]').forEach(b => b.onclick = () => openLead(b.dataset.open));
  }

  const bootcampMessages = window.CRM_BOOTCAMP_MESSAGES || [];
  let activeBootcampConfig = null;
  let messageSaving = false;
  function bootcampId(contact) { return dayKey(contact.bootcampDate); }
  function messageVariables(contact, config) {
    const date = new Date(config.date + 'T12:00:00');
    return {
      nome:contact.firstName || String(contact.name || '').split(' ')[0],
      operatore:norm(profile.operatorCode) === 'FB' ? 'Fabio' : 'Stefano',
      data_bootcamp:new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',timeZone:'Europe/Rome'}).format(date).toUpperCase(),
      giorno_bootcamp:new Intl.DateTimeFormat('it-IT',{weekday:'long',timeZone:'Europe/Rome'}).format(date).toUpperCase(),
      ora_bootcamp:config.time,
      link_zoom:config.zoomUrl,
      fascia_chiamata:$('#callMessageVariant').value === 'morning' ? 'mattina tra le 11:00 e le 13:00' : 'pomeriggio tra le 15:00 e le 17:00'
    };
  }
  function composeBootcampMessage(template, variables) {
    let text = template.replace(/\{\{(\w+)\}\}/g, (_,key) => variables[key] || '');
    // Dati richiesti in ogni messaggio; aggiungi solo quelli non già presenti nel copy.
    if (!template.includes('{{data_bootcamp}}')) text += '\n\nBootcamp: ' + variables.data_bootcamp;
    if (!template.includes('{{ora_bootcamp}}')) text += '\nOre ' + variables.ora_bootcamp;
    if (!template.includes('{{operatore}}')) text += '\n\n' + variables.operatore + ' | iconsulentidiviaggio.it';
    return text;
  }
  async function loadBootcampMessaging() {
    const contact = current;
    activeBootcampConfig = null;
    const section = $('#bootcampMessaging');
    section.classList.toggle('hidden', contact.contactType === 'DIRETTO');
    $('#firstMessage').classList.toggle('hidden', contact.contactType !== 'DIRETTO');
    if (contact.contactType === 'DIRETTO') return;
    const id = bootcampId(contact);
    $('#bootcampConfigDate').value = id;
    $('#bootcampConfigTime').value = '21:00';
    $('#bootcampConfigZoom').value = '';
    $('#bootcampConfigStatus').textContent = 'Caricamento configurazione…';
    $('#bootcampMessageButtons').innerHTML = '';
    const editable = norm(profile.operatorCode) === 'ST' || profile.role === 'admin';
    $('#bootcampConfigTime').disabled = !editable;
    $('#bootcampConfigZoom').disabled = !editable;
    $('#saveBootcampConfig').classList.toggle('hidden', !editable);
    if (!id) { $('#bootcampConfigStatus').textContent = 'Data Bootcamp mancante nel contatto.'; return; }
    try {
      const snapshot = await db.collection('bootcamps').doc(id).get();
      if (current?.id !== contact.id) return;
      activeBootcampConfig = snapshot.exists ? snapshot.data() : null;
      if (activeBootcampConfig) {
        $('#bootcampConfigTime').value = activeBootcampConfig.time || '21:00';
        $('#bootcampConfigZoom').value = activeBootcampConfig.zoomUrl || '';
      }
      renderBootcampMessages();
    } catch(error) { if(current?.id === contact.id) $('#bootcampConfigStatus').textContent = 'Configurazione non caricata: ' + error.message; }
  }
  function renderBootcampMessages() {
    const ready = activeBootcampConfig?.zoomUrl && activeBootcampConfig?.time;
    $('#bootcampConfigStatus').textContent = ready ? 'Configurazione condivisa con Stefano e Fabio. Orario italiano.' : 'Inserisci ora e link Zoom, poi salva la configurazione.';
    $('#bootcampMessageButtons').innerHTML = bootcampMessages.map(m => `<button type="button" class="first-message" data-bootcamp-message="${m.key}" ${ready ? '' : 'disabled'}>${esc(m.label)}</button>`).join('');
    $('[data-bootcamp-message="call"]').title = 'Scegli la variante mattina, pomeriggio o weekend';
    $$('[data-bootcamp-message]').forEach(b => b.onclick = () => sendBootcampMessage(b));
    refreshBootcampMessageStates();
  }
  function refreshBootcampMessageStates() {
    $$('[data-bootcamp-message]').forEach(button => {
      const message = bootcampMessages.find(m => m.key === button.dataset.bootcampMessage);
      button.classList.toggle('message-recorded', savedEvents.has(message?.event));
      button.setAttribute('aria-label', message?.label + (savedEvents.has(message?.event) ? ' · già registrato' : ''));
    });
  }
  async function saveBootcampConfig(event) {
    event.preventDefault();
    const contact = current;
    const id = bootcampId(contact);
    const time = $('#bootcampConfigTime').value;
    const zoomUrl = $('#bootcampConfigZoom').value.trim();
    let parsed;
    try { parsed = new URL(zoomUrl); } catch { return toast('Inserisci un link Zoom completo https://…', true); }
    if (!id || !/^\d{2}:\d{2}$/.test(time) || parsed.protocol !== 'https:' ||
      !(parsed.hostname === 'zoom.us' || parsed.hostname.endsWith('.zoom.us') || parsed.hostname === 'zoom.com' || parsed.hostname.endsWith('.zoom.com')))
      return toast('Controlla data, ora e link Zoom', true);
    const button = $('#saveBootcampConfig'); button.disabled = true;
    try {
      const config = {date:id,time,zoomUrl,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:profile.name};
      await db.collection('bootcamps').doc(id).set(config,{merge:true});
      if(current?.id === contact.id) { activeBootcampConfig = config; renderBootcampMessages(); }
      toast('Configurazione Bootcamp salvata per entrambi gli operatori ✓');
    } catch(error) { toast(error.message,true); }
    finally { button.disabled = false; }
  }
  async function sendBootcampMessage(button) {
    if(messageSaving || !current) return;
    const contact = current;
    const message = bootcampMessages.find(m => m.key === button.dataset.bootcampMessage);
    if(!message || !phone(contact.phone)) return toast('Cellulare non disponibile',true);
    if (!activeBootcampConfig?.zoomUrl) return toast('Salva prima la configurazione Bootcamp',true);
    const template = message.key === 'call' && $('#callMessageVariant').value === 'weekend' ? window.CRM_WEEKEND_MESSAGE : message.text;
    const text = composeBootcampMessage(template, messageVariables(contact, activeBootcampConfig));
    const recipient = '39' + phone(contact.phone);
    const iOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Apri la finestra desktop durante il gesto utente per evitare il blocco popup.
    const popup = !iOS ? window.open('about:blank','_blank') : null;
    if (!iOS && !popup) return toast('Consenti i popup per aprire WhatsApp',true);
    if(popup) { popup.opener = null; popup.document.body.textContent = 'Salvataggio scheda e apertura WhatsApp…'; }
    messageSaving = true;
    $$('[data-bootcamp-message]').forEach(b => b.disabled = true);
    try {
      const saved = await saveContact([message.event], true);
      if(!saved) { popup?.close(); return; }
      const url = iOS ? 'whatsapp-smb://send?phone='+recipient+'&text='+encodeURIComponent(text)
        : 'https://web.whatsapp.com/send?phone='+recipient+'&text='+encodeURIComponent(text);
      if(iOS) window.location.href = url;
      else popup.location.href = url;
      toast('Evento registrato al click. Conferma l’invio in WhatsApp.');
    } catch(error) { popup?.close(); toast(error.message,true); }
    finally { messageSaving = false; renderBootcampMessages(); }
  }

  async function openLead(id) {
    if (messageSaving) return toast("Attendi il salvataggio del messaggio");
    $("#bootcampMessageButtons").innerHTML = "";
    $("#bootcampMessaging").classList.add("hidden");
    current = leads.find(l => String(l.id) === String(id));
    if (!current) return;
    // Il messaggio iniziale è disponibile per entrambi gli operatori.
    $("#firstMessage").classList.remove("hidden");
    currentEvents = [];
    savedEvents = new Set();
    $$('[data-group] .chip').forEach(c => c.classList.remove("active"));
    $$('.note').forEach(n => n.value = "");
    $$('.event').forEach(b => b.classList.remove("saved", "pending", "remove-pending"));
    $("#timeline").innerHTML = '<div class="empty">Caricamento scheda…</div>';
    $("#leadId").textContent = current.id;
    $("#leadName").textContent = current.name;
    $("#leadBootcamp").textContent = current.bootcampLabel || "Bootcamp";
    const isDirect = current.contactType === "DIRETTO";
    $("#bootcampQuestions").classList.toggle("hidden", isDirect);
    $("#directQuestions").classList.toggle("hidden", !isDirect);
    $("#leadMeta").textContent = [current.region, current.dateLabel].filter(Boolean).join(" · ");
    ["#call","#topCall"].forEach(s => $(s).href = "tel:" + phone(current.phone));
    ["#wa","#topWa"].forEach(s => $(s).href = "https://wa.me/39" + phone(current.phone));
    $("#leadSheet").classList.remove("hidden");
    document.body.style.overflow = "hidden";
    try {
      const snap = await db.collection("contacts").doc(current.id).get();
      const data = snap.data() || {};
      current = { ...current, ...data };
      const answers = data.answers || {};
      $$('[data-group]').forEach(g => [...g.children].forEach(c =>
        c.classList.toggle("active", c.textContent === String(answers[g.dataset.group] || ""))
      ));
      $$('.note').forEach(n => n.value = answers[n.dataset.key] || "");
      const eventSnap = await db.collection("events")
        .where("operatorCode", "==", profile.operatorCode)
        .where("leadId", "==", current.id).get();
      const events = eventSnap.docs.map(d => ({ id:d.id, ...d.data() }))
        .filter(event => !event.deleted)
        .sort((a,b) => (jsDate(b.createdAt)?.getTime() || 0) - (jsDate(a.createdAt)?.getTime() || 0));
      timeline(events);
      await loadBootcampMessaging();
    } catch (error) {
      $("#timeline").innerHTML = '<div class="empty">Impossibile caricare la scheda.</div>';
      toast(error.message, true);
    }
  }
  function timeline(events) {
    currentEvents = events;
    setTimeout(refreshBootcampMessageStates, 0);
    savedEvents = new Set(events.map(e => String(e.type || "").trim()));
    $$('.event').forEach(b => {
      const saved = savedEvents.has(b.textContent.trim());
      b.classList.toggle("saved", saved);
      b.classList.remove("remove-pending");
      if (saved) b.classList.remove("pending");
    });
    $("#timeline").innerHTML = events.length ? events.map(e =>
      `<div class="timeline-item"><div class="dot"></div><div><strong>${esc(e.type)}</strong><small>${esc(formatDate(e.createdAt))} · ${esc(e.operatorName || profile.name)}${e.detail ? " · "+esc(e.detail) : ""}</small></div></div>`
    ).join("") : '<div class="empty">Nessun evento registrato.</div>';
  }

  async function saveContact(extraEvents = [], repeatExtra = false) {
    if (!current) return;
    const button = $("#updateContact");
    const answers = {};
    $$('[data-group]').forEach(g => {
      const active = g.querySelector('.chip.active');
      answers[g.dataset.group] = active ? active.textContent : "";
    });
    $$('.note').forEach(n => answers[n.dataset.key] = n.value);
    const newEvents = [...new Set(
      $$('.event.pending').map(b => b.textContent.trim())
        .concat(extraEvents)
        .filter(type => type && (!savedEvents.has(type) || (repeatExtra && extraEvents.includes(type))))
    )];
    const removedEvents = $$('.event.remove-pending').map(b => b.textContent.trim());
    button.disabled = true;
    button.textContent = "Aggiornamento…";
    try {
      const remainingEvents = currentEvents.filter(event => !removedEvents.includes(String(event.type || "").trim()));
      const activeTypes = remainingEvents.map(event => event.type).concat(newEvents);
      const status = combinedStatus(activeTypes, "Da lavorare", answers);
      const batch = db.batch();
      batch.update(db.collection("contacts").doc(current.id), {
        answers, status, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const addedEvents = [];
      newEvents.forEach(type => {
        const ref = db.collection("events").doc();
        addedEvents.push({id:ref.id,type,createdAt:new Date(),operatorName:profile.name});
        batch.set(ref, {
          leadId:current.id, operatorCode:profile.operatorCode, operatorName:profile.name,
          type, detail:"", note:"", newStatus:eventStatus(type), origin:"WEBAPP",
          createdAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      currentEvents.filter(event => removedEvents.includes(String(event.type || "").trim())).forEach(event => {
        batch.update(db.collection("events").doc(event.id), {
          deleted:true,
          deletedAt:firebase.firestore.FieldValue.serverTimestamp(),
          deletedBy:profile.name
        });
      });
      await batch.commit();
      current.status = status;
      const now = new Date();
      timeline(addedEvents.concat(remainingEvents));
      toast("Scheda aggiornata ✓");
      return true;
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Aggiorna scheda"; }
    return false;
  }

  function firstMessageText() {
    // Usiamo il codice operatore per mantenere sempre il nome corretto,
    // anche se nel profilo Firebase è stato salvato in minuscolo.
    const operatorName = String(profile.operatorCode || "").toUpperCase() === "FB" ? "Fabio" : "Stefano";
    const isFabio = operatorName === "Fabio";
    const contactFirstName = String(current.firstName || current.name || "").trim().split(/\s+/)[0];
    const greeting = contactFirstName
      ? `Ciao ${contactFirstName}${isFabio ? "" : " 😊"}`
      : (isFabio ? "Ciao" : "Ciao 😊");
    if (current.contactType === "DIRETTO") {
      return `${greeting} sono ${operatorName} di iconsulentidiviaggio.it.

Ho visto la tua registrazione sul nostro sito sull’attività di Consulente di Viaggio. Sul sito, probabilmente, hai già avuto modo di vedere una prima presentazione dell’attività, i video introduttivi e anche i costi.

Per capire meglio cosa stai cercando, quale di queste situazioni ti rappresenta di più?

1) Cerco una seconda attività
2) Vorrei trasformare la mia passione per i viaggi in qualcosa di concreto
3) Sto valutando un’attività professionale nel settore turismo
4) Sono già nel settore e voglio capire come funziona il vostro modello

Rispondimi semplicemente con 1, 2, 3 o 4.
Grazie`;
    }
    const bootcampDate = jsDate(current.bootcampDate);
    const dateLabel = bootcampDate
      ? new Intl.DateTimeFormat("it-IT", { day:"numeric", month:"long" }).format(bootcampDate)
      : "prossimo";
    if (isFabio) {
      return `${greeting} sono Fabio di iconsulentidiviaggio.it.

Ho visto la tua registrazione al Bootcamp del ${dateLabel} dedicato a chi vuole scoprire come funziona l’attività di Consulente di Viaggio.

Prima della diretta vorrei capire meglio cosa ti ha spinto a registrarti, così posso aiutarti a concentrarti sugli aspetti più utili per te.

Quale di queste situazioni ti rappresenta di più?

1) Cerco una seconda attività da affiancare al mio lavoro

2) Sono appassionato di viaggi e vorrei capire se posso trasformare questa passione in qualcosa di concreto

3) Vorrei costruire nel tempo una vera attività professionale nel turismo

4) Sono già nel settore turismo e voglio conoscere il vostro modello

Rispondimi semplicemente con 1, 2, 3 o 4.

A presto
Fabio | iconsulentidiviaggio.it`;
    }
    return `${greeting} sono ${operatorName} di iconsulentidiviaggio.it.

Ho visto la tua registrazione al Bootcamp del ${dateLabel} dedicato a chi vuole scoprire come funziona l’attività di Consulente di Viaggio 🌍✈️

Prima della diretta vorrei capire meglio cosa ti ha spinto a registrarti, così posso aiutarti a concentrarti sugli aspetti più utili per te.

Quale di queste situazioni ti rappresenta di più?

1️⃣ Cerco una seconda attività da affiancare al mio lavoro

2️⃣ Sono appassionato di viaggi e vorrei capire se posso trasformare questa passione in qualcosa di concreto

3️⃣ Vorrei costruire nel tempo una vera attività professionale nel turismo

4️⃣ Sono già nel settore turismo e voglio conoscere il vostro modello

Rispondimi semplicemente con 1, 2, 3 o 4 👍

A presto
${operatorName} | iconsulentidiviaggio.it`;
  }

  async function saveAndOpenWhatsApp() {
    if (!current || !phone(current.phone)) return toast("Numero di cellulare non disponibile", true);
    const button = $("#firstMessage");
    button.disabled = true;
    button.textContent = "Salvataggio…";
    try {
      const saved = await saveContact(["Primo messaggio inviato"]);
      if (!saved) return;
      const recipient = "39" + phone(current.phone);
      const query = "phone=" + recipient + "&text=" + encodeURIComponent(firstMessageText());
      const isIPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      // Su iPhone whatsapp-smb apre direttamente WhatsApp Business.
      // Sugli altri dispositivi manteniamo il collegamento WhatsApp universale.
      const url = isIPhone
        ? "whatsapp-smb://send?" + query
        : "https://wa.me/" + recipient + "?text=" + encodeURIComponent(firstMessageText());
      toast("Scheda aggiornata. Apertura WhatsApp Business…");
      window.location.href = url;
    } finally {
      button.disabled = false;
      button.textContent = "Salva e apri WhatsApp Business";
    }
  }

  async function saveNextStep(e) {
    e.preventDefault();
    const dialog = $("#nextDialog");
    const button = $("#nextForm .save");
    const type = $("#stepType").value;
    const note = $("#stepNote").value;
    const lastEvent = getLastRapidEvent();
    const dateValue = $("#calendarWhen")?.value || "";
    const when = dateValue ? new Date(dateValue) : null;
    const details = [
      "Nome: " + current.name, "Telefono: " + (current.phone || "Non indicato"),
      current.bootcampLabel || "Bootcamp non indicato", "Azione: " + type,
      "Ultimo evento rapido: " + (lastEvent || "Nessuno"),
      "Nota: " + (note || "—"), "Contatto CRM: " + current.id, location.href
    ].join("\n");
    const params = { action:"TEMPLATE", text:type + " – " + current.name, details };
    if (when && !isNaN(when)) {
      const end = new Date(when.getTime() + 30*60000);
      const cal = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      params.dates = cal(when) + "/" + cal(end);
    }
    window.open("https://calendar.google.com/calendar/render?" + new URLSearchParams(params), "_blank");
    button.disabled = true;
    dialog.close();
    try {
      const stepRef = db.collection("nextSteps").doc();
      const eventRef = db.collection("events").doc();
      const batch = db.batch();
      batch.set(stepRef, {
        leadId:current.id, contactName:current.name, phone:current.phone || "",
        bootcampDate:current.bootcampDate || null, type, note, when:when || null,
        status:"Da fare", lastRapidEvent:lastEvent || "", operatorCode:profile.operatorCode, operatorName:profile.name,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(eventRef, {
        leadId:current.id, operatorCode:profile.operatorCode, operatorName:profile.name,
        type:"Prossimo step impostato", detail:type, note, newStatus:stepStatus(type),
        origin:"WEBAPP", createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.update(db.collection("contacts").doc(current.id), {
        status:stepStatus(type), nextStep:type, nextStepAt:when || null,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      toast(when ? "Appuntamento salvato e Calendar aperto ✓" : "Calendar aperto: scegli data e ora ✓");
      await openLead(current.id);
    } catch (error) { toast("Calendar aperto. Errore CRM: " + error.message, true); }
    finally { button.disabled = false; }
  }

  function getLastRapidEvent() {
    const pending = $$('.event.pending').map(button => button.textContent.trim());
    if (pending.length) return pending[pending.length - 1];
    const rapid = currentEvents.find(event => eventNames.includes(String(event.type || "").trim()));
    return rapid ? String(rapid.type || "").trim() : "";
  }

  function openNextStep() {
    const lastEvent = getLastRapidEvent();
    $("#lastEventSummary").textContent = "Ultimo evento rapido: " + (lastEvent || "nessuno");
    $("#nextDialog").showModal();
  }

  function renderAdmin() {
    const box = $("#adminApp .admin-box");
    box.innerHTML = `
      <div class="eyebrow">Amministrazione</div>
      <h2>Importazione database Firebase</h2>
      <p>Seleziona il file Excel CRM appena scaricato. I dati vengono inviati direttamente a Firebase.</p>
      <div class="field"><label for="excelFile">Database Excel (.xlsx)</label><input id="excelFile" type="file" accept=".xlsx,.xls" /></div>
      <button class="primary" id="importExcel">Importa o aggiorna database</button>
      <div id="importState" class="api-state">Nessun file importato in questa sessione.</div>`;
    $("#importExcel").onclick = importExcel;
  }
  function rowObjects(sheet) {
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval:"", raw:true }).map(row => {
      const out = {};
      Object.keys(row).forEach(k => out[norm(k)] = row[k]);
      return out;
    });
  }
  function pick(row, names) {
    for (const n of names) if (row[norm(n)] !== "" && row[norm(n)] != null) return row[norm(n)];
    return "";
  }
  async function commitWrites(writes, state) {
    for (let i=0; i<writes.length; i+=400) {
      const batch = db.batch();
      writes.slice(i,i+400).forEach(w => batch.set(w.ref, w.data, { merge:true }));
      await batch.commit();
      state.textContent = `Importazione: ${Math.min(i+400,writes.length)} di ${writes.length} record…`;
    }
  }
  async function importExcel() {
    const input = $("#excelFile");
    const state = $("#importState");
    const button = $("#importExcel");
    if (!input.files[0]) return toast("Seleziona prima il file Excel", true);
    button.disabled = true;
    state.textContent = "Lettura del file…";
    try {
      const workbook = XLSX.read(await input.files[0].arrayBuffer(), { type:"array", cellDates:true });
      const contacts = rowObjects(workbook.Sheets["CONTATTI"]);
      const events = rowObjects(workbook.Sheets["EVENTI"]);
      const steps = rowObjects(workbook.Sheets["PROSSIMI_STEP"]);
      if (!contacts.length) throw Error("Scheda CONTATTI non trovata o vuota");
      const writes = [];
      contacts.forEach(row => {
        const id = String(pick(row,["LEAD ID","ID CONTATTO","ID"])).trim();
        if (!id) return;
        const code = norm(id).startsWith("FB-") ? "FB" : "ST";
        const answers = {};
        answerFields.forEach(f => { const v = pick(row,[f]); if (v !== "") answers[f] = String(v); });
        const firstName = String(pick(row,["NOME"]));
        const lastName = String(pick(row,["COGNOME"]));
        const name = String(pick(row,["NOME E COGNOME","NOME COMPLETO"])) || `${firstName} ${lastName}`.trim();
        writes.push({ ref:db.collection("contacts").doc(id), data:{
          leadId:id, operatorCode:code, operatorName:code === "FB" ? "Fabio" : "Stefano", contactType:"BOOTCAMP",
          firstName, lastName, name, email:String(pick(row,["EMAIL","E-MAIL"])),
          phone:phone(pick(row,["CELLULARE","TELEFONO","PHONE"])),
          region:String(pick(row,["REGIONE","PROVINCIA"])), source:String(pick(row,["AFFILIATO","FONTE"])),
          bootcampDate:jsDate(pick(row,["DATA BOOTCAMP","BOOTCAMP"])),
          registrationDate:jsDate(pick(row,["DATA REGISTRAZIONE","DATA INSERIMENTO"])),
          status:String(pick(row,["STATO","STATO LAVORAZIONE"])) || "Da lavorare",
          answers, nextStep:String(pick(row,["PROSSIMO STEP"])),
          nextStepAt:jsDate(pick(row,["DATA/ORA PROSSIMO STEP"])),
          importedAt:firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        }});
      });
      events.forEach(row => {
        const leadId = String(pick(row,["LEAD ID","ID CONTATTO"])).trim();
        if (!leadId) return;
        const id = String(pick(row,["EVENTO ID","ID EVENTO","ID"])).trim() || db.collection("events").doc().id;
        const code = norm(leadId).startsWith("FB-") ? "FB" : "ST";
        writes.push({ ref:db.collection("events").doc(id), data:{
          leadId, operatorCode:code, operatorName:String(pick(row,["OPERATORE"])) || (code === "FB" ? "Fabio" : "Stefano"),
          type:String(pick(row,["TIPO EVENTO","EVENTO","TIPO"])), detail:String(pick(row,["DETTAGLIO/TAG","DETTAGLIO"])),
          note:String(pick(row,["NOTA","NOTE"])), newStatus:String(pick(row,["NUOVO STATO","STATO"])),
          origin:String(pick(row,["ORIGINE"])) || "IMPORT", createdAt:jsDate(pick(row,["DATA/ORA","DATA ORA","DATA"])) || new Date()
        }});
      });
      steps.forEach(row => {
        const leadId = String(pick(row,["LEAD ID","ID CONTATTO"])).trim();
        if (!leadId) return;
        const id = String(pick(row,["STEP ID","ID"])).trim() || db.collection("nextSteps").doc().id;
        const code = norm(leadId).startsWith("FB-") ? "FB" : "ST";
        writes.push({ ref:db.collection("nextSteps").doc(id), data:{
          leadId, operatorCode:code, operatorName:String(pick(row,["OPERATORE"])) || (code === "FB" ? "Fabio" : "Stefano"),
          contactName:String(pick(row,["NOME CONTATTO","NOME E COGNOME"])), type:String(pick(row,["TIPO STEP","AZIONE"])),
          when:jsDate(pick(row,["DATA/ORA","DATA ORA"])), status:String(pick(row,["STATO"])) || "Da fare",
          note:String(pick(row,["NOTA","NOTE"])), createdAt:new Date()
        }});
      });
      await commitWrites(writes, state);
      state.textContent = `Importazione completata: ${contacts.length} contatti, ${events.length} eventi, ${steps.length} prossimi step.`;
      toast("Database Firebase aggiornato ✓");
    } catch (error) {
      state.textContent = "Errore: " + error.message;
      toast(error.message, true);
    } finally { button.disabled = false; }
  }

  async function exportReport() {
    const button = $("#bootcampReport");
    button.disabled = true;
    button.textContent = "Creazione Excel…";
    try {
      const freshContacts = await db.collection("contacts").where("operatorCode","==",profile.operatorCode).get();
      const visibleIds = new Set(leads.map(c=>c.id));
      const reportLeads = freshContacts.docs.map(d=>({id:d.id,...d.data()}))
        .filter(c=>visibleIds.has(c.id) && norm(c.contactType) !== "DIRETTO");
      const ids = new Set(reportLeads.map(contact => contact.id));
      const eventSnap = await db.collection("events").where("operatorCode","==",profile.operatorCode).get();
      const events = eventSnap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => ids.has(e.leadId) && !e.deleted);
      const eventTypesByLead = new Map();
      events.forEach(event => {
        if (!eventTypesByLead.has(event.leadId)) eventTypesByLead.set(event.leadId, new Set());
        eventTypesByLead.get(event.leadId).add(String(event.type || "").trim());
      });
      const operatorName = String(profile.operatorCode || "").toUpperCase() === "FB" ? "Fabio" : "Stefano";
      const summary = reportLeads.map(contact => {
        const completedEvents = eventTypesByLead.get(contact.id) || new Set();
        const row = {
          "LEAD ID":contact.id,
          "NOME E COGNOME":contact.name,
          "TELEFONO":contact.phone || "",
          "EMAIL":contact.email || "",
          "REGIONE":contact.region || "",
          "FONTE":contact.source || contact.origin || contact.contactType || "BOOTCAMP",
          "OPERATORE":operatorName,
          "DATA BOOTCAMP":formatDate(contact.bootcampDate,false),
          "STATO":contact.status || "Da lavorare",
          "PROSSIMO STEP":contact.nextStep || "",
          "DATA PROSSIMO STEP":formatDate(contact.nextStepAt)
        };
        [...new Set(eventNames.concat(bootcampMessages.map(m => m.event), events.map(e => e.type).filter(Boolean)))].forEach(eventName => { row[eventName] = completedEvents.has(eventName) ? 1 : 0; });
        row["NOTE CHIAMATA"] = contact.answers?.["NOTE CHIAMATA"] || "";
        return row;
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "RIEPILOGO");
      const history = events.sort((a,b)=>(jsDate(a.createdAt)?.getTime()||0)-(jsDate(b.createdAt)?.getTime()||0)).map(e=>({
        "LEAD ID":e.leadId,"CONTATTO":reportLeads.find(c=>c.id===e.leadId)?.name || "",
        "DATA":formatDate(e.createdAt),"EVENTO":e.type,"OPERATORE":e.operatorName || operatorName,
        "DETTAGLIO":e.detail || "","NOTE":e.note || ""
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(history), "CRONOLOGIA");
      XLSX.writeFile(wb, `Riepilogo Bootcamp - ${operatorName}.xlsx`);
      toast("Riepilogo Excel creato ✓");
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Riepilogo Bootcamp"; }
  }

  function initUI() {
    $("#userField label").textContent = "Email";
    $("#username").type = "email";
    $("#username").placeholder = "nome@dominio.it";
    $$('.tab').forEach(button => button.onclick = () => {
      requestedLevel = button.dataset.level;
      $$('.tab').forEach(x => x.classList.toggle("active", x === button));
      $("#userField").classList.remove("hidden");
      $("#username").required = true;
    });
    $("#loginForm").onsubmit = login;
    $$('[data-logout]').forEach(b => b.onclick = async () => { await auth.signOut(); location.reload(); });
    $("#openContacts").onclick = async () => {
      hideWorkAreas();
      $("#operatorApp").classList.remove("hidden");
      await loadDashboard();
    };
    $("#openEventsArea").onclick = async () => {
      hideWorkAreas();
      $("#eventsApp").classList.remove("hidden");
      await loadShipEvents();
    };
    $("#contactsMenuButton").onclick = openWorkspaceChoice;
    $("#eventsMenuButton").onclick = openWorkspaceChoice;
    $("#backToShipEvents").onclick = loadShipEvents;
    $("#exportShipEvent").onclick = exportShipEvent;
    $("#exportShipEventPdf").onclick = exportShipEventPdf;
    $("#saveShipEmbarkTime").onclick = saveShipEmbarkTime;
    $("#shipParticipantSearch").oninput = () => openShipEvent(selectedShipEvent);
    $("#showManualConsultant").onclick = () => $("#manualConsultantForm").classList.remove("hidden");
    $("#cancelManualConsultant").onclick = () => $("#manualConsultantForm").classList.add("hidden");
    $("#manualConsultantForm").onsubmit = saveManualConsultant;
    $("#search").oninput = renderLeads;
    $("#filter").onchange = renderLeads;
    $("#typeFilter").onchange = renderLeads;
    $("#back").onclick = () => { if(messageSaving) return toast("Attendi il salvataggio del messaggio"); $("#leadSheet").classList.add("hidden"); document.body.style.overflow = ""; loadDashboard(); };
    $("#events").innerHTML = eventNames.map(n => `<button class="event" type="button">${n}</button>`).join("");
    $$('[data-group] .chip').forEach(c => c.onclick = e => { e.preventDefault(); [...c.parentElement.children].forEach(x => x.classList.toggle("active", x === c)); });
    $$('.event').forEach(b => b.onclick = () => {
      const type = b.textContent.trim();
      if (savedEvents.has(type)) {
        b.classList.toggle("remove-pending");
        return toast(b.classList.contains("remove-pending") ? "Evento da togliere: premi Aggiorna scheda" : "Rimozione annullata");
      }
      b.classList.toggle("pending");
    });
    $("#updateContact").onclick = () => { if(!messageSaving) saveContact(); };
    $("#firstMessage").onclick = saveAndOpenWhatsApp;
    $("#bootcampConfigForm").onsubmit = saveBootcampConfig;
    $("#next").onclick = openNextStep;
    $("#cancelStep").onclick = () => $("#nextDialog").close();
    const noteField = $("#stepNote").closest(".field");
    noteField.insertAdjacentHTML("beforebegin", '<div class="field"><label>Data e ora (facoltative)</label><input id="calendarWhen" type="datetime-local" /></div>');
    $("#nextForm").onsubmit = saveNextStep;
    $("#bootcampReport").onclick = exportReport;
  }

  initUI();
})();
