import {cleanProgress} from './rewards.js';
import {cleanDossier,cleanReview} from './exhibits.js?v=0.4.2';
export const STATUSES=['watching','active','completed','archived'];
export function cleanProject(p){
 if(!p||typeof p!=='object')throw Error('Data proyek tidak valid.');
 const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
 const name=text(p.name,80);if(!name)throw Error('Nama proyek wajib diisi.');
 let website=text(p.website,500);if(website){const u=new URL(website);if(u.protocol!=='https:')throw Error('Gunakan URL HTTPS.');website=u.href;}
 const tasks=Array.isArray(p.tasks)?p.tasks.filter(t=>typeof t==='string'&&t.trim()).map(t=>t.trim().slice(0,200)).slice(0,30):[];
 if(!tasks.length)throw Error('Tambahkan minimal satu tugas.');
 return {id:text(p.id,80),name,website,tasks,category:['Testnet','DeFi','Gaming','AI','Infra','NFT','Layer 2','RWA','GameFi'].includes(p.category)?p.category:'Infra',chain:text(p.chain,40)||'Other',desc:text(p.desc,500),symbol:'◈',kind:['airdrop','bounty','testnet','community'].includes(p.kind)?p.kind:'airdrop',custom:true};
}
export function normalize(raw={},catalog=[]){
 const custom=Array.isArray(raw.custom)?raw.custom.map(cleanProject):[];
 if(custom.length>100||custom.some(p=>!/^custom-[a-zA-Z0-9-]+$/.test(p.id))||new Set(custom.map(p=>p.id)).size!==custom.length)throw Error('ID proyek backup tidak valid.');
 const all=[...catalog,...custom];const ids=new Set(all.map(p=>p.id));
 const done={};for(const p of all)for(let i=0;i<p.tasks.length;i++)if(raw.done?.[p.id+':'+i]===true)done[p.id+':'+i]=true;
 const records={};for(const id of ids){const r=raw.records?.[id]||{};records[id]={dossier:cleanDossier(r.dossier),status:STATUSES.includes(r.status)?r.status:'watching',priority:['low','normal','high'].includes(r.priority)?r.priority:'normal',due:typeof r.due==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.due)&&!Number.isNaN(Date.parse(r.due))?r.due:'',notes:typeof r.notes==='string'?r.notes.slice(0,5000):'',cost:Number.isFinite(Number(r.cost))&&Number(r.cost)>=0?Math.min(Number(r.cost),1e9):0,reward:Number.isFinite(Number(r.reward))&&Number(r.reward)>=0?Math.min(Number(r.reward),1e9):0};}
 return {version:2,progress:cleanProgress(raw.progress),reviews:(Array.isArray(raw.reviews)?raw.reviews:[]).slice(0,100).flatMap(r=>{try{const clean=cleanReview(r);return ids.has(clean.projectId)?[clean]:[]}catch{return []}}),saved:[...new Set((Array.isArray(raw.saved)?raw.saved:[]).filter(id=>ids.has(id)))],done,custom,records,history:Array.isArray(raw.history)?raw.history.filter(h=>typeof h?.text==='string'&&typeof h?.at==='string').slice(0,100).map(h=>({text:h.text.slice(0,200),at:h.at.slice(0,40)})):[],name:typeof raw.name==='string'?raw.name.slice(0,60):'Museum Explorer'};
}
export function backup(text,catalog){const raw=JSON.parse(text);if(!raw||![1,2].includes(raw.version)||!Array.isArray(raw.saved)||!raw.done||typeof raw.done!=='object'||Array.isArray(raw.done))throw Error('Format backup tidak valid.');return normalize(raw,catalog)}
export function mergeBackup(current,incoming,catalog){return normalize({...current,custom:[...current.custom,...incoming.custom.filter(p=>!current.custom.some(c=>c.id===p.id))],saved:[...current.saved,...incoming.saved],done:{...current.done,...incoming.done},reviews:[...current.reviews,...incoming.reviews.filter(r=>!current.reviews.some(c=>c.at===r.at&&c.projectId===r.projectId&&c.text===r.text))],progress:cleanProgress({unlocked:[...current.progress.unlocked,...incoming.progress.unlocked],claims:[...current.progress.claims,...incoming.progress.claims],days:[...current.progress.days,...incoming.progress.days],quizPassed:current.progress.quizPassed||incoming.progress.quizPassed}),records:{...incoming.records,...current.records}},catalog)}
export function icsEvent(p,r){if(!r.due)return '';const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');return ['BEGIN:VEVENT','UID:'+escape(p.id)+'@airdrop-museum','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+r.due.replaceAll('-',''),'SUMMARY:'+escape(p.name),'DESCRIPTION:'+escape('Personal research deadline. '+r.notes),'END:VEVENT'].join('\r\n')}
