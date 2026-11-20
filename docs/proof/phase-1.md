# Phase 1 — Bằng chứng kiểm chứng (Proof of Verification)

> Tất cả kết quả dưới đây được ghi nhận trực tiếp từ lần chạy lệnh thật trên codebase hiện tại (không chỉnh sửa thủ công).

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (PRD-0 / Contract v1.0) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` hợp lệ & đồng bộ `tuning` | `scripts/verify.js` + `tests/contract.test.js` | So sánh `contract.tuning === DEFAULT_TUNING` | **Đạt** |
| Chạy 60Hz cố định, tách sim khỏi render/ngẫu nhiên hệ thống | `tests/unit.test.js` (static code scan + step math) | Không chứa `three`, `Math.random`, `Date.now`, DOM trong `src/sim/` và `src/headless/` | **Đạt** |
| Nhặt đom đóm & giới hạn `carry_capacity: 6` | Scenario 01 (`01-mote-pickup.json`) qua headless CLI | 6 sự kiện `mote_picked`, đom đóm thứ 7 giữ nguyên (`motes_active: 1`), `score: 60` | **Đạt** |
| Nạp ánh sáng, thắp đủ 5 đèn → thắng + cộng điểm thưởng | Scenario 02 (`02-light-lantern-win.json`) qua headless CLI | Phát `deposit`, `lantern_lit`, `game_over (won/all_lit)` tại tick `31`, `score: 1048` | **Đạt** |
| Tỏa sáng (`pulse`) làm choáng, đẩy lùi, hồi chiêu & tỉnh lại | Scenario 03 (`03-pulse-stun-push.json`) qua headless CLI | Chỉ 1 `pulse` tại tick `1`, `S1` ở `[11,0,0]` trạng thái `stunned`, tới tick `190` hồi `chase` | **Đạt** |
| Bóng Mực đuổi, va chạm rơi sáng, bất tử `1.5s`, thua `no_flames` | Scenario 04 (`04-shade-hit-loss.json`) qua headless CLI | 2 `player_hit` cách nhau `>= 90` tick, rơi `2` đom đóm lần đầu, kết thúc `lost/no_flames` | **Đạt** |
| Vùng an toàn `safe_radius: 6m` quanh đèn đã sáng | Scenario 05 (`05-safe-zone.json`) + unit test `flee` | Chạy `300` tick: `0` lần `player_hit`, mọi snapshot `distXZ(S1, L1) >= 6.0` | **Đạt** |
| Hết giờ bình minh → thua `dawn` | Scenario 06 (`06-dawn-loss.json`) qua headless CLI | Dừng đúng tick `120` với `game_over (lost/dawn)` | **Đạt** |
| Sinh Bóng Mực theo chu kỳ (`shade_spawned`) | `tests/contract.test.js` (kịch bản 950 tick) | Phát sự kiện `shade_spawned` tại tick `900` | **Đạt** |
| Tính tất định theo `--seed` (byte-for-byte) | Chạy CLI 2 lần `--seed 42 --night 1 --ticks 600` | `sha256=36a93e5c08a3` (`62946 bytes`) giống hệt 100% | **Đạt** |
| Mã thoát lỗi CLI (`exit 2` sai JSON/schema, khác `0` thiếu tham số) | `tests/contract.test.js` | Bad JSON, non-monotonic ticks, `move=[2,0]`, bad lantern ID → `exit 2`; thiếu cờ → `exit 1` | **Đạt** |
| Đóng gói bản web 3D (Three.js + HUD + Audio + Creative) | `npm run build` (`vite build`) | Tạo sạch `dist/index.html` và `dist/assets/index-CPHNrOvY.js` trong `1.07s` | **Đạt** |
| Trải nghiệm chơi thử trực tiếp trên trình duyệt WebGL | Chạy `npm run dev` (Three.js + HUD + Web Audio) | Bản build sạch; chơi thử trực quan để xác nhận cảm giác điều khiển do người dùng kiểm tra khi chạy `npm run dev` | **Chờ chơi thử thủ công** |

---

## 2. Kết quả chạy thực tế `node --test` và `npm run verify`

```text
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# duration_ms 987.4329

> dao-den-long@0.1.0 verify
> node scripts/verify.js

[PASS] Contract Tuning Sync: game.contract.json == DEFAULT_TUNING
[PASS] Unit & Contract Suite: # pass 17
[PASS] Headless Determinism (seed=42, 600 ticks): sha256=36a93e5c08a3 (62946 bytes)
[PASS] Vite Production Build: dist/ built cleanly

Verification Summary: 4/4 passed.
```

---

## 3. Mẫu JSONL thực tế từ Scenario 02 (`02-light-lantern-win.json`)

Lệnh chạy:
```bash
node src/headless/cli.js --seed 1 --night 1 \
  --scenario tests/scenarios/02-light-lantern-win.json \
  --inputs tests/scenarios/02-light-lantern-win.inputs.json \
  --ticks 120 --out tmp/sample-s02.jsonl
```

Output thực tế:
```json
{"type":"snapshot","tick":0,"sim_tick":0,"state":"playing","time_left_s":300,"score":0,"player":{"pos":[0,0,20],"flames":3,"carried":4},"lanterns":[{"id":"L1","pos":[0,0,25],"lit":false,"deposited":0},{"id":"L2","pos":[23.776,0,7.725],"lit":true,"deposited":4},{"id":"L3","pos":[14.695,0,-20.225],"lit":true,"deposited":4},{"id":"L4","pos":[-14.695,0,-20.225],"lit":true,"deposited":4},{"id":"L5","pos":[-23.776,0,7.725],"lit":true,"deposited":4}],"shades":[],"motes_active":0,"motes":[]}
{"type":"snapshot","tick":10,"sim_tick":10,"state":"playing","time_left_s":299.833,"score":0,"player":{"pos":[0,0,21.333],"flames":3,"carried":4},"lanterns":[...],"shades":[],"motes_active":0,"motes":[]}
{"type":"snapshot","tick":20,"sim_tick":20,"state":"playing","time_left_s":299.667,"score":0,"player":{"pos":[0,0,22.667],"flames":3,"carried":4},"lanterns":[...],"shades":[],"motes_active":0,"motes":[]}
{"type":"snapshot","tick":30,"sim_tick":30,"state":"playing","time_left_s":299.5,"score":0,"player":{"pos":[0,0,24],"flames":3,"carried":4},"lanterns":[...],"shades":[],"motes_active":0,"motes":[]}
{"type":"event","tick":31,"name":"deposit","data":{"lantern_id":"L1","amount":4,"deposited":4}}
{"type":"event","tick":31,"name":"lantern_lit","data":{"lantern_id":"L1"}}
{"type":"event","tick":31,"name":"game_over","data":{"result":"won","reason":"all_lit"}}
{"type":"end","ticks":31,"state":"won","score":1048}
```
