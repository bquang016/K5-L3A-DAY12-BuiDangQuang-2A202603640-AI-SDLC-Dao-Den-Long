# Changelog

## [1.0.0] — Phase 4 (`TICKET-04`: Bình minh — Contract `v1.3`)

### Added
- **Test Contract nâng cấp lên `v1.3`** ([game.contract.json](game.contract.json)): bổ sung `bench_cmd`, `soak_cmd`, và `run_cmd` (`node scripts/run.js`) hỗ trợ `--export-leaderboard`.
- **Chế độ Benchmark 3D (`scripts/bench.js`, `src/game/bench-mode.js`)**: mở cửa sổ `1280×720` tắt VSync (`--disable-gpu-vsync`), cảnh chuẩn Đêm 1 với `L1–L3` sáng (`fuel: 100`), đúng `200` Bóng Mực `wander` + `100` đom đóm, camera quay tròn `r=30 m, Y=15 m` (`15s`/vòng CCW), đo `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `load_ms`, `peak_mem_mb` vào [bench.json](bench.json).
- **Tối ưu Instanced Rendering (`src/game/renderer.js`)**: chuyển Đom đóm và Bóng Mực sang `THREE.InstancedMesh` kèm tái sử dụng vector/matrix nháp và tắt hiệu ứng sáng tạo khi benchmark/soak.
- **Soak Test dài hạn (`scripts/soak.js`)**: chạy headless `10` Đêm liên tiếp xoay vòng Đêm `1 → 2 → 3`, theo dõi `crashes` và RSS `mem_start_mb` → `mem_end_mb` với cờ V8 ổn định bộ nhớ (`soak.json`).
- **Bảng xếp hạng cục bộ (`src/game/leaderboard.js`, `scripts/leaderboard-store.js`, `scripts/run.js`, `vite.config.js`)**: nhập tên `3–12` ký tự (hỗ trợ cả tiếng Việt NFC), lưu Top `10` theo `score` giảm dần / `achieved_at` sớm hơn đứng trên, xem từ menu chính, lưu ra đĩa cục bộ và xuất qua `node scripts/run.js --export-leaderboard <out.json>`.
- **Dễ tiếp cận (Accessibility)**: đổi tất cả `9` phím điều khiển + cảnh báo trùng phím + nút *Khôi phục mặc định*; phụ đề & mũi tên mép màn hình khi Bóng Mực xuất hiện, gió sắp thổi, `10s` cuối, đèn `< 30` dầu; tắt rung & chớp màn hình (*Giảm chuyển động*); cỡ chữ tối thiểu `18px` tại `1280×720` kèm nút phóng to `×1.25`.
- **Đóng gói phát hành**: `npm start` (`scripts/run.js`), `Dockerfile`, `.dockerignore`, ảnh chụp `1280×720`, Retro 4 phase ([docs/notes/retro.md](docs/notes/retro.md)) và bằng chứng Phase 4 ([docs/proof/phase-4.md](docs/proof/phase-4.md)).

### Fixed
- Sửa lỗi mất trạng thái chế độ Mù màu khi chuyển màn trong `_clearMapMeshes()` (`src/game/renderer.js`).
- Sửa lỗi mũi tên chỉ hướng đèn mép màn hình chồng lên bảng phím gợi ý ở góc dưới-trái và căn lại vị trí phụ đề khỏi che nhân vật Mây.
- Sửa lỗi hoàn trả thứ hạng `-1` trong `addLeaderboardEntry` do so sánh tham chiếu object sau chuẩn hóa.

---

## [1.2.0] — Phase 3 (`TICKET-03`: Đèn cạn dầu)

### Breaking Changes
- **Test Contract nâng cấp lên `v1.2`** (`game.contract.json`):
  - Thời lượng Đêm rút ngắn còn `240s` (Đêm 1), `270s` (Đêm 2), `300s` (Đêm 3).
  - Bổ sung tham số `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`.
  - **Thay thế luật thắng sớm (`all_lit` bị gỡ bỏ):** Thắp đủ tất cả đèn không còn kết thúc Đêm sớm. Thắng (`dawn_survived`) chỉ xét khi sống tới bình minh với `lit >= ceil(0.6 * total)` (`3/5`, `4/6`, `5/7`).
  - **Thay thế bảng điểm cũ:** `score.per_mote` giảm từ `10` xuống `5`; bỏ `score.per_second_left` (`0`); thêm thưởng thắp lại (`+40`), làm choáng Bóng Mực đang `drain` (`+15`), thưởng mỗi đèn sáng lúc bình minh (`+50 + floor(fuel)`).
  - **Snapshot & Scenario thay đổi:** `player` thêm `capacity`; `lanterns[]` thêm `fuel`, `ever_lit`, `relit_count`; trạng thái Bóng Mực thêm `drain`.
  - **Sự kiện mới:** `refuel`, `lantern_out`, `fuel_drain`; `lantern_lit` thêm cờ `relight`; `game_over.reason` thay `all_lit` bằng `dawn_survived`.
- **Kiểm thử cũ đã cập nhật kèm lý do:** `02-light-lantern-win.json`, `05-safe-zone.json`, và các unit test tính điểm trong `tests/unit.test.js` được cập nhật để khớp luật thắng bình minh, nhiên liệu `fuel`, và bảng điểm `v1.2`.

### Added
- Hệ thống nhiên liệu đèn tính theo `1/60` (`fuel60`), thanh dầu trên đèn 3D và nhấp nháy chậm `1 Hz` khi `fuel < 30`.
- Bóng Mực trạng thái `drain` hút dầu đèn yếu (`fuel < 30`) và mất vùng an toàn khi dưới `30`.
- Sức chứa đom đóm tăng dần theo số lần thắp thành công (`10 + 2 * successful_lights`, tối đa `20`).
- Chế độ **Mù màu (Bảng màu dễ phân biệt)** trong Cài đặt (`#00B3FF` cho Bóng Mực, `#FFFFFF` + `⚠` cho cảnh báo UI, đèn tắt xẹp `20%` kèm vết rách).
- 5 scenario headless mới (`14` đến `18`) và ADR [adr-001-lantern-fuel-and-dawn-survival.md](docs/notes/adr-001-lantern-fuel-and-dawn-survival.md).

---

## [1.1.0] — Phase 2 (`TICKET-02`: Ba hòn đảo)
- Chuẩn hóa toàn bộ thông số điều khiển & Contract `v1.1`.
- Mở rộng thành 3 Đêm (`Đảo Bến`, `Đảo Cau`, `Đảo Chuông`), bổ sung Lướt (Dash), rơi khỏi đảo & hồi sinh, Gió Lạc, Bùa Gió, gió mạnh Đêm 3, Tạm dừng (`paused`/`resumed`), Menu, Cài đặt, HUD & bảng màu chuẩn.

## [1.0.0] — Phase 1 (`PRD-0`: Đảo Bến)
- Xây dựng game 3D Đảo Bến (Three.js + Vite) tách biệt hoàn toàn với lõi mô phỏng 60Hz tất định và CLI headless (`Test Contract v1.0`).
