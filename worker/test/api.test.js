import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

const origin='https://nisongmonyimba.github.io';
const api='https://prosolver-hospitals-api.example.workers.dev';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_hardening.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0003_referral_reversals.sql',import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({
    bind(...values){return statement(sql,values);},
    async first(){return sqlite.prepare(sql).get(...args)||null;},
    async all(){return {results:sqlite.prepare(sql).all(...args)};},
    async run(){const meta=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(meta.changes)}};}
  });
  const DB={
    prepare:sql=>statement(sql),
    async batch(stmts){sqlite.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of stmts)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  };
  const objects=new Map(),emails=[];
  const env={DB,AUDIO:{async put(key,bytes,meta){objects.set(key,{body:bytes,httpMetadata:meta.httpMetadata});},async get(key){return objects.get(key)||null;},async delete(key){objects.delete(key);},async list(){return {objects:[...objects.keys()].map(key=>({key,uploaded:new Date(Date.now()-2*86400000)}))};}},RATE:{async limit(){return {success:true};}},SITE_ORIGIN:origin,PUBLIC_API_URL:api,EMAIL_FROM:'mail@example.org',PUBLIC_SIGNUPS_ENABLED:'true',PRIVACY_NOTICE_APPROVED:'true',RESEND_API_KEY:'test-only',ADMIN_TOKEN:'test-admin-token',RETENTION_DAYS:'90'};
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>{const body=JSON.parse(options.body);emails.push(body);return new Response('{}',{status:200});};
  const restore=()=>{globalThis.fetch=oldFetch;sqlite.close();};
  const call=(path,method='GET',body=null,headers={})=>worker.fetch(new Request(api+path,{method,body,headers}),env);
  const form=(fields={})=>{const f=new FormData();for(const [k,v] of Object.entries({email:'a@example.org',phone:'+233 555 000 111',problem:'Equipment issue',daily:'',consent:'yes',notice_version:'2026-11-draft',request_key:crypto.randomUUID(),website:'',ref:'',...fields}))f.append(k,v);return f;};
  const post=(path,body)=>call(path,'POST',body,{Origin:origin});
  const token=()=>emails.at(-1).text.match(/token=([a-f0-9]{64})/)[1];
  const confirm=async(path='/verify',t=token())=>{const f=new FormData();f.append('token',t);return call(path,'POST',f,{Origin:api});};
  return {sqlite,env,objects,emails,restore,call,form,post,token,confirm};
}
test('migrations from empty database and constraints',()=>{
  const x=fixture();try{
    assert.ok(x.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='ledger_nonnegative'").get());
    x.sqlite.prepare("INSERT INTO members(id,email,phone,referral_code,created_at) VALUES('m','m@example.org','+2331111111','AAAA',datetime('now'))").run();
    assert.throws(()=>x.sqlite.prepare("INSERT INTO ledger(id,member_id,delta,reason,created_at) VALUES('l','m',-1,'extra_submission',datetime('now'))").run(),/insufficient_points/);
  }finally{x.restore();}
});
test('signup stays disabled without explicit production configuration',async()=>{
  const x=fixture();try{x.env.PUBLIC_SIGNUPS_ENABLED='false';assert.equal((await x.post('/submit',x.form())).status,503);x.env.PUBLIC_SIGNUPS_ENABLED='true';x.env.PRIVACY_NOTICE_APPROVED='false';assert.equal((await x.post('/submit',x.form())).status,503);}finally{x.restore();}
});
test('typed submit, scanner-safe GET, single-use POST, rewards session',async()=>{
  const x=fixture();try{
    assert.equal((await x.post('/submit',x.form())).status,202);
    const t=x.token();
    assert.equal((await x.call('/verify?token='+t)).status,200);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM submissions WHERE verified_at IS NOT NULL').get().n,0);
    const verified=await x.confirm();
    assert.equal(verified.status,303);
    assert.equal((await x.confirm()).status,400);
    const cookie=verified.headers.get('set-cookie').split(';')[0];
    const rewards=await x.call('/rewards','GET',null,{Cookie:cookie});
    assert.equal(rewards.status,200);
    assert.match(await rewards.text(),/Your waitlist rewards/);
  }finally{x.restore();}
});
test('form validation and duplicate pending submission',async()=>{
  const x=fixture();try{
    for(const fields of [{problem:''},{email:'bad'},{phone:'1234567'},{consent:'no'},{notice_version:'wrong'}]){
      const res=await x.post('/submit',x.form(fields));assert.equal(res.status,400);
    }
    const f=x.form();assert.equal((await x.post('/submit',f)).status,202);
    assert.equal((await x.post('/submit',f)).status,202);
    assert.equal((await x.post('/submit',x.form())).status,409);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,1);
  }finally{x.restore();}
});
test('audio signature, size and R2 failure',async()=>{
  const x=fixture();try{
    const invalid=x.form({email:'bad-audio@example.org'});invalid.append('audio',new File([new Uint8Array([1,2,3])],'fake.webm',{type:'audio/webm'}));assert.equal((await x.post('/submit',invalid)).status,400);
    const large=x.form({email:'large@example.org'});large.append('audio',new File([new Uint8Array(5*1024*1024+1)],'large.webm',{type:'audio/webm'}));assert.equal((await x.post('/submit',large)).status,413);
    const valid=x.form({problem:''});valid.append('audio',new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])],'voice.webm',{type:'audio/webm'}));
    assert.equal((await x.post('/submit',valid)).status,202);assert.equal(x.objects.size,1);
  }finally{x.restore();}
});
test('referral credit is awarded once to verified referrer',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());await x.confirm();
    const code=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='a@example.org'").get().referral_code;
    const referred=x.form({email:'b@example.org',phone:'+233555000222',ref:code});await x.post('/submit',referred);
    const t=x.token();await Promise.all([x.confirm('/verify',t),x.confirm('/verify',t)]);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM referrals').get().n,1);
    assert.equal(x.sqlite.prepare("SELECT COALESCE(SUM(delta),0) n FROM ledger WHERE reason='verified_referral'").get().n,1);
  }finally{x.restore();}
});
test('invalid and self referrals do not earn points',async()=>{
  const x=fixture();try{
    const f=x.form({ref:'ABCDEF012345678900'});await x.post('/submit',f);await x.confirm();
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM ledger').get().n,0);
  }finally{x.restore();}
});
test('admin authentication and private audio access',async()=>{
  const x=fixture();try{
    assert.equal((await x.call('/admin/summary')).status,401);
    assert.equal((await x.call('/admin/summary','GET',null,{Authorization:'Bearer wrong'})).status,401);
    const authorized=await x.call('/admin/summary','GET',null,{Authorization:'Bearer test-admin-token'});
    assert.equal(authorized.status,200);
    assert.equal((await x.call('/admin/audio/00000000-0000-0000-0000-000000000000')).status,401);
  }finally{x.restore();}
});
test('earned point funds one extra verified submission, then prevents overspend',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());const first=await x.confirm();
    const cookie=first.headers.get('set-cookie').split(';')[0];
    const code=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='a@example.org'").get().referral_code;
    await x.post('/submit',x.form({email:'b@example.org',phone:'+233555000222',ref:code}));await x.confirm();
    const second=x.form({problem:'Another problem'});
    assert.equal((await x.call('/submit','POST',second,{Origin:origin,Cookie:cookie})).status,202);
    assert.equal((await x.confirm()).status,303);
    assert.equal(x.sqlite.prepare("SELECT SUM(delta) n FROM ledger WHERE member_id=(SELECT id FROM members WHERE email='a@example.org')").get().n,0);
    assert.equal((await x.call('/submit','POST',x.form(),{Origin:origin,Cookie:cookie})).status,409);
  }finally{x.restore();}
});
test('unverified referrer receives no reward',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());
    const code=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='a@example.org'").get().referral_code;
    await x.post('/submit',x.form({email:'b@example.org',phone:'+233555000222',ref:code}));
    await x.confirm();
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM referrals').get().n,0);
  }finally{x.restore();}
});
test('email access link is single use and does not enumerate unknown accounts',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());await x.confirm();
    const unknown=new FormData();unknown.append('email','unknown@example.org');
    assert.equal((await x.post('/access',unknown)).status,202);
    const known=new FormData();known.append('email','a@example.org');
    assert.equal((await x.post('/access',known)).status,202);
    const t=x.token();
    assert.equal((await x.call('/access/confirm?token='+t)).status,200);
    assert.equal((await x.confirm('/access/confirm',t)).status,303);
    assert.equal((await x.confirm('/access/confirm',t)).status,400);
  }finally{x.restore();}
});
test('admin review, safe data transport, research export and deletion',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form({problem:'<script>alert(1)</script>'}));
    const id=x.sqlite.prepare('SELECT id FROM submissions').get().id;
    const adminHeaders={Origin:origin,Authorization:'Bearer test-admin-token','Content-Type':'application/json'};
    const review=await x.call('/admin/submissions/'+id,'PATCH',JSON.stringify({review_status:'under_review',category:'Maintenance',priority:'high',founder_notes:'Synthetic note'}),adminHeaders);
    assert.equal(review.status,200);
    const classification={frequency:'daily',severity:'moderate',urgency:'low',operational_impact:'medium',resolution_effort:'unknown',willingness_to_pay:'unknown',product_opportunity:'possible',recurring_pattern:'none'};
    assert.equal((await x.call('/admin/research/'+id,'PATCH',JSON.stringify(classification),adminHeaders)).status,200);
    assert.equal((await x.call('/admin/research/export','GET',null,adminHeaders)).status,200);
    assert.equal((await x.call('/admin/submissions/'+id,'DELETE',null,adminHeaders)).status,200);
    assert.equal(x.sqlite.prepare('SELECT problem FROM submissions WHERE id=?').get(id).problem,'');
  }finally{x.restore();}
});
test('failed mail delivery removes pending submission and audio',async()=>{
  const x=fixture();try{
    globalThis.fetch=async()=>new Response('{}',{status:503});
    assert.equal((await x.post('/submit',x.form())).status,503);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);
    assert.equal(x.objects.size,0);
  }finally{x.restore();}
});
test('referral reversal is immutable, auditable and cannot create negative balance',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());await x.confirm();
    const code=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='a@example.org'").get().referral_code;
    await x.post('/submit',x.form({email:'b@example.org',phone:'+233555000222',ref:code}));await x.confirm();
    const referredId=x.sqlite.prepare("SELECT id FROM members WHERE email='b@example.org'").get().id;
    const headers={Origin:origin,Authorization:'Bearer test-admin-token','Content-Type':'application/json'};
    const path='/admin/referrals/'+referredId+'/reverse';
    assert.equal((await x.call(path,'POST',JSON.stringify({reason:'Synthetic fraud test'}),headers)).status,200);
    assert.equal((await x.call(path,'POST',JSON.stringify({reason:'Again'}),headers)).status,409);
    assert.equal(x.sqlite.prepare("SELECT SUM(delta) n FROM ledger WHERE member_id=(SELECT id FROM members WHERE email='a@example.org')").get().n,0);
    assert.ok(x.sqlite.prepare("SELECT id FROM audit_events WHERE action='reverse_referral'").get());
  }finally{x.restore();}
});
test('expired links and missing rate limiter fail safely',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());
    const t=x.token();
    x.sqlite.prepare("UPDATE submissions SET expires_at=datetime('now','-1 day')").run();
    assert.equal((await x.confirm('/verify',t)).status,400);
    x.env.RATE=null;
    assert.equal((await x.post('/submit',x.form({email:'b@example.org'}))).status,503);
  }finally{x.restore();}
});
test('resend cooldown and account-neutral response',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());
    const f=new FormData();f.append('email','a@example.org');
    const first=await x.post('/resend',f);
    const again=await x.post('/resend',f);
    assert.equal(first.status,202);assert.equal(again.status,202);
    assert.equal(x.emails.length,2);
    assert.deepEqual(await first.json(),await again.json());
  }finally{x.restore();}
});
test('database and R2 failures are handled without a false success',async()=>{
  const x=fixture();try{
    const original=x.env.DB.prepare;
    x.env.DB.prepare=()=>{throw new Error('synthetic D1 failure');};
    assert.equal((await x.post('/submit',x.form())).status,500);
    x.env.DB.prepare=original;
    x.env.AUDIO.put=async()=>{throw new Error('synthetic R2 failure');};
    const f=x.form();f.append('audio',new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])],'voice.webm',{type:'audio/webm'}));
    assert.equal((await x.post('/submit',f)).status,503);
    assert.equal(x.sqlite.prepare('SELECT COUNT(*) n FROM submissions').get().n,0);
  }finally{x.restore();}
});
test('transaction failure cleans an uploaded object',async()=>{
  const x=fixture();try{
    x.env.DB.batch=async()=>{throw new Error('synthetic transaction failure');};
    const f=x.form();f.append('audio',new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])],'voice.webm',{type:'audio/webm'}));
    assert.equal((await x.post('/submit',f)).status,503);
    assert.equal(x.objects.size,0);
  }finally{x.restore();}
});
test('member can erase submissions and contact after email confirmation',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());
    const verified=await x.confirm();
    const cookie=verified.headers.get('set-cookie').split(';')[0];
    assert.equal((await x.call('/me/delete','POST',new FormData(),{Origin:api,Cookie:cookie})).status,200);
    assert.equal(x.sqlite.prepare('SELECT phone FROM members').get().phone,'');
    assert.equal(x.sqlite.prepare('SELECT problem FROM submissions').get().problem,'');
    assert.equal((await x.call('/rewards','GET',null,{Cookie:cookie})).status,401);
  }finally{x.restore();}
});
test('same-origin additional submission page requires member session',async()=>{
  const x=fixture();try{
    assert.equal((await x.call('/submit-again')).status,401);
    await x.post('/submit',x.form());const verified=await x.confirm();
    const cookie=verified.headers.get('set-cookie').split(';')[0];
    const page=await x.call('/submit-again','GET',null,{Cookie:cookie});
    assert.equal(page.status,200);assert.match(await page.text(),/Submit another problem/);
  }finally{x.restore();}
});
test('a referred member submitting again cannot credit their referrer twice',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());await x.confirm();
    const aCode=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='a@example.org'").get().referral_code;
    await x.post('/submit',x.form({email:'b@example.org',phone:'+233555000222',ref:aCode}));
    const bSession=await x.confirm();const bCookie=bSession.headers.get('set-cookie').split(';')[0];
    const bCode=x.sqlite.prepare("SELECT referral_code FROM members WHERE email='b@example.org'").get().referral_code;
    await x.post('/submit',x.form({email:'c@example.org',phone:'+233555000333',ref:bCode}));await x.confirm();
    assert.equal((await x.call('/submit','POST',x.form({email:'b@example.org',phone:'+233555000222',problem:'Second B problem'}),{Origin:api,Cookie:bCookie})).status,202);
    assert.equal((await x.confirm()).status,303);
    const count=x.sqlite.prepare("SELECT COUNT(*) n FROM ledger WHERE reason='verified_referral' AND member_id=(SELECT id FROM members WHERE email='a@example.org')").get().n;
    assert.equal(count,1);
  }finally{x.restore();}
});
test('failed resend preserves the previous verification link',async()=>{
  const x=fixture();try{
    await x.post('/submit',x.form());const old=x.token();
    globalThis.fetch=async()=>new Response('{}',{status:503});
    const f=new FormData();f.append('email','a@example.org');
    assert.equal((await x.post('/resend',f)).status,202);
    assert.equal((await x.confirm('/verify',old)).status,303);
  }finally{x.restore();}
});
test('scheduled retention deletes old audio and anonymizes inactive contact',async()=>{
  const x=fixture();try{
    const f=x.form();f.append('audio',new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,1])],'voice.webm',{type:'audio/webm'}));
    await x.post('/submit',f);await x.confirm();
    x.sqlite.prepare("UPDATE submissions SET created_at=datetime('now','-31 days')").run();
    x.sqlite.prepare("UPDATE members SET created_at=datetime('now','-31 days')").run();
    x.env.RETENTION_DAYS='30';
    await worker.scheduled({},x.env);
    assert.equal(x.objects.size,0);
    assert.equal(x.sqlite.prepare('SELECT problem FROM submissions').get().problem,'');
    assert.equal(x.sqlite.prepare('SELECT phone FROM members').get().phone,'');
  }finally{x.restore();}
});
