const MAX_AUDIO = 5 * 1024 * 1024;
const MAX_REQUEST = MAX_AUDIO + 24000;
const NOTICE = '2026-11-draft';
const SITE_PATH = '/prosolver-hospitals/';
const CATEGORIES = ['Biomedical engineering','Equipment management','Maintenance','Calibration','Nursing workflows','Clinical administration','Procurement','Inventory','Finance','Human resources','Hospital operations','Quality management','Regulatory compliance','IT and digital systems','Facilities management','Other'];
const STATUSES = ['new','under_review','awaiting_information','accepted','in_progress','resolved','archived','rejected'];
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const error = (message, status = 400) => json({error:message},status);
const uid = () => crypto.randomUUID();
const random = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n)), x => x.toString(16).padStart(2,'0')).join('');
const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const text = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : null;
const emailOf = value => { const v=text(value,254)?.toLowerCase(); return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null; };
const phoneOf = value => { const v=text(value,32); if(!v || !/^\+[\d ()-]+$/.test(v)) return null; const digits=v.replace(/\D/g,''); return /^[1-9]\d{6,14}$/.test(digits) ? '+'+digits : null; };
const secure = {'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY','permissions-policy':'microphone=(), camera=(), geolocation=()'};
function finish(res, req, env) {
  for (const [k,v] of Object.entries(secure)) res.headers.set(k,v);
  const origin=req.headers.get('Origin');
  if(origin && origin===env.SITE_ORIGIN){res.headers.set('access-control-allow-origin',origin);res.headers.set('vary','Origin');res.headers.set('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');res.headers.set('access-control-allow-headers','Authorization,Content-Type');}
  return res;
}
const allowedOrigin = (req,env) => { const origin=req.headers.get('Origin'); return origin === env.SITE_ORIGIN || origin === new URL(req.url).origin; };
// Some browsers send Origin: null for a top-level same-origin form navigation
// after entering the confirmation page from another site. Fetch Metadata keeps
// that case distinct from a cross-site form POST.
const confirmationOrigin = (req,env) => allowedOrigin(req,env) || (req.headers.get('Origin')==='null' && req.headers.get('Sec-Fetch-Site')==='same-origin' && req.headers.get('Sec-Fetch-Mode')==='navigate');
const ready = env => env.PUBLIC_SIGNUPS_ENABLED === 'true' && env.SYNTHETIC_TEST_ENABLED !== 'true' && env.PRIVACY_NOTICE_APPROVED === 'true' && env.SITE_ORIGIN === 'https://nisongmonyimba.github.io' && /^https:\/\/[^/]+\.workers\.dev$/.test(env.PUBLIC_API_URL||'') && !!env.DB && !!env.AUDIO && !!env.RATE && !!env.RESEND_API_KEY && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM||'') && !!env.ADMIN_TOKEN;
// The test credential is a separate secret. The public gate must stay closed.
async function syntheticAuth(req,env){
  if(env.SYNTHETIC_TEST_ENABLED!=='true'||env.PUBLIC_SIGNUPS_ENABLED!=='false'||env.PRIVACY_NOTICE_APPROVED!=='true'||!env.SYNTHETIC_TEST_TOKEN||env.SYNTHETIC_TEST_TOKEN.length<32)return false;
  const candidate=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!candidate||candidate.length>256)return false;
  const a=await sha(candidate),b=await sha(env.SYNTHETIC_TEST_TOKEN);let mismatch=0;
  for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
function syntheticAudio(bytes,mime){
  if(mime!=='audio/wav'||bytes.byteLength!==8044)return false;
  const b=new Uint8Array(bytes),v=new DataView(bytes);
  if(String.fromCharCode(...b.slice(0,4))!=='RIFF'||v.getUint32(4,true)!==8036||String.fromCharCode(...b.slice(8,16))!=='WAVEfmt '||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==8000||v.getUint32(28,true)!==8000||v.getUint16(32,true)!==1||v.getUint16(34,true)!==8||String.fromCharCode(...b.slice(36,40))!=='data'||v.getUint32(40,true)!==8000)return false;
  return b.subarray(44).every(x=>x===128);
}
async function limit(env,key) { if(!env.RATE) return false; try{return (await env.RATE.limit({key})).success;}catch{return false;} }
async function boundedForm(req) {
  const len=Number(req.headers.get('content-length'));
  if(Number.isFinite(len) && len>MAX_REQUEST) throw new Error('large');
  const reader=req.body?.getReader(); if(!reader) throw new Error('body');
  const chunks=[];let total=0;
  for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_REQUEST){await reader.cancel();throw new Error('large');}chunks.push(value);}
  const body=new Uint8Array(total);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.byteLength;}
  return new Request(req.url,{method:'POST',headers:{'content-type':req.headers.get('content-type')||''},body}).formData();
}
function audioType(bytes,mime) {
  const b=new Uint8Array(bytes), str=(start,n)=>String.fromCharCode(...b.slice(start,start+n));
  if(mime==='audio/webm' && b[0]===0x1a && b[1]===0x45 && b[2]===0xdf && b[3]===0xa3)return mime;
  if(mime==='audio/ogg' && str(0,4)==='OggS')return mime;
  if(mime==='audio/wav' && str(0,4)==='RIFF' && str(8,4)==='WAVE')return mime;
  if(mime==='audio/mp4' && str(4,4)==='ftyp')return mime;
  if(mime==='audio/mpeg' && (str(0,3)==='ID3' || (b[0]===0xff && (b[1]&0xe0)===0xe0)))return mime;
  return null;
}
async function sendEmail(env,to,token,kind='verify') {
  const path=kind==='access'?'/access/confirm':'/verify';
  const link=env.PUBLIC_API_URL+path+'?token='+encodeURIComponent(token);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject:kind==='access'?'Your ProSolver Hospitals access link':'Confirm your ProSolver Hospitals request',text:'Open this link within 24 hours, then press Confirm. Do not forward it.\n\n'+link+'\n\nIf you did not request this, ignore this message. Do not submit patient information.'})});
  if(!response.ok)throw new Error('email_delivery');
}
async function cooldown(env,email) {
  const hash=await sha(email);
  const result=await env.DB.prepare("INSERT INTO send_cooldowns(email_hash,sent_at,send_count) VALUES(?,datetime('now'),1) ON CONFLICT(email_hash) DO UPDATE SET sent_at=datetime('now'),send_count=CASE WHEN sent_at<datetime('now','-1 day') THEN 1 ELSE send_count+1 END WHERE sent_at<datetime('now','-10 minutes') AND (send_count<8 OR sent_at<datetime('now','-1 day'))").bind(hash).run();
  return {allowed:result.meta.changes===1,hash};
}
async function submit(req,env) {
  const synthetic=await syntheticAuth(req,env);
  if(!synthetic&&!ready(env))return error('Registration is not open yet.',503);
  if(!allowedOrigin(req,env))return error('Request origin is not permitted.',403);
  if(!await limit(env,'submit:'+ (req.headers.get('CF-Connecting-IP')||'unknown')))return error('Too many attempts. Please try later.',429);
  let f;try{f=await boundedForm(req);}catch(e){return error(e.message==='large'?'Submission exceeds the upload limit.':'Invalid form data.',e.message==='large'?413:400);}
  if(f.get('website'))return error('Unable to accept this submission.');
  const email=emailOf(f.get('email')), phone=phoneOf(f.get('phone'));
  const problem=text(f.get('problem'),5000),daily=text(f.get('daily'),5000);
  const ref=text(f.get('ref'),24)?.toUpperCase()||null;
  const notice=f.get('notice_version'), consent=f.get('consent');
  const requestKey=text(f.get('request_key'),64);
  const audio=f.get('audio');
  if(!email || !phone)return error('Enter a valid email and international phone number beginning with +.');
  if(synthetic&&(!/^smoke-[a-z0-9][a-z0-9._+-]*@example\.test$/.test(email)||!/^\+999\d{7,12}$/.test(phone)||!problem.startsWith('[SYNTHETIC]')||(daily&&!daily.startsWith('[SYNTHETIC]'))))return error('Synthetic identity and marked content required.',400);
  if(problem===null || daily===null || (ref && !/^[A-F0-9]{18}$/.test(ref)))return error('Check the problem and referral fields.');
  if(consent!=='yes' || notice!==NOTICE)return error('Please accept the current privacy and contact notice.');
  if(!requestKey || !/^[a-f0-9-]{36}$/.test(requestKey))return error('Please refresh the form and try again.');
  if(audio!==null && !(audio instanceof File))return error('Invalid audio field.');
  let bytes=null,mime=null;
  if(audio instanceof File && audio.size){
    if(audio.size>MAX_AUDIO)return error('Audio must be at most 5 MiB.',413);
    bytes=await audio.arrayBuffer();mime=audioType(bytes,audio.type.split(';')[0]);
    if(!mime)return error('Unsupported or invalid audio recording.');
    if(synthetic&&!syntheticAudio(bytes,mime))return error('Only the canonical silent test recording is permitted.',400);
  }
  if(!problem && !bytes)return error('Type or record a problem.');
  const oldRequest=await env.DB.prepare('SELECT id FROM submissions WHERE request_key=?').bind(requestKey).first();
  if(oldRequest)return json({ok:true,status:'pending_verification'},202);
  const memberId=uid(), referralCode=random(9).toUpperCase(), submissionId=uid(), token=random(), tokenHash=await sha(token);
  const existing=await env.DB.prepare('SELECT id,verified_at,phone,deleted_at FROM members WHERE email=?').bind(email).first();
  if(synthetic&&ref){const target=await env.DB.prepare('SELECT email FROM members WHERE referral_code=? AND deleted_at IS NULL').bind(ref).first();if(!target?.email.match(/^smoke-[a-z0-9][a-z0-9._+-]*@example\.test$/))return error('Synthetic referral required.',400);}
  if(existing?.deleted_at)return error('Unable to accept this request. Contact the operator.',409);
  if(existing && existing.phone!==phone)return error('Unable to accept this request. Contact the operator.',409);
  if(existing?.verified_at){
    const session=await memberSession(req,env);
    if(!session || session.id!==existing.id)return error('Use your email access link to submit another problem.',401);
  }
  const id=existing?.id||memberId;
  const key=bytes?'private/'+random(24):null;
  if(bytes){try{await env.AUDIO.put(key,bytes,{httpMetadata:{contentType:mime}});}catch{await env.AUDIO.delete(key).catch(()=>{});return error('Audio could not be saved. Please retry.',503);}}
  try{
    if(!existing)await env.DB.prepare("INSERT OR IGNORE INTO members(id,email,phone,referral_code,referrer_code,created_at) VALUES(?,?,?,?,?,datetime('now'))").bind(memberId,email,phone,referralCode,ref).run();
    const member=await env.DB.prepare('SELECT id,verified_at FROM members WHERE email=?').bind(email).first();
    if(!member || member.id!==id)throw new Error('member_race');
    const batch=await env.DB.batch([
      env.DB.prepare("INSERT INTO submissions(id,member_id,problem,daily,audio_key,audio_type,consent_version,verification_hash,expires_at,created_at,request_key) SELECT ?,?,?,?,?,?,?,?,datetime('now','+1 day'),datetime('now'),? WHERE NOT EXISTS(SELECT 1 FROM submissions WHERE member_id=? AND verified_at IS NULL AND deleted_at IS NULL) AND (NOT EXISTS(SELECT 1 FROM submissions WHERE member_id=? AND verified_at IS NOT NULL) OR (SELECT COALESCE(SUM(delta),0) FROM ledger WHERE member_id=?)-(SELECT COUNT(*) FROM submissions WHERE member_id=? AND verified_at IS NULL AND deleted_at IS NULL)>0)").bind(submissionId,id,problem,daily,key,mime,NOTICE,tokenHash,requestKey,id,id,id,id),
      env.DB.prepare("INSERT INTO consent_events(id,member_id,submission_id,notice_version,contact_consent,created_at) SELECT ?,?,id,?,1,datetime('now') FROM submissions WHERE id=?").bind(uid(),id,NOTICE,submissionId)
    ]);
    if(batch[0].meta.changes!==1)throw new Error('eligibility');
    if(!synthetic)await sendEmail(env,email,token);
  }catch(e){
    await env.DB.prepare('DELETE FROM consent_events WHERE submission_id=?').bind(submissionId).run().catch(()=>{});
    await env.DB.prepare('DELETE FROM submissions WHERE id=? AND verified_at IS NULL').bind(submissionId).run().catch(()=>{});
    if(!existing)await env.DB.prepare('DELETE FROM members WHERE id=? AND verified_at IS NULL AND NOT EXISTS(SELECT 1 FROM submissions WHERE member_id=?)').bind(memberId,memberId).run().catch(()=>{});
    if(key)await env.AUDIO.delete(key).catch(()=>{});
    if(e.message==='eligibility')return error('An unverified request is already pending, or no submission credit is available.',409);
    return error('Submission could not be completed. Please retry later.',503);
  }
  return json(synthetic?{ok:true,status:'pending_verification',test_token:token}:{ok:true,status:'pending_verification'},202);
}
function landing(title,action,token) {
  const safe=/^[a-f0-9]{64}$/.test(token||'')?token:'';
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title><style>body{font:16px system-ui;max-width:34rem;margin:5rem auto;padding:1rem;color:#14283e}button{background:#1769df;color:white;border:0;border-radius:8px;padding:1rem;cursor:pointer}</style></head><body><h1>${title}</h1><p>Press Confirm to continue. This link expires after 24 hours and works once.</p><form method="POST" action="${action}"><input type="hidden" name="token" value="${safe}"><button type="submit">Confirm</button></form></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function confirm(req,env,access=false) {
  if(!confirmationOrigin(req,env))return error('Request origin is not permitted.',403);
  let f;try{f=await boundedForm(req);}catch(e){return error(e.message==='large'?'Request is too large.':'Invalid form data.',e.message==='large'?413:400);}
  const token=f.get('token');
  if(typeof token!=='string'|| !/^[a-f0-9]{64}$/.test(token))return error('Invalid or expired link.',400);
  const hash=await sha(token);
  if(access){
    const row=await env.DB.prepare("SELECT member_id FROM access_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')").bind(hash).first();
    if(!row)return error('Invalid or expired link.',400);
    const res=await env.DB.prepare("UPDATE access_tokens SET used_at=datetime('now') WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')").bind(hash).run();
    if(res.meta.changes!==1)return error('Invalid or expired link.',400);
    return issueSession(env,row.member_id);
  }
  const row=await env.DB.prepare("SELECT s.id,s.member_id,m.referrer_code FROM submissions s JOIN members m ON m.id=s.member_id WHERE s.verification_hash=? AND s.verified_at IS NULL AND s.expires_at>datetime('now') AND s.deleted_at IS NULL").bind(hash).first();
  if(!row)return error('Invalid or expired link.',400);
  const batch=await env.DB.batch([
    env.DB.prepare("UPDATE submissions SET verified_at=datetime('now'),verification_hash=NULL WHERE id=? AND verification_hash=? AND verified_at IS NULL AND expires_at>datetime('now') AND (NOT EXISTS(SELECT 1 FROM submissions WHERE member_id=? AND verified_at IS NOT NULL) OR (SELECT COALESCE(SUM(delta),0) FROM ledger WHERE member_id=?)>0)").bind(row.id,hash,row.member_id,row.member_id),
    env.DB.prepare("UPDATE members SET verified_at=COALESCE(verified_at,datetime('now')) WHERE id=? AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND verified_at IS NOT NULL)").bind(row.member_id,row.id),
    env.DB.prepare("INSERT OR IGNORE INTO ledger(id,member_id,delta,reason,submission_id,created_at) SELECT ?,?,-1,'extra_submission',?,datetime('now') WHERE (SELECT COUNT(*) FROM submissions WHERE member_id=? AND verified_at IS NOT NULL)>1 AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND verified_at IS NOT NULL)").bind(uid(),row.member_id,row.id,row.member_id,row.id),
    env.DB.prepare("INSERT OR IGNORE INTO referrals(referrer_id,referred_id,created_at) SELECT r.id,?,datetime('now') FROM members r JOIN members m ON m.referrer_code=r.referral_code WHERE m.id=? AND r.verified_at IS NOT NULL AND r.deleted_at IS NULL AND r.id<>? AND (SELECT COUNT(*) FROM submissions WHERE member_id=? AND verified_at IS NOT NULL)=1 AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND verified_at IS NOT NULL)").bind(row.member_id,row.member_id,row.member_id,row.member_id,row.id),
    env.DB.prepare("INSERT OR IGNORE INTO ledger(id,member_id,delta,reason,submission_id,created_at) SELECT ?,r.referrer_id,1,'verified_referral',?,datetime('now') FROM referrals r WHERE r.referred_id=? AND (SELECT COUNT(*) FROM submissions WHERE member_id=? AND verified_at IS NOT NULL)=1").bind(uid(),row.id,row.member_id,row.member_id)
  ]);
  if(batch[0].meta.changes!==1)return error('Invalid, expired, or already used link.',400);
  return issueSession(env,row.member_id);
}
async function issueSession(env,memberId){
  const token=random();
  await env.DB.prepare("INSERT INTO sessions(token_hash,member_id,expires_at,created_at) VALUES(?,?,datetime('now','+7 days'),datetime('now'))").bind(await sha(token),memberId).run();
  return new Response(null,{status:303,headers:{location:'/rewards','set-cookie':'ps_session='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800'}});
}
async function memberSession(req,env){
  const match=(req.headers.get('cookie')||'').match(/(?:^|; )ps_session=([a-f0-9]{64})(?:;|$)/);
  if(!match)return null;
  return env.DB.prepare("SELECT m.id,m.email,m.phone,m.referral_code FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND m.deleted_at IS NULL AND m.verified_at IS NOT NULL").bind(await sha(match[1])).first();
}
async function rewards(req,env){
  const member=await memberSession(req,env);
  if(!member)return new Response('<h1>Access required</h1><p>Request a fresh access link from the main site.</p>',{status:401,headers:{'content-type':'text/html; charset=utf-8'}});
  const stats=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM referrals r WHERE referrer_id=? AND NOT EXISTS(SELECT 1 FROM referral_reversals x WHERE x.referred_id=r.referred_id)) verified_referrals,(SELECT COUNT(*) FROM members m WHERE m.referrer_code=? AND m.verified_at IS NULL AND m.deleted_at IS NULL) pending_referrals,(SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) FROM ledger WHERE member_id=?) earned,(SELECT COALESCE(SUM(CASE WHEN reason='extra_submission' THEN -delta ELSE 0 END),0) FROM ledger WHERE member_id=?) redeemed,(SELECT COALESCE(SUM(delta),0) FROM ledger WHERE member_id=?) balance").bind(member.id,member.referral_code,member.id,member.id,member.id).first();
  const link=env.SITE_ORIGIN+SITE_PATH+'?ref='+member.referral_code;
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Your ProSolver rewards</title><style>body{font:16px 'IBM Plex Sans',system-ui;max-width:40rem;margin:4rem auto;padding:1rem;color:#14283e}input{width:100%;padding:.8rem;box-sizing:border-box}button,a.button{display:inline-block;background:#1769df;color:white;border:0;border-radius:8px;padding:.8rem;margin:.5rem 0;text-decoration:none}</style></head><body><h1>Your waitlist rewards</h1><p>Email verified. Your referral link:</p><input id="link" readonly value="${escape(link)}"><button id="copy">Copy link</button><button id="share">Share</button><a class="button" href="https://wa.me/?text=${encodeURIComponent(link)}" rel="noreferrer">Share on WhatsApp</a><p>Verified referrals: ${stats.verified_referrals} · pending: ${stats.pending_referrals}</p><p>Points earned: ${stats.earned} · redeemed: ${stats.redeemed} · available: ${stats.balance}</p><p>Available additional submission credits: ${stats.balance}. Each credit is consumed when that submission is verified. Points have no cash value and do not guarantee resolution.</p><a href="/submit-again">Submit another problem</a><p><button id="delete">Delete my data</button></p><script>document.getElementById('copy').onclick=()=>navigator.clipboard.writeText(document.getElementById('link').value);document.getElementById('share').onclick=()=>{const url=document.getElementById('link').value;if(navigator.share)navigator.share({title:'ProSolver Hospitals',url});else navigator.clipboard.writeText(url);};document.getElementById('delete').onclick=async()=>{if(!confirm('Delete your account contact and submissions, including voice notes?'))return;const r=await fetch('/me/delete',{method:'POST'});if(r.ok)location.href='/';else alert('Deletion failed. Please contact the operator.');};</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function submitAgain(req,env){
  const member=await memberSession(req,env);
  if(!member)return error('Access required.',401);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Submit another problem</title><style>body{font:16px system-ui;max-width:36rem;margin:3rem auto;padding:1rem;color:#14283e}textarea,input{width:100%;box-sizing:border-box;padding:.8rem;margin:.5rem 0}button{background:#1769df;color:white;border:0;border-radius:8px;padding:.8rem}</style></head><body><h1>Submit another problem</h1><p>One available point permits an additional verified submission. It is consumed after email verification.</p><form id="f"><label>Problem<textarea name="problem" maxlength="5000"></textarea></label><label>Daily challenges (optional)<textarea name="daily" maxlength="5000"></textarea></label><label>Voice note (optional)<input type="file" name="audio" accept="audio/webm,audio/ogg,audio/mp4,audio/wav,audio/mpeg"></label><input type="hidden" name="email" value="${escape(member.email)}"><input type="hidden" name="phone" value="${escape(member.phone)}"><input type="hidden" name="notice_version" value="${NOTICE}"><input type="hidden" name="consent" value="yes"><p><label><input type="checkbox" id="c" required> I accept the current privacy and contact notice.</label></p><button>Submit</button></form><p id="message" role="status"></p><a href="/rewards">Back to rewards</a><script>const f=document.getElementById('f');f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);d.append('request_key',crypto.randomUUID());const b=f.querySelector('button');b.disabled=true;try{const r=await fetch('/submit',{method:'POST',body:d});const v=await r.json();document.getElementById('message').textContent=r.ok?'Check your email and press Confirm to verify this problem.':v.error;}catch{document.getElementById('message').textContent='Submission failed. Please retry.';}finally{b.disabled=false;}};</script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
async function eraseMember(env,memberId,reason){
  const rows=await env.DB.prepare('SELECT id,audio_key FROM submissions WHERE member_id=? AND deleted_at IS NULL').bind(memberId).all();
  for(const row of rows.results){if(row.audio_key)await env.AUDIO.delete(row.audio_key);}
  const commands=[];
  for(const row of rows.results){
    commands.push(env.DB.prepare("UPDATE submissions SET problem='',daily='',founder_notes='',audio_key=NULL,verification_hash=NULL,deleted_at=datetime('now') WHERE id=?").bind(row.id));
    commands.push(env.DB.prepare("INSERT INTO deletion_events(id,member_id,submission_id,audio_key,status,reason,created_at) VALUES(?,?,?,?, 'completed',?,datetime('now'))").bind(uid(),memberId,row.id,row.audio_key,reason));
  }
  commands.push(env.DB.prepare("UPDATE members SET email=?,phone='',deleted_at=datetime('now') WHERE id=?").bind('deleted+'+memberId+'@invalid.local',memberId));
  commands.push(env.DB.prepare('DELETE FROM sessions WHERE member_id=?').bind(memberId));
  commands.push(env.DB.prepare('DELETE FROM access_tokens WHERE member_id=?').bind(memberId));
  await env.DB.batch(commands);
}
async function memberDelete(req,env){
  if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
  const member=await memberSession(req,env);if(!member)return error('Access required.',401);
  await eraseMember(env,member.id,'member_request');
  const response=json({ok:true});
  response.headers.set('set-cookie','ps_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  return response;
}
async function syntheticCleanup(req,env){
  if(!await syntheticAuth(req,env))return error('Unauthorized.',401);
  if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
  const members=await env.DB.prepare("SELECT id FROM members WHERE email LIKE 'smoke-%@example.test' AND phone LIKE '+999%' AND deleted_at IS NULL LIMIT 100").all();
  for(const member of members.results)await eraseMember(env,member.id,'synthetic_cleanup');
  return json({ok:true,deleted_members:members.results.length,more:members.results.length===100});
}
async function access(req,env){
  if(!ready(env))return error('Registration is not open yet.',503);
  if(!allowedOrigin(req,env))return error('Request origin is not permitted.',403);
  if(!await limit(env,'access:'+(req.headers.get('CF-Connecting-IP')||'unknown')))return error('Too many attempts.',429);
  let f;try{f=await boundedForm(req);}catch{return error('Invalid request.');}
  const email=emailOf(f.get('email'));
  if(!email)return error('Enter a valid email address.');
  const generic=json({ok:true,message:'If an eligible account exists, an email has been sent.'},202);
  const member=await env.DB.prepare('SELECT id,verified_at FROM members WHERE email=? AND deleted_at IS NULL').bind(email).first();
  if(!member)return generic;
  const pending=member.verified_at?null:await env.DB.prepare('SELECT id,verification_hash,expires_at FROM submissions WHERE member_id=? AND verified_at IS NULL AND deleted_at IS NULL').bind(member.id).first();
  if(!member.verified_at&&!pending)return generic;
  const cd=await cooldown(env,email);if(!cd.allowed)return generic;
  const token=random(),hash=await sha(token);
  try{
    if(member.verified_at)await env.DB.prepare("INSERT INTO access_tokens(token_hash,member_id,expires_at,created_at) VALUES(?,?,datetime('now','+1 day'),datetime('now'))").bind(hash,member.id).run();
    else await env.DB.prepare("UPDATE submissions SET verification_hash=?,expires_at=datetime('now','+1 day') WHERE id=? AND verified_at IS NULL AND deleted_at IS NULL").bind(hash,pending.id).run();
    await sendEmail(env,email,token,member.verified_at?'access':'verify');
  }catch{
    await env.DB.prepare('DELETE FROM access_tokens WHERE token_hash=?').bind(hash).run().catch(()=>{});
    if(pending)await env.DB.prepare('UPDATE submissions SET verification_hash=?,expires_at=? WHERE id=? AND verification_hash=?').bind(pending.verification_hash,pending.expires_at,pending.id,hash).run().catch(()=>{});
    await env.DB.prepare('DELETE FROM send_cooldowns WHERE email_hash=?').bind(cd.hash).run().catch(()=>{});
  }
  return generic;
}
async function adminAuth(req,env){
  if(!env.ADMIN_TOKEN || !await limit(env,'admin:'+(req.headers.get('CF-Connecting-IP')||'unknown')))return false;
  const candidate=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!candidate || candidate.length>256)return false;
  const a=await sha(candidate),b=await sha(env.ADMIN_TOKEN);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;
}
async function audit(env,action,target,detail=''){await env.DB.prepare("INSERT INTO audit_events(id,actor,action,target_type,target_id,detail,created_at) VALUES(?,'founder',?,'submission',?,?,datetime('now'))").bind(uid(),action,target,detail).run();}
function auditStmt(env,action,target,detail=''){return env.DB.prepare("INSERT INTO audit_events(id,actor,action,target_type,target_id,detail,created_at) VALUES(?,'founder',?,'submission',?,?,datetime('now'))").bind(uid(),action,target,detail);}
async function admin(req,env,url){
  if(!await adminAuth(req,env))return error('Unauthorized.',401);
  const reverse=url.pathname.match(/^\/admin\/referrals\/([a-f0-9-]{36})\/reverse$/);
  if(reverse&&req.method==='POST'){
    if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
    let body;try{body=await req.json();}catch{return error('Invalid JSON.');}
    const reason=text(body?.reason,300);
    if(!reason)return error('A reason is required.');
    const referral=await env.DB.prepare('SELECT referrer_id,referred_id FROM referrals WHERE referred_id=?').bind(reverse[1]).first();
    if(!referral)return error('Not found.',404);
    const ledgerId=uid();
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO ledger(id,member_id,delta,reason,created_at) VALUES(?,?,-1,'referral_reversal',datetime('now'))").bind(ledgerId,referral.referrer_id),
        env.DB.prepare("INSERT INTO referral_reversals(referred_id,referrer_id,ledger_id,reason,created_at) VALUES(?,?,?,?,datetime('now'))").bind(referral.referred_id,referral.referrer_id,ledgerId,reason),
        auditStmt(env,'reverse_referral',reverse[1],reason)
      ]);
    }catch{await audit(env,'reversal_rejected',reverse[1]);return error('Reward was already reversed or cannot be recovered without a negative balance.',409);}
    return json({ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/admin/summary'){
    const totals=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM members WHERE deleted_at IS NULL) members,(SELECT COUNT(*) FROM members WHERE verified_at IS NOT NULL AND deleted_at IS NULL) verified_members,(SELECT COUNT(*) FROM members WHERE verified_at IS NULL AND deleted_at IS NULL) pending_members,(SELECT COUNT(*) FROM submissions WHERE deleted_at IS NULL) problems,(SELECT COUNT(*) FROM submissions WHERE verified_at IS NOT NULL AND deleted_at IS NULL) verified_problems,(SELECT COUNT(*) FROM submissions WHERE verified_at IS NULL AND deleted_at IS NULL) pending_verification,(SELECT COUNT(*) FROM submissions WHERE audio_key IS NULL AND deleted_at IS NULL) typed_submissions,(SELECT COUNT(*) FROM submissions WHERE audio_key IS NOT NULL AND deleted_at IS NULL) voice_submissions,(SELECT COUNT(*) FROM referrals r WHERE NOT EXISTS(SELECT 1 FROM referral_reversals x WHERE x.referred_id=r.referred_id)) verified_referrals,(SELECT COALESCE(SUM(CASE WHEN delta>0 THEN delta ELSE 0 END),0) FROM ledger) points_awarded,(SELECT COALESCE(SUM(CASE WHEN reason='extra_submission' THEN -delta ELSE 0 END),0) FROM ledger) points_redeemed,(SELECT COALESCE(SUM(l.delta),0) FROM ledger l JOIN members m ON m.id=l.member_id WHERE m.deleted_at IS NULL) outstanding_points,(SELECT COUNT(*) FROM submissions WHERE review_status='new' AND deleted_at IS NULL) awaiting_review").first();
    const filters=[],bind=[];
    if(url.searchParams.get('q')){filters.push('(s.problem LIKE ? OR s.daily LIKE ?)');const q='%'+url.searchParams.get('q').slice(0,100).replace(/[%_]/g,'')+'%';bind.push(q,q);}
    const status=url.searchParams.get('status');if(status==='verified'||status==='pending'){filters.push(status==='verified'?'s.verified_at IS NOT NULL':'s.verified_at IS NULL');}
    const type=url.searchParams.get('type');if(type==='voice'||type==='typed')filters.push(type==='voice'?'s.audio_key IS NOT NULL':'s.audio_key IS NULL');
    const review=url.searchParams.get('review');if(STATUSES.includes(review)){filters.push('s.review_status=?');bind.push(review);}
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if(/^\d{4}-\d{2}-\d{2}$/.test(from||'')){filters.push('s.created_at>=?');bind.push(from);}
    if(/^\d{4}-\d{2}-\d{2}$/.test(to||'')){filters.push('s.created_at<?');bind.push(to+' 23:59:59');}
    const rows=await env.DB.prepare('SELECT s.id,s.created_at,s.verified_at,s.problem,s.daily,s.audio_key IS NOT NULL has_audio,s.review_status,s.category,s.priority,s.founder_notes,m.email,m.phone,r.frequency,r.severity,r.urgency,r.operational_impact,r.resolution_effort,r.willingness_to_pay,r.product_opportunity,r.recurring_pattern FROM submissions s JOIN members m ON m.id=s.member_id LEFT JOIN research_classifications r ON r.submission_id=s.id WHERE s.deleted_at IS NULL '+(filters.length?' AND '+filters.join(' AND '):'')+' ORDER BY s.created_at DESC LIMIT 100').bind(...bind).all();
    const trends=await env.DB.prepare("SELECT substr(created_at,1,10) day,COUNT(*) count FROM submissions WHERE deleted_at IS NULL GROUP BY day ORDER BY day DESC LIMIT 30").all();
    await audit(env,'view_list',null);
    return json({totals,submissions:rows.results,trends:trends.results});
  }
  const match=url.pathname.match(/^\/admin\/submissions\/([a-f0-9-]{36})$/);
  if(match && req.method==='PATCH'){
    if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
    let body;try{body=await req.json();}catch{return error('Invalid JSON.');}
    if(!body || typeof body!=='object' || !STATUSES.includes(body.review_status) || (body.category!==null && !CATEGORIES.includes(body.category)) || (body.priority!==null && !['low','normal','high','critical'].includes(body.priority)) || text(body.founder_notes,5000)===null)return error('Invalid review fields.');
    const res=await env.DB.batch([env.DB.prepare("UPDATE submissions SET review_status=?,category=?,priority=?,founder_notes=?,updated_at=datetime('now') WHERE id=? AND deleted_at IS NULL").bind(body.review_status,body.category,body.priority,body.founder_notes.trim(),match[1]),auditStmt(env,'update_review',match[1])]);
    if(!res[0].meta.changes)return error('Not found.',404);
    return json({ok:true});
  }
  const classification=url.pathname.match(/^\/admin\/research\/([a-f0-9-]{36})$/);
  if(classification&&req.method==='PATCH'){
    if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
    let body;try{body=await req.json();}catch{return error('Invalid JSON.');}
    const keys=['frequency','severity','urgency','operational_impact','resolution_effort','willingness_to_pay','product_opportunity','recurring_pattern'];
    if(!body||typeof body!=='object'||keys.some(k=>body[k]!==null&&text(body[k],120)===null))return error('Invalid classification.');
    const exists=await env.DB.prepare('SELECT id FROM submissions WHERE id=? AND deleted_at IS NULL').bind(classification[1]).first();
    if(!exists)return error('Not found.',404);
    await env.DB.batch([env.DB.prepare("INSERT INTO research_classifications(submission_id,frequency,severity,urgency,operational_impact,resolution_effort,willingness_to_pay,product_opportunity,recurring_pattern,updated_at) VALUES(?,?,?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(submission_id) DO UPDATE SET frequency=excluded.frequency,severity=excluded.severity,urgency=excluded.urgency,operational_impact=excluded.operational_impact,resolution_effort=excluded.resolution_effort,willingness_to_pay=excluded.willingness_to_pay,product_opportunity=excluded.product_opportunity,recurring_pattern=excluded.recurring_pattern,updated_at=datetime('now')").bind(classification[1],...keys.map(k=>body[k])),auditStmt(env,'classify',classification[1])]);return json({ok:true});
  }
  if(match && req.method==='DELETE'){
    if(!allowedOrigin(req,env))return error('Origin not permitted.',403);
    const row=await env.DB.prepare('SELECT audio_key FROM submissions WHERE id=? AND deleted_at IS NULL').bind(match[1]).first();
    if(!row)return error('Not found.',404);
    if(row.audio_key)await env.AUDIO.delete(row.audio_key);
    await env.DB.batch([
      env.DB.prepare("UPDATE submissions SET problem='',daily='',founder_notes='',audio_key=NULL,deleted_at=datetime('now'),verification_hash=NULL WHERE id=?").bind(match[1]),
      env.DB.prepare("INSERT INTO deletion_events(id,submission_id,audio_key,status,reason,created_at) VALUES(?,?,?,'completed','founder_request',datetime('now'))").bind(uid(),match[1],row.audio_key),
      auditStmt(env,'delete',match[1])
    ]);
    return json({ok:true});
  }
  const audio=url.pathname.match(/^\/admin\/audio\/([a-f0-9-]{36})$/);
  if(audio&&req.method==='GET'){
    const row=await env.DB.prepare('SELECT audio_key FROM submissions WHERE id=? AND deleted_at IS NULL').bind(audio[1]).first();
    if(!row?.audio_key)return error('Not found.',404);
    const obj=await env.AUDIO.get(row.audio_key);if(!obj)return error('Not found.',404);
    await audit(env,'audio_access',audio[1]);
    return new Response(obj.body,{headers:{'content-type':obj.httpMetadata?.contentType||'application/octet-stream','content-disposition':'attachment; filename="prosolver-voice-note"'}});
  }
  if(url.pathname==='/admin/research/export'&&req.method==='GET'){
    const rows=await env.DB.prepare("SELECT s.category,r.frequency,r.severity,r.urgency,r.operational_impact,r.resolution_effort,r.willingness_to_pay,r.product_opportunity,r.recurring_pattern,COUNT(*) count FROM submissions s LEFT JOIN research_classifications r ON r.submission_id=s.id WHERE s.verified_at IS NOT NULL AND s.deleted_at IS NULL AND s.category IS NOT NULL GROUP BY s.category,r.frequency,r.severity,r.urgency,r.operational_impact,r.resolution_effort,r.willingness_to_pay,r.product_opportunity,r.recurring_pattern").all();
    await audit(env,'research_export',null);return json({groups:rows.results});
  }
  return error('Not found.',404);
}
async function cleanup(env){
  const days=Number(env.RETENTION_DAYS);
  if(!Number.isInteger(days)||days<30||days>3650)return error('Retention is not configured.',503);
  const pending=await env.DB.prepare("SELECT id,audio_key FROM submissions WHERE deleted_at IS NULL AND ((verified_at IS NULL AND expires_at<datetime('now','-1 day')) OR (verified_at IS NOT NULL AND created_at<datetime('now',?))) LIMIT 100").bind('-'+days+' days').all();
  for(const row of pending.results){
    if(row.audio_key)await env.AUDIO.delete(row.audio_key);
    await env.DB.batch([
      env.DB.prepare("UPDATE submissions SET problem='',daily='',founder_notes='',audio_key=NULL,verification_hash=NULL,deleted_at=datetime('now') WHERE id=?").bind(row.id),
      env.DB.prepare("INSERT INTO deletion_events(id,submission_id,audio_key,status,reason,created_at) VALUES(?,?,?,'completed','retention',datetime('now'))").bind(uid(),row.id,row.audio_key)
    ]);
  }
  await env.DB.prepare("UPDATE members SET email='deleted+'||id||'@invalid.local',phone='',deleted_at=datetime('now') WHERE deleted_at IS NULL AND created_at<datetime('now',?) AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.member_id=members.id AND s.deleted_at IS NULL)").bind('-'+days+' days').run();
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at<datetime('now')").run();
  await env.DB.prepare("DELETE FROM access_tokens WHERE expires_at<datetime('now')").run();
  await env.DB.prepare("DELETE FROM send_cooldowns WHERE sent_at<datetime('now','-2 days')").run();
  await env.DB.prepare('DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE deleted_at IS NOT NULL)').run();
  await env.DB.prepare('DELETE FROM access_tokens WHERE member_id IN (SELECT id FROM members WHERE deleted_at IS NOT NULL)').run();
  const oldSynthetic=await env.DB.prepare("SELECT id FROM members WHERE email LIKE 'smoke-%@example.test' AND phone LIKE '+999%' AND created_at<datetime('now','-1 day') AND deleted_at IS NULL LIMIT 100").all();
  for(const member of oldSynthetic.results)await eraseMember(env,member.id,'synthetic_retention');
  let orphaned=0,cursor;
  for(let page=0;page<10;page++){
    const listing=await env.AUDIO.list({prefix:'private/',limit:1000,...(cursor?{cursor}:{})});
    for(const object of listing.objects){
      if(Date.now()-new Date(object.uploaded).getTime()<86400000)continue;
      const linked=await env.DB.prepare('SELECT id FROM submissions WHERE audio_key=? AND deleted_at IS NULL').bind(object.key).first();
      if(!linked){await env.AUDIO.delete(object.key);orphaned++;}
    }
    if(!listing.truncated||!listing.cursor)break;
    cursor=listing.cursor;
  }
  return json({ok:true,expired_pending:pending.results.length,orphaned_audio:orphaned});
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    try{
      if(req.method==='OPTIONS')return finish(new Response(null,{status:204}),req,env);
      let res;
      if(req.method==='GET'&&url.pathname==='/health')res=json({ok:true,signups_enabled:ready(env)});
      else if(req.method==='POST'&&url.pathname==='/submit')res=await submit(req,env);
      else if(req.method==='POST'&&['/resend','/access'].includes(url.pathname))res=await access(req,env);
      else if(req.method==='GET'&&url.pathname==='/verify')res=landing('Confirm your request','/verify',url.searchParams.get('token'));
      else if(req.method==='POST'&&url.pathname==='/verify')res=await confirm(req,env);
      else if(req.method==='GET'&&url.pathname==='/access/confirm')res=landing('Access your rewards','/access/confirm',url.searchParams.get('token'));
      else if(req.method==='POST'&&url.pathname==='/access/confirm')res=await confirm(req,env,true);
      else if(req.method==='GET'&&url.pathname==='/rewards')res=await rewards(req,env);
      else if(req.method==='GET'&&url.pathname==='/submit-again')res=await submitAgain(req,env);
      else if(req.method==='POST'&&url.pathname==='/me/delete')res=await memberDelete(req,env);
      else if(req.method==='POST'&&url.pathname==='/synthetic/cleanup')res=await syntheticCleanup(req,env);
      else if(url.pathname.startsWith('/admin/'))res=await admin(req,env,url);
      else res=error('Not found.',404);
      return finish(res,req,env);
    }catch(e){console.error('Request failure',e?.name);return finish(error('The service is temporarily unavailable.',500),req,env);}
  },
  async scheduled(_event,env){await cleanup(env);}
};
