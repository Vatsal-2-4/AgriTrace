/** CEDA snapshots refresh on first use each India calendar day, per query. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const localDirectory = fileURLToPath(new URL('../../artifacts/ceda-cache/', import.meta.url));
const active = new Map();
let cacheConnection;
const dayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function unpack(record) {
  if (record.status === 'READY') return record.data;
  const error = new Error(record.message || 'CEDA refresh already attempted today; try again after midnight IST.');
  error.status = record.httpStatus || 503;
  throw error;
}

export async function dailyCedaSnapshot(endpoint, options, fetchData) {
  const query = JSON.stringify(canonical({ endpoint, method: options.method || 'GET', body: options.body || null }));
  const hash = createHash('sha256').update(query).digest('hex');
  const key = `${dayInIndia()}-${hash}`;
  if (active.has(key)) return active.get(key);
  const pending = (async () => {
    let store;
    if (process.env.VERCEL) {
      // Shared durable storage is required across serverless instances; fail closed.
      if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required for the daily CEDA cache');
      cacheConnection ||= mongoose.createConnection(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 }).asPromise().catch(error => { cacheConnection = null; throw error; });
      const connection = await cacheConnection;
      const collection = connection.collection('ceda_daily_snapshots');
      store = {
        read: () => collection.findOne({ _id: key }),
        claim: () => collection.insertOne({ _id: key, status: 'FETCHING', query, fetchedAt: new Date().toISOString() }).then(() => true).catch(error => { if (error.code === 11000) return false; throw error; }),
        save: record => collection.replaceOne({ _id: key }, { _id: key, ...record })
      };
    } else {
      await mkdir(localDirectory, { recursive: true });
      const path = `${localDirectory}/${key}.json`;
      store = {
        read: () => readFile(path, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; }),
        claim: () => writeFile(path, JSON.stringify({ status: 'FETCHING', query }), { flag: 'wx' }).then(() => true).catch(error => { if (error.code === 'EEXIST') return false; throw error; }),
        save: async record => {
          const temporary = `${path}.${process.pid}.tmp`;
          await writeFile(temporary, JSON.stringify(record));
          await rename(temporary, path);
        }
      };
    }
    const existing = await store.read();
    if (existing) return unpack(existing);
    if (!await store.claim()) return unpack(await store.read());
    try {
      const data = await fetchData();
      await store.save({ status: 'READY', fetchedAt: new Date().toISOString(), query, data });
      return data;
    } catch (error) {
      // Failed attempts also consume today's refresh, preventing automatic retry storms.
      await store.save({ status: 'FAILED', fetchedAt: new Date().toISOString(), query, httpStatus: error.status || 503, message: 'CEDA daily refresh failed. No automatic retry until the next India calendar day.' });
      throw error;
    }
  })();
  active.set(key, pending);
  try { return await pending; } finally { active.delete(key); }
}
