import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
test('schema 5 upgrades forward preserving two owners and legacy application state contract',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 const files=readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)).sort();
 try{
  for(const f of files.slice(0,5))db.exec(readFileSync('migrations/'+f,'utf8'));
  assert.equal(db.prepare('SELECT MAX(version) v FROM am_core_schema').get().v,5);
  for(const id of ['tg:111','tg:222']){
   db.prepare('INSERT INTO am_users(id,username) VALUES(?,?)').run(id,id);
   db.prepare('INSERT INTO am_core_user_state(user_id,payload,revision) VALUES(?,?,3)').run(id,JSON.stringify({version:2,saved:[],done:{}}));
  }
  const before=db.prepare('SELECT * FROM am_core_user_state ORDER BY user_id').all();
  for(const f of files.slice(5))db.exec(readFileSync('migrations/'+f,'utf8'));
  assert.equal(db.prepare('SELECT MAX(version) v FROM am_core_schema').get().v,17);
  assert.deepEqual(db.prepare('SELECT * FROM am_core_user_state ORDER BY user_id').all(),before);
  // Previous application query/write contract still works on the expanded schema.
  assert.equal(db.prepare('UPDATE am_core_user_state SET revision=revision+1 WHERE user_id=? AND revision=?').run('tg:111',3).changes,1);
  assert.equal(db.prepare('SELECT revision FROM am_core_user_state WHERE user_id=?').get('tg:222').revision,3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 }finally{db.close();}
});

test('canonical migration preserves historical XP and refuses overlapping identities without merging',()=>{
 for(const conflict of [false,true]){
  const db=new DatabaseSync(':memory:');
  try{
   const files=readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)).sort();
   for(const f of files.filter(f=>!f.startsWith('0020')))db.exec(readFileSync('migrations/'+f,'utf8'));
   db.prepare("INSERT INTO am_core_user_state(user_id,payload,revision) VALUES('123','{}',4)").run();
   db.prepare("INSERT INTO am_xp_accounts(user_id,invite_code) VALUES('123','retained-code')").run();
   db.prepare("INSERT INTO am_xp_ledger(user_id,event_key,xp,kind) VALUES('123','quiz:wallet-safety',50,'learning')").run();
   if(conflict)db.prepare("INSERT INTO am_core_user_state(user_id,payload,revision) VALUES('tg:123','{\"newer\":true}',8)").run();
   const migration=readFileSync('migrations/0020_canonical_telegram_identity.sql','utf8');
   db.exec('BEGIN');
   if(conflict){
    assert.throws(()=>db.exec(migration),/CHECK constraint/);db.exec('ROLLBACK');
    assert.equal(db.prepare("SELECT revision FROM am_core_user_state WHERE user_id='123'").get().revision,4);
    assert.equal(db.prepare("SELECT revision FROM am_core_user_state WHERE user_id='tg:123'").get().revision,8);
   }else{
    db.exec(migration);db.exec('COMMIT');
    assert.equal(db.prepare("SELECT revision FROM am_core_user_state WHERE user_id='tg:123'").get().revision,4);
    assert.equal(db.prepare("SELECT invite_code FROM am_xp_accounts WHERE user_id='tg:123'").get().invite_code,'retained-code');
    assert.equal(db.prepare("SELECT xp FROM am_xp_ledger WHERE user_id='tg:123'").get().xp,50);
   }
  }finally{db.close();}
 }
});
