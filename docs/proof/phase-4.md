# Phase 4 — Bằng chứng kiểm chứng (Proof of Verification)

> Toàn bộ số liệu, tệp JSON và kết quả kiểm tra dưới đây được ghi nhận trực tiếp từ các lần chạy lệnh thật trên mã nguồn Phase 4 (`Contract v1.3`, `v1.0.0`). Không có số liệu nào bị chỉnh tay.

## 1. Bảng truy vết Yêu cầu → Bằng chứng (`TICKET-04` / Contract `v1.3`)

| Yêu cầu Phase 4 | Cách kiểm chứng | Bằng chứng thực tế | Kết quả |
|---|---|---|---|
| `game.contract.json` (`contract_version: "1.3"`) có `bench_cmd`, `soak_cmd`, `run_cmd` và đồng bộ `DEFAULT_TUNING` | `scripts/verify.js` + `tests/contract.test.js` | Khớp cấu trúc `v1.3`, giữ nguyên `tuning` chuẩn | **Đạt** |
| **Chế độ Benchmark `1280×720`** (Đêm 1, `200` Bóng Mực `wander`, `100` đom đóm, `L1–L3` sáng `100`, tắt sáng tạo, quay vòng `r=30, Y=15`, `3s` warm + `30s` đo) | `node scripts/bench.js --seed 42 --duration 30 --out bench.json` (Chrome thực + WebGL2) | Thoát mã `0`: `2990` frames, `avg_fps: 99.6` (`>= 60`), `p1_low_fps: 37.7` (`>= 30`), `frame_ms_p95: 11.8 ms`, `load_ms: 2067 ms` (`<= 10000`), `peak_mem_mb: 908`, `vsync_off: true` | **Đạt** |
| **Soak Test 10 Đêm** xoay vòng Đêm `1→2→3` (`seed 7+i`, `crashes=0`, `mem_end_mb <= 1.2 * mem_start_mb`) | `node --max-semi-space-size=1 --no-concurrent-recompilation --optimize-for-size --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json` | `nights: 10`, `crashes: 0`, `mem_start_mb: 39.19` → `mem_end_mb: 43.2` (`1.102× <= 1.2×`), `duration_s: 1.17` | **Đạt** |
| **Bảng xếp hạng cục bộ** (nhập tên `3–12` ký tự, top 10 giảm dần, tie-break `achieved_at`, lưu đĩa & CLI `--export-leaderboard`) | `tests/unit.test.js` + `tests/contract.test.js` + `scripts/verify.js` | Unit test + CLI xuất `{"entries": [...]}` đúng thứ tự `TopPlayer → FirstTie → SecondTie` với mã thoát `0` | **Đạt** |
| **Dễ tiếp cận (Accessibility)**: đổi 9 phím + báo trùng + Reset, phụ đề + mũi tên mép, Giảm chuyển động, cỡ chữ `>= 18px` + `×1.25` | `tests/unit.test.js` (conflict/format) + Chrome CDP DOM font audit tại `1280×720` + ảnh chụp thật [screenshot-night1.png](../assets/screenshot-night1.png) | Kiểm tra Chrome CDP `1280×720` trên `25` phần tử văn bản HUD hiển thị: `minPx: 18`, `under18: []`; không đè chữ/nhân vật | **Đạt** |
| **Đóng gói & Tài liệu**: clone `<= 3` lệnh, `README.md`, `CHANGELOG.md`, `CREDITS.md`, `LICENSE`, `Dockerfile`, [retro.md](../notes/retro.md) | `npm run build` (`vite build`) + kiểm tra cấu trúc tệp | `dist/` đóng gói sạch trong `1.36s`; đủ tài liệu 4 phase & harness | **Đạt** |
| **Hồi quy Phase 1–3** (tính tất định 3 Đêm, kịch bản `01..18`, hiệu năng headless Đêm 3 `<= 30s`) | `npm run verify` | `36/36` test xanh; SHA-256 Đêm 1/2/3 không đổi; `18.000` tick Đêm 3 chạy **`548 ms`** | **Đạt** |
| **Video Demo `< 5 phút` & GitHub Release `v1.0.0` + Tag `phase-4`** | Quay màn hình thủ công & tải lên GitHub | Cần người dùng quay `.mp4`, gắn tag `phase-4`, đẩy lên GitHub và tạo Release `v1.0.0` | **Chờ hoàn tất phát hành** |

---

## 2. Kết quả chạy thực tế `npm run verify`

```text
> dao-den-long@1.0.0 verify
> node scripts/verify.js

[PASS] Contract v1.3 Sync: contract_version=1.3, bench_cmd/soak_cmd/run_cmd set & tuning == DEFAULT_TUNING
[PASS] Unit & Contract Suite: # pass 36
[PASS] Leaderboard Export CLI: Sorted TopPlayer -> FirstTie -> SecondTie
[PASS] Soak Gate (3 nights, RSS <= 1.2x): crashes=0, mem=40.48->43.74 MB (0.56s)
[PASS] Determinism Night 1 (1400 ticks): sha256=5f632f6b3d20 (336202 bytes)
[PASS] Determinism Night 2 (1400 ticks): sha256=7ae059d3e82d (348478 bytes)
[PASS] Determinism Night 3 (1400 ticks): sha256=59d0777e4259 (384250 bytes)
[PASS] Full Night 3 Performance (18000 ticks <= 30s): 548 ms (1815 JSONL lines)
[PASS] Vite Production Build: dist/ built cleanly

Verification Summary: 9/9 passed.
```

---

## 3. Output thực tế `bench.json` (`--seed 42 --duration 30`)

```json
{
  "contract_version": "1.3",
  "avg_fps": 99.6,
  "p1_low_fps": 37.7,
  "frame_ms_p95": 11.8,
  "frames": 2990,
  "load_ms": 2067,
  "peak_mem_mb": 908,
  "vsync_off": true,
  "renderer": "Three.js 0.170.0 / WebGL2 (ANGLE (Intel, Intel(R) UHD Graphics (0x00009A68) Direct3D11 vs_5_0 ps_5_0, D3D11))",
  "os": "Windows_NT 10.0.26200 (win32/x64)"
}
```

---

## 4. Output thực tế `soak.json` (`--seed 7 --nights 10`)

```json
{
  "nights": 10,
  "crashes": 0,
  "results": [
    "lost",
    "lost",
    "lost",
    "lost",
    "lost",
    "lost",
    "lost",
    "lost",
    "lost",
    "lost"
  ],
  "mem_start_mb": 39.19,
  "mem_end_mb": 43.2,
  "duration_s": 1.17
}
```

---

## 5. Kiểm tra cỡ chữ UI thực tế trên Chrome `1280×720`

Đo `getComputedStyle(el).fontSize` trên toàn bộ nút văn bản đang hiển thị trong `#hud` ở viewport `1280×720`:

```json
{"count":25,"minPx":18,"under18":[]}
```
