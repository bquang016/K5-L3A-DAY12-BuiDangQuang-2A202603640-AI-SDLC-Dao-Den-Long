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
