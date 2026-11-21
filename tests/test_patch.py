from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]
assert (p/'worker/src/index.js').exists()
assert 'DEMO-' not in (p/'public/live.js').read_text()
assert 'https://prosolver.example' not in (p/'public/live.js').read_text()
assert 'CREATE TABLE IF NOT EXISTS members' in (p/'worker/migrations/0001_init.sql').read_text()
config=json.loads((p/'worker/wrangler.jsonc').read_text())
assert config['d1_databases'][0]['binding']=='DB'
assert config['r2_buckets'][0]['binding']=='AUDIO'
print('Static MVP checks passed')
