# Phase 3 — Bằng chứng kiểm chứng (Proof of Verification)

> Toàn bộ số liệu, mã băm và dòng JSONL dưới đây được ghi nhận trực tiếp từ lần chạy lệnh thật trên codebase Phase 3 (Contract `v1.2`).

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (`TICKET-03` / Contract `v1.2`) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` (`contract_version: "1.2"`) đồng bộ `DEFAULT_TUNING` | `scripts/verify.js` + `tests/contract.test.js` | Khớp toàn bộ khóa mới (`fuel_max`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`, `night1..3_duration_s`, `score.*`) | **Đạt** |
| Hao dầu `1/s`, tắt đèn `lantern_out`, thắp lại `5` đom đóm (`+40`) | Scenario `14-fuel-decay-burnout-relight.json` | Tick `60` phát `lantern_out (L1)`, `fuel=0`, `ever_lit=true`; tick `81` nạp `5` phát `lantern_lit { relight: true }`, `relit_count=1`, `score=65` | **Đạt** |
| Châm dầu (`refuel`) & đẩy Bóng Mực khi `fuel >= 30` | Scenario `15-refuel-and-safe-push.json` + unit test `fuel=30` | Tick `1` phát `refuel { amount: 5, fuel: 72 }`; `S1` bị đẩy ra `>= 6m` không gây sát thương; đúng `fuel=30` vẫn giữ vùng an toàn | **Đạt** |
| Bóng Mực `drain` (`5/s`), `fuel_drain` mỗi `60` tick, Tỏa Sáng `+15` | Scenario `16-shade-drain-and-pulse-bonus.json` + unit test | Tick `1` Pulse `S2` đang `drain` nhận `+15` điểm; tick `60` `S1` phát `fuel_drain { lantern_id: "L1", shade_id: "S1", fuel: 19 }` | **Đạt** |
| Bỏ thắng sớm `all_lit`; thắng `dawn_survived` khi đạt `>= ceil(0.6*N)` | Scenario `02` & `17-dawn-survived-win.json` + unit test `no_flames` | Thắp đủ `5/5` ở tick `41` vẫn chạy tới tick `120` mới phát `dawn_survived`; `3/5` sáng thắng `364` điểm; `no_flames` luôn ưu tiên trước bình minh | **Đạt** |
| Sức chứa tăng dần `10 + 2 * successful_lights` (tối đa `20`) | Scenario `18-capacity-growth.json` + `tests/unit.test.js` | Sau khi thắp `L1`, `capacity` tăng `10 -> 12` và nhặt được ngay `12` đom đóm; kiểm tra trần `20` | **Đạt** |
| Hồi quy Phase 1–2 (`01, 03, 04, 05, 06..13`) | `tests/contract.test.js` + `tests/unit.test.js` | Toàn bộ hành vi di chuyển, nhảy, Dash, rơi/hồi sinh, Đảo Cau, Gió Lạc, Bùa Gió, Đảo Chuông, Gió mạnh và Tạm dừng đều xanh | **Đạt** |
| Tính tất định 3 Đêm (`--night 1, 2, 3`) | `scripts/verify.js` (`--seed 42 --ticks 1400` chạy 2 lần) | Đêm 1 `sha256=5f632f6b3d20`, Đêm 2 `sha256=7ae059d3e82d`, Đêm 3 `sha256=59d0777e4259` (khớp từng byte) | **Đạt** |
| Hiệu năng headless 1 Đêm 3 đầy đủ (`18.000` tick `<= 30s`) | `scripts/verify.js` | `--night 3 --ticks 18000` hoàn tất trong **`552 ms`** (`1815` dòng JSONL) | **Đạt** |
| Chế độ Mù màu & hiển thị thanh dầu / đèn xẹp rách / nhấp nháy `1 Hz` | `npm run build` + kiểm tra mã `src/game/` | Đóng gói sạch `dist/` qua Vite; kiểm tra trực quan cần mở `npm run dev` | **Chờ chơi thử trực tiếp** |

---

## 2. Kết quả chạy `node --test` và `npm run verify`

```text
1..32
# tests 32
# suites 0
# pass 32
# fail 0
# duration_ms 2713.3208

> dao-den-long@0.1.0 verify
> node scripts/verify.js

[PASS] Contract v1.2 Sync: contract_version=1.2 & tuning == DEFAULT_TUNING
[PASS] Unit & Contract Suite: # pass 32
[PASS] Determinism Night 1 (1400 ticks): sha256=5f632f6b3d20 (336202 bytes)
[PASS] Determinism Night 2 (1400 ticks): sha256=7ae059d3e82d (348478 bytes)
[PASS] Determinism Night 3 (1400 ticks): sha256=59d0777e4259 (384250 bytes)
[PASS] Full Night 3 Performance (18000 ticks <= 30s): 552 ms (1815 JSONL lines)
[PASS] Vite Production Build: dist/ built cleanly

Verification Summary: 7/7 passed.
```

---

## 3. Mẫu JSONL thực tế từ Scenario 14 (`lantern_out`, `relight`) & Scenario 16 (`fuel_drain`, `pulse +15`)

### Scenario 14 (`14-fuel-decay-burnout-relight.json`)
```json
{"type":"event","tick":60,"name":"lantern_out","data":{"lantern_id":"L1"}}
{"type":"snapshot","tick":60,"sim_tick":60,"night":1,"state":"playing","time_left_s":239,"score":0,"wind":{"active":false,"dir_deg":0},"player":{"pos":[0,0,25],"vel":[0,0,0],"grounded":true,"flames":3,"carried":5,"capacity":10,"invuln":false,"dash_cd_s":0,"pulse_cd_s":0,"charm_s":0},"lanterns":[{"id":"L1","pos":[0,0,25],"lit":false,"deposited":0,"fuel":0,"ever_lit":true,"relit_count":0},...]}
{"type":"event","tick":81,"name":"deposit","data":{"lantern_id":"L1","amount":5,"deposited":5}}
{"type":"event","tick":81,"name":"lantern_lit","data":{"lantern_id":"L1","relight":true}}
{"type":"snapshot","tick":90,"sim_tick":90,"night":1,"state":"playing","time_left_s":238.5,"score":65,"wind":{"active":false,"dir_deg":0},"player":{"pos":[0,0,25],"vel":[0,0,0],"grounded":true,"flames":3,"carried":0,"capacity":12,"invuln":false,"dash_cd_s":0,"pulse_cd_s":0,"charm_s":0},"lanterns":[{"id":"L1","pos":[0,0,25],"lit":true,"deposited":5,"fuel":99.9,"ever_lit":true,"relit_count":1},...]}
```

### Scenario 16 (`16-shade-drain-and-pulse-bonus.json`)
```json
{"type":"event","tick":1,"name":"pulse","data":{"stunned_ids":["S2"]}}
{"type":"snapshot","tick":30,"sim_tick":30,"night":1,"state":"playing","time_left_s":239.5,"score":15,"wind":{"active":false,"dir_deg":0},...,"shades":[{"id":"S1","pos":[0,0.8,23.5],"state":"drain"},{"id":"S2","pos":[0,0.8,25],"state":"stunned"}]}
{"type":"event","tick":60,"name":"fuel_drain","data":{"lantern_id":"L1","shade_id":"S1","fuel":19}}
```
