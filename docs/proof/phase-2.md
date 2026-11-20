# Phase 2 — Bằng chứng kiểm chứng (Proof of Verification)

> Toàn bộ số liệu, mã băm và đầu ra dưới đây được ghi nhận trực tiếp từ lần chạy lệnh thật trên codebase Phase 2 (Contract `v1.1`).

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (`TICKET-02` / Contract `v1.1`) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` (`contract_version: "1.1"`) đồng bộ `DEFAULT_TUNING` | `scripts/verify.js` + `tests/contract.test.js` | So sánh cấu trúc & giá trị chuẩn (`player_speed: 6`, `dash_*`, `night2/3_duration_s`, `score.*`) | **Đạt** |
| Tách sim khỏi render / non-determinism | `tests/unit.test.js` (static code scan) | `src/sim/` và `src/headless/` không chứa `three`, `Math.random`, `Date.now`, DOM | **Đạt** |
| Hồi quy Phase 1 với số liệu chuẩn (`01..06`) | Scenario `01..06` qua headless CLI | Nhặt trần `10`, thắp đèn thắng `948` điểm, Pulse đẩy `4m` choáng `120` tick, hit rơi `50%` thua `no_flames`, `safe_radius=6`, hết giờ thua `dawn` | **Đạt** |
| Lướt (`Dash`) & hồi chiêu `1.5s`, giữ độ cao | Scenario `07-dash-and-cooldown.json` | Lướt tick `11..22` giữ nguyên `Y=0.861`, di chuyển `2.8m`, lần lướt tại tick `30` bị chặn | **Đạt** |
| Rơi khỏi đảo (`Y < -10`) & hồi sinh `60` tick | Scenario `08-fall-and-respawn.json` | Phát `player_hit { by: "fall", flames: 1, dropped: 0, lost: 4 }`, sau `60` tick hồi sinh tại `[0,0,0]` với `invuln: true` | **Đạt** |
| Đêm 2: Cầu tre & Bục nhảy Đảo Cau | Scenario `09` + unit test cầu tre | Cầu tre đi liên tục `x=25→45` ở `Y=0`; bục nhảy `[20,0,18]` đáp gọn trong Đảo B `r<28` | **Đạt** |
| Gió Lạc cướp & thả đom đóm | Scenario `10-drifter-steal-and-drop.json` | Tick `16` phát `drifter_steal (amount: 3, carried: 3)`; tick `21` Pulse phát `drifter_drop (amount: 3)` tạo 3 `dropped` motes | **Đạt** |
| Bùa Gió (`C1`, `7.2 m/s`, Lướt `0s` hồi chiêu) | Scenario `11-charm-speed-and-dash.json` | `charm_picked` (`600` tick), thực hiện 2 lần `dash` liên tiếp trong `40` tick | **Đạt** |
| Đêm 3: Dốc `30°/150°`, Bục nhảy, Tháp chuông & Gió mạnh | Scenario `12` + `tests/unit.test.js` | Leo dốc `30°` lên `Y=3`; tháp chuông chặn `r>=2`; bục nhảy `(0,3,13)` đáp `Y=6`; `wind.active: true` tại tick `1810` | **Đạt** |
| Tạm dừng (`paused` / `resumed`) | Scenario `13-pause-and-resume.json` | Khi `state: "paused"`, `tick` tăng nhưng `sim_tick=5`, `time_left_s`, `dash_cd_s`, `ttl_s` đứng yên hoàn toàn | **Đạt** |
| Tính tất định 3 Đêm (`--night 1, 2, 3`) | `scripts/verify.js` (`--seed 42 --ticks 1400` chạy 2 lần) | Đêm 1 `sha256=3953f9d948bb`, Đêm 2 `sha256=c04c6fd63c6e`, Đêm 3 `sha256=17539de145a1` (giống từng byte) | **Đạt** |
| Hiệu năng headless 1 Đêm đầy đủ (`21.600` tick `<= 30s`) | `scripts/verify.js` & `tests/contract.test.js` | `--night 3 --ticks 21600` hoàn tất trong **`187 ms`** (ngân sách `30.000 ms`) | **Đạt** |
| Build bản web 3D (bảng màu chuẩn, HUD, âm thanh, cài đặt) | `npm run build` (`vite build`) | Đóng gói sạch `dist/index.html` + `dist/assets/index-qFuCZ_Mn.js` trong `1.34s` | **Đạt** |
| FPS thực tế `>= 30 FPS` ở `1280x720` trên trình duyệt | Chạy `npm run dev` ở cửa sổ `1280x720` | Môi trường CLI không có cửa sổ WebGL trực tiếp; cần mở `npm run dev` để xác nhận FPS trực quan | **Chờ đo trực tiếp trên trình duyệt** |

---

## 2. Kết quả chạy `node --test` và `npm run verify`

```text
1..26
# tests 26
# suites 0
# pass 26
# fail 0
# duration_ms 1950.3571

> dao-den-long@0.1.0 verify
> node scripts/verify.js

[PASS] Contract v1.1 Sync: contract_version=1.1 & tuning == DEFAULT_TUNING
[PASS] Unit & Contract Suite: # pass 26
[PASS] Determinism Night 1 (1400 ticks): sha256=3953f9d948bb (304688 bytes)
[PASS] Determinism Night 2 (1400 ticks): sha256=c04c6fd63c6e (311095 bytes)
[PASS] Determinism Night 3 (1400 ticks): sha256=17539de145a1 (340788 bytes)
[PASS] Full Night 3 Performance (21600 ticks <= 30s): 187 ms (639 JSONL lines)
[PASS] Vite Production Build: dist/ built cleanly

Verification Summary: 7/7 passed.
```

---

## 3. Mẫu JSONL thực tế từ Scenario 10 (`10-drifter-steal-and-drop.json`, Night 2)

```json
{"type":"event","tick":0,"name":"night_start","data":{"night":2}}
{"type":"event","tick":16,"name":"drifter_steal","data":{"drifter_id":"D1","amount":3,"carried":3}}
{"type":"snapshot","tick":20,"sim_tick":20,"night":2,"state":"playing","time_left_s":329.667,"score":0,"wind":{"active":false,"dir_deg":0},"player":{"pos":[0,0,0],"vel":[0,0,0],"grounded":true,"flames":3,"carried":3,"invuln":false,"dash_cd_s":0,"pulse_cd_s":0,"charm_s":0},"lanterns":[...],"shades":[],"drifters":[{"id":"D1","pos":[1.6,1.5,0],"state":"flee","stolen":3}],"charms":[{"id":"C1","available":true,"respawn_s":0}],"motes_active":0,"motes":[]}
{"type":"event","tick":21,"name":"drifter_drop","data":{"drifter_id":"D1","amount":3}}
{"type":"event","tick":21,"name":"pulse","data":{"stunned_ids":[]}}
{"type":"snapshot","tick":40,"sim_tick":40,"night":2,"state":"playing","time_left_s":329.333,"score":0,"wind":{"active":false,"dir_deg":0},"player":{"pos":[0,0,0],"vel":[0,0,0],"grounded":true,"flames":3,"carried":0,"invuln":false,"dash_cd_s":0,"pulse_cd_s":2.683,"charm_s":0},"lanterns":[...],"shades":[],"drifters":[{"id":"D1","pos":[3.933,1.5,0],"state":"flee","stolen":0}],"charms":[{"id":"C1","available":true,"respawn_s":0}],"motes_active":3,"motes":[{"id":"M1","pos":[1.6,0,0],"kind":"dropped","ttl_s":7.683},{"id":"M2","pos":[1.6,0,0],"kind":"dropped","ttl_s":7.683},{"id":"M3","pos":[1.6,0,0],"kind":"dropped","ttl_s":7.683}]}
```
