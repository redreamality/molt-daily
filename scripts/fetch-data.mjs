#!/usr/bin/env node

/**
 * Fetch hot/top/new feeds from Moltbook and save to data/ directory.
 * Run: MOLTBOOK_API_KEY=xxx node scripts/fetch-data.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const API_BASE = 'https://www.moltbook.com/api/v1';
const API_KEY = process.env.MOLTBOOK_API_KEY;

if (!API_KEY) {
  console.error('Missing MOLTBOOK_API_KEY environment variable');
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: HEADERS });

    if (res.status === 429) {
      const wait = Math.pow(2, i) * 2000;
      console.warn(`Rate limited, waiting ${wait}ms before retry...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    return res.json();
  }
  throw new Error('Max retries reached');
}

async function fetchFeed(sort, limit = 25) {
  const data = await fetchWithRetry(
    `${API_BASE}/posts?sort=${sort}&limit=${limit}`
  );
  return data.posts || data;
}

async function fetchSubmolts() {
  const data = await fetchWithRetry(`${API_BASE}/submolts`);
  return data.submolts || data;
}

async function main() {
  console.log('Fetching Moltbook data...');

  const [hot, top, newPosts, submolts] = await Promise.all([
    fetchFeed('hot'),
    fetchFeed('top'),
    fetchFeed('new'),
    fetchSubmolts(),
  ]);

  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const payload = {
    date,
    fetchedAt: now.toISOString(),
    feeds: { hot, top, new: newPosts },
    submolts,
    stats: {
      hotCount: hot.length,
      topCount: top.length,
      newCount: newPosts.length,
      submoltCount: Array.isArray(submolts) ? submolts.length : 0,
    },
  };

  // Ensure directories exist
  const dataDir = join(ROOT, 'data');
  const archiveDir = join(dataDir, 'archive');
  mkdirSync(archiveDir, { recursive: true });

  // Write latest.json
  const latestPath = join(dataDir, 'latest.json');
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));
  console.log(`Written: ${latestPath}`);

  // Write archive
  const archivePath = join(archiveDir, `${date}.json`);
  writeFileSync(archivePath, JSON.stringify(payload, null, 2));
  console.log(`Written: ${archivePath}`);

  console.log(
    `Done! ${payload.stats.hotCount} hot, ${payload.stats.topCount} top, ${payload.stats.newCount} new posts`
  );
}

main().catch((err) => {
  console.error('Fetch failed:', err.message);
  process.exit(1);
});
