export const PRIMARY_NAV=[['home','home','Beranda'],['explore','compass','Airdrop'],['missions','check','Quest'],['workspace','layers','Portofolio'],['profile','user','Profil']];
export const SIDE_NAV=PRIMARY_NAV;
export const ROUTES=PRIMARY_NAV.map(([id])=>id);
export function resolveRoute(value){return ROUTES.includes(value)?value:'home'}
export function primaryRoute(value){return resolveRoute(value)}
