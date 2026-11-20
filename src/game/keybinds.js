export const DEFAULT_KEYBINDS = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape'
};

export const KEYBIND_ACTIONS = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'jump',
  'dash',
  'interact',
  'pulse',
  'pause'
];

export const ACTION_LABELS = {
  moveUp: 'Tiến lên',
  moveDown: 'Lùi lại',
  moveLeft: 'Sang trái',
  moveRight: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác / Châm dầu',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng'
};

export function normalizeKeybinds(raw) {
  const out = { ...DEFAULT_KEYBINDS };
  if (raw && typeof raw === 'object') {
    for (const action of KEYBIND_ACTIONS) {
      if (typeof raw[action] === 'string' && raw[action].trim().length > 0) {
        out[action] = raw[action].trim();
      }
    }
  }
  return out;
}

export function findKeybindConflicts(keybinds) {
  const byCode = new Map();
  for (const action of KEYBIND_ACTIONS) {
    const code = keybinds[action];
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(action);
  }
  const conflicts = [];
  for (const [code, actions] of byCode.entries()) {
    if (actions.length >= 2) {
      conflicts.push({ code, actions });
    }
  }
  return conflicts;
}

const SPECIAL_KEY_NAMES = {
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  ShiftLeft: 'Shift',
  ShiftRight: 'R-Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'R-Ctrl',
  AltLeft: 'Alt',
  AltRight: 'R-Alt',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  BracketLeft: '[',
  BracketRight: ']'
};

export function formatKeyCode(code) {
  if (!code) return '?';
  if (SPECIAL_KEY_NAMES[code]) return SPECIAL_KEY_NAMES[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  return code;
}
