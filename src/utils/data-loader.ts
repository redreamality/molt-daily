import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(process.cwd(), 'data');
const ARCHIVE_DIR = join(DATA_DIR, 'archive');

export interface Post {
  id: string;
  title: string;
  content?: string;
  url?: string;
  upvotes: number;
  downvotes: number;
  comment_count?: number;
  created_at: string;
  author?: { name: string };
  submolt?: { name: string; display_name?: string };
}

export interface DailyData {
  date: string;
  fetchedAt: string;
  feeds: {
    hot: Post[];
    top: Post[];
    rising: Post[];
  };
  submolts: unknown[];
  stats: {
    hotCount: number;
    topCount: number;
    risingCount: number;
    submoltCount: number;
  };
}

export function loadLatest(): DailyData | null {
  const path = join(DATA_DIR, 'latest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function loadArchive(date: string): DailyData | null {
  const path = join(ARCHIVE_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function listArchiveDates(): string[] {
  if (!existsSync(ARCHIVE_DIR)) return [];
  return readdirSync(ARCHIVE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', ''))
    .sort()
    .reverse();
}

export function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
