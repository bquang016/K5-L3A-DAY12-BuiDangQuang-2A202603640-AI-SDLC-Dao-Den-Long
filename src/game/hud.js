import { FUEL_SCALE, LOW_FUEL_60 } from '../sim/config.js';
import { distXZ } from '../sim/math.js';
import {
  ACTION_LABELS,
  DEFAULT_KEYBINDS,
  findKeybindConflicts,
  formatKeyCode,
  KEYBIND_ACTIONS,
  normalizeKeybinds
} from './keybinds.js';
import { validateLeaderboardName } from './leaderboard.js';

const NIGHT_INTROS = {
  1: {
    title: 'Đêm 1 · Đảo Bến',
    quote:
      'Ông Đăng dặn: "Mây ơi, sương đêm nay nuốt dầu nhanh lắm! Đèn sẽ tự cạn dần, hãy giữ ít nhất 3/5 Đèn Lồng còn sáng tới khi bình minh ló dạng (240s). Đèn tắt nhớ thắp lại chỉ tốn 5 đom đóm thôi!"'
  },
  2: {
    title: 'Đêm 2 · Đảo Cau',
    quote:
      'Ông Đăng dặn: "Đêm nay cần giữ ít nhất 4/6 đèn sáng suốt 270s! Khi dầu xuống dưới 30, vùng an toàn sẽ biến mất và Bóng Mực sẽ lao tới hút cạn dầu. Hãy châm dầu kịp thời nhé!"'
  },
  3: {
    title: 'Đêm 3 · Đảo Chuông',
    quote:
      'Ông Đăng dặn: "Thử thách cuối cùng trên Đảo Chuông (300s): giữ tối thiểu 5/7 đèn sáng tới bình minh! Thắp và châm dầu càng nhiều, túi ánh sáng của con càng mở rộng tới 20 ô!"'
  }
};

const SVG_FLAME = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 2C12.5 2 18 7.2 18 13a6 6 0 1 1-12 0c0-3.2 1.8-6.1 3.7-8.1-.2 1.8.8 3.2 2.1 3.7C11.2 6.5 12.5 2 12.5 2Z"/></svg>`;
const SVG_LANTERN = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2h6v2h-6V2Zm-2 4h10l1.5 3v9L16 21H8l-2.5-3V9L7 6Zm3 17h4v1h-4v-1Z"/></svg>`;
const SVG_DASH = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 10-12h-6l0-8Z"/></svg>`;
const SVG_PULSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2Z"/></svg>`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function positionEdgeArrow(el, proj) {
  const cx = proj.w / 2;
  const cy = proj.h / 2;
  const dx = Math.cos(proj.angleRad);
  const dy = Math.sin(proj.angleRad);
  const maxLeft = Math.max(80, cx - 54);
  const maxRight = Math.max(80, cx - 54);
  const maxTop = Math.max(80, cy - 112);
  const maxBottom = Math.max(80, cy - 148);
  const rx = dx > 1e-4 ? maxRight / dx : dx < -1e-4 ? maxLeft / -dx : 9999;
  const ry = dy > 1e-4 ? maxBottom / dy : dy < -1e-4 ? maxTop / -dy : 9999;
  const t = Math.min(rx, ry);
  el.style.display = 'flex';
  el.style.left = `${cx + dx * t - 19}px`;
  el.style.top = `${cy + dy * t - 19}px`;
  el.style.transform = `rotate(${(proj.angleRad * 180) / Math.PI}deg)`;
}

export class GameHud {
  constructor(
    root,
    {
      settings,
      onStartCampaign,
      onSelectNight,
      onBeginNightPlay,
      onResume,
      onRestartNight,
      onNextNight,
      onBackToMenu,
      onSettingsChange,
      onRebindStateChange,
      onOpenLeaderboard,
      onSaveLeaderboardScore
    } = {}
  ) {
    this.root = root;
    this.settings = settings;
    this.callbacks = {
      onStartCampaign,
      onSelectNight,
      onBeginNightPlay,
      onResume,
      onRestartNight,
      onNextNight,
      onBackToMenu,
      onSettingsChange,
      onRebindStateChange,
      onOpenLeaderboard,
      onSaveLeaderboardScore
    };

    this.whisperTimer = 0;
    this.flashTimer = 0;
    this.shadeAlert = null; // { id, pos, timer }
    this.settingsOrigin = 'menu';
    this.listeningAction = null;
    this._keyCaptureHandler = null;

    this._buildDom();
  }

  _buildDom() {
    this.root.innerHTML = `
      <div class="hud-flash" id="hud-flash"></div>
      <div class="hud-reticle" id="hud-reticle"></div>

      <div class="hud-top">
        <div class="hud-panel justify-start">
          <div class="stat-line">
            <span class="label">Ngọn lửa</span>
            <div class="flames-row" id="hud-flames"></div>
          </div>
          <div class="lock-badge" id="hud-lock-badge">[C] Ẩn chuột: Bật</div>
          <div id="hud-charm-tag" class="charm-tag" style="display:none;"></div>
        </div>

        <div class="hud-panel timer-box justify-center">
          <div class="label" id="hud-night-label">Đêm 1 · Đảo Bến</div>
          <div class="timer-value" id="hud-timer">04:00</div>
        </div>

        <div class="hud-panel justify-end" style="text-align:right;">
          <div class="stat-line" style="justify-content:flex-end;">
            <span class="label" id="hud-lantern-goal">Đèn (cần ≥3)</span>
            <div class="lantern-pips" id="hud-lanterns"></div>
            <span class="value-gold" id="hud-lantern-count">0/5</span>
          </div>
          <div class="stat-line" style="justify-content:flex-end;">
            <span class="label">Điểm</span>
            <span class="value-gold" id="hud-score">0</span>
          </div>
        </div>
      </div>

      <div class="caption-stack">
        <div id="hud-countdown-banner" class="countdown-banner"></div>
        <div id="hud-caption-shade" class="shade-caption-banner"></div>
        <div id="hud-lowfuel-banner" class="alert-banner"></div>
        <div id="hud-wind-banner" class="wind-banner" style="display:none;"></div>
        <div class="lock-hint-pill" id="hud-lock-hint">Nhấp màn hình để ẩn chuột xoay 360° · [C] Đổi chuột</div>
      </div>

      <div style="margin-top:auto;">
        <div class="bottom-prompts">
          <div class="whisper-banner" id="hud-whisper"></div>
          <div class="prompt-pill" id="hud-prompt"></div>
        </div>
        <div class="hud-bottom">
        <div class="hud-panel justify-start controls-hint" id="hud-controls-hint"></div>

        <div class="hud-panel mote-bar-panel justify-center">
          <div class="mote-title">
            Đom đóm <span id="hud-mote-count">0/10</span>
          </div>
          <div class="mote-bar" id="hud-motes"></div>
        </div>

        <div class="abilities-row justify-end">
          <div class="ability-card" id="hud-dash-card">
            <div class="ability-title" id="hud-dash-title">${SVG_DASH} [Shift] Lướt</div>
            <div class="ability-state" id="hud-dash-state">Sẵn sàng</div>
          </div>
          <div class="ability-card" id="hud-pulse-card">
            <div class="ability-title" id="hud-pulse-title">${SVG_PULSE} [Q] Tỏa Sáng</div>
            <div class="ability-state" id="hud-pulse-state">Sẵn sàng</div>
          </div>
        </div>
        </div>
      </div>

      <div class="offscreen-arrow" id="hud-arrow">
        <svg width="36" height="36" viewBox="0 0 32 32">
          <polygon points="28,16 6,6 12,16 6,26" fill="#FFB347" stroke="#FFE9B0" stroke-width="1.5" />
        </svg>
      </div>

      <div class="offscreen-arrow shade-arrow" id="hud-shade-arrow">
        <svg width="36" height="36" viewBox="0 0 32 32">
          <polygon points="28,16 6,6 12,16 6,26" fill="var(--shade-alert)" stroke="#FFFFFF" stroke-width="1.6" />
        </svg>
      </div>

      <!-- Main Menu -->
      <div class="modal-backdrop" id="menu-modal">
        <div class="modal-card">
          <h1>Đảo Đèn Lồng</h1>
          <p>Giữ ánh sáng qua Ba Hòn Đảo cho tới Bình Minh</p>
          <div class="btn-col">
            <button class="primary-btn" id="btn-campaign">Chơi chuỗi 3 Đêm (Từ Đêm 1)</button>
            <div class="btn-row">
              <button class="secondary-btn" data-night="1">Đêm 1 · Đảo Bến</button>
              <button class="secondary-btn" data-night="2">Đêm 2 · Đảo Cau</button>
              <button class="secondary-btn" data-night="3">Đêm 3 · Đảo Chuông</button>
            </div>
            <div class="btn-row">
              <button class="secondary-btn" id="btn-menu-leaderboard">Bảng xếp hạng</button>
              <button class="secondary-btn" id="btn-menu-settings">Cài đặt & Phím</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Night Intro -->
      <div class="modal-backdrop hidden" id="intro-modal">
        <div class="modal-card">
          <h2 id="intro-title">Đêm 1 · Đảo Bến</h2>
          <div class="ong-dang-quote" id="intro-quote"></div>
          <button class="primary-btn" id="btn-intro-go">Ra đảo giữ đèn</button>
        </div>
      </div>

      <!-- Pause Menu -->
      <div class="modal-backdrop hidden" id="pause-modal">
        <div class="modal-card">
          <h2>Tạm dừng</h2>
          <div class="btn-col">
            <button class="primary-btn" id="btn-resume">Tiếp tục</button>
            <button class="secondary-btn" id="btn-pause-restart">Chơi lại Đêm</button>
            <button class="secondary-btn" id="btn-pause-settings">Cài đặt & Phím</button>
            <button class="secondary-btn" id="btn-pause-menu">Về menu</button>
          </div>
        </div>
      </div>

      <!-- Settings Modal -->
      <div class="modal-backdrop hidden" id="settings-modal">
        <div class="modal-card">
          <h2>Cài đặt & Trợ năng</h2>
          <div class="setting-row">
            <label><span>Âm lượng</span><span id="set-vol-val">75%</span></label>
            <input type="range" id="set-vol" min="0" max="100" value="75" />
          </div>
          <div class="setting-row">
            <label><span>Độ nhạy chuột</span><span id="set-sens-val">1.0x</span></label>
            <input type="range" id="set-sens" min="0.3" max="2.2" step="0.1" value="1.0" />
          </div>
          <label class="setting-check" for="set-pointer-lock">
            <span>Khóa chuột xoay 360° (Ẩn con trỏ)</span>
            <input type="checkbox" id="set-pointer-lock" checked />
          </label>
          <label class="setting-check" for="set-colorblind">
            <span>Bảng màu dễ phân biệt (Mù màu)</span>
            <input type="checkbox" id="set-colorblind" />
          </label>
          <label class="setting-check" for="set-reduced-motion">
            <span>Giảm chuyển động (Tắt rung camera & chớp)</span>
            <input type="checkbox" id="set-reduced-motion" />
          </label>
          <label class="setting-check" for="set-large-text">
            <span>Chữ lớn giao diện (×1.25)</span>
            <input type="checkbox" id="set-large-text" />
          </label>

          <div class="keybind-section">
            <div class="keybind-header">
              <span>Đổi phím điều khiển</span>
              <button class="secondary-btn" type="button" id="btn-reset-keybinds">Khôi phục mặc định</button>
            </div>
            <div class="keybind-grid" id="keybind-grid"></div>
            <div class="conflict-warning" id="keybind-conflict-msg" style="display:none;"></div>
          </div>

          <button class="primary-btn" id="btn-settings-close">Lưu & Đóng</button>
        </div>
      </div>

      <!-- Leaderboard Modal -->
      <div class="modal-backdrop hidden" id="leaderboard-modal">
        <div class="modal-card">
          <h2>Bảng xếp hạng Top 10</h2>
          <p id="lb-subtitle">Tổng điểm các Đêm đã thắng · Lưu cục bộ</p>
          <div id="lb-table-wrap"></div>
          <button class="primary-btn" id="btn-lb-close">Đóng</button>
        </div>
      </div>

      <!-- Night Result / Dawn Finale -->
      <div class="modal-backdrop hidden" id="end-modal">
        <div class="modal-card">
          <h1 id="end-title">Hoàn thành</h1>
          <p id="end-subtitle"></p>
          <div class="breakdown" id="end-breakdown"></div>
          <div class="score-save-box" id="score-save-section" style="display:none;">
            <div>
              <strong>Lưu bảng xếp hạng</strong> — Tổng điểm đã thắng:
              <span id="save-score-summary" style="color:var(--gold);font-weight:700;"></span>
            </div>
            <div class="score-save-row">
              <input
                type="text"
                class="name-input"
                id="lb-name-input"
                maxlength="12"
                placeholder="Tên 3–12 ký tự (vd: May_01)"
              />
              <button class="primary-btn" type="button" id="btn-save-score">Lưu điểm</button>
              <button class="secondary-btn" type="button" id="btn-end-leaderboard">Xem BXH</button>
            </div>
            <div class="form-error" id="lb-save-error" style="display:none;"></div>
            <div class="form-success" id="lb-save-success" style="display:none;"></div>
          </div>
          <div class="btn-row">
            <button class="primary-btn" id="btn-end-primary">Đêm kế tiếp</button>
            <button class="secondary-btn" id="btn-end-menu">Về menu</button>
          </div>
        </div>
      </div>
    `;

    this.elFlash = this.root.querySelector('#hud-flash');
    this.elReticle = this.root.querySelector('#hud-reticle');
    this.elLockBadge = this.root.querySelector('#hud-lock-badge');
    this.elLockHint = this.root.querySelector('#hud-lock-hint');
    this.elFlames = this.root.querySelector('#hud-flames');
    this.elCharmTag = this.root.querySelector('#hud-charm-tag');
    this.elNightLabel = this.root.querySelector('#hud-night-label');
    this.elTimer = this.root.querySelector('#hud-timer');
    this.elLanternGoal = this.root.querySelector('#hud-lantern-goal');
    this.elLanterns = this.root.querySelector('#hud-lanterns');
    this.elLanternCount = this.root.querySelector('#hud-lantern-count');
    this.elScore = this.root.querySelector('#hud-score');
    this.elCountdownBanner = this.root.querySelector('#hud-countdown-banner');
    this.elShadeCaption = this.root.querySelector('#hud-caption-shade');
    this.elLowFuelBanner = this.root.querySelector('#hud-lowfuel-banner');
    this.elWindBanner = this.root.querySelector('#hud-wind-banner');
    this.elWhisper = this.root.querySelector('#hud-whisper');
    this.elPrompt = this.root.querySelector('#hud-prompt');
    this.elControlsHint = this.root.querySelector('#hud-controls-hint');
    this.elMotes = this.root.querySelector('#hud-motes');
    this.elMoteCount = this.root.querySelector('#hud-mote-count');
    this.elDashCard = this.root.querySelector('#hud-dash-card');
    this.elDashTitle = this.root.querySelector('#hud-dash-title');
    this.elDashState = this.root.querySelector('#hud-dash-state');
    this.elPulseCard = this.root.querySelector('#hud-pulse-card');
    this.elPulseTitle = this.root.querySelector('#hud-pulse-title');
    this.elPulseState = this.root.querySelector('#hud-pulse-state');
    this.elArrow = this.root.querySelector('#hud-arrow');
    this.elShadeArrow = this.root.querySelector('#hud-shade-arrow');

    this.menuModal = this.root.querySelector('#menu-modal');
    this.introModal = this.root.querySelector('#intro-modal');
    this.pauseModal = this.root.querySelector('#pause-modal');
    this.settingsModal = this.root.querySelector('#settings-modal');
    this.leaderboardModal = this.root.querySelector('#leaderboard-modal');
    this.endModal = this.root.querySelector('#end-modal');

    this.volSlider = this.root.querySelector('#set-vol');
    this.volLabel = this.root.querySelector('#set-vol-val');
    this.sensSlider = this.root.querySelector('#set-sens');
    this.sensLabel = this.root.querySelector('#set-sens-val');
    this.lockCheckbox = this.root.querySelector('#set-pointer-lock');
    this.cbCheckbox = this.root.querySelector('#set-colorblind');
    this.rmCheckbox = this.root.querySelector('#set-reduced-motion');
    this.ltCheckbox = this.root.querySelector('#set-large-text');
    this.elKeybindGrid = this.root.querySelector('#keybind-grid');
    this.elKeybindConflictMsg = this.root.querySelector('#keybind-conflict-msg');

    this.elSaveSection = this.root.querySelector('#score-save-section');
    this.elSaveSummary = this.root.querySelector('#save-score-summary');
    this.elNameInput = this.root.querySelector('#lb-name-input');
    this.elSaveBtn = this.root.querySelector('#btn-save-score');
    this.elSaveError = this.root.querySelector('#lb-save-error');
    this.elSaveSuccess = this.root.querySelector('#lb-save-success');

    this.syncSettingsUi(this.settings);

    this.root.querySelector('#btn-campaign').addEventListener('click', () => {
      this.menuModal.classList.add('hidden');
      this.callbacks.onStartCampaign?.();
    });
    this.root.querySelectorAll('[data-night]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number.parseInt(btn.dataset.night, 10);
        this.menuModal.classList.add('hidden');
        this.callbacks.onSelectNight?.(n);
      });
    });
    this.root.querySelector('#btn-menu-leaderboard').addEventListener('click', () => {
      this.callbacks.onOpenLeaderboard?.();
    });
    this.root.querySelector('#btn-menu-settings').addEventListener('click', () => {
      this.settingsOrigin = 'menu';
      this.menuModal.classList.add('hidden');
      this.settingsModal.classList.remove('hidden');
    });
    this.root.querySelector('#btn-intro-go').addEventListener('click', () => {
      this.introModal.classList.add('hidden');
      this.callbacks.onBeginNightPlay?.();
    });
    this.root.querySelector('#btn-resume').addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.callbacks.onResume?.();
    });
    this.root.querySelector('#btn-pause-restart').addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.callbacks.onRestartNight?.();
    });
    this.root.querySelector('#btn-pause-settings').addEventListener('click', () => {
      this.settingsOrigin = 'pause';
      this.pauseModal.classList.add('hidden');
      this.settingsModal.classList.remove('hidden');
    });
    this.root.querySelector('#btn-pause-menu').addEventListener('click', () => {
      this.pauseModal.classList.add('hidden');
      this.callbacks.onBackToMenu?.();
    });

    const emitSettings = (extra = {}) => {
      this.callbacks.onSettingsChange?.({
        volume: Number(this.volSlider.value) / 100,
        mouseSensitivity: Number(this.sensSlider.value),
        pointerLockEnabled: this.lockCheckbox.checked,
        colorblindMode: this.cbCheckbox.checked,
        reducedMotion: this.rmCheckbox.checked,
        largeText: this.ltCheckbox.checked,
        keybinds: normalizeKeybinds(extra.keybinds ?? this.settings.keybinds)
      });
    };

    this.volSlider.addEventListener('input', () => {
      this.volLabel.textContent = `${this.volSlider.value}%`;
      emitSettings();
    });
    this.sensSlider.addEventListener('input', () => {
      this.sensLabel.textContent = `${Number(this.sensSlider.value).toFixed(1)}x`;
      emitSettings();
    });
    this.lockCheckbox.addEventListener('change', () => emitSettings());
    this.cbCheckbox.addEventListener('change', () => emitSettings());
    this.rmCheckbox.addEventListener('change', () => emitSettings());
    this.ltCheckbox.addEventListener('change', () => emitSettings());

    this.root.querySelector('#btn-reset-keybinds').addEventListener('click', () => {
      this._cancelListening();
      emitSettings({ keybinds: { ...DEFAULT_KEYBINDS } });
    });

    this.root.querySelector('#btn-settings-close').addEventListener('click', () => {
      this._cancelListening();
      this.settingsModal.classList.add('hidden');
      if (this.settingsOrigin === 'pause') this.pauseModal.classList.remove('hidden');
      else this.menuModal.classList.remove('hidden');
    });

    this.root.querySelector('#btn-lb-close').addEventListener('click', () => {
      this.leaderboardModal.classList.add('hidden');
    });

    this.root.querySelector('#btn-end-leaderboard').addEventListener('click', () => {
      this.callbacks.onOpenLeaderboard?.();
    });

    this.root.querySelector('#btn-end-menu').addEventListener('click', () => {
      this.endModal.classList.add('hidden');
      this.callbacks.onBackToMenu?.();
    });

    this.elSaveBtn.addEventListener('click', () => this._handleSaveScoreClick());
  }

  _cancelListening() {
    if (this._keyCaptureHandler) {
      window.removeEventListener('keydown', this._keyCaptureHandler, true);
      this._keyCaptureHandler = null;
    }
    if (this.listeningAction) {
      this.listeningAction = null;
      this.callbacks.onRebindStateChange?.(false);
      this._renderKeybindGrid();
    }
  }

  _startListeningKeybind(action) {
    this._cancelListening();
    this.listeningAction = action;
    this.callbacks.onRebindStateChange?.(true);
    this._renderKeybindGrid();

    this._keyCaptureHandler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = { ...normalizeKeybinds(this.settings.keybinds), [action]: e.code };
      this._cancelListening();
      this.callbacks.onSettingsChange?.({
        ...this.settings,
        keybinds: next
      });
    };
    window.addEventListener('keydown', this._keyCaptureHandler, true);
  }

  _renderKeybindGrid() {
    const kb = normalizeKeybinds(this.settings.keybinds);
    const conflicts = findKeybindConflicts(kb);
    const conflictActions = new Set(conflicts.flatMap((c) => c.actions));

    let html = '';
    for (const action of KEYBIND_ACTIONS) {
      const isListening = this.listeningAction === action;
      const isConflict = conflictActions.has(action);
      const cls = `keybind-btn${isListening ? ' listening' : ''}${isConflict ? ' conflict' : ''}`;
      const label = isListening ? 'Nhấn phím...' : escapeHtml(formatKeyCode(kb[action]));
      html += `
        <div class="keybind-row">
          <span>${escapeHtml(ACTION_LABELS[action])}</span>
          <button type="button" class="${cls}" data-rebind="${action}">${label}</button>
        </div>
      `;
    }
    this.elKeybindGrid.innerHTML = html;

    this.elKeybindGrid.querySelectorAll('[data-rebind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._startListeningKeybind(btn.dataset.rebind);
      });
    });

    if (conflicts.length > 0) {
      const desc = conflicts
        .map((c) => `${formatKeyCode(c.code)} (${c.actions.map((a) => ACTION_LABELS[a]).join(', ')})`)
        .join('; ');
      this.elKeybindConflictMsg.style.display = 'block';
      this.elKeybindConflictMsg.textContent = `⚠ Phát hiện trùng phím: ${desc}`;
    } else {
      this.elKeybindConflictMsg.style.display = 'none';
      this.elKeybindConflictMsg.textContent = '';
    }
  }

  syncSettingsUi(settings) {
    this.settings = settings;
    const kb = normalizeKeybinds(settings.keybinds);

    this.volSlider.value = String(Math.round(settings.volume * 100));
    this.volLabel.textContent = `${this.volSlider.value}%`;
    this.sensSlider.value = String(settings.mouseSensitivity);
    this.sensLabel.textContent = `${settings.mouseSensitivity.toFixed(1)}x`;
    this.lockCheckbox.checked = Boolean(settings.pointerLockEnabled);
    this.cbCheckbox.checked = Boolean(settings.colorblindMode);
    this.rmCheckbox.checked = Boolean(settings.reducedMotion);
    this.ltCheckbox.checked = Boolean(settings.largeText);

    this.elLockBadge.textContent = `[C] Ẩn chuột: ${settings.pointerLockEnabled ? 'Bật' : 'Tắt (Kéo chuột)'}`;
    document.body.classList.toggle('colorblind', Boolean(settings.colorblindMode));
    document.body.classList.toggle('reduced-motion', Boolean(settings.reducedMotion));
    document.body.classList.toggle('large-text', Boolean(settings.largeText));

    const moveLabel = `${formatKeyCode(kb.moveUp)}${formatKeyCode(kb.moveLeft)}${formatKeyCode(kb.moveDown)}${formatKeyCode(kb.moveRight)}`;
    this.elControlsHint.innerHTML =
      `<div><strong>${escapeHtml(moveLabel)}</strong> Đi · <strong>${escapeHtml(formatKeyCode(kb.jump))}</strong> Nhảy · <strong>${escapeHtml(formatKeyCode(kb.dash))}</strong> Lướt · <strong>${escapeHtml(formatKeyCode(kb.interact))}</strong> Đèn · <strong>${escapeHtml(formatKeyCode(kb.pulse))}</strong> Sáng</div>` +
      `<div><strong>Chuột</strong> Xoay 360° · <strong>[C]</strong> Ẩn chuột · <strong>${escapeHtml(formatKeyCode(kb.pause))}</strong> Dừng</div>`;
    this.elDashTitle.innerHTML = `${SVG_DASH} [${escapeHtml(formatKeyCode(kb.dash))}] Lướt`;
    this.elPulseTitle.innerHTML = `${SVG_PULSE} [${escapeHtml(formatKeyCode(kb.pulse))}] Tỏa Sáng`;

    this._renderKeybindGrid();
  }

  showLeaderboardModal(entries) {
    const wrap = this.root.querySelector('#lb-table-wrap');
    if (!entries || entries.length === 0) {
      wrap.innerHTML = '<p>Chưa có kỷ lục nào. Hãy chơi và lưu điểm đầu tiên!</p>';
    } else {
      const rows = entries
        .map(
          (e, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(e.name)}</strong></td>
            <td style="color:var(--gold);font-weight:700;">${e.score}</td>
            <td>${e.nights_won}/3</td>
            <td>${e.seed}</td>
          </tr>
        `
        )
        .join('');
      wrap.innerHTML = `
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Người chơi</th>
              <th>Điểm</th>
              <th>Đêm</th>
              <th>Seed</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }
    this.leaderboardModal.classList.remove('hidden');
  }

  showShadeSpawnAlert(shadeId, pos) {
    const safePos = Array.isArray(pos) && pos.length >= 3 ? [pos[0], pos[1], pos[2]] : null;
    this.shadeAlert = {
      id: shadeId,
      pos: safePos,
      timer: 4.5
    };
  }

  flashHit() {
    if (this.settings.reducedMotion) return;
    const color = this.settings.colorblindMode ? 'rgba(255,255,255,0.5)' : 'rgba(255,90,95,0.55)';
    this.elFlash.style.background = `radial-gradient(circle, rgba(0,0,0,0) 45%, ${color} 100%)`;
    this.elFlash.style.opacity = '1';
    this.flashTimer = 0.28;
  }

  flashPulse() {
    if (this.settings.reducedMotion) return;
    this.elFlash.style.background =
      'radial-gradient(circle, rgba(255,233,176,0.28) 20%, rgba(255,179,71,0) 75%)';
    this.elFlash.style.opacity = '1';
    this.flashTimer = 0.22;
  }

  showMenu() {
    this._cancelListening();
    this.introModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    this.endModal.classList.add('hidden');
    this.settingsModal.classList.add('hidden');
    this.leaderboardModal.classList.add('hidden');
    this.menuModal.classList.remove('hidden');
  }

  showIntro(night) {
    const info = NIGHT_INTROS[night];
    this.shadeAlert = null;
    this.root.querySelector('#intro-title').textContent = info.title;
    this.root.querySelector('#intro-quote').textContent = info.quote;
    this.elWhisper.classList.remove('visible');
    this.endModal.classList.add('hidden');
    this.pauseModal.classList.add('hidden');
    this.introModal.classList.remove('hidden');
  }

  setPaused(paused) {
    if (paused) {
      this.pauseModal.classList.remove('hidden');
    } else {
      this._cancelListening();
      this.pauseModal.classList.add('hidden');
      this.settingsModal.classList.add('hidden');
    }
  }

  showWhisper(text) {
    this.elWhisper.textContent = text;
    this.elWhisper.classList.add('visible');
    this.whisperTimer = 4.2;
  }

  async _handleSaveScoreClick() {
    const raw = this.elNameInput.value;
    const check = validateLeaderboardName(raw);
    if (!check.valid) {
      this.elSaveError.textContent = check.error;
      this.elSaveError.style.display = 'block';
      this.elSaveSuccess.style.display = 'none';
      return;
    }
    this.elSaveError.style.display = 'none';
    this.elSaveBtn.disabled = true;
    try {
      const res = await this.callbacks.onSaveLeaderboardScore?.({ name: check.name });
      this.elNameInput.disabled = true;
      this.elSaveSuccess.style.display = 'block';
      this.elSaveSuccess.textContent =
        res && res.rank > 0
          ? `Đã lưu kỷ lục "${check.name}" — Hạng #${res.rank} Top 10!`
          : `Đã lưu điểm "${check.name}".`;
    } catch (err) {
      this.elSaveBtn.disabled = false;
      this.elSaveError.style.display = 'block';
      this.elSaveError.textContent = err.message || 'Không thể lưu điểm.';
    }
  }

  showEndModal(sim, reason, { totalCampaignScore, nightsWonCount, isCampaignWin }) {
    const won = sim.state === 'won';
    const titleEl = this.root.querySelector('#end-title');
    const subEl = this.root.querySelector('#end-subtitle');
    const brEl = this.root.querySelector('#end-breakdown');
    const primaryBtn = this.root.querySelector('#btn-end-primary');

    if (won && sim.night === 3 && isCampaignWin) {
      titleEl.textContent = 'Bình Minh Trên Ba Hòn Đảo!';
      subEl.textContent =
        'Bạn đã giữ trọn ánh sáng qua Đảo Bến, Đảo Cau và Đảo Chuông cho tới khi bình minh ló rạng.';
    } else if (won) {
      titleEl.textContent = `Sống Sót Qua Đêm ${sim.night}!`;
      subEl.textContent = `Đã giữ đủ đèn sáng trên ${sim.map.name} tới bình minh.`;
    } else {
      titleEl.textContent = 'Đêm Chưa Qua Khỏi';
      subEl.textContent =
        reason === 'dawn'
          ? 'Bình minh tới nhưng số đèn sáng chưa đạt ngưỡng yêu cầu.'
          : 'Mây đã mất hết ngọn lửa ấm áp.';
    }

    const b = sim.scoreBreakdown;
    brEl.innerHTML = `
      <div class="breakdown-row"><span>Nạp / châm dầu (+5)</span><span>+${b.deposits}</span></div>
      <div class="breakdown-row"><span>Thắp mới (+100)</span><span>+${b.lanterns}</span></div>
      <div class="breakdown-row"><span>Thắp lại (+40)</span><span>+${b.relights}</span></div>
      <div class="breakdown-row"><span>Tỏa Sáng (+5 / +15 đang hút)</span><span>+${b.stuns}</span></div>
      <div class="breakdown-row"><span>Đèn sáng lúc Bình minh</span><span>+${b.lanternDawnBonus}</span></div>
      <div class="breakdown-row"><span>Ngọn lửa còn lại</span><span>+${b.flameBonus}</span></div>
      <div class="breakdown-row total"><span>Điểm Đêm ${sim.night}</span><span>${sim.score}</span></div>
      <div class="breakdown-row total"><span>Tổng điểm đã thắng</span><span>${totalCampaignScore}</span></div>
    `;

    // Show leaderboard submission after Dawn finale (Night 3 win) OR after losing any Night
    const allowSave = !won || (won && sim.night === 3);
    if (allowSave) {
      this.elSaveSection.style.display = 'block';
      this.elSaveSummary.textContent = `${totalCampaignScore} điểm (${nightsWonCount} đêm thắng)`;
      this.elNameInput.disabled = false;
      this.elNameInput.value = '';
      this.elSaveBtn.disabled = false;
      this.elSaveError.style.display = 'none';
      this.elSaveSuccess.style.display = 'none';
    } else {
      this.elSaveSection.style.display = 'none';
    }

    const freshBtn = primaryBtn.cloneNode(true);
    primaryBtn.parentNode.replaceChild(freshBtn, primaryBtn);

    if (won && sim.night < 3) {
      freshBtn.textContent = `Sang Đêm ${sim.night + 1}`;
      freshBtn.addEventListener('click', () => {
        this.endModal.classList.add('hidden');
        this.callbacks.onNextNight?.();
      });
    } else if (won && sim.night === 3) {
      freshBtn.textContent = 'Chơi lại từ Đêm 1';
      freshBtn.addEventListener('click', () => {
        this.endModal.classList.add('hidden');
        this.callbacks.onStartCampaign?.();
      });
    } else {
      freshBtn.textContent = `Chơi lại Đêm ${sim.night}`;
      freshBtn.addEventListener('click', () => {
        this.endModal.classList.add('hidden');
        this.callbacks.onRestartNight?.();
      });
    }

    this.endModal.classList.remove('hidden');
  }

  update(sim, renderer, dt, { phase, input } = {}) {
    if (this.whisperTimer > 0) {
      this.whisperTimer -= dt;
      if (this.whisperTimer <= 0) this.elWhisper.classList.remove('visible');
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.elFlash.style.opacity = '0';
    }

    const isPlaying = phase === 'playing' && sim.state === 'playing';
    this.elReticle.style.display = isPlaying && input?.isPointerLocked ? 'block' : 'none';
    this.elLockHint.style.display =
      isPlaying && input?.pointerLockEnabled && !input?.isPointerLocked ? 'inline-block' : 'none';

    this.elNightLabel.textContent = `Đêm ${sim.night} · ${sim.map.name}`;

    let flamesHtml = '';
    for (let i = 0; i < sim.tuning.flames; i += 1) {
      flamesHtml += `<span class="flame-icon ${i < sim.player.flames ? '' : 'lost'}">${SVG_FLAME}</span>`;
    }
    this.elFlames.innerHTML = flamesHtml;

    if (sim.player.charmTicks > 0) {
      this.elCharmTag.style.display = 'inline-block';
      this.elCharmTag.textContent = `Bùa Gió: ${(sim.player.charmTicks / 60).toFixed(1)}s`;
    } else {
      this.elCharmTag.style.display = 'none';
    }

    const totalSec = Math.ceil(sim.timeLeftS);
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    const isDangerTime = totalSec <= 30 && isPlaying;
    this.elTimer.textContent = isDangerTime && this.settings.colorblindMode ? `⚠ ${min}:${sec}` : `${min}:${sec}`;
    this.elTimer.classList.toggle('danger', isDangerTime);

    if (isPlaying && totalSec <= 10 && totalSec >= 1) {
      this.elCountdownBanner.style.display = 'inline-block';
      this.elCountdownBanner.textContent = `⏳ 10s cuối: Còn ${totalSec}s tới Bình Minh!`;
    } else {
      this.elCountdownBanner.style.display = 'none';
    }

    // Visual caption + offscreen arrow for newly spawned Shade
    if (this.shadeAlert && isPlaying) {
      this.shadeAlert.timer -= dt;
      if (this.shadeAlert.timer <= 0) {
        this.shadeAlert = null;
        this.elShadeCaption.style.display = 'none';
        this.elShadeArrow.style.display = 'none';
      } else {
        const liveShade = sim.shades.find((s) => s.id === this.shadeAlert.id);
        const shadePos = liveShade ? liveShade.pos : this.shadeAlert.pos;
        this.elShadeCaption.style.display = 'inline-block';
        this.elShadeCaption.textContent = `⚠ Bóng Mực ${this.shadeAlert.id} vừa xuất hiện!`;
        if (shadePos) {
          const projShade = renderer.projectToScreen(shadePos, 1.2);
          if (!projShade.onScreen) {
            positionEdgeArrow(this.elShadeArrow, projShade);
          } else {
            this.elShadeArrow.style.display = 'none';
          }
        } else {
          this.elShadeArrow.style.display = 'none';
        }
      }
    } else {
      this.elShadeCaption.style.display = 'none';
      this.elShadeArrow.style.display = 'none';
    }

    let litCount = 0;
    let lanternsHtml = '';
    let nearTarget = null;
    let nearDist = Infinity;
    let closestPriorityLantern = null;
    let closestPriorityDist = Infinity;
    const lowFuelIds = [];

    for (const l of sim.lanterns) {
      const d = distXZ(sim.player.pos, l.pos);
      if (l.lit) {
        litCount += 1;
        if (l.fuel60 < LOW_FUEL_60) lowFuelIds.push(l.id);
        if (l.fuel60 < 6000 && d <= sim.tuning.interact_radius && d < nearDist) {
          nearDist = d;
          nearTarget = l;
        }
        if (l.fuel60 < LOW_FUEL_60 && d < closestPriorityDist) {
          closestPriorityDist = d;
          closestPriorityLantern = l;
        }
      } else {
        if (d <= sim.tuning.interact_radius && d < nearDist) {
          nearDist = d;
          nearTarget = l;
        }
        if (d < closestPriorityDist) {
          closestPriorityDist = d;
          closestPriorityLantern = l;
        }
      }
      lanternsHtml += `<span class="lantern-svg ${l.lit ? 'lit' : ''}">${SVG_LANTERN}</span>`;
    }

    const reqLit = Math.ceil(sim.tuning.win_ratio * sim.lanterns.length - 1e-9);
    this.elLanternGoal.textContent = `Đèn (≥${reqLit})`;
    this.elLanterns.innerHTML = lanternsHtml;
    this.elLanternCount.textContent = `${litCount}/${sim.lanterns.length}`;
    this.elScore.textContent = String(sim.score);

    if (lowFuelIds.length > 0 && isPlaying) {
      this.elLowFuelBanner.style.display = 'inline-block';
      this.elLowFuelBanner.textContent = `⚠ Sắp cạn dầu (<30): ${lowFuelIds.join(', ')}`;
    } else {
      this.elLowFuelBanner.style.display = 'none';
    }

    const carryCap = sim.getCarryCapacity();
    let motesHtml = '';
    for (let i = 0; i < carryCap; i += 1) {
      motesHtml += `<span class="mote-pip ${i < sim.player.carried ? 'filled' : ''}"></span>`;
    }
    this.elMotes.innerHTML = motesHtml;
    this.elMoteCount.textContent = `${sim.player.carried}/${carryCap}`;

    if (sim.player.charmTicks > 0) {
      this.elDashCard.classList.remove('cooling');
      this.elDashState.textContent = '0s (Bùa Gió)';
    } else if (sim.player.dashCdTicks > 0) {
      this.elDashCard.classList.add('cooling');
      this.elDashState.textContent = `${(sim.player.dashCdTicks / 60).toFixed(1)}s`;
    } else {
      this.elDashCard.classList.remove('cooling');
      this.elDashState.textContent = 'Sẵn sàng';
    }

    if (sim.player.pulseCdTicks > 0) {
      this.elPulseCard.classList.add('cooling');
      this.elPulseState.textContent = `${(sim.player.pulseCdTicks / 60).toFixed(1)}s`;
    } else if (sim.player.carried < sim.tuning.pulse_cost) {
      this.elPulseCard.classList.add('cooling');
      this.elPulseState.textContent = `Cần ${sim.tuning.pulse_cost}`;
    } else {
      this.elPulseCard.classList.remove('cooling');
      this.elPulseState.textContent = 'Sẵn sàng';
    }

    const interactKey = formatKeyCode(normalizeKeybinds(this.settings.keybinds).interact);
    if (nearTarget && isPlaying) {
      if (!nearTarget.lit) {
        const cost = sim.getLanternCost(nearTarget);
        const tag = nearTarget.everLit ? ' (Thắp lại)' : '';
        this.elPrompt.textContent = `${interactKey} — Nạp ánh sáng (${nearTarget.deposited}/${cost})${tag}`;
      } else {
        const fuelInt = Math.round(nearTarget.fuel60 / FUEL_SCALE);
        const warn = nearTarget.fuel60 < LOW_FUEL_60 ? ' ⚠' : '';
        this.elPrompt.textContent = `${interactKey} — Châm dầu ${nearTarget.id} (${fuelInt}/100)${warn}`;
      }
      this.elPrompt.classList.add('visible');
    } else {
      this.elPrompt.classList.remove('visible');
    }

    if (isPlaying && sim.windEnabled && sim.wind.warning) {
      this.elWindBanner.style.display = 'inline-block';
      this.elWindBanner.textContent = '⚠ Gió mạnh sắp thổi — bám chắc mặt đất!';
    } else if (isPlaying && sim.windEnabled && sim.wind.active) {
      this.elWindBanner.style.display = 'inline-block';
      this.elWindBanner.textContent = `Gió mạnh đang thổi (${Math.round(sim.wind.dirDeg)}°)`;
    } else {
      this.elWindBanner.style.display = 'none';
    }

    if (closestPriorityLantern && isPlaying) {
      const proj = renderer.projectToScreen(closestPriorityLantern.pos, 2.4);
      if (!proj.onScreen) {
        positionEdgeArrow(this.elArrow, proj);
      } else {
        this.elArrow.style.display = 'none';
      }
    } else {
      this.elArrow.style.display = 'none';
    }
  }
}
