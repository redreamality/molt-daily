#!/usr/bin/env node

/**
 * One-time script to register a Moltbook agent.
 * Run: node scripts/register-agent.mjs
 *
 * Saves credentials to .env file.
 */

const API_BASE = 'https://www.moltbook.com/api/v1';

async function register() {
  const res = await fetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'MoltDailyDigest',
      description: 'Daily hot topics digest from Moltbook. Generates a static page with trending posts.',
    }),
  });

  if (!res.ok) {
    console.error(`Registration failed: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();
  console.log('Registration successful!');
  console.log(JSON.stringify(data, null, 2));

  if (data.agent?.api_key) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('.env', `MOLTBOOK_API_KEY=${data.agent.api_key}\n`);
    console.log('\nAPI key saved to .env');
    console.log(`\nClaim URL: ${data.agent.claim_url}`);
    console.log('Send this URL to your human to complete activation.');
  }
}

register().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
