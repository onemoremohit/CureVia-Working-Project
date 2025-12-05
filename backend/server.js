// backend/server.js  (ES Module version - paste exactly)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenRouter } from '@openrouter/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const port = process.env.PORT || 8080;

// Initialize OpenRouter SDK
const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:5500',
    'X-Title': 'CureVia AI Health Assistant'
  }
});

// ---------- Demo fallback (keeps previous behavior) ----------
function demoAggregates(city, age, symptoms) {
  const base = 10000 + (age * 60);
  const all = Math.round(base * 1.15);
  const ayu = Math.round(base * 0.75);
  const home = Math.round(base * 0.5);
  const urgency = (typeof symptoms === 'string' && (symptoms.toLowerCase().includes('chest') || symptoms.toLowerCase().includes('breath')))
    ? 'High: Seek immediate care'
    : 'Normal';

  return {
    source: `Aggregated sample records for ${city}`,
    urgency,
    treatments: [
      { type: 'Allopathic', cost: all, duration: '30-90 days', durationValue: 60, sideEffects: 'Possible medication side effects (nausea, dizziness)' },
      { type: 'Ayurvedic', cost: ayu, duration: '60-180 days', durationValue: 120, sideEffects: 'Herbal interactions possible; requires lifestyle changes' },
      { type: 'Homeopathic', cost: home, duration: '30-120 days', durationValue: 75, sideEffects: 'Minimal side effects reported' }
    ],
    recommendations: [
      'Consult a registered practitioner before starting treatment.',
      'If severe symptoms occur (breathing difficulty, chest pain), visit an emergency department.'
    ]
  };
}

// ---------- Prompt builder ----------
function buildPrompt({ city, age, gender, symptoms, diseaseName, affectedOrgan }) {
  return `
You are a helpful medical information assistant (non-diagnostic).
Given the user details below, do these tasks and return ONLY valid JSON:

USER:
- city: ${city}
- age: ${age}
- gender: ${gender}
- diseaseName: ${diseaseName || 'N/A'}
- affectedOrgan: ${affectedOrgan || 'N/A'}
- symptoms: ${symptoms}

TASKS:
1) Identify the most likely disease (short).
2) Estimate treatment info for ALL of: Allopathic, Ayurvedic, Homeopathic.
   For each provide: type, cost (INR, integer), duration (text), durationValue (days numeric), sideEffects (short text).
3) Provide 3 realistic hospitals in the given city (name, address, contact). If exact hospitals not known, create realistic-sounding ones.
4) Give urgency: 'High', 'Moderate', or 'Normal'.
5) Give 3 short recommendations.

RETURN EXACT JSON object (no extra text) with keys:
{
  "possibleDisease": "...",
  "urgency": "...",
  "treatments": [ { "type":"...","cost":1234,"duration":"...","durationValue":45,"sideEffects":"..." }, ... ],
  "hospitals": [ { "name":"...", "address":"...", "contact":"..." }, ... ],
  "recommendations": ["...", "...", "..."]
}

Keep the JSON compact and valid.
`;
}

// ---------- Endpoint ----------
app.post('/analyze-health', async (req, res) => {
  try {
    const { city = 'Unknown', age = 30, symptoms = '', gender = 'unknown', diseaseName = '', affectedOrgan = '' } = req.body;

    // Basic validation
    if (!city || !age || !symptoms) {
      return res.status(400).json({ error: 'city, age and symptoms are required' });
    }

    const prompt = buildPrompt({ city, age, gender, symptoms, diseaseName, affectedOrgan });

    // Call OpenRouter with token limits and graceful fallback
    let completion;
    try {
      completion = await openRouter.chat.send({
        model: 'openai/gpt-4o', // you can change model to a cheaper one if available
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 1200),
        temperature: 0.2
      });
    } catch (orErr) {
      console.error('OpenRouter call failed:', orErr?.message || orErr);

      // Attempt to detect 402 payment error from SDK error body
      const statusCode = orErr?.statusCode || (orErr?.body && (() => {
        try { const parsed = JSON.parse(orErr.body); return parsed?.error?.code; } catch { return null; }
      })());

      if (statusCode === 402) {
        console.warn('OpenRouter 402: insufficient credits or token limit exceeded.');
        const fallback = demoAggregates(city, age, symptoms);
        return res.status(200).json({
          ...fallback,
          source: 'Fallback: OpenRouter payment/credits issue (402). Lower tokens or top up credits.'
        });
      }

      // Any other OpenRouter error -> fallback
      const fallback = demoAggregates(city, age, symptoms);
      return res.status(200).json({
        ...fallback,
        source: 'Fallback: OpenRouter unavailable or returned error. Using demo data.'
      });
    }

    // If we have an AI response, parse it
    const aiText = completion?.choices?.[0]?.message?.content;
    if (!aiText) {
      console.warn('OpenRouter returned no text. Using fallback.');
      const fallback = demoAggregates(city, age, symptoms);
      return res.json({ ...fallback, source: 'Fallback: empty AI response' });
    }

    // Try parse JSON
    try {
      const parsed = JSON.parse(aiText);

      // Validate basic shape
      if (!parsed || !Array.isArray(parsed.treatments)) {
        console.warn('Parsed AI JSON missing treatments array. Falling back.');
        const fallback = demoAggregates(city, age, symptoms);
        return res.json({ ...fallback, source: 'Fallback: AI JSON missing expected fields' });
      }

      // Normalize numeric fields
      parsed.treatments = parsed.treatments.map(t => ({
        type: t.type || 'Unknown',
        cost: Number(t.cost) || null,
        duration: t.duration || '',
        durationValue: Number(t.durationValue) || null,
        sideEffects: t.sideEffects || ''
      }));

      parsed.source = 'OpenRouter AI (no DB)';
      // attach original request meta for logging/debugging (optional)
      parsed._meta = { city, age, symptoms: (''+symptoms).slice(0,200) };

      return res.json(parsed);
    } catch (parseErr) {
      console.warn('Failed to parse AI JSON:', parseErr?.message || parseErr);
      const fallback = demoAggregates(city, age, symptoms);
      return res.json({ ...fallback, source: 'Fallback: AI returned invalid JSON' });
    }

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => console.log(`CureVia backend running with OpenRouter on http://localhost:${port}`));
