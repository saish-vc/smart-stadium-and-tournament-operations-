// Express server — use this for local dev, Render, Railway, or any plain Node host.
// Not needed if you deploy to Vercel (which uses api/generate.js and api/weather.js instead).
//
// Uses NVIDIA NIM (free, OpenAI-compatible). Get a key at https://build.nvidia.com

require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.1-8b-instruct';

app.use(express.json());
app.use(express.static(path.join(__dirname))); // serves index.html

// ──────────────────────────────────────────
// /api/weather — Real, live data via Open-Meteo (free, no key needed)
// MetLife Stadium, East Rutherford, NJ
// ──────────────────────────────────────────
const WEATHER_LAT = 40.8136;
const WEATHER_LON = -74.0745;
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
};

app.get('/api/weather', async (req, res) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok || !data.current) throw new Error('Open-Meteo returned no current conditions');
    const c = data.current;
    const condition = WMO[c.weather_code] || 'Unknown';
    res.json({
      tempF: Math.round(c.temperature_2m),
      condition,
      windMph: Math.round(c.wind_speed_10m),
      precipitationMm: c.precipitation,
      isWet: c.precipitation > 0 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(c.weather_code),
      source: 'Open-Meteo (live)',
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Weather fetch error:', err.message);
    res.json({
      tempF: 72, condition: 'Unavailable', windMph: 0, precipitationMm: 0,
      isWet: false, source: 'fallback (live fetch failed)', fetchedAt: new Date().toISOString(),
    });
  }
});

// ──────────────────────────────────────────
// /api/generate — NVIDIA NIM proxy (keeps API key server-side)
// ──────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  if (!NVIDIA_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: NVIDIA_API_KEY is not set.' });
  }
  const { system, prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'Missing "prompt" in request body.' });
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const nimRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.6,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await nimRes.json();
    if (!nimRes.ok) {
      console.error('NVIDIA NIM API error:', nimRes.status, JSON.stringify(data));
      return res.status(nimRes.status).json({ error: data?.error?.message || data?.error || 'NVIDIA NIM API error' });
    }
    const text = data?.choices?.[0]?.message?.content || '';
    res.json({ text });
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('Error generating response:', err);
    const isTimeout = err.name === 'AbortError';
    res.status(500).json({ error: isTimeout ? 'NVIDIA NIM API request timed out' : (err.message || 'Unexpected server error') });
  }
});

app.listen(PORT, () => {
  console.log(`PulsePoint running at http://localhost:${PORT}`);
});
