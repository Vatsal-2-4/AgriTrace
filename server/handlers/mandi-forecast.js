import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCors } from '../../api/_utils/http.js';

// Local Vite bridge; production uses the Python serverless handler directly.
export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [
        fileURLToPath(new URL('../../api/ai/mandi-forecast.py', import.meta.url))
      ], { windowsHide: true, timeout: 55000 });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', () => {});
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', code => {
        if (code !== 0) return reject(new Error('Python model process failed; check Python dependencies and model artifacts'));
        try { resolve(JSON.parse(output)); } catch { reject(new Error('Invalid response from model process')); }
      });
      child.stdin.end(JSON.stringify(req.body || {}));
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(503).json({ success: false, code: 'MODEL_UNAVAILABLE', message: error.message });
  }
}
