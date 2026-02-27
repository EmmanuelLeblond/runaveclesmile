export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, code, refresh_token } = req.query;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

  // Exchange auth code for tokens (first-time connect)
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

  // Refresh token + fetch this month's activities
  if (action === 'stats' && refresh_token) {
    // Refresh the access token
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

    // Fetch activities since start of this month
    const start = new Date();
    start.setDate(1); start.setHours(0, 0, 0, 0);
    const after = Math.floor(start.getTime() / 1000);

    const actRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const activities = await actRes.json();

    const runs = activities.filter(a => a.type === 'Run');

    // Total monthly km
    const totalKm = runs.reduce((sum, a) => sum + a.distance / 1000, 0);

    // Last 7 days — return array of runs per day (for stacked bars)
    // Each day = array of km values, one per run
    const weeklyDays = [0, 1, 2, 3, 4, 5, 6].map(i => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);

      return runs
        .filter(a => {
          const t = new Date(a.start_date_local).getTime();
          return t >= d.getTime() && t < next.getTime();
        })
        .map(a => Math.round((a.distance / 1000) * 10) / 10)
        .sort((a, b) => b - a); // biggest run first (bottom of stack)
    });

    return res.json({
      totalKm: Math.round(totalKm * 10) / 10,
      weeklyDays,
      refresh_token: new_refresh
    });
  }

  res.status(400).json({ error: 'Invalid action' });
}
