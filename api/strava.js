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
    return res.json(await r.json());
  }

  if (action === 'stats' && refresh_token) {
    // Refresh token
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

    // Get Monday of current ISO week
    function getMonday(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }

    // Fetch from 4 weeks ago Monday so we can build 4 full weeks
    const thisMonday = getMonday(new Date());
    const fourWeeksAgo = new Date(thisMonday);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21);
    const after = Math.floor(fourWeeksAgo.getTime() / 1000);

    // Also fetch start of month for monthly total
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthAfter = Math.floor(monthStart.getTime() / 1000);

    const [weekActRes, monthActRes, latestRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`, {
        headers: { Authorization: `Bearer ${access_token}` }
      }),
      fetch(`https://www.strava.com/api/v3/athlete/activities?after=${monthAfter}&per_page=100`, {
        headers: { Authorization: `Bearer ${access_token}` }
      }),
      fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=1`, {
        headers: { Authorization: `Bearer ${access_token}` }
      })
    ]);

    const weekActivities  = await weekActRes.json();
    const monthActivities = await monthActRes.json();
    const latestArr       = await latestRes.json();
    const latestActivity  = latestArr[0] || null;

    const monthRuns = monthActivities.filter(a => a.type === 'Run');
    const totalKm   = monthRuns.reduce((sum, a) => sum + a.distance / 1000, 0);

    const weekRuns = weekActivities.filter(a => a.type === 'Run');

    // Build 4 weeks newest-first: week[0] = this week, week[1] = last week, etc.
    const allWeeks = [0, -1, -2, -3].map(weekOffset => {
      const mon = new Date(thisMonday);
      mon.setDate(mon.getDate() + weekOffset * 7);
      // Build Mon-Sun array (7 days)
      return [0, 1, 2, 3, 4, 5, 6].map(dayIdx => {
        const dayStart = new Date(mon);
        dayStart.setDate(dayStart.getDate() + dayIdx);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        return weekRuns
          .filter(a => {
            const t = new Date(a.start_date_local).getTime();
            return t >= dayStart.getTime() && t < dayEnd.getTime();
          })
          .map(a => Math.round((a.distance / 1000) * 10) / 10)
          .sort((a, b) => b - a);
      });
    });

    return res.json({
      totalKm: Math.round(totalKm * 10) / 10,
      weeklyDays: allWeeks,   // new format: array of 4 weeks
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
