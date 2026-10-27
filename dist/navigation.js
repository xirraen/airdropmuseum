export const PRIMARY_NAV=[['home','home','Beranda'],['explore','compass','Jelajahi'],['missions','activity','Misi & Bounty'],['profile','user','Profil']];
export const ROUTES=['home','explore','workspace','profile','calendar','archive','voices','referral','missions'];
export function resolveRoute(value){return ROUTES.includes(value)?value:'home'}
export function primaryRoute(value){if(['workspace','calendar','archive'].includes(value))return 'profile';if(value==='voices')return 'explore';if(value==='referral')return 'profile';return resolveRoute(value)}
