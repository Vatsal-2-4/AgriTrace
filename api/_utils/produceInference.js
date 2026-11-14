import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let running = 0;

export async function inferProduceImage(cropId, imageBase64) {
  const packet = { cropId, imageBase64 };
  if (process.env.QUALITY_INFERENCE_URL) {
    const response = await fetch(process.env.QUALITY_INFERENCE_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.QUALITY_SERVICE_TOKEN || ''}` },
      body: JSON.stringify(packet), signal: AbortSignal.timeout(90000)
    });
    if (!response.ok) throw new Error('Quality inference service unavailable');
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.message || 'Quality inference failed');
    return payload.data;
  }
  if (process.env.VERCEL) throw new Error('QUALITY_INFERENCE_URL must point to the CPU inference service');
  if (running >= 2) throw new Error('Quality engine busy; manual review remains available');
  running++;
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_EXECUTABLE || 'python', [fileURLToPath(new URL('../../services/quality/infer.py', import.meta.url))], { windowsHide: true, timeout: 90000 });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', () => {});
    child.on('error', reject); child.stdin.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(new Error('Quality process failed; check quality requirements'));
      try {
        const payload = JSON.parse(output);
        if (!payload.success) throw new Error(payload.message);
        resolve(payload.data);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(packet));
  }).finally(() => { running--; });
}
