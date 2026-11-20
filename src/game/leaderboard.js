export const LEADERBOARD_LIMIT = 10;

const VALID_NAME_RE =
  /^[A-Za-z0-9_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]{3,12}$/;

/**
 * Validates player name: 3-12 characters of [A-Za-z0-9_] or Vietnamese letters.
 */
export function validateLeaderboardName(raw) {
  const name = typeof raw === 'string' ? raw.trim().normalize('NFC') : '';
  if (name.length < 3 || name.length > 12) {
    return {
      valid: false,
      name,
      error: 'Tên phải dài từ 3 đến 12 ký tự.'
    };
  }
  if (!VALID_NAME_RE.test(name)) {
    return {
      valid: false,
      name,
      error: 'Chỉ dùng chữ cái (hỗ trợ tiếng Việt), chữ số và dấu gạch dưới (_).'
    };
  }
  return { valid: true, name, error: '' };
}

/**
 * Formats a Date as ISO 8601 string with local timezone offset (e.g. +07:00).
 */
export function formatIsoWithOffset(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${hh}:${mm}`
  );
}

/**
 * Validates and normalizes a single leaderboard entry.
 */
export function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const check = validateLeaderboardName(raw.name);
  if (!check.valid) return null;

  const scoreNum = Number(raw.score);
  const nightsNum = Number(raw.nights_won);
  const seedNum = Number(raw.seed);

  let achievedAt = typeof raw.achieved_at === 'string' ? raw.achieved_at.trim() : '';
  if (!achievedAt || Number.isNaN(Date.parse(achievedAt))) {
    achievedAt = formatIsoWithOffset();
  }

  return {
    name: check.name,
    score: Number.isFinite(scoreNum) ? Math.max(0, Math.floor(scoreNum)) : 0,
    nights_won: Number.isFinite(nightsNum) ? Math.max(0, Math.min(3, Math.floor(nightsNum))) : 0,
    achieved_at: achievedAt,
    seed: Number.isFinite(seedNum) ? Math.trunc(seedNum) : 0
  };
}

/**
 * Sorts leaderboard entries by score descending (earlier achieved_at wins ties)
 * and keeps at most top 10.
 */
export function sortAndTrimEntries(entries) {
  const normalized = [];
  if (Array.isArray(entries)) {
    for (const item of entries) {
      const norm = normalizeEntry(item);
      if (norm) normalized.push(norm);
    }
  }
  normalized.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = Date.parse(a.achieved_at);
    const tb = Date.parse(b.achieved_at);
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });
  return normalized.slice(0, LEADERBOARD_LIMIT);
}

/**
 * Adds a new entry if valid, returning sorted top 10 entries and 1-based rank (-1 if outside top 10).
 */
export function addLeaderboardEntry(entries, rawEntry) {
  const entry = normalizeEntry(rawEntry);
  if (!entry) {
    throw new Error('Dữ liệu bảng xếp hạng không hợp lệ.');
  }
  const existing = Array.isArray(entries) ? entries.map(normalizeEntry).filter(Boolean) : [];
  existing.push(entry);
  const sorted = sortAndTrimEntries(existing);
  const idx = sorted.findIndex(
    (e) =>
      e.name === entry.name &&
      e.score === entry.score &&
      e.nights_won === entry.nights_won &&
      e.achieved_at === entry.achieved_at &&
      e.seed === entry.seed
  );
  return {
    entry,
    entries: sorted,
    rank: idx >= 0 ? idx + 1 : -1
  };
}
