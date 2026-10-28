import {evidenceCard} from './evidenceCard.ts';
export async function evidenceChainCard(env,campaignSlug){
 // This service never accesses autopsy_events or any user_scope data.
 const result=await evidenceCard(env,campaignSlug);
 return {...result,privacy:'PUBLIC_SOURCES_ONLY',disclaimer:result.disclaimer+' Semua klaim perlu diperiksa pada sumber primer sebelum bertindak.'};
}
