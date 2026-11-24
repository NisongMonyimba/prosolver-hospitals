#!/usr/bin/env python3
"""Controlled production smoke flow. No credentials or confirmation links are printed."""
import getpass
import json
import re
import sys
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / 'worker/wrangler.jsonc').read_text())['vars']
api = cfg['PUBLIC_API_URL'].rstrip('/')
notice = re.search(r"const NOTICE = '([^']+)'", (ROOT / 'worker/src/index.js').read_text()).group(1)
html = (ROOT / 'public/index.html').read_text()
if not re.fullmatch(r'https://[a-z0-9.-]+\.workers\.dev', api):
    sys.exit('Configure PUBLIC_API_URL before testing.')
if 'draft' in notice or f'name="prosolver-notice-version" content="{notice}"' not in html:
    sys.exit('Approve and align the Worker and public privacy notice versions before testing.')
if cfg['PUBLIC_SIGNUPS_ENABLED'] != 'false' or cfg['SYNTHETIC_TEST_ENABLED'] != 'true' or cfg['PRIVACY_NOTICE_APPROVED'] != 'true':
    sys.exit('Synthetic mode requires a closed public gate and approved privacy notice.')

test_token = getpass.getpass('Synthetic test token: ')
admin_token = getpass.getpass('Founder admin token: ')
if len(test_token) < 32 or not admin_token:
    sys.exit('Missing test or founder credential.')
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect)

def request(path, method='GET', body=None, *, auth=None, cookie=None, content_type=None):
    headers = {'Origin': api, 'Cache-Control': 'no-store'}
    if auth:
        headers['Authorization'] = 'Bearer ' + auth
    if cookie:
        headers['Cookie'] = cookie
    if content_type:
        headers['Content-Type'] = content_type
    req = Request(api + path, body, headers, method=method)
    try:
        with opener.open(req, timeout=25) as response:
            return response.status, response.headers, response.read()
    except HTTPError as exc:
        return exc.code, exc.headers, exc.read()

def form(fields, audio=False):
    boundary = '----prosolver' + uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n'.encode(), str(value).encode(), b'\r\n'])
    if audio:
        wav = bytearray(44) + bytes([128]) * 8000
        wav[0:4] = b'RIFF'; wav[4:8] = (8036).to_bytes(4, 'little')
        wav[8:16] = b'WAVEfmt '; wav[16:20] = (16).to_bytes(4, 'little')
        wav[20:22] = (1).to_bytes(2, 'little'); wav[22:24] = (1).to_bytes(2, 'little')
        wav[24:28] = (8000).to_bytes(4, 'little'); wav[28:32] = (8000).to_bytes(4, 'little')
        wav[32:34] = (1).to_bytes(2, 'little'); wav[34:36] = (8).to_bytes(2, 'little')
        wav[36:40] = b'data'; wav[40:44] = (8000).to_bytes(4, 'little')
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="silence.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(), wav, b'\r\n'])
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), 'multipart/form-data; boundary=' + boundary

def submit(email, phone, problem, ref='', cookie=None, audio=False):
    fields = dict(email=email, phone=phone, problem='[SYNTHETIC] ' + problem, daily='', consent='yes',
                  notice_version=notice, request_key=str(uuid.uuid4()), website='', ref=ref)
    body, content_type = form(fields, audio)
    status, _, raw = request('/submit', 'POST', body, auth=test_token, cookie=cookie, content_type=content_type)
    if status != 202:
        raise RuntimeError(f'Synthetic submission failed ({status}).')
    return json.loads(raw)['test_token']

def confirm(token):
    body = urlencode({'token': token}).encode()
    status, headers, _ = request('/verify', 'POST', body, content_type='application/x-www-form-urlencoded')
    if status != 303:
        raise RuntimeError(f'Confirmation failed ({status}).')
    return headers.get('Set-Cookie', '').split(';')[0]

suffix = uuid.uuid4().hex[:12]
email_a, email_b = f'smoke-{suffix}-a@example.test', f'smoke-{suffix}-b@example.test'
try:
    status, _, raw = request('/health')
    if status != 200 or json.loads(raw).get('signups_enabled') is not False:
        raise RuntimeError('Public registration is not closed.')
    denied, _, _ = request('/submit', 'POST', b'')
    if denied != 503:
        raise RuntimeError('Unauthenticated public submission was not denied.')
    cookie_a = confirm(submit(email_a, '+99900000001', 'Typed smoke request'))
    status, _, rewards = request('/rewards', cookie=cookie_a)
    if status != 200:
        raise RuntimeError('Member rewards failed.')
    match = re.search(rb'\?ref=([A-F0-9]{18})', rewards)
    if not match:
        raise RuntimeError('Referral link missing.')
    confirm(submit(email_b, '+99900000002', 'Referred smoke request', match.group(1).decode()))
    cookie_a = confirm(submit(email_a, '+99900000001', 'Silent WAV request', cookie=cookie_a, audio=True))
    status, _, rewards = request('/rewards', cookie=cookie_a)
    if status != 200 or b'available: 0' not in rewards:
        raise RuntimeError('Referral or extra submission reward failed.')
    status, _, raw = request('/admin/summary', auth=admin_token)
    if status != 200:
        raise RuntimeError('Founder dashboard API failed.')
    rows = json.loads(raw)['submissions']
    audio_rows = [row for row in rows if row['email'] == email_a and row['has_audio']]
    if not audio_rows:
        raise RuntimeError('Private audio not present in founder dashboard.')
    status, _, audio = request('/admin/audio/' + audio_rows[0]['id'], auth=admin_token)
    if status != 200 or len(audio) != 8044:
        raise RuntimeError('Private audio retrieval failed.')
    print('Synthetic typed, confirmation, referral, rewards, audio, founder and closed signup checks passed.')
finally:
    status, _, raw = request('/synthetic/cleanup', 'POST', b'', auth=test_token)
    if status != 200:
        raise RuntimeError('Synthetic cleanup failed; run the authenticated cleanup endpoint immediately.')
    else:
        print('Authenticated synthetic cleanup completed.')
