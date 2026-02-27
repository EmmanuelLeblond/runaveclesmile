function renderActivityMap(encoded) {
    // Decode Google encoded polyline
    const points = [];
    let idx = 0, lat = 0, lng = 0;
    while (idx < encoded.length) {
      let b, shift = 0, result = 0;export default async function handler(req, res) {
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

    const activities     = await actRes.json();
    const latestArr      = await latestRes.json();
    const latestActivity = latestArr[0] || null;
    const runs           = activities.filter(a => a.type === 'Run');
    const totalKm        = runs.reduce((sum, a) => sum + a.distance / 1000, 0);

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

      do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += (result & 1) ? ~(result >> 1) : (result >> 1);
      shift = result = 0;
      do { b = encoded.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lng += (result & 1) ? ~(result >> 1) : (result >> 1);
      points.push([lat / 1e5, lng / 1e5]);
    }
    if (points.length < 2) return;

    const lats = points.map(p => p[0]);
    const lngs = points.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const W = 400, H = 160;
    const pad = 16;

    const toX = lng => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (W - pad * 2);
    const toY = lat => H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - pad * 2);

    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p[1]).toFixed(1)},${toY(p[0]).toFixed(1)}`).join(' ');

    const mapEl = document.getElementById('activity-map');
    if (!mapEl) return;
    const existing = mapEl.querySelector('svg');
    if (existing) existing.remove();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Glow path
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('d', d);
    glowPath.setAttribute('fill', 'none');
    glowPath.setAttribute('stroke', 'rgba(91,200,245,0.15)');
    glowPath.setAttribute('stroke-width', '8');
    glowPath.setAttribute('stroke-linecap', 'round');
    glowPath.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(glowPath);

    // Main path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#5bc8f5');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);

    // Start dot
    const startDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startDot.setAttribute('cx', toX(points[0][1]));
    startDot.setAttribute('cy', toY(points[0][0]));
    startDot.setAttribute('r', '4');
    startDot.setAttribute('fill', '#4caf50');
    svg.appendChild(startDot);

    // End dot
    const endPt = points[points.length - 1];
    const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    endDot.setAttribute('cx', toX(endPt[1]));
    endDot.setAttribute('cy', toY(endPt[0]));
    endDot.setAttribute('r', '4');
    endDot.setAttribute('fill', '#fc4c02');
    svg.appendChild(endDot);

    mapEl.insertBefore(svg, mapEl.firstChild);
  }
