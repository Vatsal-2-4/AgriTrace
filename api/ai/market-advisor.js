import { handleCors } from '../_utils/http.js';

const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const VALID_RECOMMENDATIONS = new Set(['SELL', 'HOLD', 'CONSIDER_ALTERNATIVE', 'INSUFFICIENT_DATA']);
const VALID_CONFIDENCE = new Set(['LOW', 'MEDIUM', 'HIGH']);

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function isEvidenceItem(item) {
  return item &&
    typeof item.id === 'string' &&
    typeof item.type === 'string' &&
    typeof item.label === 'string' &&
    item.value !== undefined &&
    typeof item.source === 'string';
}

function parseGroqJson(text = '') {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(trimmed);
}

function validateAssistantOutput(output, evidenceIds) {
  if (!output || typeof output !== 'object') throw new Error('Groq response was not an object');
  if (!VALID_RECOMMENDATIONS.has(output.recommendation)) throw new Error('Invalid recommendation in Groq response');
  if (!VALID_CONFIDENCE.has(output.confidence)) throw new Error('Invalid confidence in Groq response');
  if (typeof output.summary !== 'string') throw new Error('Missing summary in Groq response');
  if (!Array.isArray(output.reasons)) throw new Error('Missing reasons in Groq response');
  if (typeof output.suggestedAction !== 'string') throw new Error('Missing suggestedAction in Groq response');
  if (!Array.isArray(output.limitations)) throw new Error('Missing limitations in Groq response');

  output.reasons.forEach((reason) => {
    if (!reason || typeof reason.text !== 'string' || !Array.isArray(reason.evidenceIds)) {
      throw new Error('Invalid reason in Groq response');
    }
    if (reason.evidenceIds.length === 0) {
      throw new Error('Every reason must reference at least one evidence ID');
    }
    reason.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) throw new Error(`Groq referenced unknown evidence ID: ${id}`);
    });
  });

  return {
    recommendation: output.recommendation,
    confidence: output.confidence,
    summary: output.summary,
    reasons: output.reasons.map(reason => ({
      text: reason.text,
      evidenceIds: reason.evidenceIds
    })),
    suggestedAction: output.suggestedAction,
    limitations: output.limitations.filter(item => typeof item === 'string')
  };
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, message: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return sendJson(res, 503, {
        success: false,
        message: 'Groq API key is not configured.',
        code: 'GROQ_UNAVAILABLE'
      });
    }

    const { context, evidence } = req.body || {};
    if (!context || typeof context !== 'object') {
      return sendJson(res, 400, { success: false, message: 'context is required' });
    }
    if (!Array.isArray(evidence) || evidence.length === 0 || !evidence.every(isEvidenceItem)) {
      return sendJson(res, 400, { success: false, message: 'Valid evidence array is required' });
    }

    const evidenceIds = new Set(evidence.map(item => item.id));
    const prompt = [
      'You are AgriTrace AI Market Assistant, an analytical helper for a multi-commodity market-intelligence platform.',
      'Use ONLY the supplied AgriTrace evidence. Do not invent prices, forecasts, buyers, quality data, certificates, news, market conditions, or sources.',
      'Do not recompute financial values. If the evidence is insufficient, say so explicitly.',
      'Every factual reason must cite one or more evidenceIds from the supplied evidence.',
      'Return ONLY valid JSON matching this schema:',
      '{"recommendation":"SELL|HOLD|CONSIDER_ALTERNATIVE|INSUFFICIENT_DATA","confidence":"LOW|MEDIUM|HIGH","summary":"string","reasons":[{"text":"string","evidenceIds":["string"]}],"suggestedAction":"string","limitations":["string"]}',
      '',
      `Context: ${JSON.stringify(context)}`,
      `Evidence: ${JSON.stringify(evidence)}`
    ].join('\n');

    const groqResponse = await fetch(GROQ_ENDPOINT, {
      signal: AbortSignal.timeout(25000),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 4096
      })
    });

    const groqPayload = await groqResponse.json().catch(() => null);
    if (!groqResponse.ok) {
      return sendJson(res, 502, {
        success: false,
        message: groqPayload?.error?.message || `Groq API returned ${groqResponse.status}`,
        code: 'GROQ_UNAVAILABLE'
      });
    }

    const text = groqPayload?.choices?.[0]?.message?.content || '';
    if (!text) {
      return sendJson(res, 502, {
        success: false,
        message: 'Groq returned an empty response.',
        code: 'GROQ_EMPTY_RESPONSE'
      });
    }

    const parsed = parseGroqJson(text);
    const data = validateAssistantOutput(parsed, evidenceIds);
    return sendJson(res, 200, { success: true, data, evidence });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: error.message || 'AgriTrace AI Market Assistant failed.'
    });
  }
}
