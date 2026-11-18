// The public catalogue is hydrated from the production D1 campaign API.
// Never ship fictional campaigns or replace a failed request with mock data.
export const projects = [];

const CATEGORY = Object.freeze({
  nft: 'NFT', points: 'Points', retroactive: 'Retroactive',
  testnet: 'Testnet', defi: 'DeFi', gaming: 'Gaming', gamefi: 'GameFi',
  infrastructure: 'Infra', rwa: 'RWA', community: 'Community'
});
const NETWORK = Object.freeze({
  'eip155:1': 'Ethereum', 'eip155:8453': 'Base',
  'eip155:42161': 'Arbitrum', 'eip155:10': 'Optimism',
  'eip155:137': 'Polygon', solana: 'Solana', offchain: 'Off-chain'
});
const string = (value, limit = 200) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';
const array = value => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const data = JSON.parse(value); return Array.isArray(data) ? data : []; }
  catch { return []; }
};
const safeUrl = url => {
  try { const value = new URL(url); return value.protocol === 'https:' ? value.href : ''; }
  catch { return ''; }
};

// Produces a local *research view* of a real D1 campaign, never a verified claim.
export function projectFromCampaign(c) {
  if (!c || typeof c !== 'object' || !/^[a-z0-9-]{1,80}$/.test(c.id || '')) return null;
  const name = string(c.name, 80);
  if (!name) return null;
  const chains = array(c.chain).map(x => NETWORK[x] || string(x, 40)).filter(Boolean);
  const urls = array(c.official_urls).map(safeUrl).filter(Boolean);
  const riskFlags = array(c.risk_flags).filter(x => typeof x === 'string' && x.length <= 100).slice(0, 16);
  const validDate = v => {
    const raw = string(v, 40);
    return /^\d{4}-\d\d-\d\d/.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : '';
  };
  const tasks = array(c.eligibility_rules)
    .map(rule => string(rule?.parameters?.instruction, 200))
    .filter(Boolean).slice(0, 30);
  if (!tasks.length) tasks.push('Tinjau ketentuan dan status terbaru dari sumber resmi');
  return {
    id: 'campaign-' + c.id,
    sourceId: c.id,
    name,
    website: urls[0] || '',
    official_urls: urls,
    tasks,
    symbol: '◈',
    category: CATEGORY[String(c.category || '').toLowerCase()] || 'Research',
    chain: chains.join(', ') || 'Jaringan belum dicatat',
    desc: string(c.description, 500),
    status: string(c.status, 32),
    updatedAt: validDate(c.updated_at),
    lastVerifiedAt: validDate(c.last_verified_at),
    claimDeadlineAt: validDate(c.claim_deadline_at),
    snapshotAt: validDate(c.snapshot_at),
    riskFlags,
    color: '#4c92da',
    featured: false,
    custom: false
  };
}
