// ─── Upstash REST helpers (no npm package needed) ───────────────────────────
async function kvGet(key) {
  const res = await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
  );
  const { result } = await res.json();
  return result; // null if key doesn't exist
}

async function kvSet(key, value) {
  await fetch(
    `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
    { method: 'GET', headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } }
  );
}

// ─── Strava token helpers ────────────────────────────────────────────────────
async function getRefreshToken() {
  // Try KV first, fall back to env var (for initial seed)
  const fromKV = await kvGet('strava_refresh_token');
  return fromKV || process.env.STRAVA_REFRESH_TOKEN_SEED;
}

async function refreshAccessToken(refresh_token) {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: 206136,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token'
    })
  });
  return res.json();
}

// ─── Week helpers ─────────────────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeeks(runs) {
  const thisMonday = getMonday(new Date());
  return [0, -1, -2, -3].map(weekOffset => {
    const mon = new Date(thisMonday);
    mon.setDate(mon.getDate() + weekOffset * 7);
    return [0,1,2,3,4,5,6].map(dayIdx => {
      const dayStart = new Date(mon);
      dayStart.setDate(dayStart.getDate() + dayIdx);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      return runs
        .filter(a => {
          const t = new Date(a.start_date_local).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        })
        .map(a => Math.round((a.distance / 1000) * 10) / 10)
        .sort((a, b) => b - a);
    });
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, code, seed_token, admin_key } = req.query;

  // ── SEED: one-time endpoint to store your refresh token in KV ──────────────
  // Hit: /api/strava?action=seed&admin_key=YOUR_ADMIN_KEY&seed_token=REFRESH_TOKEN
  if (action === 'seed') {
    if (admin_key !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!seed_token) return res.status(400).json({ error: 'Missing seed_token' });
    await kvSet('strava_refresh_token', seed_token);
    return res.json({ ok: true, message: 'Token stored in KV successfully' });
  }

  // ── EXCHANGE: still needed for your initial OAuth to get the refresh token ──
  if (action === 'exchange' && code) {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 206136,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });
    return res.json(await r.json());
  }

  // ── STATS: public endpoint — fetches Emmanuel's data for all visitors ───────
  if (action === 'stats') {
    const storedRefresh = await getRefreshToken();
    if (!storedRefresh) {
      return res.status(500).json({ error: 'No refresh token configured' });
    }

    // Refresh access token and persist the new refresh token
    const tokenData = await refreshAccessToken(storedRefresh);
    if (!tokenData.access_token) {
      return res.status(500).json({ error: 'Token refresh failed', detail: tokenData });
    }
    await kvSet('strava_refresh_token', tokenData.refresh_token);

    const access_token = tokenData.access_token;

    // Fetch 4 weeks of activities + latest activity
    const thisMonday = getMonday(new Date());
    const fourWeeksAgo = new Date(thisMonday);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const headers = { Authorization: `Bearer ${access_token}` };

    const [weekActRes, monthActRes, latestRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${Math.floor(fourWeeksAgo/1000)}&per_page=200`, { headers }),
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${Math.floor(monthStart/1000)}&per_page=100`, { headers }),
      fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=1`, { headers })
    ]);

    const weekActivities  = await weekActRes.json();
    const monthActivities = await monthActRes.json();
    const latestArr       = await latestRes.json();
    const latestActivity  = latestArr[0] || null;

    const monthRuns = monthActivities.filter(a => a.type === 'Run');
    const weekRuns  = weekActivities.filter(a => a.type === 'Run');
    const totalKm   = monthRuns.reduce((sum, a) => sum + a.distance / 1000, 0);

    return res.json({
      totalKm: Math.round(totalKm * 10) / 10,
      weeklyDays: buildWeeks(weekRuns),
      latestActivity: latestActivity ? {
        id:                   latestActivity.id,
        name:                 latestActivity.name,
        start_date_local:     latestActivity.start_date_local,
        distance:             latestActivity.distance,
        moving_time:          latestActivity.moving_time,
        average_heartrate:    latestActivity.average_heartrate,
        max_heartrate:        latestActivity.max_heartrate,
        suffer_score:         latestActivity.suffer_score,
        total_elevation_gain: latestActivity.total_elevation_gain,
        type:                 latestActivity.type,
        map: { summary_polyline: latestActivity.map?.summary_polyline || '' }
      } : null
    });
  }

  res.status(400).json({ error: 'Invalid action' });
}
