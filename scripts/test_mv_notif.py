import time
import db
from main import active_metaverse_event_payloads

evs = active_metaverse_event_payloads()
print('active events:', [(e['eventId'], e['status']) for e in evs])
assert len(evs) == 4, evs
with db.get_conn() as conn:
    row = conn.execute('SELECT id, email FROM users LIMIT 1').fetchone()
if not row:
    print('no users')
else:
    uid = int(row['id'])
    print('user', uid, row['email'])
    c1 = db.ensure_metaverse_event_notifications(user_id=uid, events=evs, created_at=time.time())
    print('created1', len(c1), [x['data'].get('eventId') for x in c1])
    c2 = db.ensure_metaverse_event_notifications(user_id=uid, events=evs, created_at=time.time())
    print('created2', len(c2))
    assert len(c2) == 0
    print('DEDUPE_OK')
