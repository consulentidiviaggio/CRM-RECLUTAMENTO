/* Funzioni condivise dei rinnovi: nessuna connessione o scrittura remota. */
(function(root){
'use strict';
const norm=v=>String(v??'').trim().toLocaleUpperCase('it');
function day(v){
 if(v?.toDate)v=v.toDate();
 if(v instanceof Date&&!isNaN(v))return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(v);
 if(typeof v==='number'&&root.XLSX){const d=root.XLSX.SSF.parse_date_code(v);return d?calendar(d.y,d.m,d.d):'';}
 const s=String(v??'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);if(m)return calendar(+m[1],+m[2],+m[3]);
 m=s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);return m?calendar(+m[3],+m[2],+m[1]):'';
}
function calendar(y,m,d){const date=new Date(Date.UTC(y,m-1,d,12));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';}
function val(row,key){const k=Object.keys(row).find(k=>norm(k)===norm(key));return row[k]??'';}
function key(row){return [String(val(row,'Email')).trim().toLowerCase()||String(val(row,'Cellulare')).replace(/\D/g,'')||norm(val(row,'Nome')+' '+val(row,'Cognome')),day(val(row,'Data scadenza'))].join('|');}
function count(row){const v=val(row,'Rinnovi');return v!==''&&Number.isInteger(Number(v))&&Number(v)>=0?Number(v):null;}
const amount=row=>val(row,'Importo rinnovo richiesto')!==''?Number(val(row,'Importo rinnovo richiesto')):count(row)===null?null:count(row)===0?99:49;
const active=events=>(events||[]).filter(e=>!e.cancelled);
function initial(row){const s=norm(val(row,'Stato lavorazione'));return ['RINNOVOPAGATO','RINNOVATO'].includes(s)?'Rinnovato':s==='NESSUNA'||!s?'Da contattare':String(val(row,'Stato lavorazione'));}
const status=(row,events)=>active(events).filter(e=>e.kind!=='edit').at(-1)?.type||initial(row);
const excluded=(row,events)=>['Premium','Advance'].includes(status(row,events));
function urgent(row,events,now=Date.now()){if(excluded(row,events))return false;const e=active(events);let i=-1;for(let j=e.length-1;j>=0;j--)if(e[j].kind==='message'){i=j;break;}return i>=0&&!e.slice(i+1).some(x=>x.kind==='status')&&now-Date.parse(e[i].at)>=15*86400000;}
function compare(a,b){return Number(count(b)===0)-Number(count(a)===0)||String(val(a,'Cognome')).trim().localeCompare(String(val(b,'Cognome')).trim(),'it',{sensitivity:'base'})||String(val(a,'Nome')).trim().localeCompare(String(val(b,'Nome')).trim(),'it',{sensitivity:'base'});}
function formatDate(date){return date?new Intl.DateTimeFormat('it-IT',{dateStyle:'long',timeZone:'Europe/Rome'}).format(new Date(date+'T12:00:00')):'';}
function message(row){const date=formatDate(day(val(row,'Data scadenza'))).toUpperCase(),cost=amount(row);if(cost===null||!date)return '';const short=date.replace(/\s\d{4}$/,'');return `👨‍🎓🌏 *PREMIUM ACADEMY | RINNOVO POSTAZIONE CONSULENTE*

Gentile Consulente,
ti ricordiamo che *l’accordo di collaborazione è in scadenza il ${date}*.

Per procedere con il *rinnovo* e continuare a mantenere *attive le piattaforme e i servizi a tua disposizione*, è richiesto un *contributo di ${cost}€*.

📩 Ti abbiamo già inviato via mail la *procedura per il rinnovo*.
👉 Ti invitiamo a completare la procedura *entro il ${short}*, così da *garantire la continuità* dei servizi senza interruzioni.

📌 *Se non intendi proseguire, puoi rispondere a questo messaggio con: NON RINNOVO*

La Segreteria Consulenti`;}
function phone(row){let p=String(val(row,'Cellulare')).replace(/\D/g,'');if(p.startsWith('00'))p=p.slice(2);if(/^3\d{8,9}$/.test(p))p='39'+p;return /^\d{8,15}$/.test(p)?p:'';}
const allowed=['Rinnovo inviato','Non rinnovato dalla sede','Non vuole rinnovare','Rinnovato','Premium','Advance'];
function transition(row,history,type,kind,at=new Date().toISOString()){
 if(!allowed.includes(type))throw Error('Stato rinnovo non valido');
 const next=(history||[]).map(e=>({...e}));
 if(status(row,next)===type){const latest=active(next).filter(e=>e.kind!=='edit').at(-1);if(!latest)throw Error('Lo stato proviene dal file sorgente: non esiste un’azione da annullare.');latest.cancelled=true;latest.cancelledAt=at;return {history:next,cancelled:true};}
 const event={type,kind,at};if(kind==='message')event.text=message(row);next.push(event);return {history:next,cancelled:false};
}
function validateRow(row){if(!day(val(row,'Data scadenza')))throw Error('Data scadenza non valida');if(!String(val(row,'Nome')).trim()||!String(val(row,'Cognome')).trim())throw Error('Nome o cognome mancante');if(!String(val(row,'Email')).trim()&&!phone(row))throw Error('Email e cellulare mancanti o non validi');if(val(row,'Importo rinnovo richiesto')!==''&&(!Number.isFinite(amount(row))||amount(row)<0))throw Error('Importo rinnovo non valido');if(count(row)===null)throw Error('Numero rinnovi non valido');}
const api={norm,day,val,key,count,amount,active,initial,status,excluded,urgent,compare,formatDate,message,phone,transition,validateRow,allowed};
if(typeof module!=='undefined')module.exports=api;else root.CRM_RENEWALS_CORE=api;
})(typeof window!=='undefined'?window:globalThis);
