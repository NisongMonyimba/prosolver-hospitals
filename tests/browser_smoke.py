#!/usr/bin/env python3
"""Browser and local Wrangler D1/R2 smoke suite; never uses remote bindings."""
import asyncio
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, urlopen, HTTPRedirectHandler

from websockets.asyncio.client import connect

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / 'worker'
NOTICE = re.search(r"const NOTICE = '([^']+)'", (WORKER / 'src/index.js').read_text()).group(1)
CHROME = os.environ.get('CHROME_BIN') or shutil.which('google-chrome') or shutil.which('chromium') or str(Path.home() / '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome')
WRANGLER = WORKER / 'node_modules/.bin/wrangler'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, msg, headers, newurl):
        return None

opener = build_opener(NoRedirect)

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

def fetch(url, method='GET', body=None, headers=None):
    try:
        with opener.open(Request(url, body, headers or {}, method=method), timeout=20) as response:
            return response.status, response.headers, response.read()
    except HTTPError as exc:
        return exc.code, exc.headers, exc.read()

def multipart(fields, audio=False):
    boundary = '----browser-' + uuid.uuid4().hex
    parts = []
    for key, value in fields.items():
        parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n'.encode(), str(value).encode(), b'\r\n']
    if audio:
        wav = bytearray(8044)
        wav[0:4] = b'RIFF'; wav[4:8] = (8036).to_bytes(4, 'little')
        wav[8:16] = b'WAVEfmt '; wav[16:20] = (16).to_bytes(4, 'little')
        wav[20:22] = (1).to_bytes(2, 'little'); wav[22:24] = (1).to_bytes(2, 'little')
        wav[24:28] = (8000).to_bytes(4, 'little'); wav[28:32] = (8000).to_bytes(4, 'little')
        wav[32:34] = (1).to_bytes(2, 'little'); wav[34:36] = (8).to_bytes(2, 'little')
        wav[36:40] = b'data'; wav[40:44] = (8000).to_bytes(4, 'little')
        wav[44:] = bytes([128]) * 8000
        parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="silence.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode(), wav, b'\r\n']
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), 'multipart/form-data; boundary=' + boundary

class CDP:
    def __init__(self, websocket):
        self.websocket = websocket
        self.next_id = 0
        self.errors = []
        self.verify_origin = None
        self.verify_request_id = None
        self.verify_extra = None

    async def command(self, method, params=None):
        self.next_id += 1
        ident = self.next_id
        await self.websocket.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
        while True:
            data = json.loads(await asyncio.wait_for(self.websocket.recv(), 20))
            if data.get('method') == 'Runtime.exceptionThrown':
                self.errors.append(data['params']['exceptionDetails'].get('text', 'JavaScript exception'))
            if data.get('method') == 'Network.requestWillBeSent':
                request=data['params']['request']
                if request.get('method') == 'POST' and request.get('url', '').endswith('/verify'):
                    self.verify_request_id=data['params']['requestId']
                    self.verify_origin={key:value for key,value in request.get('headers', {}).items() if key.lower() in ('origin','sec-fetch-site','sec-fetch-mode','sec-fetch-user')}
            if data.get('method') == 'Network.requestWillBeSentExtraInfo' and data['params'].get('requestId') == self.verify_request_id:
                self.verify_extra={key:value for key,value in data['params'].get('headers', {}).items() if key.lower() in ('origin','sec-fetch-site','sec-fetch-mode','sec-fetch-user')}
            if data.get('id') == ident:
                if 'error' in data:
                    raise RuntimeError(f'CDP {method}: {data["error"]}')
                return data.get('result', {})

    async def eval(self, expression):
        result = await self.command('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in result:
            raise RuntimeError(result['exceptionDetails'].get('text', 'Browser JavaScript error'))
        return result.get('result', {}).get('value')

    async def navigate(self, url):
        await self.command('Page.navigate', {'url': url})
        await asyncio.sleep(.2)
        await self.wait('location.href === ' + json.dumps(url) + ' && document.readyState === "complete"')

    async def wait(self, expression, timeout=12):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await self.eval(expression):
                return
            await asyncio.sleep(.12)
        state = await self.eval('({url:location.href,text:document.body?.textContent?.slice(0,300)})')
        raise AssertionError(f'Browser condition timed out: {expression}; state={state}; verify_origin={self.verify_origin}; verify_extra={self.verify_extra}')

def check(condition, message):
    if not condition:
        raise AssertionError(message)

async def browser_flow(static_url, api, synthetic_token, admin_token, chrome_port):
    pages = json.loads(urlopen(f'http://127.0.0.1:{chrome_port}/json', timeout=5).read())
    async with connect(pages[0]['webSocketDebuggerUrl'], max_size=10_000_000) as ws:
        c = CDP(ws)
        await c.command('Page.enable'); await c.command('Runtime.enable'); await c.command('Network.enable')
        await c.command('Emulation.setDeviceMetricsOverride', {'width': 375, 'height': 812, 'deviceScaleFactor': 1, 'mobile': True})
        await c.navigate(static_url + '/index.html')
        check(await c.eval('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile landing overflows viewport')
        check(await c.eval('document.querySelector("#submit").disabled && document.querySelector("#accessForm button").disabled'), 'Public registration is not visibly disabled')
        check(await c.eval('document.querySelector("h1").getBoundingClientRect().width > 0'), 'Landing heading is not visible')
        # Mock only the external XHR transport to exercise the public form in a browser.
        await c.command('Page.addScriptToEvaluateOnNewDocument', {'source': '''window.XMLHttpRequest=class {constructor(){this.upload={};this.status=202;this.response={ok:true,status:'pending_verification'}} open(){} send(){setTimeout(()=>{this.onload?.();this.onloadend?.()},0)}};'''})
        await c.navigate(static_url + '/enabled.html')
        await c.eval("document.querySelector('#problem').value='Synthetic typed browser request';document.querySelector('#email').value='smoke-browser@example.test';document.querySelector('#phone').value='+99900000004';document.querySelector('#consent').checked=true;document.querySelector('#submit').click()")
        await c.wait('!document.querySelector("#success").classList.contains("hidden")')
        await c.navigate(static_url + '/enabled.html')
        await c.eval('''Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});window.MediaRecorder=class{static isTypeSupported(){return true}constructor(){this.mimeType='audio/webm';this.state='inactive'}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob([new Uint8Array([26,69,223,163,1])],{type:'audio/webm'})});this.onstop?.()}};document.querySelector('#record').click()''')
        await c.wait('document.querySelector("#recordText").textContent === "Stop recording"')
        await c.eval("document.querySelector('#record').click()")
        await c.wait('!document.querySelector("#playback").classList.contains("hidden")')
        await c.eval("document.querySelector('#deleteRecording').click()")
        check(await c.eval('document.querySelector("#playback").classList.contains("hidden")'), 'Recording delete control failed')

        suffix = uuid.uuid4().hex[:10]
        a, b = f'smoke-{suffix}-a@example.test', f'smoke-{suffix}-b@example.test'
        def submit(email, phone, problem, ref='', cookie=None, audio=False):
            fields = dict(email=email, phone=phone, problem='[SYNTHETIC] ' + problem, daily='', consent='yes', notice_version=NOTICE, request_key=uuid.uuid4(), website='', ref=ref)
            body, content_type = multipart(fields, audio)
            headers = {'Origin': api, 'Authorization': 'Bearer ' + synthetic_token, 'Content-Type': content_type}
            if cookie:
                headers['Cookie'] = cookie
            status, _, raw = fetch(api + '/submit', 'POST', body, headers)
            check(status == 202, f'Local D1/R2 submission failed: {status}')
            return json.loads(raw)['test_token']
        try:
            check(fetch(api + '/health')[0] == 200, 'Worker health failed')
            check(fetch(api + '/submit', 'POST', b'')[0] == 503, 'Public submit is open')
            token_a = submit(a, '+99900000001', 'Browser verification')
            await c.navigate(api + '/verify?token=' + token_a)
            check(await c.eval('document.querySelector("h1").textContent.includes("Confirm")'), 'Verification confirmation missing')
            await c.eval('document.querySelector("button").click()')
            await c.wait('location.pathname === "/rewards"')
            check(await c.eval('document.body.textContent.includes("Your waitlist rewards")'), 'Member rewards missing')
            referral = await c.eval('document.querySelector("#link").value.split("ref=")[1]')
            check(bool(re.fullmatch(r'[A-F0-9]{18}', referral or '')), 'Referral link invalid')
            await c.eval('''navigator.clipboard.writeText=async text=>{window.__copied=text};document.querySelector('#copy').click();document.querySelector('#share').click()''')
            await c.wait('window.__copied === document.querySelector("#link").value')
            cookie_values = (await c.command('Network.getCookies', {'urls': [api + '/rewards']}))['cookies']
            member_cookie = 'ps_session=' + next(row['value'] for row in cookie_values if row['name'] == 'ps_session')
            token_b = submit(b, '+99900000002', 'Referral', referral)
            body = urlencode({'token': token_b}).encode()
            check(fetch(api + '/verify', 'POST', body, {'Origin': api, 'Content-Type': 'application/x-www-form-urlencoded'})[0] == 303, 'Referral confirmation failed')
            await c.navigate(api + '/rewards')
            check(await c.eval('document.body.textContent.includes("available: 1")'), 'Referral credit missing')
            token_audio = submit(a, '+99900000001', 'Silent audio', cookie=member_cookie, audio=True)
            check(fetch(api + '/verify', 'POST', urlencode({'token': token_audio}).encode(), {'Origin': api, 'Content-Type': 'application/x-www-form-urlencoded'})[0] == 303, 'Audio confirmation failed')
            await c.navigate(static_url + '/admin.html')
            await c.eval('document.querySelector("#token").value=' + json.dumps(admin_token) + ';document.querySelector("#load").click()')
            await c.wait('document.querySelectorAll("#rows article").length >= 3')
            check(await c.eval('document.querySelector("#status").textContent.includes("Showing")'), 'Founder dashboard failed')
            status, _, raw = fetch(api + '/admin/summary', headers={'Authorization': 'Bearer ' + admin_token})
            check(status == 200, 'Founder API failed')
            audio_row = next(row for row in json.loads(raw)['submissions'] if row['email'] == a and row['has_audio'])
            check(len(fetch(api + '/admin/audio/' + audio_row['id'], headers={'Authorization': 'Bearer ' + admin_token})[2]) == 8044, 'Local R2 audio fetch failed')
            await c.navigate(api + '/rewards')
            await c.eval('window.confirm=()=>true;document.querySelector("#delete").click()')
            await c.wait('location.pathname === "/"')
            await c.navigate(api + '/rewards')
            check(await c.eval('document.body.textContent.includes("Access required")'), 'Account deletion did not revoke session')
            check(fetch(api + '/admin/audio/' + audio_row['id'], headers={'Authorization': 'Bearer ' + admin_token})[0] == 404, 'Local R2 audio survived deletion')
            check(not c.errors, 'Browser JavaScript errors: ' + ', '.join(c.errors))
            print('Browser: mobile, typed form, recording, confirmation, sharing, rewards, dashboard, deletion, closed signup passed.')
            print('Local Wrangler: D1 migration/CRUD and R2 put/get/delete passed.')
        finally:
            status, _, _ = fetch(api + '/synthetic/cleanup', 'POST', b'', {'Origin': api, 'Authorization': 'Bearer ' + synthetic_token})
            check(status == 200, 'Synthetic local cleanup failed')

def main():
    if not WRANGLER.exists() or not Path(CHROME).exists():
        raise RuntimeError('Wrangler or Chrome is missing; install local test prerequisites.')
    with tempfile.TemporaryDirectory(prefix='prosolver-browser-') as temporary:
        tmp = Path(temporary)
        public = tmp / 'public'; public.mkdir()
        for name in ('index.html', 'live.js', 'admin.html', 'admin.js', 'privacy.html'):
            shutil.copy(ROOT / 'public' / name, public / name)
        enabled = (public / 'index.html').read_text().replace('2026-11-draft', '2026-11-v1').replace('REPLACE_WITH_WORKER_URL', 'https://browser-test.workers.dev')
        (public / 'enabled.html').write_text(enabled)
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass
        handler = partial(QuietHandler, directory=str(public))
        static_server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        Thread(target=static_server.serve_forever, daemon=True).start()
        static_url = f'http://127.0.0.1:{static_server.server_port}'
        api = 'http://127.0.0.1:' + str(free_port())
        (public / 'admin.html').write_text((public / 'admin.html').read_text().replace('REPLACE_WITH_WORKER_URL', api).replace('connect-src https://*.workers.dev', 'connect-src ' + api))
        test_token, admin_token = secrets.token_urlsafe(36), secrets.token_urlsafe(36)
        env = dict(os.environ, XDG_CONFIG_HOME=str(tmp / 'config'), WRANGLER_SEND_METRICS='false')
        migration = subprocess.run([str(WRANGLER), 'd1', 'migrations', 'apply', 'prosolver-hospitals', '--local', '--persist-to', str(tmp / 'state'), '--force'], cwd=WORKER, env=env, capture_output=True, text=True, timeout=90)
        check(migration.returncode == 0, 'Local D1 migrations failed: ' + migration.stderr[-1200:])
        vars = {'SITE_ORIGIN': static_url, 'PUBLIC_SIGNUPS_ENABLED': 'false', 'PRIVACY_NOTICE_APPROVED': 'true', 'SYNTHETIC_TEST_ENABLED': 'true', 'SYNTHETIC_TEST_TOKEN': test_token, 'ADMIN_TOKEN': admin_token}
        args = [str(WRANGLER), 'dev', '--local', '--ip', '127.0.0.1', '--port', api.rsplit(':', 1)[1], '--persist-to', str(tmp / 'state'), '--log-level', 'none']
        for key, value in vars.items():
            args += ['--var', key + ':' + value]
        with (tmp / 'wrangler.log').open('w') as log:
            worker = subprocess.Popen(args, cwd=WORKER, env=env, stdout=log, stderr=subprocess.STDOUT)
            chrome = None
            try:
                for _ in range(100):
                    if worker.poll() is not None:
                        raise RuntimeError('Local Worker exited: ' + (tmp / 'wrangler.log').read_text()[-1200:])
                    try:
                        if fetch(api + '/health')[0] == 200:
                            break
                    except OSError:
                        pass
                    time.sleep(.15)
                else:
                    raise RuntimeError('Local Worker did not become ready.')
                chrome = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + str(tmp / 'chrome'), 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                active = tmp / 'chrome' / 'DevToolsActivePort'
                for _ in range(100):
                    if active.exists():
                        break
                    if chrome.poll() is not None:
                        raise RuntimeError('Chrome could not start with its sandbox enabled.')
                    time.sleep(.1)
                else:
                    raise RuntimeError('Chrome debugging endpoint did not start.')
                asyncio.run(browser_flow(static_url, api, test_token, admin_token, int(active.read_text().splitlines()[0])))
            finally:
                if chrome:
                    chrome.terminate(); chrome.wait(timeout=10)
                worker.terminate(); worker.wait(timeout=10)
                static_server.shutdown()

if __name__ == '__main__':
    main()
