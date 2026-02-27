export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, code, refresh_token } = req.query;
  const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

  // Helper to decode the polyline to get Start and End coordinates for our pins
  function decodePolyline(encoded) {
    const points = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));
      // Mapbox expects [longitude, latitude]
      points.push([lng / 1e5, lat / 1e5]);
    }
    return points;
  }

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

    // Requesting a wider 800x250 canvas forces CSS 'cover' to crop the sides, protecting the Y-axis.
        mapUrlDark = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlaysDark}/auto/800x250@2x?padding=35&access_token=${MAPBOX_TOKEN}`;
        mapUrlLight = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlaysLight}/auto/800x250@2x?padding=35&access_token=${MAPBOX_TOKEN}`;

    if (latestActivity?.map?.summary_polyline && MAPBOX_TOKEN) {
      const encoded = latestActivity.map.summary_polyline;
      const points = decodePolyline(encoded);
      
      if (points.length >= 2) {
        const startLng = points[0][0].toFixed(5);
        const startLat = points[0][1].toFixed(5);
        const endLng = points[points.length - 1][0].toFixed(5);
        const endLat = points[points.length - 1][1].toFixed(5);

        // Fetch clean 20px circle icons for start and stop
        const startIcon = encodeURIComponent('https://img.icons8.com/ios-filled/20/4caf50/filled-circle.png');
        const endIcon = encodeURIComponent('https://img.icons8.com/ios-filled/20/fc4c02/filled-circle.png');
        const safePolyline = encodeURIComponent(encoded);

        // Single, clean, vibrant blue path (00e5ff) with no glow
        const overlaysDark = [
          `path-3+00e5ff-1(${safePolyline})`,
          `url-${startIcon}(${startLng},${startLat})`,
          `url-${endIcon}(${endLng},${endLat})`
        ].join(',');

        // Darker blue path for light mode
        const overlaysLight = [
          `path-3+1a7fb5-1(${safePolyline})`,
          `url-${startIcon}(${startLng},${startLat})`,
          `url-${endIcon}(${endLng},${endLat})`
        ].join(',');

        // Padding reduced to 15 to make the route snug and large
        mapUrlDark = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlaysDark}/auto/400x160@2x?padding=15&access_token=${MAPBOX_TOKEN}`;
        mapUrlLight = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlaysLight}/auto/400x160@2x?padding=15&access_token=${MAPBOX_TOKEN}`;
      }
    }

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
        map: { summary_polyline: latestActivity.map?.summary_polyline || '' },
        mapUrlDark,
        mapUrlLight
      } : null
    });
  }

  res.status(400).json({ error: 'Invalid action' });
}
