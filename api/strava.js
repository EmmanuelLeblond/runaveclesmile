export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, code, refresh_token } = req.query;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

  if (action === 'exchange' && code) {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 206136,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })
    });
    const data = await r.json();
    return res.json(data);
  }

  if (action === 'stats' && refresh_token) {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 206136,
        client_secret: CLIENT_SECRET,
        refresh_token,
        grant_type: 'refresh_token'
      })
    });
    const { access_token, refresh_token: new_refresh } = await tokenRes.json();

    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    const after = Math.floor(start.getTime() / 1000);

    const [actRes, latestRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, {
        headers: { Authorization: `Bearer ${access_token}` }
      }),
      fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=1`, {
        headers: { Authorization: `Bearer ${access_token}` }
      })
    ]);

    const activities      = await actRes.json();
    const latestArr       = await latestRes.json();
    const latestActivity  = latestArr[0] || null;
    const runs            = activities.filter(a => a.type === 'Run');
    const totalKm         = runs.reduce((sum, a) => sum + a.distance / 1000, 0);

    const weeklyDays = [0,1,2,3,4,5,6].map(i => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      return runs
        .filter(a => {
          const t = new Date(a.start_date_local).getTime();
          return t >= d.getTime() && t < next.getTime();
        })
        .map(a => Math.round((a.distance / 1000) * 10) / 10)
        .sort((a, b) => b - a);
    });

    return res.json({
      totalKm: Math.round(totalKm * 10) / 10,
      weeklyDays,
      refresh_token: new_refresh,
      latestActivity: latestActivity ? {
        id:                   latestActivity.id,
        name:                 latestActivity.name,
        start_date_local:     latestActivity.start_date_local,
        distance:             latestActivity.distance,
        moving_time:          latestActivity.moving_time,
        elapsed_time:         latestActivity.elapsed_time,
        average_speed:        latestActivity.average_speed,
        max_speed:            latestActivity.max_speed,
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
