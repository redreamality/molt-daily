#!/usr/bin/env node

/**
 * Generate bilingual (CN/EN) summaries for Moltbook posts using Anthropic API.
 * Run: ANTHROPIC_AUTH_TOKEN=xxx node scripts/generate-summaries.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const ARCHIVE_DIR = join(DATA_DIR, 'archive');

const AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN;
const BASE_URL = (process.env.ANTHROPIC_BASE_URL || 'https://ai.ppbox.top').replace(/\/+$/, '');
const MODEL = process.env.SUMMARY_MODEL || 'claude-3-5-haiku-20241022';
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1000;
const MIN_CONTENT_LENGTH = 50;

if (!AUTH_TOKEN) {
  console.error('Missing ANTHROPIC_AUTH_TOKEN environment variable');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a content editor for a tech news aggregator. Your job is to write reader-friendly summaries of posts.

Output format:
1. First write a Chinese summary (中文摘要)
2. Then a separator line: ---
3. Then an English summary

Each summary should be 150-400 words, written in Markdown format.
Preserve the core arguments, technical details, and key insights from the original post.
Make the summaries engaging and easy to read. Use bullet points or subheadings where appropriate.
Do NOT include the "中文摘要" or "English Summary" headers — just start writing the summary directly.`;

function loadJsonFile(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJsonFile(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function listAllDataFiles() {
  const files = [];
  const latestPath = join(DATA_DIR, 'latest.json');
  if (existsSync(latestPath)) files.push(latestPath);

  if (existsSync(ARCHIVE_DIR)) {
    for (const f of readdirSync(ARCHIVE_DIR)) {
      if (f.endsWith('.json')) {
        files.push(join(ARCHIVE_DIR, f));
      }
    }
  }
  return files;
}

function collectPostsNeedingSummary(files) {
  const postMap = new Map(); // id -> { post, files: Set<string> }

  for (const file of files) {
    const data = loadJsonFile(file);
    if (!data?.feeds) continue;

    const allPosts = [
      ...(data.feeds.hot || []),
      ...(data.feeds.top || []),
      ...(data.feeds.new || []),
    ];

    for (const post of allPosts) {
      if (!post.id) continue;

      if (!postMap.has(post.id)) {
        postMap.set(post.id, { post, files: new Set() });
      }
      postMap.get(post.id).files.add(file);
    }
  }

  // Filter: has content, no summary, content long enough
  const needsSummary = [];
  for (const [id, entry] of postMap) {
    const { post } = entry;
    if (post.summary) continue;
    if (!post.content || post.content.length < MIN_CONTENT_LENGTH) continue;
    needsSummary.push(entry);
  }

  return needsSummary;
}

async function generateSummary(post) {
  const url = `${BASE_URL}/v1/messages`;
  const body = {
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Please summarize the following post:\n\nTitle: ${post.title}\n\nContent:\n${post.content}`,
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AUTH_TOKEN,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const result = await res.json();
  const content = result.content?.[0]?.text;
  if (!content) throw new Error('Empty response from API');
  return content;
}

function writeSummaryToFiles(postId, summary, files) {
  for (const file of files) {
    const data = loadJsonFile(file);
    if (!data?.feeds) continue;

    let changed = false;
    for (const feed of ['hot', 'top', 'new']) {
      const posts = data.feeds[feed];
      if (!posts) continue;
      for (const post of posts) {
        if (post.id === postId) {
          post.summary = summary;
          changed = true;
        }
      }
    }

    if (changed) {
      saveJsonFile(file, data);
    }
  }
}

async function processBatch(batch) {
  const results = await Promise.allSettled(
    batch.map(async (entry) => {
      const { post, files } = entry;
      console.log(`  Generating summary for: ${post.title.slice(0, 60)}...`);
      const summary = await generateSummary(post);
      writeSummaryToFiles(post.id, summary, files);
      console.log(`  ✓ Done: ${post.id}`);
      return post.id;
    })
  );
  return results;
}

async function main() {
  console.log('Scanning data files for posts needing summaries...');
  const files = listAllDataFiles();
  const entries = collectPostsNeedingSummary(files);

  if (entries.length === 0) {
    console.log('All posts already have summaries (or no eligible posts found). Nothing to do.');
    return;
  }

  console.log(`Found ${entries.length} posts needing summaries.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)}:`);

    const results = await processBatch(batch);
    for (const r of results) {
      if (r.status === 'fulfilled') successCount++;
      else {
        failCount++;
        console.error(`  ✗ Failed: ${r.reason?.message || r.reason}`);
      }
    }

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < entries.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`\nDone: ${successCount} succeeded, ${failCount} failed.`);

  if (successCount === 0 && failCount > 0) {
    console.error('All summaries failed to generate.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Summary generation failed:', err.message);
  process.exit(1);
});
