export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const ISLAND_PLAYABLE_RADIUS = 46;
export const ISLAND_VISUAL_RADIUS = 48;

export const JUMP_VELOCITY = 8.5;
export const GRAVITY = 22.0;

export const INITIAL_MOTE_COUNT = 18;
export const MOTE_REPLENISH_INTERVAL_TICKS = 180;
export const INITIAL_SHADE_COUNT = 2;
export const SHADE_SPAWN_INTERVAL_TICKS = 900;

export const DEFAULT_TUNING = {
  player_speed: 8,
  carry_capacity: 6,
  lantern_cost: 4,
  lantern_count_night1: 5,
  pickup_radius: 2,
  interact_radius: 3.5,
  pulse_cost: 2,
  pulse_radius: 8,
  night1_duration_s: 300,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 6,
  pulse_cooldown_s: 2.5,
  safe_radius: 6,
  shade_speed: 5.5,
  shade_hit_radius: 1.4,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 150,
    per_stun: 25,
    per_second_left: 2,
    per_flame_left: 100
  }
};

export const NIGHT1_LANTERNS = [
  { id: 'L1', pos: [0, 0, 25] },
  { id: 'L2', pos: [23.776, 0, 7.725] },
  { id: 'L3', pos: [14.695, 0, -20.225] },
  { id: 'L4', pos: [-14.695, 0, -20.225] },
  { id: 'L5', pos: [-23.776, 0, 7.725] }
];
