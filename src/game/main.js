import { DT } from '../sim/config.js';
import { LanternIslandSim } from '../sim/simulation.js';
import { SoundEngine } from './audio.js';
import { GameHud } from './hud.js';
import { InputController } from './input.js';
import { IslandRenderer } from './renderer.js';

const SETTINGS_KEY = 'dao-den-long-settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: Number.isFinite(parsed.volume) ? parsed.volume : 0.75,
        mouseSensitivity: Number.isFinite(parsed.mouseSensitivity) ? parsed.mouseSensitivity : 1.0
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 0.75, mouseSensitivity: 1.0 };
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

const appEl = document.getElementById('app');
const hudEl = document.getElementById('hud');

const settings = loadSettings();
const sound = new SoundEngine({ volume: settings.volume });
const renderer = new IslandRenderer(appEl);

let currentNight = 1;
let runSeed = 2026;
let totalCampaignScore = 0;
let sim = new LanternIslandSim({ seed: runSeed, night: 1 });
let phase = 'menu'; // menu | intro | playing | paused | ended
let accumulator = 0;
let lastFrameMs = performance.now();
let lastCountdownSec = null;
let prevWindWarn = false;
let prevWindActive = false;

function prepareNight(night, resetCampaign = false) {
  currentNight = night;
  if (resetCampaign) totalCampaignScore = 0;
  runSeed += 1;
  sim = new LanternIslandSim({ seed: runSeed, night });
  renderer.rebuildMap(night);
  input.resetCameraForNight();
  accumulator = 0;
  lastCountdownSec = null;
  prevWindWarn = false;
  prevWindActive = false;
  phase = 'intro';
  hud.showIntro(night);
}

const hud = new GameHud(hudEl, {
  settings,
  onStartCampaign: () => prepareNight(1, true),
  onSelectNight: (n) => prepareNight(n, true),
  onBeginNightPlay: () => {
    sound.unlock();
    sound.startMusic();
    phase = 'playing';
    lastFrameMs = performance.now();
  },
  onResume: () => {
    if (sim.state === 'paused') {
      sim.step({ pause: true });
      sim.step({ pause: false });
    }
    phase = 'playing';
    hud.setPaused(false);
    lastFrameMs = performance.now();
  },
  onRestartNight: () => {
    prepareNight(currentNight, false);
  },
  onNextNight: () => {
    prepareNight(Math.min(3, currentNight + 1), false);
  },
  onBackToMenu: () => {
    sound.stopMusic();
    phase = 'menu';
    hud.showMenu();
  },
  onSettingsChange: (next) => {
    settings.volume = next.volume;
    settings.mouseSensitivity = next.mouseSensitivity;
    sound.setVolume(settings.volume);
    input.setMouseSensitivity(settings.mouseSensitivity);
    saveSettings(settings);
  }
});

function togglePause() {
  if (phase === 'playing') {
    sim.step({ pause: true });
    sim.step({ pause: false });
    phase = 'paused';
    hud.setPaused(true);
  } else if (phase === 'paused') {
    sim.step({ pause: true });
    sim.step({ pause: false });
    phase = 'playing';
    hud.setPaused(false);
    lastFrameMs = performance.now();
  }
}

const input = new InputController(renderer.renderer.domElement, {
  mouseSensitivity: settings.mouseSensitivity,
  onMuteToggle: () => sound.toggleMute(),
  onPauseToggle: togglePause
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
      hud.showWhisper(`Đã thắp ${ev.data.lantern_id} (${litCount}/${sim.lanterns.length})!`);
    } else if (ev.name === 'pulse') {
      sound.playPulse();
      renderer.triggerPulseFx(sim.player.pos);
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
    } else if (ev.name === 'player_hit') {
      sound.playHit();
    } else if (ev.name === 'game_over') {
      phase = 'ended';
      if (ev.data.result === 'won') {
        totalCampaignScore += sim.score;
        sound.playWin();
      } else {
        sound.playLose();
      }
      hud.showEndModal(sim, ev.data.reason, {
        totalCampaignScore,
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

  renderer.render(sim, input.camYawDeg, frameDt);
  hud.update(sim, renderer, frameDt);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
