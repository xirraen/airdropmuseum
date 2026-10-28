import {TrustError} from './types.ts';
const SOCIAL_HOSTS=new Set(['x.com','twitter.com','t.me','telegram.me','discord.com','discord.gg','github.com','medium.com','youtube.com','www.youtube.com','warpcast.com','farcaster.xyz']);
const EXPLORERS=new Set(['etherscan.io','basescan.org','arbiscan.io','polygonscan.com','optimistic.etherscan.io','sepolia.etherscan.io']);
const BLOCKED_SUFFIXES=['.local','.internal','.localhost','.test','.invalid','.example','.onion'];
const TRACKER=/^(utm_|fbclid$|gclid$|dclid$|msclkid$|igshid$|ref_src$)/i;
export function normalizeTrustUrl(input){
 if(typeof input!=='string'||input.length>2048)throw new TrustError('INVALID_HTTPS_URL');
 let url;try{url=new URL(input.trim());}catch{throw new TrustError('INVALID_HTTPS_URL');}
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443'))throw new TrustError('INVALID_HTTPS_URL');
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||host.length>253||! /^[a-z0-9.-]+$/.test(host)||host.split('.').some(p=>!p||p.length>63||p.startsWith('-')||p.endsWith('-'))||
 BLOCKED_SUFFIXES.some(s=>host.endsWith(s))||/^\d+(?:\.\d+){3}$/.test(host)||host.includes('..'))throw new TrustError('UNSAFE_SOURCE_HOST');
 url.hostname=host;url.port='';url.hash='';
 for(const key of [...url.searchParams.keys()])if(TRACKER.test(key))url.searchParams.delete(key);
 url.searchParams.sort();return url.href;
}
export function sameOriginHost(a,b){return new URL(normalizeTrustUrl(a)).hostname===new URL(normalizeTrustUrl(b)).hostname;}
export function isVerifiedSubdomain(host,domains){return [...domains].some(d=>host===d||host.endsWith('.'+d));}
export function classifyTrustTier({url,officialDomains=[],verifiedSubdomains=[],linkedFromOfficial=false,officialSocialUrls=[],contracts=[],explorerApproved=false}){
 const canonical=normalizeTrustUrl(url),host=new URL(canonical).hostname;
 const domains=new Set([...officialDomains,...verifiedSubdomains].filter(Boolean).map(x=>String(x).toLowerCase()));
 if(isVerifiedSubdomain(host,domains))return 'primary_official';
 if(explorerApproved&&EXPLORERS.has(host)&&contracts.some(c=>/^0x[a-f0-9]{40}$/i.test(c)&&new URL(canonical).pathname.toLowerCase().includes(c.toLowerCase())))return 'primary_official';
 if(SOCIAL_HOSTS.has(host)&&linkedFromOfficial&&officialSocialUrls.some(x=>{try{return normalizeTrustUrl(x)===canonical;}catch{return false;}}))return 'official_social';
 return linkedFromOfficial?'independent':'unknown';
}
export function allowRegisteredSource(source,campaignId){
 if(!source||source.campaign_id!==campaignId||source.enabled!==1||!source.registered_by)throw new TrustError('SOURCE_NOT_REGISTERED',403);
 return normalizeTrustUrl(source.source_url);
}
// Requests are limited to registered HTTPS hosts, with no automatic redirects.
export function validateRedirect(response){if(response.status>=300&&response.status<400)throw new TrustError('SOURCE_REDIRECT_BLOCKED',502);}
