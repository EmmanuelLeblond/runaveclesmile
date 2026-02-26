export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, code, refresh_token } = req.query;
  const CLIENT_ID     = 206136;
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
    start.setDate(1); start.setHours(0,0,0,0);
    const after = Math.floor(start.getTime() / 1000);

    const actRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const activities = await actRes.json();

    const totalKm = activities
      .filter(a => a.type === 'Run')
      .reduce((sum, a) => sum + a.distance / 1000, 0);

    const days = [0,1,2,3,4,5,6].map(i => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const km = activities
        .filter(a => a.type === 'Run')
        .filter(a => {
          const t = new Date(a.start_date_local).getTime();
          return t >= d.getTime() && t < next.getTime();
        })
        .reduce((sum, a) => sum + a.distance / 1000, 0);
      return Math.round(km * 10) / 10;
    });

    return res.json({
      totalKm: Math.round(totalKm * 10) / 10,
      weeklyDays: days,
      refresh_token: new_refresh
    });
  }

  res.status(400).json({ error: 'Invalid action' });
}
