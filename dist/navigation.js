export const PRIMARY_NAV=[['home','home','Beranda'],['explore','compass','Jelajahi'],['workspace','layers','Portofolio'],['profile','user','Profil']];
export const ROUTES=['home','explore','workspace','profile','calendar','archive','voices','referral'];
export function resolveRoute(value){return ROUTES.includes(value)?value:'home'}
export function primaryRoute(value){if(['calendar','archive'].includes(value))return 'workspace';if(value==='voices')return 'explore';if(value==='referral')return 'profile';return resolveRoute(value)}
