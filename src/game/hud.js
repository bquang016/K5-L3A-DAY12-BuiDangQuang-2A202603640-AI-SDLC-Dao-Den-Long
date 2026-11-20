import { ISLAND_VISUAL_RADIUS } from '../sim/config.js';
import { distXZ } from '../sim/math.js';

const STORY_WHISPERS = [
  'Ánh đèn đầu tiên thức giấc — tiếng sóng Đảo Bến khẽ ngân vang.',
  'Sương đen lùi bước; những cánh thông đêm bắt đầu ánh vàng ấm.',
  'Hơi ấm lan qua con đường đá cũ, dẫn lối người giữ đèn nhỏ.',
  'Bốn ngọn hải đăng nhỏ hòa ánh sáng, bầu trời đêm bớt lạnh giá.',
  'Cả Đảo Bến rực sáng — đêm nay sương mù không thể chạm tới nữa!'
];

export class GameHud {
  constructor(root, { onStart, onRestart, onToggleMute } = {}) {
    this.root = root;
    this.onStart = onStart;
    this.onRestart = onRestart;
    this.onToggleMute = onToggleMute;

    this.whisperTimer = 0;
    this.lastLitCount = 0;

    this._buildDom();
  }

  _buildDom() {
    this.root.innerHTML = `
      <div class="hud-row">
        <div class="hud-panel">
          <div class="stat-line">
            <span class="label">Ngọn lửa</span>
            <div class="flames-row" id="hud-flames"></div>
          </div>
          <div class="stat-line">
            <span class="label">Ánh sáng</span>
            <div class="mote-bar" id="hud-motes"></div>
            <span id="hud-mote-count" style="font-size:13px;color:#ffe29a;">0/6</span>
          </div>
          <div class="stat-line">
            <div class="pulse-badge" id="hud-pulse">[Shift] Tỏa sáng (2 đom đóm)</div>
          </div>
        </div>

        <div class="hud-panel" style="text-align:right;">
          <div class="stat-line" style="justify-content:flex-end;">
            <span class="label">Đèn Lồng</span>
            <div class="lantern-pips" id="hud-lanterns"></div>
            <span class="value-strong" id="hud-lantern-count">0/5</span>
          </div>
          <div class="stat-line" style="justify-content:flex-end;">
            <span class="label">Bình minh</span>
            <span class="value-strong" id="hud-timer">05:00</span>
            <span class="label" style="margin-left:8px;">Điểm</span>
            <span class="value-strong" id="hud-score">0</span>
          </div>
        </div>
      </div>

      <div class="hud-row" style="align-items:flex-end;">
        <div class="hud-panel" style="padding:8px;">
          <canvas id="compass-canvas" width="128" height="128"></canvas>
        </div>

        <div class="bottom-center">
          <div class="whisper-banner" id="hud-whisper"></div>
          <div class="prompt-pill" id="hud-prompt"></div>
        </div>

        <div class="hud-panel controls-box">
          <div><strong>WASD / Mũi tên</strong> Di chuyển · <strong>Space</strong> Nhảy</div>
          <div><strong>F / Enter</strong> Nạp đèn · <strong>Shift / X</strong> Tỏa sáng</div>
          <div><strong>Q / E</strong> hoặc <strong>Kéo chuột</strong> Xoay góc nhìn</div>
          <button class="hud-btn" id="hud-mute-btn">[M] Âm thanh: Bật</button>
        </div>
      </div>

      <div class="modal-backdrop" id="start-modal">
        <div class="modal-card">
          <h1>Đảo Đèn Lồng</h1>
          <p style="color:#ffd88c;font-weight:600;">Đêm 1 · Đảo Bến</p>
          <p>
            Sương đen đã nuốt trọn ánh sáng của đảo. Hãy cùng <strong>Mây</strong> thu thập
            những đốm sáng đom đóm, thắp lại cả <strong>5 Đèn Lồng Lớn</strong> và dùng ánh sáng
            để xua đuổi <strong>Bóng Mực</strong>.
          </p>
          <button class="primary-btn" id="start-btn">Bắt đầu đêm giữ đèn</button>
        </div>
      </div>

      <div class="modal-backdrop hidden" id="end-modal">
        <div class="modal-card">
          <h1 id="end-title">Hoàn thành</h1>
          <p id="end-subtitle"></p>
          <div class="breakdown" id="end-breakdown"></div>
          <button class="primary-btn" id="restart-btn">Chơi lại</button>
        </div>
      </div>
    `;

    this.elFlames = this.root.querySelector('#hud-flames');
    this.elMotes = this.root.querySelector('#hud-motes');
    this.elMoteCount = this.root.querySelector('#hud-mote-count');
    this.elPulse = this.root.querySelector('#hud-pulse');
    this.elLanterns = this.root.querySelector('#hud-lanterns');
    this.elLanternCount = this.root.querySelector('#hud-lantern-count');
    this.elTimer = this.root.querySelector('#hud-timer');
    this.elScore = this.root.querySelector('#hud-score');
    this.elPrompt = this.root.querySelector('#hud-prompt');
    this.elWhisper = this.root.querySelector('#hud-whisper');
    this.elMuteBtn = this.root.querySelector('#hud-mute-btn');
    this.elStartModal = this.root.querySelector('#start-modal');
    this.elEndModal = this.root.querySelector('#end-modal');
    this.elEndTitle = this.root.querySelector('#end-title');
    this.elEndSubtitle = this.root.querySelector('#end-subtitle');
    this.elEndBreakdown = this.root.querySelector('#end-breakdown');

    this.compassCtx = this.root.querySelector('#compass-canvas').getContext('2d');

    this.root.querySelector('#start-btn').addEventListener('click', () => {
      this.elStartModal.classList.add('hidden');
      if (this.onStart) this.onStart();
    });
    this.root.querySelector('#restart-btn').addEventListener('click', () => {
      this.elEndModal.classList.add('hidden');
      if (this.onRestart) this.onRestart();
    });
    this.elMuteBtn.addEventListener('click', () => {
      if (this.onToggleMute) this.onToggleMute();
    });
  }

  setMuted(muted) {
    this.elMuteBtn.textContent = `[M] Âm thanh: ${muted ? 'Tắt' : 'Bật'}`;
  }

  showWhisper(text) {
    this.elWhisper.textContent = text;
    this.elWhisper.classList.add('visible');
    this.whisperTimer = 4.5;
  }

  resetForNewRun() {
    this.lastLitCount = 0;
    this.whisperTimer = 0;
    this.elWhisper.classList.remove('visible');
    this.elEndModal.classList.add('hidden');
  }

  update(sim, camYawDeg, dt) {
    if (this.whisperTimer > 0) {
      this.whisperTimer -= dt;
      if (this.whisperTimer <= 0) {
        this.elWhisper.classList.remove('visible');
      }
    }

    // Flames
    let flamesHtml = '';
    for (let i = 0; i < sim.tuning.flames; i += 1) {
      flamesHtml += `<span class="flame-pip ${i < sim.player.flames ? '' : 'lost'}"></span>`;
    }
    this.elFlames.innerHTML = flamesHtml;

    // Motes carried
    let motesHtml = '';
    for (let i = 0; i < sim.tuning.carry_capacity; i += 1) {
      motesHtml += `<span class="mote-pip ${i < sim.player.carried ? 'filled' : ''}"></span>`;
    }
    this.elMotes.innerHTML = motesHtml;
    this.elMoteCount.textContent = `${sim.player.carried}/${sim.tuning.carry_capacity}`;

    // Pulse status
    if (sim.player.pulseCooldownTicks > 0) {
      const s = (sim.player.pulseCooldownTicks / 60).toFixed(1);
      this.elPulse.textContent = `Tỏa sáng hồi chiêu: ${s}s`;
      this.elPulse.classList.add('dim');
    } else if (sim.player.carried < sim.tuning.pulse_cost) {
      this.elPulse.textContent = `[Shift] Tỏa sáng (cần ${sim.tuning.pulse_cost} đom đóm)`;
      this.elPulse.classList.add('dim');
    } else {
      this.elPulse.textContent = '[Shift] Tỏa sáng sẵn sàng!';
      this.elPulse.classList.remove('dim');
    }

    // Lanterns
    let litCount = 0;
    let lanternsHtml = '';
    let nearbyUnlit = null;
    let bestDist = Infinity;

    for (const l of sim.lanterns) {
      if (l.lit) {
        litCount += 1;
      } else {
        const d = distXZ(sim.player.pos, l.pos);
        if (d <= sim.tuning.interact_radius && d < bestDist) {
          bestDist = d;
          nearbyUnlit = l;
        }
      }
      lanternsHtml += `<span class="lantern-pip ${l.lit ? 'lit' : ''}"></span>`;
    }
    this.elLanterns.innerHTML = lanternsHtml;
    this.elLanternCount.textContent = `${litCount}/${sim.lanterns.length}`;

    if (litCount > this.lastLitCount && litCount <= STORY_WHISPERS.length) {
      this.lastLitCount = litCount;
      this.showWhisper(STORY_WHISPERS[litCount - 1]);
    }

    // Context prompt
    if (nearbyUnlit && sim.player.carried > 0 && sim.state === 'playing') {
      this.elPrompt.textContent = `[F] Nạp ánh sáng vào ${nearbyUnlit.id} (${nearbyUnlit.deposited}/${sim.tuning.lantern_cost})`;
      this.elPrompt.classList.add('visible');
    } else if (nearbyUnlit && sim.player.carried === 0 && sim.state === 'playing') {
      this.elPrompt.textContent = `Đèn ${nearbyUnlit.id} (${nearbyUnlit.deposited}/${sim.tuning.lantern_cost}) — cần thêm đom đóm`;
      this.elPrompt.classList.add('visible');
    } else {
      this.elPrompt.classList.remove('visible');
    }

    // Timer & Score
    const totalSec = Math.ceil(sim.timeLeftS);
    const min = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const sec = String(totalSec % 60).padStart(2, '0');
    this.elTimer.textContent = `${min}:${sec}`;
    this.elTimer.classList.toggle('timer-warn', totalSec <= 45);
    this.elScore.textContent = String(sim.score);

    this._drawCompass(sim, camYawDeg);
  }

  _drawCompass(sim, camYawDeg) {
    const ctx = this.compassCtx;
    const size = 128;
    const cx = size / 2;
    const cy = size / 2;
    const scale = 56 / ISLAND_VISUAL_RADIUS;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20, 26, 48, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 203, 107, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Motes
    ctx.fillStyle = 'rgba(255, 224, 130, 0.65)';
    for (const m of sim.motes) {
      ctx.beginPath();
      ctx.arc(cx + m.pos[0] * scale, cy + m.pos[2] * scale, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lanterns
    for (const l of sim.lanterns) {
      ctx.beginPath();
      ctx.arc(cx + l.pos[0] * scale, cy + l.pos[2] * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = l.lit ? '#ffbe4f' : '#585a7a';
      ctx.fill();
      if (l.lit) {
        ctx.strokeStyle = 'rgba(255, 203, 107, 0.45)';
        ctx.stroke();
      }
    }

    // Shades
    for (const s of sim.shades) {
      ctx.beginPath();
      ctx.arc(cx + s.pos[0] * scale, cy + s.pos[2] * scale, 3, 0, Math.PI * 2);
      ctx.fillStyle = s.state === 'stunned' ? '#ffe07d' : '#c76bff';
      ctx.fill();
    }

    // Player & camera forward indicator
    const px = cx + sim.player.pos[0] * scale;
    const py = cy + sim.player.pos[2] * scale;
    const theta = (camYawDeg * Math.PI) / 180;
    const fwdX = -Math.sin(theta);
    const fwdZ = -Math.cos(theta);

    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + fwdX * 10, py + fwdZ * 10);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  showEndModal(sim, reason) {
    const won = sim.state === 'won';
    this.elEndTitle.textContent = won ? 'Đảo Bến Rực Sáng!' : 'Ngọn Đèn Đã Tắt';
    if (won) {
      this.elEndSubtitle.textContent =
        'Bạn đã thắp sáng cả 5 Đèn Lồng Lớn trước bình minh và bảo vệ hòn đảo khỏi sương đen.';
    } else if (reason === 'dawn') {
      this.elEndSubtitle.textContent = 'Bình minh đã tới trước khi cả 5 ngọn đèn được thắp sáng.';
    } else {
      this.elEndSubtitle.textContent = 'Mây đã mất hết ngọn lửa ấm áp trước sự truy đuổi của Bóng Mực.';
    }

    const b = sim.scoreBreakdown;
    this.elEndBreakdown.innerHTML = `
      <div class="breakdown-row"><span>Nhặt đom đóm</span><span>+${b.motes}</span></div>
      <div class="breakdown-row"><span>Thắp Đèn Lồng Lớn</span><span>+${b.lanterns}</span></div>
      <div class="breakdown-row"><span>Làm choáng Bóng Mực</span><span>+${b.stuns}</span></div>
      <div class="breakdown-row"><span>Thời gian còn lại</span><span>+${b.timeBonus}</span></div>
      <div class="breakdown-row"><span>Ngọn lửa còn lại</span><span>+${b.flameBonus}</span></div>
      <div class="breakdown-row total"><span>Tổng điểm</span><span>${sim.score}</span></div>
    `;

    this.elEndModal.classList.remove('hidden');
  }
}
