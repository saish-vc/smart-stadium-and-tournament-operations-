// Vercel serverless function: /api/weather
// Real, live data source: Open-Meteo (open-meteo.com) — free, no API key required.
// Used to ground crowd/transport/incident recommendations in actual conditions
// instead of purely simulated numbers.

// MetLife Stadium, East Rutherford, NJ
const LAT = 40.8136;
const LON = -74.0745;

// Minimal WMO weather-code -> plain-English mapping (Open-Meteo uses WMO codes)
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
};

module.exports = async function handler(req, res) {
  // Set CORS headers to allow browser fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok || !data.current) {
      throw new Error('Open-Meteo returned no current conditions');
    }

    const c = data.current;
    const condition = WMO[c.weather_code] || 'Unknown';

    res.status(200).json({
      tempF: Math.round(c.temperature_2m),
      condition,
      windMph: Math.round(c.wind_speed_10m),
      precipitationMm: c.precipitation,
      isWet: c.precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(c.weather_code),
      source: 'Open-Meteo (live)',
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Fail soft: the app should still work if weather is unreachable.
    console.error('Weather fetch error:', err.message);
    res.status(200).json({
      tempF: 72, condition: 'Unavailable', windMph: 0, precipitationMm: 0,
      isWet: false, source: 'fallback (live fetch failed)', fetchedAt: new Date().toISOString(),
    });
  }
};
