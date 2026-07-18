// Express alternative to api/generate.js — use this for local dev,
// Render, Railway, or any plain Node host. Not needed if you deploy to Vercel.
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
      console.error('NVIDIA NIM API error response:', data);
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
