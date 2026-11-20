import { DT } from '../sim/config.js';
import { LanternIslandSim } from '../sim/simulation.js';
import { SoundEngine } from './audio.js';
import { GameHud } from './hud.js';
import { InputController } from './input.js';
import { IslandRenderer } from './renderer.js';

const appEl = document.getElementById('app');
const hudEl = document.getElementById('hud');

const sound = new SoundEngine();
const renderer = new IslandRenderer(appEl);

let runSeed = 2026;
let sim = new LanternIslandSim({ seed: runSeed, night: 1 });
let started = false;
let endShown = false;
let accumulator = 0;
let lastFrameMs = performance.now();

const hud = new GameHud(hudEl, {
  onStart: () => {
    sound.unlock();
    started = true;
    lastFrameMs = performance.now();
  },
  onRestart: () => {
    sound.unlock();
    runSeed += 1;
    sim = new LanternIslandSim({ seed: runSeed, night: 1 });
    endShown = false;
    accumulator = 0;
    started = true;
    hud.resetForNewRun();
    lastFrameMs = performance.now();
  },
  onToggleMute: () => {
    const muted = sound.toggleMute();
    hud.setMuted(muted);
  }
});

const input = new InputController(renderer.renderer.domElement, {
  onMuteToggle: () => {
    const muted = sound.toggleMute();
    hud.setMuted(muted);
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
    } else if (ev.name === 'pulse') {
      sound.playPulse();
      renderer.triggerPulseFx(sim.player.pos);
    } else if (ev.name === 'player_hit') {
      sound.playHit();
    } else if (ev.name === 'game_over') {
      if (ev.data.result === 'won') {
        sound.playWin();
      } else {
        sound.playLose();
      }
      if (!endShown) {
        endShown = true;
        hud.showEndModal(sim, ev.data.reason);
      }
    }
  }
}

function frame(nowMs) {
  const frameDt = Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
  lastFrameMs = nowMs;

  if (started && sim.state === 'playing') {
    accumulator += frameDt;
    while (accumulator >= DT) {
      const tickInput = input.sampleTickInput(DT);
      const events = sim.step(tickInput);
      handleSimEvents(events);
      accumulator -= DT;
      if (sim.state !== 'playing') break;
    }
  }

  renderer.render(sim, input.camYawDeg, frameDt);
  hud.update(sim, input.camYawDeg, frameDt);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
