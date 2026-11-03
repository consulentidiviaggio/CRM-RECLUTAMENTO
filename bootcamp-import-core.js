(function(root){'use strict';
const norm=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const email=v=>String(v??'').trim().toLowerCase();
function phone(v){let p=String(v??'').replace(/\D/g,'');if(p.startsWith('00'))p=p.slice(2);if(/^3\d{9}$/.test(p))p='39'+p;return p;}
function date(v){if(v instanceof Date&&!isNaN(v))return [v.getFullYear(),String(v.getMonth()+1).padStart(2,'0'),String(v.getDate()).padStart(2,'0')].join('-');if(typeof v==='number'&&root.XLSX){const d=root.XLSX.SSF.parse_date_code(v);return d?date(new Date(d.y,d.m-1,d.d)):'';}const s=String(v??'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/)||s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?: .*)?$/);if(!m)return '';const a=m[1].length===4?[+m[1],+m[2],+m[3]]:[+m[3],+m[2],+m[1]],d=new Date(a[0],a[1]-1,a[2]);return d.getFullYear()===a[0]&&d.getMonth()===a[1]-1&&d.getDate()===a[2]?date(d):'';}
function time(v){if(v instanceof Date)return String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');if(typeof v==='number'&&root.XLSX){const d=root.XLSX.SSF.parse_date_code(v);return String(d.H).padStart(2,'0')+':'+String(d.M).padStart(2,'0');}return String(v??'').match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]||'';}
const aliases={firstName:['NOME'],lastName:['COGNOME'],name:['NOME E COGNOME','NOME COMPLETO'],email:['EMAIL','E-MAIL'],phone:['CELLULARE','TELEFONO','PHONE'],region:['REGIONE'],source:['AFFILIATO','FONTE','SOURCE','PROVENIENZA'],bootcampDate:['DATA BOOTCAMP','BOOTCAMP','DATA DEL BOOTCAMP'],registrationDate:['DATA REGISTRAZIONE','DATA INSERIMENTO','INSERITO IL'],originalId:['LEAD ID','ID CONTATTO','ID'],operator:['OPERATORE','ASSEGNATO A','REFERENTE'],gender:['GENERE','SESSO']};
function read(row,field){const k=Object.keys(row).find(k=>aliases[field].includes(norm(k)));return k===undefined?'':row[k];}
function parse(row,sheet,index){const r={sheet,rowNumber:index};for(const k of Object.keys(aliases))r[k]=read(row,k);for(const k of ['firstName','lastName','name','region','source','originalId','operator','gender'])r[k]=String(r[k]??'').trim();r.name=r.name||[r.firstName,r.lastName].filter(Boolean).join(' ');r.email=email(r.email);r.phone=phone(r.phone);r.time=time(r.bootcampDate);r.bootcampDate=date(r.bootcampDate);const registration=r.registrationDate;r.registrationDate=date(registration);const registrationTime=time(registration);r.registrationISO=registration instanceof Date&&!isNaN(registration)?registration.toISOString():r.registrationDate?new Date(r.registrationDate+'T'+(registrationTime||'12:00')+':00').toISOString():'';return r;}
function validate(r){const e=[];if(!r.name)e.push('Nome mancante');if(!r.email&&!r.phone)e.push('Email e cellulare mancanti');if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))e.push('Email non valida');if(r.phone&&!/^\d{8,15}$/.test(r.phone))e.push('Cellulare non valido');if(!r.bootcampDate)e.push('Data Bootcamp non valida');return e;}
function assign(r){const op=norm(r.operator);if(op){if(['ST','STEFANO'].includes(op))return {code:'ST',reason:'Operatore esplicito'};if(['FB','FABIO'].includes(op))return {code:'FB',reason:'Operatore esplicito'};return {error:'Operatore esplicito non riconosciuto'};}
 const source=norm(r.source).replace(/[_ -]+/g,''),sheet=norm(r.sheet),signals=[];
 if(['LEADFACEBOOK','FACEBOOK','LEADCROCIERE'].includes(source)||sheet==='CONTATTI_FILTRATI_FB')signals.push('FB');
 if(source==='LEADDISNEY'||sheet==='FOGLI QUOTIDIANI PRO_DOTTO1$')signals.push('ST');
 if(new Set(signals).size>1)return {error:'Conflitto fra foglio e provenienza'};if(signals.length)return {code:signals[0],reason:'Provenienza'};
 const region=norm(r.region);if(['LOMBARDIA','LAZIO','VENETO','PIEMONTE'].includes(region))return {code:'ST',reason:'Regione prioritaria'};
 if(['ABRUZZO','MOLISE','CAMPANIA','PUGLIA','BASILICATA','CALABRIA','SICILIA','SARDEGNA'].includes(region))return {code:'FB',reason:'Regione'};
 const regions=['EMILIA-ROMAGNA','TOSCANA','FRIULI-VENEZIA GIULIA','MARCHE','TRENTINO-ALTO ADIGE','UMBRIA','LIGURIA',"VALLE D'AOSTA"];
 if(!regions.includes(region))return {error:'Regione mancante o non riconosciuta: verificare assegnazione'};
 return {code:['M','MASCHIO','MASCHILE','UOMO'].includes(norm(r.gender))?'FB':'ST',reason:'Regione / assegnazione residuale'};
}
function match(r,contacts){const hits=contacts.filter(c=>(r.email&&email(c.email)===r.email)||(r.phone&&phone(c.phone)===r.phone)||(r.originalId&&(c.id===r.originalId||c.leadId===r.originalId)));return hits.length>1?{error:'Identificativi associati a più schede esistenti'}:hits[0]?{contact:hits[0]}:{};}
function plan(rows,contacts,enrollments){const seen=new Map(),result=[];for(const r of rows){let errors=validate(r),m=match(r,contacts),a=m.contact?{code:m.contact.operatorCode,reason:'Operatore esistente conservato'}:assign(r);if(m.error)errors.push(m.error);if(a.error)errors.push(a.error);if(m.contact&&!['ST','FB'].includes(m.contact.operatorCode))errors.push('Operatore esistente non valido');
 const keys=[r.email&&'e:'+r.email,r.phone&&'p:'+r.phone,r.originalId&&'i:'+r.originalId].filter(Boolean),prior=[...new Set(keys.map(k=>seen.get(k)).filter(Boolean))];let duplicate=false;
 if(prior.length>1)errors.push('Identificativi incrociati nel file');else if(prior.length){const p=prior[0];if(!m.contact&&p.assignedCode){a.code=p.assignedCode;a.reason='Prima assegnazione nel file conservata';}if((r.email&&p.email&&r.email!==p.email)||(r.phone&&p.phone&&r.phone!==p.phone))errors.push('Dati contrastanti per la stessa persona nel file');else if(p.bootcampDate===r.bootcampDate)duplicate=true;}
 if(!errors.length&&!duplicate){r.assignedCode=a.code;for(const k of keys)seen.set(k,r);}
 const oldDate=m.contact?date(m.contact.bootcampDate?.toDate?m.contact.bootcampDate.toDate():m.contact.bootcampDate):'';
 const enrolled=m.contact&&(oldDate===r.bootcampDate||enrollments.some(e=>e.contactId===m.contact.id&&e.bootcampId===r.bootcampDate));
 result.push({row:r,contact:m.contact,operatorCode:a.code,reason:a.reason,errors,duplicate,newEnrollment:!!m.contact&&!enrolled});}
 return result;}
const api={norm,email,phone,date,time,aliases,parse,validate,assign,match,plan};if(typeof module!=='undefined')module.exports=api;else root.CRM_BOOTCAMP_IMPORT_CORE=api;
})(typeof window!=='undefined'?window:globalThis);
