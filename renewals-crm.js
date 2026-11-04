(() => {
'use strict';
const stats=window.CRM_RENEWALS_REPORT;
const core=window.CRM_RENEWALS_CORE, root=document.querySelector('#renewalsApp'), $=s=>root.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v)||0);
const stamp=v=>v?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Rome'}).format(new Date(v)):'';
let whatsappWindow=null,goal=null;
let ctx=null,documents=[],selected='',busy=false,generation=0,pending=null;
const headersDefault=['Nome','Cognome','Email','Cellulare','Rinnovi','Stato lavorazione','Data scadenza','Fatturato annuale','Fatturato totale'];
function access(){if(!ctx||ctx.profile.operatorCode!=='ST'||ctx.auth.currentUser?.uid!==ctx.profile.uid)throw Error('Accesso ai rinnovi riservato a Stefano.');}
function notice(text,error=false){$('#renewalNotice').textContent=text;$('#renewalNotice').classList.toggle('renewal-error',error);}
function fail(error){if(!$('#renewalEditor').hidden){$('#renewalEditorStatus').textContent=error.message;$('#renewalEditorStatus').classList.toggle('renewal-error',true);}notice(error.code==='permission-denied'?'Accesso Firebase ai rinnovi non autorizzato. Pubblica la regola dedicata inclusa nell’aggiornamento.':error.message,true);}
function collection(){access();return ctx.db.collection('consultantRenewals');}
function controls(){root.querySelectorAll('button,input,select').forEach(b=>b.disabled=busy||b.dataset.intrinsicDisabled==='true');}
function scoped(includeExcluded=false){return documents.filter(d=>(selected==='all'||d.expiration===selected)&&(includeExcluded||!core.excluded(d.data,d.history))).sort((a,b)=>core.compare(a.data,b.data));}
function dates(){const options=[...new Set(documents.map(d=>d.expiration).filter(Boolean))].sort();if(selected!=='all'&&!options.includes(selected))selected=options.at(-1)||'';$('#renewalExpiry').innerHTML='<option value="all">Tutte le scadenze</option>'+options.map(d=>`<option value="${d}">${esc(core.formatDate(d))}</option>`).join('');$('#renewalExpiry').value=selected;}
function value(row,h){const v=core.val(row,h);if(core.norm(h)==='RINNOVI')return core.count(row)===0?'Primo rinnovo':v+' rinnovi precedenti';if(core.norm(h)==='DATA SCADENZA')return core.formatDate(core.day(v));if((core.norm(h).includes('FATTURATO')||core.norm(h)==='IMPORTO RINNOVO RICHIESTO'))return money(v);return v===''?'—':String(v);}
function currentFilters(){return {date:selected,month:$('#renewalMonth').value,search:$('#renewalSearch').value,state:$('#renewalFilter').value,price:$('#renewalPrice').value,type:$('#renewalType').value,urgent:$('#renewalOnlyUrgent').checked};}
function visible(){return documents.filter(d=>stats.filters(d,currentFilters())).sort((a,b)=>core.compare(a.data,b.data));}
function showProgress(){const p=stats.progress(documents,goal);$('#renewalGoalSummary').textContent=p?`Anno ${goal.year} · Rinnovi: ${p.count} / ${goal.targetCount} (${(p.countRate*100).toFixed(1)}%) · Importo confermato: ${money(p.amount)} / ${money(goal.targetAmount)} · Mancano ${p.remainingCount} rinnovi e ${money(p.remainingAmount)}. Saldo iniziale fino al ${core.formatDate(goal.cutoff)}; ${p.addedCount} conferme successive aggiunte. ${p.notAdded} schede già rinnovate non aggiunte al saldo (precedenti al riferimento o senza data di conferma).`:'Nessun saldo iniziale salvato per questo anno. Configura obiettivi e data di riferimento.';}
function render(){
 showProgress();
 const all=scoped(),excluded=scoped(true).filter(d=>core.excluded(d.data,d.history)),q=$('#renewalSearch').value.trim().toLowerCase(),filter=$('#renewalFilter').value;
 const pool=['excluded','Premium','Advance'].includes(filter)?excluded:all, urgents=all.filter(d=>core.urgent(d.data,d.history));
 $('#renewalTotal').textContent=all.length;$('#renewalFirst').textContent=all.filter(d=>core.count(d.data)===0).length;$('#renewalRenewed').textContent=all.filter(d=>core.status(d.data,d.history)==='Rinnovato').length;$('#renewalUrgentCount').textContent=urgents.length;$('#renewalDateTitle').textContent=(selected==='all'?'Tutte le scadenze':core.formatDate(selected))||'Carica il primo file';
 $('#renewalUrgents').innerHTML=urgents.length?urgents.map(d=>`<button data-renewal-jump="${esc(d.id)}"><strong>${esc(core.val(d.data,'Nome')+' '+core.val(d.data,'Cognome'))}</strong><span>Rinnovo inviato · nessun cambio di stato da 15 giorni</span></button>`).join(''):'<p class="muted">Nessun rinnovo urgente.</p>';
 const list=visible();
 $('#renewalResultCount').textContent=`${list.length} di ${pool.length} · ${excluded.length} Premium / Advance esclusi`;
 $('#renewalCards').innerHTML=list.map(d=>{
 const row=d.data,status=core.status(row,d.history),cost=core.amount(row),history=d.history||[],headers=d.headers||headersDefault;
 return `<article class="renewal-card" data-renewal-card="${esc(d.id)}"><div class="renewal-card-top"><div><div class="eyebrow">${core.count(row)===0?'PRIMO RINNOVO':'RINNOVO CONSULENTE'}</div><h2>${esc(core.val(row,'Nome')+' '+core.val(row,'Cognome'))}</h2></div><div class="renewal-price">${cost}€<small>contributo rinnovo</small></div></div><div class="renewal-toolbar"><button data-renewal-edit="${esc(d.id)}">Modifica scheda</button><button data-renewal-cycle="${esc(d.id)}">Aggiungi scadenza</button></div><dl>${headers.map(h=>`<div><dt>${esc(h)}</dt><dd>${esc(value(row,h))}</dd></div>`).join('')}</dl><div class="renewal-state"><span>${esc(status)}</span>${core.urgent(row,history)?'<strong class="renewal-error">Urgente · 15 giorni</strong>':''}</div><details class="renewal-preview"><summary>Anteprima messaggio WhatsApp · ${cost}€</summary><pre>${esc(core.message(row))}</pre></details><div class="renewal-actions"><button type="button" data-renewal-email="${esc(d.id)}">Email consulente · non rinnovo dalla sede</button>${core.allowed.map(type=>`<button type="button" data-renewal-action="${esc(type)}" data-renewal-id="${esc(d.id)}" aria-pressed="${status===type}" ${type==='Rinnovo inviato'&&!core.phone(row)?'disabled data-intrinsic-disabled="true"':''}>${type==='Rinnovo inviato'?'Rinnovo inviato · WhatsApp Web ↗':esc(type)}</button>`).join('')}</div><p class="renewal-help">Un secondo clic sullo stato attivo lo annulla e ripristina il precedente. L’invio effettivo si conferma su WhatsApp Web. Premium e Advance restano recuperabili dal filtro Esclusi.</p><section class="renewal-timeline"><h3>Timeline · ${history.length}</h3>${history.length?'<ol>'+history.map(e=>`<li class="${e.cancelled?'renewal-cancelled':''}"><strong>${esc(e.type)}${e.cancelled?' · ANNULLATO':''}</strong><small>${esc(stamp(e.at))}${e.kind==='message'?' · clic WhatsApp, invio manuale':''}${e.mailDraft?' · apertura bozza Outlook, invio manuale':''}${e.cancelledAt?' · annullato '+esc(stamp(e.cancelledAt)):''}</small>${e.changes?.length?'<ul>'+e.changes.map(c=>'<li>'+esc(c.field)+': '+esc(c.before)+' → '+esc(c.after)+'</li>').join('')+'</ul>':''}</li>`).join('')+'</ol>':'<p class="muted">Nessuna attività registrata.</p>'}</section></article>`;
 }).join('')||'<p class="empty">Nessun consulente. Carica un Excel/CSV e scegli la scadenza da importare.</p>';
}
async function load(){if(busy)return;access();busy=true;controls();const token=generation;notice('Caricamento rinnovi…');try{const snap=await collection().where('operatorCode','==','ST').get({source:'server'});if(token!==generation)return;documents=snap.docs.map(d=>({id:d.id,...d.data()}));dates();await loadGoal();render();notice('Rinnovi aggiornati alle '+stamp(new Date()));}catch(e){if(token===generation)fail(e);}finally{if(token===generation){busy=false;controls();}}}
async function act(id,type){
 if(busy)return;access();const doc=documents.find(d=>d.id===id);if(!doc)return;
 const messageClick=type==='Rinnovo inviato',removing=core.status(doc.data,doc.history)===type;
 if(messageClick&&!core.phone(doc.data))return notice('Cellulare non valido.',true);
 let popup=null;if(messageClick&&!removing){try{popup=whatsappWindow&&!whatsappWindow.closed?whatsappWindow:window.open('about:blank','icvRinnoviWhatsApp');whatsappWindow=popup;popup?.focus?.();}catch{popup=window.open('about:blank','icvRinnoviWhatsApp');whatsappWindow=popup;}}
 if(messageClick&&!removing&&!popup)return notice('Consenti i popup per aprire WhatsApp Web. Nessuna azione registrata.',true);
 if(popup){try{popup.document.body.textContent='Salvataggio rinnovo e preparazione WhatsApp Web…';}catch{}}
 busy=true;controls();const token=generation;
 try{
  const ref=collection().doc(id);const result=await ctx.db.runTransaction(async transaction=>{
   access();const snapshot=await transaction.get(ref);if(!snapshot.exists)throw Error('Consulente non trovato. Premi Aggiorna.');const current=snapshot.data();if(current.operatorCode!=='ST')throw Error('Operatore non autorizzato.');
   // Intento esplicito: se un altro dispositivo ha cambiato stato, non eseguire un toggle diverso da quello richiesto.
   if((core.status(current.data,current.history)===type)!==removing)throw Error('Lo stato è cambiato su un altro dispositivo. Premi Aggiorna e riprova.');
   const next=core.transition(current.data,current.history,type,messageClick?'message':'status');
   transaction.update(ref,{history:next.history,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:ctx.profile.uid});
   return {...current,history:next.history,cancelled:next.cancelled};
  });
  if(token!==generation){popup?.close();return;}
  const index=documents.findIndex(d=>d.id===id);documents[index]={...doc,...result};render();
  if(popup){popup.location.href='https://web.whatsapp.com/send?phone='+core.phone(result.data)+'&text='+encodeURIComponent(core.message(result.data));}
  notice(result.cancelled?'Stato annullato; ripristinato il precedente.':'Stato e timeline salvati.');
 }catch(e){if(token===generation)fail(e);}finally{if(token===generation){busy=false;controls();}}
}
async function documentId(row){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(core.key(row)));return 'ST_'+Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
function cleanRow(row,headers){const data={};for(const h of headers){const v=row[h];data[h]=core.norm(h)==='DATA SCADENZA'?core.day(v):v==null?'':typeof v==='number'||typeof v==='boolean'?v:String(v);}return data;}
function prepare(rows,headers,name,histories=null){
 const required=['Nome','Cognome','Cellulare','Rinnovi','Data scadenza'];for(const h of required)if(!headers.some(x=>core.norm(x)===core.norm(h)))throw Error('Colonna mancante: '+h);
 const ids=new Set();const parsed=rows.map((row,i)=>{const data=cleanRow(row,headers);try{core.validateRow(data);}catch(e){throw Error('Riga '+(i+2)+': '+e.message);}const k=core.key(data);if(ids.has(k))throw Error('Consulente duplicato per la stessa scadenza: '+core.val(data,'Nome')+' '+core.val(data,'Cognome'));ids.add(k);return data;});
 if(!parsed.length)throw Error('Il file non contiene consulenti.');const options=[...new Set(parsed.map(r=>core.day(core.val(r,'Data scadenza'))))].sort();
 pending={rows:parsed,headers,name,histories};$('#renewalImportDate').innerHTML='<option value="all">Tutte le scadenze del file</option>'+options.map(d=>`<option value="${d}">${esc(core.formatDate(d))}</option>`).join('');$('#renewalImportDate').value=options.includes(selected)?selected:options.at(-1);$('#renewalImportPanel').hidden=false;previewImport();
}
function previewImport(){if(!pending)return;const date=$('#renewalImportDate').value,rows=pending.rows.filter(r=>core.day(core.val(r,'Data scadenza'))===date||date==='all'),first=rows.filter(r=>core.count(r)===0).length;$('#renewalImportInfo').textContent=`${pending.name} · ${rows.length} consulenti: ${first} primi rinnovi e ${rows.length-first} successivi. Importi automatici 99€/49€, salvo cifre personalizzate. Timeline e stati già presenti verranno conservati.`;}
async function importFile(file,backup){access();if(busy)return;try{
 if(!window.XLSX&&!backup)throw Error('Libreria Excel non disponibile: ricarica la pagina con Internet attivo.');
 if(backup){const data=JSON.parse(await file.text());if(data.format!=='icv-rinnovi-1'||!Array.isArray(data.rows)||!Array.isArray(data.headers))throw Error('Backup simulazione non valido.');prepare(data.rows,data.headers,data.sourceName||file.name,data.history||{});}
 else{const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});const headers=(raw.shift()||[]).map(h=>String(h).trim());if(headers.some(h=>!h)||new Set(headers.map(core.norm)).size!==headers.length)throw Error('Intestazioni vuote o duplicate nel file.');prepare(raw.filter(r=>r.some(v=>v!==''&&v!=null)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??'']))),headers,file.name);}
 }catch(e){fail(e);}}
function validateHistory(events){return (events||[]).map(e=>{if(!(core.allowed.includes(e.type)||e.kind==='edit')||!['message','status','edit'].includes(e.kind)||!Number.isFinite(Date.parse(e.at)))throw Error('Il backup contiene una timeline non valida.');return {type:e.type,kind:e.kind,at:new Date(e.at).toISOString(),...(e.text?{text:String(e.text)}:{}),...(e.cancelled?{cancelled:true,...(e.cancelledAt&&Number.isFinite(Date.parse(e.cancelledAt))?{cancelledAt:new Date(e.cancelledAt).toISOString()}:{})}:{})};});}
async function commitImport(){
 if(busy||!pending)return;access();const date=$('#renewalImportDate').value,source=pending,rows=source.rows.filter(r=>core.day(core.val(r,'Data scadenza'))===date||date==='all');if(!rows.length)return;
 busy=true;controls();const token=generation;let written=0,outcome='',failed=false;
 try{
  const items=await Promise.all(rows.map(async row=>{const k=core.key(row),existing=documents.find(d=>core.key(d.data)===k||(d.identityAliases||[]).includes(k));if(existing&&core.val(row,'Importo rinnovo richiesto')===''&&core.val(existing.data,'Importo rinnovo richiesto')!=='')row={...row,'Importo rinnovo richiesto':core.val(existing.data,'Importo rinnovo richiesto')};return {row,id:existing?.id||await documentId(row)};}));
  for(let start=0;start<items.length;start+=150){access();if(token!==generation)throw Error('Importazione interrotta: sessione cambiata.');const chunk=items.slice(start,start+150);
   if(source.histories){for(const item of chunk){const imported=validateHistory(source.histories[core.key(item.row)]||[]),ref=collection().doc(item.id);await ctx.db.runTransaction(async tx=>{access();const snapshot=await tx.get(ref),old=snapshot.exists?snapshot.data():{};if(snapshot.exists&&old.operatorCode!=='ST')throw Error('Operatore non autorizzato.');const history=(old.history||[]).map(e=>({...e}));for(const event of imported){const found=history.find(e=>e.type===event.type&&e.kind===event.kind&&e.at===event.at);if(!found)history.push(event);/* Mai sovrascrivere annullamenti o azioni del CRM con un backup vecchio. */}history.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));tx.set(ref,{operatorCode:'ST',data:item.row,headers:[...new Set([...source.headers,...(core.val(item.row,'Importo rinnovo richiesto')!==''?['Importo rinnovo richiesto']:[])])],expiration:core.day(core.val(item.row,'Data scadenza')),sourceFile:source.name,history,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:ctx.profile.uid},{merge:true});});written++;}}
   else{const batch=ctx.db.batch();for(const item of chunk)batch.set(collection().doc(item.id),{operatorCode:'ST',data:item.row,headers:[...new Set([...source.headers,...(core.val(item.row,'Importo rinnovo richiesto')!==''?['Importo rinnovo richiesto']:[])])],expiration:core.day(core.val(item.row,'Data scadenza')),sourceFile:source.name,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:ctx.profile.uid},{merge:true});await batch.commit();written+=chunk.length;}
   notice('Importati '+written+' di '+rows.length+' consulenti…');
  }
  selected=date;pending=null;$('#renewalImportPanel').hidden=true;outcome='Importazione completata: '+written+' consulenti.';
 }catch(e){if(token===generation){failed=true;outcome='Importati '+written+' consulenti prima dell’interruzione. '+e.message+'. Puoi ripetere: gli stessi consulenti non vengono duplicati.';}}
 finally{if(token===generation){busy=false;controls();await load();if(outcome)notice(outcome,failed);}}
}
function report(){
 access();if(!window.XLSX)return notice('Libreria Excel non disponibile.',true);
 const list=visible(),m=stats.metrics(list),rows=list.map(d=>({...d.data,'Contributo rinnovo €':core.amount(d.data),'Tipologia rinnovo':core.count(d.data)===0?'Primo rinnovo':'Rinnovo successivo','Ultimo stato':core.status(d.data,d.history),'Escluso dalla lista rinnovi':core.excluded(d.data,d.history)?'Sì':'No','Urgente rinnovo':core.urgent(d.data,d.history)?'Sì':'No'}));
 const report=[{Indicatore:'Esportazione',Valore:stamp(new Date())},{Indicatore:'Ambito',Valore:'Lista filtrata: '+JSON.stringify(currentFilters())},{Indicatore:'Rinnovi previsti',Valore:m.total.total},{Indicatore:'Rinnovi confermati',Valore:m.total.confirmed},{Indicatore:'Importo confermato (non pagamento verificato)',Valore:m.total.amount},{Indicatore:'Tasso rinnovo',Valore:m.rate},{Indicatore:'Esclusi Premium/Advance nella selezione',Valore:m.excluded}];
 for(const [label,x] of [['Primi rinnovi',m.first],['Rinnovi successivi',m.later],['Totale',m.total]])report.push({Indicatore:label,Totali:x.total,'Con fatturato annuale':x.withTurn,'Senza fatturato annuale':x.withoutTurn,'Confermati con fatturato':x.confirmedWith,'Confermati senza fatturato':x.confirmedWithout,'Confermati totali':x.confirmed,'Importo confermato €':x.amount,'Fatturato annuale consulenti in scadenza':x.turnover,'Fatturato annuale mantenuto':x.retained,'Fatturato annuale non mantenuto':x.turnover-x.retained});
 for(const [state,n] of Object.entries(m.states))report.push({Indicatore:state,Valore:n});
 for(const month of [...new Set(list.map(d=>d.expiration.slice(0,7)))].sort()){const x=stats.metrics(list.filter(d=>d.expiration.startsWith(month)));report.push({Indicatore:'Mese '+month,Totali:x.total.total,'Confermati totali':x.total.confirmed,'Importo confermato €':x.total.amount});}
 const p=stats.progress(documents,goal);if(p){report.push({Indicatore:'OBIETTIVI ANNUALI — tutti i rinnovi dell’anno, indipendenti dai filtri',Valore:goal.year});for(const [label,v] of [['Obiettivo rinnovi',goal.targetCount],['Obiettivo importo confermato',goal.targetAmount],['Saldo iniziale rinnovi',goal.baseCount],['Saldo iniziale importo',goal.baseAmount],['Data saldo iniziale',goal.cutoff],['Nuove conferme successive',p.addedCount],['Totale rinnovi raggiunto',p.count],['Totale importo raggiunto',p.amount],['Rinnovi residui',p.remainingCount],['Importo residuo',p.remainingAmount]])report.push({Indicatore:label,Valore:v});}
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'SORGENTE');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(report),'REPORT');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(list.flatMap(d=>(d.history||[]).map(e=>({Nome:core.val(d.data,'Nome'),Cognome:core.val(d.data,'Cognome'),Email:core.val(d.data,'Email'),Scadenza:d.expiration,Evento:e.type,Data:stamp(e.at),Annullato:e.cancelled?'Sì':'No','Messaggio preparato':e.text||'','Bozza email':e.mailDraft?'Sì':''})))),'TIMELINE');if(wb.SheetNames){for(const name of wb.SheetNames){const sheet=wb.Sheets[name];const headers=name==='SORGENTE'?Object.keys(rows[0]||{}):name==='REPORT'?[...new Set(report.flatMap(r=>Object.keys(r)))]:[];sheet['!cols']=headers.map((h,i)=>({wch:name==='REPORT'&&i===0?65:Math.min(32,Math.max(18,h.length+2))}));if(name==='SORGENTE'&&sheet['!ref'])sheet['!autofilter']={ref:sheet['!ref']};}}XLSX.writeFile(wb,'Riepilogo-rinnovi-'+selected+'.xlsx');
}
async function loadGoal(){
 access();const year=$('#renewalGoalYear').value||String(new Date().getFullYear());
 try{const snap=await ctx.db.collection('renewalGoals').doc('ST_'+year).get({source:'server'});goal=snap.exists?snap.data():null;$('#renewalGoalNotice').textContent='';for(const [field,id] of [['targetCount','TargetCount'],['targetAmount','TargetAmount'],['baseCount','BaseCount'],['baseAmount','BaseAmount'],['cutoff','Cutoff']])$('#renewalGoal'+id).value=goal?.[field]??(field==='targetCount'?250:field==='targetAmount'?15000:field==='cutoff'?'':0);}catch(e){goal=null;$('#renewalGoalNotice').textContent='Obiettivi non caricati: '+e.message+' Pubblica la regola renewalGoals della v65.';}
 showProgress();
}
async function saveGoal(event){
 event.preventDefault();if(busy)return;access();
 const data={operatorCode:'ST',year:Number($('#renewalGoalYear').value),targetCount:Number($('#renewalGoalTargetCount').value),targetAmount:Number($('#renewalGoalTargetAmount').value),baseCount:Number($('#renewalGoalBaseCount').value),baseAmount:Number($('#renewalGoalBaseAmount').value),cutoff:$('#renewalGoalCutoff').value};
 if(!Number.isInteger(data.year)||data.year<2020||data.year>2100||!core.day(data.cutoff)||!data.cutoff.startsWith(String(data.year))||['targetCount','targetAmount','baseCount','baseAmount'].some(k=>!Number.isFinite(data[k])||data[k]<0)||!Number.isInteger(data.targetCount)||!Number.isInteger(data.baseCount))return $('#renewalGoalNotice').textContent='Controlla anno, importi, conteggi e data del saldo iniziale (nello stesso anno).';
 busy=true;controls();try{const ref=ctx.db.collection('renewalGoals').doc('ST_'+data.year),revision=goal?.revision||0;await ctx.db.runTransaction(async tx=>{access();const snap=await tx.get(ref),old=snap.exists?snap.data():null;if((old?.revision||0)!==revision)throw Error('Obiettivi modificati da un altro dispositivo. Premi Aggiorna.');const saved={...data,revision:revision+1,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:ctx.profile.uid};tx.set(ref,saved);});goal={...data,revision:revision+1};showProgress();$('#renewalGoalNotice').textContent='Obiettivi e saldo iniziale salvati in Firebase.';}catch(e){$('#renewalGoalNotice').textContent=e.message;}finally{busy=false;controls();}
}
async function emailConsultant(id){
 if(busy)return;access();const doc=documents.find(d=>d.id===id);if(!doc)return;const address=String(core.val(doc.data,'Email')).trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))return notice('Email consulente non valida.',true);
 const type='Non rinnovato dalla sede',removing=core.status(doc.data,doc.history)===type;busy=true;controls();
 try{const ref=collection().doc(id),result=await ctx.db.runTransaction(async tx=>{access();const snap=await tx.get(ref);if(!snap.exists||snap.data().operatorCode!=='ST')throw Error('Consulente non trovato.');const current=snap.data();if((core.status(current.data,current.history)===type)!==removing)throw Error('Stato cambiato: premi Aggiorna.');const next=core.transition(current.data,current.history,type,'status');if(!next.cancelled){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(core.val(current.data,'Email')).trim()))throw Error('Email attuale non valida: correggi la scheda.');const e=next.history.at(-1);e.mailDraft=true;e.recipient=String(core.val(current.data,'Email'));e.text=stats.email(current.data);}tx.update(ref,{history:next.history,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:ctx.profile.uid});return {...current,history:next.history,cancelled:next.cancelled};});documents[documents.findIndex(d=>d.id===id)]={id,...result};render();if(!result.cancelled){const uri='mailto:'+encodeURIComponent(String(core.val(result.data,'Email')).trim())+'?subject='+encodeURIComponent('Comunicazione sulla collaborazione con iConsulentidiViaggio.it')+'&body='+encodeURIComponent(stats.email(result.data));$('#renewalOutlookFallback').href=uri;$('#renewalOutlookFallback').hidden=false;window.location.href=uri;notice('Stato salvato. Bozza richiesta a Outlook: invio manuale. Se non si apre, usa il collegamento Apri Outlook.');}else notice('Stato annullato. Nessuna nuova email aperta.');}catch(e){fail(e);}finally{busy=false;controls();}
}

function rowSignature(row){return JSON.stringify(Object.keys(row).sort().map(k=>[k,row[k]]));}
let editing=null;
function openEditor(id,newCycle=false){
 if(busy)return;access();const doc=documents.find(d=>d.id===id);if(!doc)return;
 const headers=[...new Set([...(doc.headers||headersDefault),'Importo rinnovo richiesto'])];editing={id,newCycle,headers,original:rowSignature(doc.data)};$('#renewalEditorStatus').textContent='';
 $('#renewalEditorTitle').textContent=newCycle?'Aggiungi una nuova scadenza':'Modifica scheda consulente';
 $('#renewalEditorHelp').textContent=newCycle?'Nuovo ciclo con stato iniziale e timeline separati. Le scadenze precedenti restano in archivio.':'Le modifiche conservano stati e timeline. I messaggi già preparati restano nello storico originale.';
 $('#renewalEditorFields').innerHTML=headers.map((h,i)=>{const n=core.norm(h),date=n==='DATA SCADENZA',numeric=n==='RINNOVI'||(n.includes('FATTURATO')||n==='IMPORTO RINNOVO RICHIESTO');let v=core.val(doc.data,h);if(n==='IMPORTO RINNOVO RICHIESTO')v=newCycle?'':core.val(doc.data,h);if(date)v=newCycle?'':core.day(v);if(newCycle&&n==='RINNOVI')v=core.count(doc.data)+1;if(newCycle&&n==='STATO LAVORAZIONE')v='NESSUNA';return `<label>${esc(h)}<input data-renewal-field="${i}" type="${date?'date':numeric?'number':'text'}" ${numeric?'min="0" step="'+(n==='RINNOVI'?'1':'any')+'"':''} value="${esc(v)}"></label>`;}).join('');
 $('#renewalEditor').hidden=false;$('#renewalEditor').scrollIntoView?.({behavior:'smooth'});
}
async function saveEditor(event){
 event.preventDefault();if(busy||!editing)return;access();const original=documents.find(d=>d.id===editing.id);if(!original)return;
 const headers=editing.headers,row={...original.data};
 for(const input of root.querySelectorAll('[data-renewal-field]')){const h=headers[Number(input.dataset.renewalField)],numeric=core.norm(h)==='RINNOVI'||(core.norm(h).includes('FATTURATO')||core.norm(h)==='IMPORTO RINNOVO RICHIESTO');row[h]=numeric&&input.value!==''?Number(input.value):input.value.trim();}
 try{core.validateRow(row);}catch(e){fail(e);return;}
 const k=core.key(row),duplicate=documents.find(d=>d.id!==original.id&&(core.key(d.data)===k||(d.identityAliases||[]).includes(k)));
 if(duplicate||editing.newCycle&&k===core.key(original.data))return notice('Esiste già una scheda per questo consulente e questa scadenza.',true);
 busy=true;controls();$('#renewalEditorStatus').textContent='Salvataggio in corso…';const token=generation,mode=editing.newCycle;
 try{
  const id=mode?await documentId(row):original.id,ref=collection().doc(id);
  const saved=await ctx.db.runTransaction(async tx=>{
   access();const snap=await tx.get(ref),current=snap.exists?snap.data():null;
   if(mode&&current)throw Error('Questa scadenza esiste già. Premi Aggiorna.');
   if(!mode&&(!current||current.operatorCode!=='ST'||rowSignature(current.data)!==editing.original))throw Error('Scheda modificata da un altro dispositivo. Chiudi la modifica, premi Aggiorna e riprova.');
   const now=new Date().toISOString(),history=mode?[]:[...(current.history||[])];
   history.push({type:mode?'Nuova scadenza creata':'Scheda modificata',kind:'edit',at:now,changes:headers.filter(h=>original.data[h]!==row[h]).map(h=>({field:h,before:original.data[h]??'',after:row[h]}))});
   const aliases=mode?[]:[...new Set([...(current.identityAliases||[]),core.key(current.data)])];
   const data={operatorCode:'ST',data:row,headers,expiration:core.day(core.val(row,'Data scadenza')),identityAliases:aliases,history,sourceFile:mode?'Nuova scadenza manuale':current.sourceFile||'',updatedBy:ctx.profile.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
   if(mode)tx.set(ref,data);else tx.update(ref,data);
   return {id,...data};
  });
  if(token!==generation)return;const i=documents.findIndex(d=>d.id===id);if(i<0)documents.push(saved);else documents[i]=saved;
  selected=saved.expiration;editing=null;$('#renewalEditor').hidden=true;dates();render();notice(mode?'Nuova scadenza salvata.':'Scheda aggiornata; timeline e stati conservati.');
 }catch(e){if(token===generation)fail(e);}finally{if(token===generation){busy=false;controls();}}
}
$('#renewalEditorForm').onsubmit=saveEditor;
$('#renewalEditorForm').addEventListener('invalid',event=>{const input=event.target;$('#renewalEditorStatus').textContent='Controlla il campo '+(input.closest('label')?.textContent||'selezionato')+': '+input.validationMessage;$('#renewalEditorStatus').classList.toggle('renewal-error',true);},true);
$('#renewalEditorCancel').onclick=()=>{editing=null;$('#renewalEditor').hidden=true;};

$('#renewalCards').addEventListener('click',event=>{const mail=event.target.closest('[data-renewal-email]');if(mail){emailConsultant(mail.dataset.renewalEmail);return;}const edit=event.target.closest('[data-renewal-edit]'),cycle=event.target.closest('[data-renewal-cycle]');if(edit||cycle){openEditor((edit||cycle).dataset[edit?'renewalEdit':'renewalCycle'],!!cycle);return;}const b=event.target.closest('[data-renewal-action]');if(b)act(b.dataset.renewalId,b.dataset.renewalAction);});
$('#renewalUrgents').addEventListener('click',event=>{const b=event.target.closest('[data-renewal-jump]');if(!b)return;$('#renewalFilter').value='';$('#renewalSearch').value='';render();[...root.querySelectorAll('[data-renewal-card]')].find(c=>c.dataset.renewalCard===b.dataset.renewalJump)?.scrollIntoView({behavior:'smooth'});});
$('#renewalGoalYear').value=String(new Date().getFullYear());$('#renewalGoalsForm').onsubmit=saveGoal;$('#renewalGoalYear').onchange=()=>loadGoal();for(const id of ['renewalPrice','renewalType','renewalOnlyUrgent'])$('#'+id).onchange=render;$('#renewalMonth').onchange=()=>{selected='all';dates();render();};
$('#renewalSearch').oninput=render;$('#renewalFilter').onchange=render;$('#renewalExpiry').onchange=()=>{selected=$('#renewalExpiry').value;render();};$('#renewalRefresh').onclick=load;$('#renewalReport').onclick=report;
$('#renewalUpload').onchange=e=>{if(e.target.files[0])importFile(e.target.files[0],false);e.target.value='';};$('#renewalRestore').onchange=e=>{if(e.target.files[0])importFile(e.target.files[0],true);e.target.value='';};$('#renewalImportDate').onchange=previewImport;$('#renewalImportConfirm').onclick=commitImport;$('#renewalImportCancel').onclick=()=>{pending=null;$('#renewalImportPanel').hidden=true;};
$('#renewalMenu').onclick=()=>{if(busy)return notice('Attendi il completamento del salvataggio.',true);ctx?.onBack();};
window.CRM_RENEWALS={async open(context){if(context.profile.operatorCode!=='ST')throw Error('Accesso non autorizzato.');ctx=context;generation++;busy=false;documents=[];selected='';$('#renewalSearch').value='';$('#renewalFilter').value='';$('#renewalMonth').value='';$('#renewalPrice').value='';$('#renewalType').value='';$('#renewalOnlyUrgent').checked=false;render();await load();},close(){generation++;editing=null;$('#renewalEditor').hidden=true;ctx=null;documents=[];pending=null;busy=false;goal=null;$('#renewalGoalSummary').textContent='';$('#renewalOutlookFallback').hidden=true;$('#renewalCards').innerHTML='';$('#renewalUrgents').innerHTML='';$('#renewalImportPanel').hidden=true;}};
})();
