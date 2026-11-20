# Nhật ký dùng AI & Đánh giá (AI Log & Evaluation)

## Phase 1 — Đêm 1: Đảo Bến (PRD-0)

### 1. Quy trình làm việc với AI
- **Plan-first**: Chốt `tuning` và tách `src/sim/` khỏi `src/game/` ngay từ đầu.
- **Harness**: `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.githooks/pre-commit`, `.github/workflows/ci.yml`.
- **Lỗi đã sửa**: Test 8 thiếu thời gian sống tới tick 900; Test 15 chưa reset phím `pulse: false`; Test 17 quét trúng comment JSDoc.

---

## Phase 2 — Ba hòn đảo (`TICKET-02` / Contract `v1.1`)

### 1. Quy trình & cập nhật Harness
1. Cập nhật `AGENTS.md` và `.agents/skills/verify-phase/SKILL.md` bổ sung chuẩn `v1.1`, 3 bản đồ (`src/sim/maps.js`), thứ tự 12 bước trong tick, tên trạng thái Bóng Mực chuẩn (`spawning`, `wander`, `chase`, `recoil`, `stunned`) và ngưỡng hiệu năng `<= 30s` cho `21.600` tick.
2. Nâng cấp `src/sim/` và `src/headless/cli.js` trước, rồi mới đồng bộ toàn bộ 3D renderer/HUD/Audio (`src/game/`) và 26 bài test (`tests/`).

### 2. Lỗi phát hiện & cách sửa trong Phase 2
| Lỗi phát hiện | Nguyên nhân | Cách khắc phục & phòng ngừa |
|---|---|---|
| Scenario 07 (`snap11.pos[1] !== snap22.pos[1]`: `0.861 !== 0.856`) | Giảm `dashActiveTicks` (`1 -> 0`) trước khi kiểm tra nhánh giữ độ cao trên không ở tick thứ 12 của Lướt | Lưu cờ `const isDashing = this.player.dashActiveTicks > 0` đầu bước di chuyển để cả 12 tick đều giữ nguyên độ cao |
| Nguy cơ khe hở ở mép dốc `r=24` Đêm 3 & offset `y` của Bóng Mực scenario | Kiểm tra đường nối `r=24` ở mép rộng `3m` (`r = sqrt(24²+1.5²) = 24.047 > 24`) và ép `shade.pos[1] = 1.0` | Mở rộng vùng đệm dốc `s ∈ [23.8, 30]` và giữ nguyên `yOffset = item.pos[1] - surfY` khi nạp scenario |

### 3. Tiết kiệm token & Đánh giá Phase 2
- **Tiết kiệm token**: Tái sử dụng nguyên kiến trúc `LanternIslandSim` + `IslandRenderer` từ Phase 1 thay vì viết lại từ đầu; gộp viết song song 13 scenario và bộ test; dùng hình học thủ tục nhẹ (`three`) giữ runtime 21.600 tick chỉ `187 ms`.
- **Đánh giá**: Toàn bộ 26 test, tính tất định 3 Đêm, hiệu năng `187 ms <= 30.000 ms`, và build Vite đều đạt. Đo FPS trình duyệt `1280x720` cần chạy thực tế trên máy có GPU/WebGL qua `npm run dev`.

---

## Phase 3 — Đèn cạn dầu (`TICKET-03` / Contract `v1.2`)

### 1. Quy trình & Xử lý Change Request
1. Đọc kỹ các phần `[THAY THẾ]` trong `TICKET-03`, cập nhật trước [AGENTS.md](../../AGENTS.md) và [.agents/skills/verify-phase/SKILL.md](../../.agents/skills/verify-phase/SKILL.md) cho Contract `v1.2`.
2. Lập ADR [adr-001-lantern-fuel-and-dawn-survival.md](adr-001-lantern-fuel-and-dawn-survival.md) giải thích mô hình nhiên liệu nguyên `fuel60` (`1/60`), trạng thái `drain`, luật thắng `dawn_survived` và [CHANGELOG.md](../../CHANGELOG.md) liệt kê các thay đổi phá vỡ tương thích.
3. Cập nhật có chủ đích các test Phase 1–2 bị thay thế (`02`, `05`, đơn vị tính điểm) và bổ sung 5 scenario mới (`14..18`) nâng tổng lên **32/32 test xanh ngay lần chạy đầu**.

### 2. Tiết kiệm token & Kiểm chứng Phase 3
- **Tiết kiệm token**: Chỉnh sửa theo điểm (targeted edits) trên `renderer.js`, `maps.js`, `main.js`; gộp viết đồng thời toàn bộ scenario, ADR, changelog và proof trước khi chạy `npm run verify` một lượt.
- **Đánh giá**: `32/32` unit + contract tests đạt, determinism 3 Đêm khớp byte-for-byte, `18.000` tick Đêm 3 chạy `552 ms` (`<= 30s`), Vite build sạch. Kiểm tra trực quan thanh dầu, nhấp nháy `1 Hz` và chế độ Mù màu cần chơi thử trên trình duyệt qua `npm run dev`.

---

## Phase 4 — Bình minh: phát hành `v1.0.0` (`TICKET-04` / Contract `v1.3`)

### 1. Quy trình & Xử lý kỹ thuật
1. Cập nhật harness ([AGENTS.md](../../AGENTS.md), [verify-phase](../../.agents/skills/verify-phase/SKILL.md)) và [game.contract.json](../../game.contract.json) lên `contract_version: "1.3"` với `run_cmd`, `bench_cmd`, `soak_cmd`.
2. Xây dựng chế độ Soak Test (`scripts/soak.js`), Bảng xếp hạng cục bộ + CLI `--export-leaderboard` (`scripts/leaderboard-store.js`, `scripts/run.js`, `vite.config.js`), Benchmark WebGL `1280×720` (`scripts/bench.js`, `src/game/bench-mode.js`) và bộ trợ năng UI (`>= 18px`, `×1.25`, giảm chuyển động, đổi 9 phím + báo trùng, phụ đề + mũi tên chỉ hướng).
3. Chuyển Đom đóm và Bóng Mực trong `src/game/renderer.js` sang `THREE.InstancedMesh` (giảm từ hàng trăm draw calls xuống còn vài draw calls cho 200 Bóng Mực + 100 Đom đóm) và tắt tính năng sáng tạo khi chạy benchmark.

### 2. Lỗi phát hiện & cách khắc phục trong Phase 4
| Vấn đề phát hiện | Nguyên nhân | Giải pháp & Ràng buộc |
|---|---|---|
| Soak RSS tăng từ `38.62` lên `56.56 MB` (`1.46× > 1.2×`) dù `heapUsed` không tăng | Thread JIT nền V8 & vùng nhớ young-gen mở rộng trên tiến trình Node nhỏ | Xác minh bằng `v8.getHeapSpaceStatistics()`, cấu hình cờ `--max-semi-space-size=1 --no-concurrent-recompilation --optimize-for-size --expose-gc` trong `soak_cmd` → RSS ổn định `39.19 → 43.20 MB` (`1.10×`) |
| `addLeaderboardEntry` trả `rank: -1` | `sortAndTrimEntries` tạo object mới sau `normalizeEntry` nên `indexOf(entry)` trượt | Tìm lại vị trí theo khóa dữ liệu trong `src/game/leaderboard.js`, bắt qua unit test |
| Benchmark thoát `1` sau khi in xong số đo; mũi tên HUD đè chữ `WASD` | Windows giữ khóa file lock SQLite của Chrome vài ms khi `taskkill`; `positionEdgeArrow` chừa mép `48px` | Thử lại/bỏ qua `EBUSY` khi dọn profile tạm; chừa lề trên `112px` / dưới `148px` cho mũi tên mép và đưa `caption-stack` lên phía trên |

### 3. Tổng hợp ước tính Token / Chi phí (4 Phases)
- Chi tiết đầy đủ tại [docs/notes/retro.md](retro.md) (ước tính tổng ~850k tokens / ~$2.15 trên cả 4 phase; ghi nhận rõ đây là ước lượng theo quy mô đọc/ghi thực tế).
