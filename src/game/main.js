import { DT } from '../sim/config.js';
import { LanternIslandSim } from '../sim/simulation.js';
import { SoundEngine } from './audio.js';
import { startBenchMode } from './bench-mode.js';
import { GameHud } from './hud.js';
import { InputController } from './input.js';
import { DEFAULT_KEYBINDS, normalizeKeybinds } from './keybinds.js';
import { addLeaderboardEntry, formatIsoWithOffset, sortAndTrimEntries } from './leaderboard.js';
import { IslandRenderer } from './renderer.js';

const SETTINGS_KEY = 'dao-den-long-settings';
const LEADERBOARD_KEY = 'dao-den-long-leaderboard';

function loadSettings() {
  const defaults = {
    volume: 0.75,
    mouseSensitivity: 1.0,
    pointerLockEnabled: true,
    colorblindMode: false,
    reducedMotion: false,
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS }
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: Number.isFinite(parsed.volume) ? parsed.volume : defaults.volume,
        mouseSensitivity: Number.isFinite(parsed.mouseSensitivity) ? parsed.mouseSensitivity : defaults.mouseSensitivity,
        pointerLockEnabled:
          typeof parsed.pointerLockEnabled === 'boolean' ? parsed.pointerLockEnabled : defaults.pointerLockEnabled,
        colorblindMode: typeof parsed.colorblindMode === 'boolean' ? parsed.colorblindMode : defaults.colorblindMode,
        reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion,
        largeText: typeof parsed.largeText === 'boolean' ? parsed.largeText : defaults.largeText,
        keybinds: normalizeKeybinds(parsed.keybinds)
      };
    }
  } catch {
    // ignore storage errors
  }
  return defaults;
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function loadLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (raw) return sortAndTrimEntries(JSON.parse(raw));
  } catch {
    // ignore
  }
  return [];
}

function saveLocalLeaderboard(entries) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(sortAndTrimEntries(entries)));
  } catch {
    // ignore
  }
}

async function fetchLeaderboardEntries() {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const data = await res.json();
      const entries = sortAndTrimEntries(data.entries || []);
      saveLocalLeaderboard(entries);
      return entries;
    }
  } catch {
    // fallback to localStorage in static-only hosting
  }
  return loadLocalLeaderboard();
}

async function submitLeaderboardScore(entryPayload) {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entryPayload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Không thể lưu bảng xếp hạng');
    }
    saveLocalLeaderboard(data.entries || []);
    return data;
  } catch (err) {
    // Fallback when running as a standalone static file without local API server
    if (err instanceof TypeError || /fetch/i.test(err.message)) {
      const current = loadLocalLeaderboard();
      const res = addLeaderboardEntry(current, entryPayload);
      saveLocalLeaderboard(res.entries);
      return res;
    }
    throw err;
  }
}

const appEl = document.getElementById('app');
const hudEl = document.getElementById('hud');
const urlParams = new URLSearchParams(window.location.search);

if (urlParams.get('bench') === '1') {
  startBenchMode(appEl, hudEl);
} else {
  startNormalGame();
}

function startNormalGame() {
  const settings = loadSettings();
  const sound = new SoundEngine({ volume: settings.volume });
  const renderer = new IslandRenderer(appEl, { reducedMotion: settings.reducedMotion });
  renderer.setColorblindMode(settings.colorblindMode);

  let currentNight = 1;
  let runSeed = 2026;
  let campaignSeed = 2027;
  let totalCampaignScore = 0;
  let nightsWonCount = 0;
  let sim = new LanternIslandSim({ seed: runSeed, night: 1 });
  let phase = 'menu'; // menu | intro | playing | paused | ended
  let accumulator = 0;
  let lastFrameMs = performance.now();
  let lastCountdownSec = null;
  let prevWindWarn = false;
  let prevWindActive = false;

  function prepareNight(night, resetCampaign = false) {
    currentNight = night;
    runSeed += 1;
    if (resetCampaign) {
      totalCampaignScore = 0;
      nightsWonCount = 0;
      campaignSeed = runSeed;
    }
    sim = new LanternIslandSim({ seed: runSeed, night });
    renderer.rebuildMap(night);
    input.exitPointerLock();
    input.resetCameraForNight();
    accumulator = 0;
    lastCountdownSec = null;
    prevWindWarn = false;
    prevWindActive = false;
    phase = 'intro';
    hud.showIntro(night);
  }

  function enterPause() {
    if (phase !== 'playing') return;
    input.exitPointerLock();
    sim.step({ pause: true });
    sim.step({ pause: false });
    phase = 'paused';
    hud.setPaused(true);
  }

  function resumeFromPause() {
    if (phase !== 'paused') return;
    if (sim.state === 'paused') {
      sim.step({ pause: true });
      sim.step({ pause: false });
    }
    phase = 'playing';
    hud.setPaused(false);
    if (settings.pointerLockEnabled) {
      input.requestPointerLock();
    }
    lastFrameMs = performance.now();
  }

  const hud = new GameHud(hudEl, {
    settings,
    onStartCampaign: () => prepareNight(1, true),
    onSelectNight: (n) => prepareNight(n, true),
    onBeginNightPlay: () => {
      sound.unlock();
      sound.startMusic();
      phase = 'playing';
      if (settings.pointerLockEnabled) {
        input.requestPointerLock();
      }
      lastFrameMs = performance.now();
    },
    onResume: resumeFromPause,
    onRestartNight: () => prepareNight(currentNight, false),
    onNextNight: () => prepareNight(Math.min(3, currentNight + 1), false),
    onBackToMenu: () => {
      input.exitPointerLock();
      sound.stopMusic();
      phase = 'menu';
      hud.showMenu();
    },
    onRebindStateChange: (active) => {
      input.setRebinding(active);
    },
    onSettingsChange: (next) => {
      settings.volume = next.volume;
      settings.mouseSensitivity = next.mouseSensitivity;
      settings.pointerLockEnabled = next.pointerLockEnabled;
      settings.colorblindMode = next.colorblindMode;
      settings.reducedMotion = Boolean(next.reducedMotion);
      settings.largeText = Boolean(next.largeText);
      settings.keybinds = normalizeKeybinds(next.keybinds);

      sound.setVolume(settings.volume);
      input.setMouseSensitivity(settings.mouseSensitivity);
      input.setPointerLockEnabled(settings.pointerLockEnabled);
      input.setKeybinds(settings.keybinds);
      renderer.setColorblindMode(settings.colorblindMode);
      renderer.setReducedMotion(settings.reducedMotion);

      hud.syncSettingsUi(settings);
      saveSettings(settings);
    },
    onOpenLeaderboard: async () => {
      const entries = await fetchLeaderboardEntries();
      hud.showLeaderboardModal(entries);
    },
    onSaveLeaderboardScore: async ({ name }) =>
      submitLeaderboardScore({
        name,
        score: totalCampaignScore,
        nights_won: nightsWonCount,
        achieved_at: formatIsoWithOffset(),
        seed: campaignSeed
      })
  });

  function togglePause() {
    if (phase === 'playing') enterPause();
    else if (phase === 'paused') resumeFromPause();
  }

  const input = new InputController(renderer.renderer.domElement, {
    mouseSensitivity: settings.mouseSensitivity,
    pointerLockEnabled: settings.pointerLockEnabled,
    keybinds: settings.keybinds,
    onMuteToggle: () => sound.toggleMute(),
    onPauseToggle: togglePause,
    onPointerLockChange: (locked, { userExited }) => {
      if (!locked && userExited && phase === 'playing') {
        enterPause();
      }
    },
    onPointerLockModeToggle: (enabled) => {
      settings.pointerLockEnabled = enabled;
      hud.syncSettingsUi(settings);
      saveSettings(settings);
      hud.showWhisper(
        enabled
          ? 'Chế độ ẩn chuột xoay 360°: BẬT (Click màn hình để khóa chuột)'
          : 'Chế độ ẩn chuột xoay 360°: TẮT (Giữ kéo chuột để xoay)'
      );
      if (enabled && phase === 'playing') {
        input.requestPointerLock();
      }
    }
  });

  function handleSimEvents(events) {
    for (const ev of events) {
      if (ev.name === 'mote_picked') {
        sound.playMotePickup(ev.data.carried);
      } else if (ev.name === 'deposit') {
        sound.playDeposit();
      } else if (ev.name === 'lantern_lit') {
        const litCount = sim.lanterns.filter((l) => l.lit).length;
        sound.playLanternLit(litCount);
        hud.showWhisper(
          ev.data.relight
            ? `Đã thắp lại ${ev.data.lantern_id}! Sức chứa tăng lên ${sim.getCarryCapacity()}!`
            : `Đã thắp ${ev.data.lantern_id} (${litCount}/${sim.lanterns.length})! Sức chứa: ${sim.getCarryCapacity()}`
        );
      } else if (ev.name === 'refuel') {
        sound.playDeposit();
        hud.showWhisper(`Đã châm dầu ${ev.data.lantern_id} → ${ev.data.fuel}%`);
      } else if (ev.name === 'lantern_out') {
        hud.showWhisper(`⚠ Đèn ${ev.data.lantern_id} đã tắt! Thắp lại chỉ cần 5 đom đóm.`);
      } else if (ev.name === 'pulse') {
        sound.playPulse();
        renderer.triggerPulseFx(sim.player.pos);
        renderer.triggerShake(0.28);
        hud.flashPulse();
      } else if (ev.name === 'dash') {
        sound.playDash();
      } else if (ev.name === 'charm_picked') {
        sound.playCharmPickup();
        hud.showWhisper('Bùa Gió kích hoạt: chạy nhanh hơn & Lướt không hồi chiêu trong 10 giây!');
      } else if (ev.name === 'drifter_steal') {
        sound.playDrifterSteal();
        hud.showWhisper(`Gió Lạc ${ev.data.drifter_id} vừa cướp ${ev.data.amount} đom đóm! Dùng Tỏa Sáng để lấy lại!`);
      } else if (ev.name === 'shade_spawned') {
        sound.playShadeSpawn();
        const spawnedShade = sim.shades.find((s) => s.id === ev.data.id);
        hud.showShadeSpawnAlert(ev.data.id, spawnedShade?.pos ?? null);
      } else if (ev.name === 'player_hit') {
        sound.playHit();
        renderer.triggerShake(0.55);
        hud.flashHit();
      } else if (ev.name === 'game_over') {
        input.exitPointerLock();
        phase = 'ended';
        if (ev.data.result === 'won') {
          totalCampaignScore += sim.score;
          nightsWonCount += 1;
          sound.playWin();
        } else {
          sound.playLose();
        }
        hud.showEndModal(sim, ev.data.reason, {
          totalCampaignScore,
          nightsWonCount,
          isCampaignWin: ev.data.result === 'won' && currentNight === 3
        });
      }
    }
  }

  function frame(nowMs) {
    const frameDt = Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;

    if (phase === 'playing' && sim.state === 'playing') {
      accumulator += frameDt;
      while (accumulator >= DT) {
        const prevGrounded = sim.player.grounded;
        const prevLaunched = sim.player.launched;
        const tickInput = input.sampleTickInput(DT);
        const events = sim.step(tickInput);

        if (prevGrounded && !sim.player.grounded && sim.player.launched && !prevLaunched) {
          sound.playJumpPad();
        } else if (prevGrounded && !sim.player.grounded && tickInput.jump) {
          sound.playJump();
        }

        if (sim.windEnabled) {
          if ((sim.wind.warning && !prevWindWarn) || (sim.wind.active && !prevWindActive)) {
            sound.playWindGust();
          }
          prevWindWarn = sim.wind.warning;
          prevWindActive = sim.wind.active;
        }

        const secLeft = Math.ceil(sim.timeLeftS);
        if (secLeft <= 10 && secLeft >= 1 && secLeft !== lastCountdownSec) {
          lastCountdownSec = secLeft;
          sound.playCountdownTick();
        }

        handleSimEvents(events);
        accumulator -= DT;
        if (sim.state !== 'playing') break;
      }
    }

    renderer.render(sim, input.getCameraState(), frameDt);
    hud.update(sim, renderer, frameDt, { phase, input });

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
