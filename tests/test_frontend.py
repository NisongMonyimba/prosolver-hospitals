from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class FrontendContract(unittest.TestCase):
    def test_mobile_and_typography(self):
        html = (ROOT / 'public/index.html').read_text()
        self.assertIn("IBM Plex Sans", html)
        self.assertIn("@media(max-width:560px)", html)
        self.assertIn('name="viewport"', html)

    def test_no_fabricated_verified_state(self):
        script = (ROOT / 'public/live.js').read_text()
        self.assertNotIn("q.get('verified')", script)
        self.assertIn("if(!enabled)", script)
        self.assertIn("pending_verification", (ROOT / 'worker/src/index.js').read_text())
        self.assertIn("PRIVACY_NOTICE_APPROVED", (ROOT / 'worker/src/index.js').read_text())

    def test_recorder_and_access_controls(self):
        html = (ROOT / 'public/index.html').read_text()
        script = (ROOT / 'public/live.js').read_text()
        for control in ('recordStatus', 'playback', 'deleteRecording', 'accessForm'):
            self.assertIn(control, html)
        for state in ('getUserMedia', 'MediaRecorder', 'setTimeout', 'onprogress'):
            self.assertIn(state, script)

    def test_admin_renders_text_safely(self):
        script = (ROOT / 'public/admin.js').read_text()
        self.assertIn('textContent', script)
        self.assertNotIn('innerHTML', script)
        self.assertNotIn('localStorage', script)

    def test_static_page_csp_matches_assets_and_requests(self):
        landing = (ROOT / 'public/index.html').read_text()
        admin = (ROOT / 'public/admin.html').read_text()
        privacy = (ROOT / 'public/privacy.html').read_text()
        self.assertIn("script-src 'self'", landing)
        self.assertIn("connect-src https://*.workers.dev", landing)
        self.assertIn("media-src 'self' blob:", landing)
        self.assertIn("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", landing)
        self.assertIn("font-src https://fonts.gstatic.com", landing)
        self.assertIn("script-src 'self'", admin)
        self.assertIn("connect-src https://*.workers.dev", admin)
        self.assertIn("default-src 'none'; style-src 'unsafe-inline'", privacy)

if __name__ == '__main__':
    unittest.main()
