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
const MODEL = process.env.SUMMARY_MODEL || 'claude-sonnet-4-5-20250929';
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 1000;
const MIN_CONTENT_LENGTH = 50;

if (!AUTH_TOKEN) {
  console.error('Missing ANTHROPIC_AUTH_TOKEN environment variable');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are a content editor for a tech news aggregator. Your job is to write reader-friendly summaries of posts.

Output format:
1. First write a Chinese title (one line, concise and engaging)
2. Then a separator: ---
3. Then a Chinese summary (中文摘要, 150-400 words)
4. Then a separator line: ---
5. Then an English title (one line, concise and engaging)
6. Then a separator: ---
7. Then an English summary

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
  const url = `${BASE_URL}/v1/chat/completions`;
  const body = {
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Please summarize the following post:\n\nTitle: ${post.title}\n\nContent:\n${post.content}`,
      },
    ],
    stream: false,
    temperature: 0.7,
    top_p: 1,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  const result = await res.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API');
  return content;
}

function parseBilingualContent(content) {
  const parts = content.split(/\n---\n/);
  if (parts.length >= 4) {
    return {
      titleZh: parts[0].trim(),
      summaryZh: parts[1].trim(),
      titleEn: parts[2].trim(),
      summaryEn: parts.slice(3).join('\n---\n').trim(),
    };
  }
  // Fallback for old format (just summaries without titles)
  if (parts.length >= 2) {
    return {
      summaryZh: parts[0].trim(),
      summaryEn: parts.slice(1).join('\n---\n').trim(),
    };
  }
  return { summaryEn: content };
}

function writeSummaryToFiles(postId, content, files) {
  const { titleZh, summaryZh, titleEn, summaryEn } = parseBilingualContent(content);

  for (const file of files) {
    const data = loadJsonFile(file);
    if (!data?.feeds) continue;

    let changed = false;
    for (const feed of ['hot', 'top', 'new']) {
      const posts = data.feeds[feed];
      if (!posts) continue;
      for (const post of posts) {
        if (post.id === postId) {
          // Store bilingual titles if available
          if (titleZh) post.title_zh = titleZh;
          if (titleEn) post.title_en = titleEn;
          // Combine summaries with separator
          if (summaryZh && summaryEn) {
            post.summary = `${summaryZh}\n---\n${summaryEn}`;
          } else {
            post.summary = content;
          }
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
