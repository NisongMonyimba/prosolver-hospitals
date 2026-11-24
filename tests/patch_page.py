from pathlib import Path
import re, sys
repo=Path(sys.argv[1])
p=repo/'public/index.html'
s=p.read_text()
assert 'id="waitlistForm"' in s, 'Unexpected landing page: no matching form found'
assert 'DEMO-' in s or 'live.js' in s, 'Unknown page version. Not overwriting'
if 'live.js' not in s:
    pattern=r'<script>\s*\(\(\) => \{.*?\}\)\(\);\s*</script>'
    s,count=re.subn(pattern, '<script src="./live.js" defer></script>', s, flags=re.S)
    assert count==1, 'Unable to locate exactly one demo script'
    s=s.replace('<meta name="theme-color"', '<meta name="prosolver-api" content="REPLACE_WITH_WORKER_URL" />\n  <meta name="theme-color"',1)
    s=s.replace('This demonstration does not send, save, or register submissions. A secure backend and privacy notice are required before launch.', 'Registration opens after secure backend configuration and required privacy disclosures are completed.')
    s=s.replace('Demo only. No real referral identity, points, or waitlist registration has been created.', 'After email verification, qualifying referrals earn points toward one extra submission each.')
    s=s.replace('This is how the post-submission referral step will work after the waitlist backend is connected.', 'Please verify your email to receive a referral link.')
    s=s.replace('Your preview is ready.', 'Check your email')
    s=s.replace('Your example referral link', 'Your referral link')
    s=s.replace('This is how the post-submission', 'This is how the post-submission')
    s=s.replace('In the live version, qualifying referred users can earn you points toward eligible extra submissions and selected easy resolution steps. Points and rewards are only issued after verification.', '1 point for a qualifying verified referral. Each point unlocks 1 extra problem submission. Resolution services are not guaranteed.')
    s=s.replace('</head>', '</head>')
    s=s.replace('Keep patient names and identifying details out of your submission.', 'Do not record patients, identifiers, or confidential hospital data. See <a href="./privacy.html">privacy information</a>.')
    p.write_text(s)
else:
    assert 'prosolver-api' in s
print('Frontend integration patch verified')
