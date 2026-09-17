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
    "Appuntamento fissato", "Chiamata fissata", "Chiamata effettuata",
    "Non risponde", "Numero non raggiungibile", "Primo contatto completato",
    "Materiale inviato", "Trailer inviato", "Interesse confermato",
    "Zoom proposta", "Bootcamp confermato", "Da richiamare",
    "Non interessato", "Attivazione completata", "Attivo come consulente"
  ];
  const answerFields = [
    "MOTIVAZIONE PRINCIPALE", "ESPERIENZA TURISMO", "ORGANIZZA GIÀ VIAGGI",
    "OBIETTIVO", "TEMPO DISPONIBILE", "RISULTATO ATTESO", "INTERESSE 1-10",
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
  }
  function showApp(level) {
    $("#loginPage").classList.add("hidden");
    $("#operatorApp").classList.toggle("hidden", level !== "operator");
    $("#adminApp").classList.toggle("hidden", level !== "admin");
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
      if (requestedLevel === "admin") renderAdmin(); else await loadDashboard();
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

  async function openLead(id) {
    current = leads.find(l => String(l.id) === String(id));
    if (!current) return;
    $("#firstMessage").classList.toggle("hidden", profile.operatorCode !== "ST");
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
    } catch (error) {
      $("#timeline").innerHTML = '<div class="empty">Impossibile caricare la scheda.</div>';
      toast(error.message, true);
    }
  }
  function timeline(events) {
    currentEvents = events;
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

  async function saveContact(extraEvents = []) {
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
        .filter(type => type && !savedEvents.has(type))
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
      newEvents.forEach(type => {
        const ref = db.collection("events").doc();
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
      timeline(newEvents.map(type => ({ type, createdAt:now, operatorName:profile.name })).concat(remainingEvents));
      toast("Scheda aggiornata ✓");
      return true;
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = "Aggiorna scheda"; }
    return false;
  }

  function firstMessageText() {
    const operatorName = profile.name || "Stefano";
    if (current.contactType === "DIRETTO") {
      return `Ciao 😊 sono ${operatorName} di iconsulentidiviaggio.it.

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
    return `Ciao 😊 sono ${operatorName} di iconsulentidiviaggio.it.

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
      const url = "https://wa.me/39" + phone(current.phone) + "?text=" + encodeURIComponent(firstMessageText());
      toast("Scheda aggiornata. Apertura WhatsApp…");
      window.location.href = url;
    } finally {
      button.disabled = false;
      button.textContent = "Salva e apri WhatsApp";
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
      const reportLeads = leads.filter(contact => contact.contactType !== "DIRETTO");
      const ids = new Set(reportLeads.map(contact => contact.id));
      const eventSnap = await db.collection("events").where("operatorCode","==",profile.operatorCode).get();
      const events = eventSnap.docs.map(d => ({ id:d.id, ...d.data() })).filter(e => ids.has(e.leadId) && !e.deleted);
      const summary = reportLeads.map(c => ({
        "LEAD ID":c.id, "NOME E COGNOME":c.name, "TELEFONO":c.phone || "", "EMAIL":c.email || "",
        "REGIONE":c.region || "", "OPERATORE":profile.name, "DATA BOOTCAMP":formatDate(c.bootcampDate,false),
        "STATO":c.status || "Da lavorare", "PROSSIMO STEP":c.nextStep || "", "DATA PROSSIMO STEP":formatDate(c.nextStepAt),
        "TOTALE EVENTI":events.filter(e => e.leadId === c.id).length
      }));
      const detail = events.map(e => ({
        "ID EVENTO":e.id, "LEAD ID":e.leadId, "DATA/ORA":formatDate(e.createdAt),
        "OPERATORE":e.operatorName || profile.name, "EVENTO":e.type || "", "DETTAGLIO":e.detail || "", "NOTA":e.note || ""
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "RIEPILOGO");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "EVENTI");
      XLSX.writeFile(wb, `Riepilogo Bootcamp - ${profile.name}.xlsx`);
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
    $("#search").oninput = renderLeads;
    $("#filter").onchange = renderLeads;
    $("#typeFilter").onchange = renderLeads;
    $("#back").onclick = () => { $("#leadSheet").classList.add("hidden"); document.body.style.overflow = ""; loadDashboard(); };
    const nums = Array.from({length:10},(_,i) => `<button class="chip" type="button">${i+1}</button>`).join("");
    $(".score").innerHTML = nums;
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
    $("#updateContact").onclick = () => saveContact();
    $("#firstMessage").onclick = saveAndOpenWhatsApp;
    $("#next").onclick = openNextStep;
    $("#cancelStep").onclick = () => $("#nextDialog").close();
    const noteField = $("#stepNote").closest(".field");
    noteField.insertAdjacentHTML("beforebegin", '<div class="field"><label>Data e ora (facoltative)</label><input id="calendarWhen" type="datetime-local" /></div>');
    $("#nextForm").onsubmit = saveNextStep;
    $("#bootcampReport").onclick = exportReport;
  }

  initUI();
})();
