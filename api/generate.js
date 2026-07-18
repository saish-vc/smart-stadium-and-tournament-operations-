// Vercel serverless function: /api/generate
// Keeps the NVIDIA NIM API key server-side. The frontend never sees it.
//
// NVIDIA NIM (build.nvidia.com) is free, requires no credit card, and
// exposes an OpenAI-compatible /v1/chat/completions endpoint — so this
// is a near drop-in replacement for the Anthropic Messages API.
// Get a key (starts with "nvapi-") at https://build.nvidia.com

const NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: NVIDIA_API_KEY is not set.' });
    return;
  }

  const { system, prompt } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: 'Missing "prompt" in request body.' });
    return;
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  try {
    const nimRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.6,
      }),
    });

    const data = await nimRes.json();

    if (!nimRes.ok) {
      res.status(nimRes.status).json({ error: data?.error?.message || data?.error || 'NVIDIA NIM API error' });
      return;
    }

    const text = data?.choices?.[0]?.message?.content || '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};
