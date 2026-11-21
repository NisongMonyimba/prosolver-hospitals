const MAX_AUDIO = 5 * 1024 * 1024;
const ALLOWED_AUDIO = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']);
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const error = (message, status = 400) => json({ error: message }, status);
const clean = (value, limit = 5000) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const sha = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(9))).map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 12).toUpperCase();
const cors = (req, env) => {
  const origin = req.headers.get('Origin');
  return origin === env.SITE_ORIGIN ? { 'access-control-allow-origin': origin, 'vary': 'Origin', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, Authorization' } : {};
};
const isAuthorizedOrigin = (req, env) => !req.headers.get('Origin') || req.headers.get('Origin') === env.SITE_ORIGIN;
const forbidden = () => error('Not permitted', 403);
const corsWrap = (response, headers) => { for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; };
const reqSizeOk = req => Number(req.headers.get('content-length') || 0) <= MAX_AUDIO + 20000;
const newId = () => crypto.randomUUID();

async function sendVerification(env, email, token) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email verification is not configured');
  const link = `${env.PUBLIC_API_URL}/verify?token=${encodeURIComponent(token)}`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: 'Verify your ProSolver Hospitals waitlist request',
      text: `Confirm your ProSolver Hospitals request by opening this link within 24 hours:\n\n${link}\n\nIf you did not request this, ignore this email. Never send patient information.` })
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}

async function submit(req, env) {
  if (!isAuthorizedOrigin(req, env)) return forbidden();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.PUBLIC_API_URL) return error('Waitlist email verification is not configured yet', 503);
  if (!reqSizeOk(req)) return error('Submission exceeds the upload limit', 413);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const rate = await env.RATE.limit({ key: ip });
  if (!rate.success) return error('Too many attempts. Please try again later.', 429);
  let fields;
  try { fields = await req.formData(); } catch { return error('Invalid form data'); }
  if (clean(fields.get('website'), 200)) return error('Unable to accept this submission');
  const email = clean(fields.get('email'), 254).toLowerCase();
  const phone = clean(fields.get('phone'), 30);
  const problem = clean(fields.get('problem'));
  const daily = clean(fields.get('daily'));
  const referral = clean(fields.get('ref'), 24).toUpperCase();
  const consent = fields.get('consent') === 'yes';
  const audio = fields.get('audio');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[\d\s().-]{7,25}$/.test(phone) || phone.replace(/\D/g,'').length < 7 || phone.replace(/\D/g,'').length > 15) return error('Enter a valid email and phone number');
  if (!consent || (!problem && !(audio instanceof File && audio.size))) return error('Problem and consent are required');
  const audioExists = audio instanceof File && audio.size > 0;
  if (audioExists && (audio.size > MAX_AUDIO || !ALLOWED_AUDIO.has(audio.type.split(';')[0]))) return error('Audio must be supported and under 5 MB');
  const existing = await env.DB.prepare('SELECT id,verified_at,phone,referral_code FROM members WHERE email=?').bind(email).first();
  if (existing && existing.phone !== phone) return error('This email is already registered with a different phone number. Contact support.', 409);
  const memberId = existing?.id || newId();
  const token = `${newId()}${newId()}`;
  const tokenHash = await sha(token);
  const memberCode = existing?.referral_code || code();
  const submitId = newId();
  const audioKey = audioExists ? `private/${memberId}/${submitId}` : null;
  const currentVerifiedSubmissions = existing?.verified_at ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE member_id=? AND verified_at IS NOT NULL').bind(memberId).first()).n : 0;
  const points = existing?.verified_at ? (await env.DB.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE member_id=?').bind(memberId).first()).n : 0;
  if (currentVerifiedSubmissions > 0 && points < 1) return error('No additional request credits available yet. Invite verified colleagues to earn points.', 409);
  if (audioExists) await env.AUDIO.put(audioKey, audio.stream(), { httpMetadata: { contentType: audio.type.split(';')[0] } });
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO members(id,email,phone,referral_code,referrer_code,verified_at,created_at) VALUES(?,?,?,?,?,NULL,datetime("now")) ON CONFLICT(email) DO NOTHING').bind(memberId,email,phone,memberCode,referral || null),
      env.DB.prepare('INSERT INTO submissions(id,member_id,problem,daily,audio_key,consent_version,verification_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?,datetime("now","+1 day"),datetime("now"))').bind(submitId,memberId,problem,daily,audioKey,'2026-11-v1',tokenHash)
    ]);
    await sendVerification(env, email, token);
  } catch (e) {
    // Keep the pending record on mail failures so the owner can troubleshoot. Never expose provider internals.
    await env.DB.prepare("DELETE FROM submissions WHERE id=? AND verified_at IS NULL").bind(submitId).run().catch(()=>{});
    if (!existing) await env.DB.prepare("DELETE FROM members WHERE id=? AND verified_at IS NULL").bind(memberId).run().catch(()=>{});
    if (audioKey) await env.AUDIO.delete(audioKey).catch(()=>{});
    if (e?.message?.startsWith('Email provider')) return error('Verification email could not be sent. Contact support before retrying.', 503);
    return error('Submission failed. Please contact support.', 503);
  }
  return json({ ok: true, status: 'pending_verification', message: 'Check your email for a verification link. No points are awarded until verification.' }, 202);
}

async function verify(url, env) {
  const raw = url.searchParams.get('token') || '';
  if (!/^[a-f0-9-]{72}$/.test(raw)) return error('Invalid or expired verification link', 400);
  const hash = await sha(raw);
  const row = await env.DB.prepare('SELECT s.id,s.member_id,s.verified_at,s.expires_at,m.referrer_code,m.referral_code FROM submissions s JOIN members m ON m.id=s.member_id WHERE s.verification_hash=?').bind(hash).first();
  if (!row || row.verified_at || Date.parse(row.expires_at.replace(' ','T')+'Z') < Date.now()) return error('Invalid, expired, or previously used verification link', 400);
  const member = await env.DB.prepare('SELECT COUNT(*) AS n FROM submissions WHERE member_id=? AND verified_at IS NOT NULL').bind(row.member_id).first();
  const balance = await env.DB.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE member_id=?').bind(row.member_id).first();
  if (member.n && balance.n < 1) return error('No available request credits. Invite colleagues to earn more.', 409);
  const referredBy = !member.n && row.referrer_code ? await env.DB.prepare('SELECT id FROM members WHERE referral_code=? AND verified_at IS NOT NULL').bind(row.referrer_code).first() : null;
  const commands = [
    env.DB.prepare('UPDATE submissions SET verified_at=datetime("now"),verification_hash=NULL WHERE id=? AND verified_at IS NULL').bind(row.id),
    env.DB.prepare('UPDATE members SET verified_at=COALESCE(verified_at,datetime("now")) WHERE id=?').bind(row.member_id)
  ];
  if (member.n) commands.push(env.DB.prepare('INSERT INTO ledger(id,member_id,delta,reason,submission_id,created_at) VALUES(?,?,-1,?,?,datetime("now"))').bind(newId(),row.member_id,'extra_submission',row.id));
  if (referredBy && referredBy.id !== row.member_id) {
    commands.push(env.DB.prepare('INSERT OR IGNORE INTO referrals(referrer_id,referred_id,created_at) VALUES(?,?,datetime("now"))').bind(referredBy.id,row.member_id));
    commands.push(env.DB.prepare('INSERT OR IGNORE INTO ledger(id,member_id,delta,reason,submission_id,created_at) VALUES(?,?,1,?,?,datetime("now"))').bind(newId(),referredBy.id,'verified_referral',row.id));
  }
  await env.DB.batch(commands);
  // Email is the authority for claiming this referral link. It is returned only after verification.
  return Response.redirect(`${env.SITE_ORIGIN}/prosolver-hospitals/?verified=1&referral=${encodeURIComponent(row.referral_code)}`, 302);
}

function adminAllowed(req, env) {
  const auth = req.headers.get('Authorization') || '';
  return Boolean(env.ADMIN_TOKEN && auth === `Bearer ${env.ADMIN_TOKEN}`);
}
async function admin(req, env, url) {
  if (!adminAllowed(req,env)) return error('Unauthorized', 401);
  if (url.pathname === '/admin/summary') {
    const totals = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM members WHERE verified_at IS NOT NULL) verified_members, (SELECT COUNT(*) FROM submissions WHERE verified_at IS NOT NULL) verified_problems, (SELECT COUNT(*) FROM submissions WHERE verified_at IS NULL) pending_problems, (SELECT COUNT(*) FROM referrals) verified_referrals').first();
    const rows = await env.DB.prepare('SELECT s.id,s.created_at,s.verified_at,s.problem,s.daily,s.audio_key IS NOT NULL AS has_audio,m.email,m.phone FROM submissions s JOIN members m ON m.id=s.member_id ORDER BY s.created_at DESC LIMIT 100').all();
    return json({ totals, submissions: rows.results });
  }
  const match = url.pathname.match(/^\/admin\/audio\/([a-f0-9-]{36})$/);
  if (match) {
    const row = await env.DB.prepare('SELECT audio_key FROM submissions WHERE id=?').bind(match[1]).first();
    if (!row?.audio_key) return error('Not found', 404);
    const obj = await env.AUDIO.get(row.audio_key);
    if (!obj) return error('Not found', 404);
    return new Response(obj.body,{ headers: { 'content-type': obj.httpMetadata?.contentType || 'application/octet-stream', 'cache-control':'no-store', 'content-disposition':'attachment; filename="hospital-voice-note"' }});
  }
  return error('Not found', 404);
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const headers = cors(req, env);
    if (req.method === 'OPTIONS') return corsWrap(new Response(null,{status:204}),headers);
    try {
      let res;
      if (req.method==='GET' && url.pathname==='/health') res=json({ ok:true });
      else if (req.method==='POST' && url.pathname==='/submit') res=await submit(req,env);
      else if (req.method==='GET' && url.pathname==='/verify') res=await verify(url,env);
      else if (req.method==='GET' && url.pathname.startsWith('/admin/')) res=await admin(req,env,url);
      else res=error('Not found',404);
      return corsWrap(res,headers);
    } catch (e) { console.error('Request error', e?.name); return corsWrap(error('Unexpected server error',500),headers); }
  }
};
