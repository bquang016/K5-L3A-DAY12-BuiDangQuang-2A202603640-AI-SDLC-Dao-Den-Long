import fs from 'node:fs';
import path from 'node:path';
import { LanternIslandSim } from '../sim/simulation.js';
import { validateInputs, validateScenario, ValidationError } from '../sim/validator.js';

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      fail(`Unexpected argument: ${token}`, 1);
    }
    const key = token.slice(2);
    if (i + 1 >= argv.length) {
      fail(`Missing value for --${key}`, 1);
    }
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function parseIntStrict(raw, name) {
  if (raw === undefined) {
    fail(`Missing required argument --${name}`, 1);
  }
  if (!/^-?\d+$/.test(String(raw))) {
    fail(`Invalid integer for --${name}: ${raw}`, 1);
  }
  return Number.parseInt(raw, 10);
}

function loadJsonFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    fail(`Failed to read ${label} file (${filePath}): ${err.message}`, 1);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`Invalid JSON in ${label} file (${filePath}): ${err.message}`, 2);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const seed = parseIntStrict(args.seed, 'seed');
  const night = parseIntStrict(args.night, 'night');
  if (![1, 2, 3].includes(night)) {
    fail(`Unsupported --night ${night}. Supported nights are 1, 2, 3.`, 1);
  }

  const ticks = parseIntStrict(args.ticks, 'ticks');
  if (ticks < 0) {
    fail(`--ticks must be >= 0 (got ${ticks})`, 1);
  }

  if (!args.out) {
    fail('Missing required argument --out <file.jsonl>', 1);
  }

  const snapshotEvery = args['snapshot-every'] !== undefined
    ? parseIntStrict(args['snapshot-every'], 'snapshot-every')
    : 10;
  if (snapshotEvery < 1) {
    fail(`--snapshot-every must be >= 1 (got ${snapshotEvery})`, 1);
  }

  let scenario = null;
  if (args.scenario !== undefined) {
    scenario = loadJsonFile(args.scenario, 'scenario');
    try {
      validateScenario(scenario, night);
    } catch (err) {
      if (err instanceof ValidationError) {
        fail(`Invalid scenario schema: ${err.message}`, 2);
      }
      fail(`Scenario validation failed: ${err.message}`, 1);
    }
  }

  let frames = [];
  if (args.inputs !== undefined) {
    const inputsData = loadJsonFile(args.inputs, 'inputs');
    try {
      validateInputs(inputsData);
    } catch (err) {
      if (err instanceof ValidationError) {
        fail(`Invalid inputs schema: ${err.message}`, 2);
      }
      fail(`Inputs validation failed: ${err.message}`, 1);
    }
    frames = inputsData.frames;
  }

  const sim = new LanternIslandSim({ seed, night, scenario });
  const lines = [
    JSON.stringify(sim.getSnapshot()),
    JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night } })
  ];

  const currentInput = {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false
  };
  let frameIdx = 0;

  for (let k = 0; k < ticks; k += 1) {
    if (sim.state === 'won' || sim.state === 'lost') break;

    if (frameIdx < frames.length && frames[frameIdx].tick === k) {
      const f = frames[frameIdx];
      if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
      if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
      if (f.jump !== undefined) currentInput.jump = f.jump;
      if (f.interact !== undefined) currentInput.interact = f.interact;
      if (f.pulse !== undefined) currentInput.pulse = f.pulse;
      if (f.dash !== undefined) currentInput.dash = f.dash;
      if (f.pause !== undefined) currentInput.pause = f.pause;
      frameIdx += 1;
    }

    const events = sim.step(currentInput);
    for (const ev of events) {
      lines.push(JSON.stringify(ev));
    }

    if (sim.tick % snapshotEvery === 0) {
      lines.push(JSON.stringify(sim.getSnapshot()));
    }

    if (sim.state === 'won' || sim.state === 'lost') break;
  }

  lines.push(JSON.stringify(sim.getEndRecord()));

  try {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, `${lines.join('\n')}\n`, 'utf8');
  } catch (err) {
    fail(`Failed to write output file (${args.out}): ${err.message}`, 1);
  }
}

main();
