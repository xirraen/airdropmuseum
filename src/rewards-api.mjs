export async function rewardsApi(request,DB,user,json,readText){
 const path=new URL(request.url).pathname;
 const okMethods=path==='/api/me/rewards'?['GET']:['POST'];
 if(!okMethods.includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:okMethods.join(', ')});
 if(request.method==='POST'&&!(request.headers.get('Content-Type')||'').startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
 // Opaque code is generated server-side; never accept a user ID as an invite code.
 const random=crypto.randomUUID().replaceAll('-','').slice(0,16);
 await DB.prepare('INSERT OR IGNORE INTO am_xp_accounts(user_id,invite_code) VALUES(?,?)').bind(user.id,random).run();
 if(path==='/api/me/referral'){
 let body;try{body=JSON.parse(await readText(request))}catch(err){if(err.message==='BODY_TOO_LARGE')throw err;return json({error:'INVALID_JSON'},400)}
 if(!/^[a-f0-9]{16}$/.test(body.code||''))return json({error:'INVALID_INVITE'},400);
 const referrer=await DB.prepare('SELECT user_id FROM am_xp_accounts WHERE invite_code=?').bind(body.code).first();
 if(!referrer||referrer.user_id===user.id)return json({error:'INVALID_INVITE'},400);
 const qualified=await DB.prepare("SELECT 1 FROM am_xp_ledger WHERE user_id=? AND event_key='quiz:wallet-safety'").bind(user.id).first();
 if(qualified)return json({error:'ALREADY_QUALIFIED'},409);
 const written=await DB.prepare("INSERT INTO am_xp_referrals(invitee_id,referrer_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM am_xp_ledger WHERE user_id=? AND event_key='quiz:wallet-safety') ON CONFLICT(invitee_id) DO NOTHING").bind(user.id,referrer.user_id,user.id).run();
 if(written.meta.changes!==1)return json({error:'REFERRAL_ALREADY_BOUND'},409);
 return json({bound:true,qualified:false,message:'Complete the verified wallet-safety quiz to qualify.'});
 }
 if(path==='/api/me/qualify'){
 let body;try{body=JSON.parse(await readText(request))}catch(err){if(err.message==='BODY_TOO_LARGE')throw err;return json({error:'INVALID_JSON'},400)}
 if(!Array.isArray(body.answers)||body.answers.length!==3||body.answers.some((n,i)=>n!==[1,2,0][i]))return json({error:'QUIZ_NOT_PASSED'},400);
 // Transactional batch + unique event keys make retries idempotent.
 await DB.batch([
 DB.prepare("INSERT OR IGNORE INTO am_xp_ledger(user_id,event_key,xp,kind) VALUES(?,'quiz:wallet-safety',50,'learning')").bind(user.id),
 DB.prepare('UPDATE am_xp_referrals SET qualified_at=CURRENT_TIMESTAMP WHERE invitee_id=? AND qualified_at IS NULL').bind(user.id),
 DB.prepare("INSERT OR IGNORE INTO am_xp_ledger(user_id,event_key,xp,kind) SELECT referrer_id,'referral:'||invitee_id,100,'referral' FROM am_xp_referrals r WHERE invitee_id=? AND qualified_at IS NOT NULL AND date(qualified_at)=date('now') AND (SELECT count(*) FROM am_xp_ledger l WHERE l.user_id=r.referrer_id AND l.kind='referral' AND date(l.created_at)=date('now'))<10").bind(user.id),
 DB.prepare("INSERT OR IGNORE INTO am_xp_ledger(user_id,event_key,xp,kind) SELECT invitee_id,'invite-welcome',25,'welcome' FROM am_xp_referrals WHERE invitee_id=? AND qualified_at IS NOT NULL").bind(user.id)
 ]);
 return json({qualified:true,message:'XP events recorded once; check rewards balance.'});
 }
 const account=await DB.prepare('SELECT invite_code FROM am_xp_accounts WHERE user_id=?').bind(user.id).first();
 const rows=await DB.prepare('SELECT event_key,xp,kind,created_at FROM am_xp_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100').bind(user.id).all();
 const total=await DB.prepare('SELECT COALESCE(SUM(xp),0) AS xp FROM am_xp_ledger WHERE user_id=?').bind(user.id).first();
 const refs=await DB.prepare('SELECT count(*) AS total,SUM(CASE WHEN qualified_at IS NOT NULL THEN 1 ELSE 0 END) AS qualified FROM am_xp_referrals WHERE referrer_id=?').bind(user.id).first();
 return json({inviteCode:account.invite_code,xp:total.xp,referrals:{total:refs.total,qualified:refs.qualified||0},ledger:rows.results,policy:{referrerXP:100,inviteeXP:25,qualificationXP:50,dailyReferrerCap:10,qualification:'Verified Telegram user + wallet-safety quiz; no financial value.'}});
}
