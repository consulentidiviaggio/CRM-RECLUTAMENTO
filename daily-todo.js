(function(root) {
  'use strict';
  function nextDay(day) {
    const value = new Date(day + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() + 1);
    return value.toISOString().slice(0,10);
  }
  function calendarUrl(day, tasks) {
    const dates = [day,nextDay(day)].map(value=>value.replace(/-/g,'')).join('/');
    const details = tasks.map(t => (t.done ? '[Fatto] ' : '[Da fare] ') + t.text).join('\n');
    return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
      action:'TEMPLATE',text:'Promemoria CRM · '+day,dates,details
    });
  }
  if (typeof module !== 'undefined') { module.exports = {nextDay, calendarUrl}; return; }
  function init({onBack, today}) {
    const $ = id => document.getElementById(id);
    const form = $('todoForm'), input = $('todoText'), date = $('todoDate'), list = $('todoItems');
    const status = $('todoStatus'), count = $('todoCount'), archive = $('todoArchive');
    let ref, tasks = [], busy = false, ready = false, generation = 0, unsubscribe, hadError = false;
    const forDay = () => tasks.filter(t => t.day === date.value);
    function render() {
      archive.replaceChildren(new Option('Scegli un giorno archiviato',''));
      for (const day of [...new Set(tasks.map(t=>t.day))].sort().reverse()) {
        archive.add(new Option(day.split('-').reverse().join('/'), day));
      }
      archive.value = date.value;
      const rows = forDay();
      count.textContent = ready ? rows.filter(t=>t.done).length+' di '+rows.length+' completati' : '';
      form.querySelector('button').disabled = busy || !ready;
      $('todoPdf').disabled = !ready || !rows.length;
      $('todoCalendar').disabled = !ready || !rows.length;
      list.replaceChildren();
      if (ready && !rows.length) list.textContent = 'Nessun promemoria per questa data.';
      for (const task of rows) {
        const item=document.createElement('li'), label=document.createElement('label'), check=document.createElement('input'), text=document.createElement('span');
        check.type='checkbox'; check.checked=task.done; check.disabled=busy; text.textContent=task.text;
        check.addEventListener('change', () => save(() => ref.doc(task.id).update({done:check.checked})));
        label.append(check,text); item.append(label); list.append(item);
      }
    }
    function close() {
      generation++;
      unsubscribe?.(); unsubscribe=undefined; ready=false; busy=false; hadError=false; ref=undefined; tasks=[];
    }
    function open(db, uid) {
      close();
      const run = generation;
      ref=db.collection('users').doc(uid).collection('dailyTasks');
      date.value=today(); input.value=''; status.textContent='Caricamento promemoria…'; render();
      unsubscribe=ref.onSnapshot(snapshot=>{
        if(generation!==run) return;
        tasks=snapshot.docs.map(doc=>({...doc.data(),id:doc.id}));
        ready=true;
        if(!hadError) status.textContent='';
        render();
      },error=>{
        if(generation!==run) return;
        ready=false; render();
        status.textContent=error.code==='permission-denied'
          ? 'Archivio non accessibile. Pubblica la regola Firebase per la To do list.'
          : 'Impossibile caricare i promemoria. Torna al menu e riprova.';
      });
    }
    async function save(write, onSaved) {
      if(!ready || busy) return;
      const run=generation; busy=true; hadError=false; status.textContent='Salvataggio…'; render();
      try {
        await write();
        if(generation===run) { onSaved?.(); status.textContent='Salvato nell’archivio.'; }
      } catch(error) {
        if(generation===run) { hadError=true; status.textContent='Salvataggio non riuscito. Riprova.'; }
      } finally {
        if(generation===run) { busy=false; render(); }
      }
    }
    form.onsubmit=event=>{
      event.preventDefault();
      const day=date.value, text=input.value.trim();
      if(!day || !text || text.length>300) return;
      save(()=>ref.add({day,text,done:false}),()=>{if(input.value.trim()===text) input.value='';});
    };
    date.onchange=()=>{if(!date.value) date.value=today(); render();};
    archive.onchange=()=>{if(archive.value) date.value=archive.value; render();};
    $('todoToday').onclick=()=>{date.value=today(); render();};
    $('todoBack').onclick=onBack;
    $('todoCalendar').onclick=()=>window.open(calendarUrl(date.value,forDay()),'_blank','noopener,noreferrer');
    $('todoPdf').onclick=()=>{
      try {
        const pdf=new root.jspdf.jsPDF();
        pdf.setFontSize(17);
        pdf.text('To do list - '+date.value.split('-').reverse().join('/'),14,20);
        pdf.autoTable({
          startY:27,head:[['Stato','Promemoria']],
          body:forDay().map(t=>[t.done?'Fatto':'Da fare',t.text]),
          headStyles:{fillColor:[180,73,0]},columnStyles:{0:{cellWidth:26}}
        });
        pdf.save('To-do-'+date.value+'.pdf');
      } catch(error) { status.textContent='PDF non disponibile. Ricarica il CRM e riprova.'; }
    };
    return {open,close};
  }
  root.CRM_DAILY_TODO={init};
})(typeof window==='undefined'?globalThis:window);
