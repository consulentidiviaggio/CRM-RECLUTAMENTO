(function(root){'use strict';
const c=root.CRM_RENEWALS_CORE||(typeof require==='function'?require('./renewals-core.js'):null);
function filters(d,f={}){const row=d.data,status=c.status(row,d.history),excluded=c.excluded(row,d.history),cost=c.amount(row);if(f.date&&f.date!=='all'&&d.expiration!==f.date)return false;if(f.month&&d.expiration.slice(0,7)!==f.month)return false;if(f.search&&!Object.values(row).join(' ').toLowerCase().includes(f.search.trim().toLowerCase()))return false;
 if(f.state==='excluded'){if(!excluded)return false;}else if(['Premium','Advance'].includes(f.state)){if(status!==f.state)return false;}else {if(excluded)return false;if(f.state==='unrenewed'&&status==='Rinnovato')return false;if(f.state==='Urgenti'&&!c.urgent(row,d.history))return false;if(f.state&&!['unrenewed','Urgenti'].includes(f.state)&&status!==f.state)return false;}
 if(f.price==='custom'&&[49,99].includes(cost))return false;if(f.price&&f.price!=='custom'&&cost!==Number(f.price))return false;if(f.type==='first'&&c.count(row)!==0)return false;if(f.type==='later'&&c.count(row)===0)return false;if(f.urgent&&!c.urgent(row,d.history))return false;return true;}
function metrics(docs){const active=docs.filter(d=>!c.excluded(d.data,d.history)),confirmed=active.filter(d=>c.status(d.data,d.history)==='Rinnovato'),sum=(list,fn)=>Math.round(list.reduce((n,d)=>n+fn(d),0)*100)/100,turn=d=>Number(c.val(d.data,'Fatturato annuale'))||0;
 const line=list=>({total:list.length,withTurn:list.filter(d=>turn(d)>0).length,withoutTurn:list.filter(d=>turn(d)===0).length,confirmed:list.filter(d=>c.status(d.data,d.history)==='Rinnovato').length,confirmedWith:list.filter(d=>c.status(d.data,d.history)==='Rinnovato'&&turn(d)>0).length,confirmedWithout:list.filter(d=>c.status(d.data,d.history)==='Rinnovato'&&turn(d)===0).length,amount:sum(list.filter(d=>c.status(d.data,d.history)==='Rinnovato'),d=>c.amount(d.data)),turnover:sum(list,turn),retained:sum(list.filter(d=>c.status(d.data,d.history)==='Rinnovato'),turn)});
 return {total:line(active),first:line(active.filter(d=>c.count(d.data)===0)),later:line(active.filter(d=>c.count(d.data)!==0)),excluded:docs.length-active.length,states:Object.fromEntries(c.allowed.map(s=>[s,docs.filter(d=>c.status(d.data,d.history)===s).length])),rate:active.length?confirmed.length/active.length:0};}
function progress(docs,goal){if(!goal)return null;const selected=docs.filter(d=>d.expiration.slice(0,4)===String(goal.year)&&c.status(d.data,d.history)==='Rinnovato');const fresh=selected.filter(d=>{const e=c.active(d.history).filter(e=>e.kind!=='edit').at(-1);return e&&e.type==='Rinnovato'&&c.day(new Date(e.at))>goal.cutoff;});const added=Math.round(fresh.reduce((n,d)=>n+c.amount(d.data),0)*100)/100,count=goal.baseCount+fresh.length,amount=goal.baseAmount+added;
 return {addedCount:fresh.length,addedAmount:added,count,amount,remainingCount:Math.max(0,goal.targetCount-count),remainingAmount:Math.max(0,goal.targetAmount-amount),countRate:goal.targetCount?count/goal.targetCount:0,amountRate:goal.targetAmount?amount/goal.targetAmount:0,notAdded:selected.length-fresh.length};}
function email(row){return `Ciao ${c.val(row,'Nome')}

A seguito di una attenta valutazione e dopo un ampio tempo di rodaggio e verifica circa la tua attività di Consulente, abbiamo deciso di non procedere con un nuovo contratto di procacciatore.

TI informiamo pertanto che tutti gli strumenti e profili in tuo possesso verranno disattivati a breve.

Ti ringraziamo per aver creduto nel nostro progetto, ma una collaborazione senza riscontri effettivi non può essere supportata ulteriormente, questo alla luce anche della crescita dell’assistenza e dei servizi forniti nel tempo, oltre ai riscontri mediamente avuti in termini operativi dagli altri consulenti attivi in piattaforma.

In ogni modo saremo felici di supportarti e fornirti lo stesso trattamento che garantiamo ai nostri Consulenti attivi nel caso in cui volessi scegliere Borsaviaggi come tuo partner di fiducia per l’acquisto di un tuo viaggio.

Grazie e buona fortuna.

La Segreteria Consulenti`;}
const api={filters,metrics,progress,email};if(typeof module!=='undefined')module.exports=api;else root.CRM_RENEWALS_REPORT=api;
})(typeof window!=='undefined'?window:globalThis);
