import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  addLeaderboardEntry,
  sortAndTrimEntries,
  validateLeaderboardName
} from '../src/game/leaderboard.js';

export function getLeaderboardPath() {
  if (process.env.DAO_DEN_LONG_LEADERBOARD_PATH) {
    return path.resolve(process.env.DAO_DEN_LONG_LEADERBOARD_PATH);
  }
  return path.join(os.homedir(), '.dao-den-long', 'leaderboard.json');
}

export function readLeaderboard(filePath = getLeaderboardPath()) {
  try {
    if (!fs.existsSync(filePath)) {
      return { entries: [] };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.entries;
    return { entries: sortAndTrimEntries(list || []) };
  } catch {
    return { entries: [] };
  }
}

export function writeLeaderboard(entries, filePath = getLeaderboardPath()) {
  const sorted = sortAndTrimEntries(entries);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ entries: sorted }, null, 2)}\n`, 'utf8');
  return { entries: sorted };
}

export function appendLeaderboardEntry(rawEntry, filePath = getLeaderboardPath()) {
  const check = validateLeaderboardName(rawEntry?.name);
  if (!check.valid) {
    const err = new Error(check.error);
    err.statusCode = 400;
    throw err;
  }
  const current = readLeaderboard(filePath);
  const { entries, rank, entry } = addLeaderboardEntry(current.entries, rawEntry);
  writeLeaderboard(entries, filePath);
  return { entry, entries, rank };
}
