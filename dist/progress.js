export function parseBackup(text,projects){
 const data=JSON.parse(text);
 if(!data||data.version!==1||!Array.isArray(data.saved)||!data.done||typeof data.done!=='object'||Array.isArray(data.done))throw new Error('Format backup tidak valid.');
 const ids=new Set(projects.map(p=>p.id));const keys=new Set(projects.flatMap(p=>p.tasks.map((_,i)=>p.id+':'+i)));
 if(data.saved.some(id=>typeof id!=='string'||!ids.has(id)))throw new Error('Backup berisi proyek yang tidak dikenal.');
 const done={};for(const [key,value] of Object.entries(data.done)){if(!keys.has(key)||typeof value!=='boolean')throw new Error('Data tugas backup tidak valid.');if(value)done[key]=true;}
 return {saved:[...new Set(data.saved)],done};
}
