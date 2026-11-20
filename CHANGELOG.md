# Changelog

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
