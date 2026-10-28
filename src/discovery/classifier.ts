export function classify(item){
 const text=((item.title||'')+' '+(item.summary||'')).toLowerCase();
 const has=re=>re.test(text);
 if(has(/\bairdrop\b/)&&has(/\bclaim(?:ing)?\s+(?:is\s+)?live\b/))return {classification:'airdrop',classification_confidence:0.8};
 if(has(/\bincentiviz(?:ed|ing)\s+testnet\b/))return {classification:'testnet',classification_confidence:0.7};
 if(has(/\bpoints?\s+season\b/))return {classification:'points',classification_confidence:0.6};
 if(has(/\bsnapshot\b/))return {classification:'snapshot',classification_confidence:0.65};
 if(has(/\bclaim(?:ing)?\b/))return {classification:'claim',classification_confidence:0.55};
 if(has(/\b(quest|campaign task|galxe|zealy)\b/))return {classification:'quest',classification_confidence:0.55};
 if(has(/\btestnet\b/))return {classification:'testnet',classification_confidence:0.5};
 if(has(/\bpoints?\b/))return {classification:'points',classification_confidence:0.45};
 if(has(/\bairdrop\b/))return {classification:'airdrop',classification_confidence:0.5};
 return {classification:'unknown',classification_confidence:0};
}
