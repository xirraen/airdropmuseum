export function createInvitePayload(href){
 const current=new URL(href);
 const url=new URL('./',current).href;
 return {
  title:'Airdrop Museum',
  url,
  text:'Saya mengundang Anda melihat Airdrop Museum untuk menelaah konteks, sumber, dan riwayat airdrop. Contoh di dalamnya fiktif; ini bukan rekomendasi investasi atau jaminan hadiah.'
 };
}
