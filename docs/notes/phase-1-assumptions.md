# Phase 1 — Giả định & Tiêu chí nghiệm thu (PRD-0)

## 1. Bảng giả định cho các điểm mở của PRD-0

| Điểm mở trong PRD-0 | Giả định lựa chọn | Lý do | Cách kiểm chứng |
|---|---|---|---|
| Kích thước & ranh giới Đảo Bến | Hình tròn bán kính chơi `46m` (hiển thị `48m`), `fall_enabled: false` | Tránh rơi mất oan ở Phase 1, tập trung vào vòng lặp gom sáng và né Bóng Mực; khớp contract `fall_enabled: false` | `clampToCircleXZ` trong `src/sim/math.js` |
| Vị trí 5 Đèn Lồng Lớn (`L1..L5`) | Ngũ giác đều bán kính `25m` quanh gốc `(0, 0, 0)`, `L1` tại `[0, 0, 25]` | Cân bằng cự ly di chuyển từ điểm xuất phát và khớp ví dụ tọa độ `L1` trong Contract D | `NIGHT1_LANTERNS` trong `src/sim/config.js` |
| Sức chứa & chi phí thắp đèn | `carry_capacity: 6`, `lantern_cost: 4` (có thể nạp từng phần) | Cho phép người chơi tích trữ đủ thắp 1 đèn + dư `pulse_cost: 2` để tự vệ trên đường về | `tests/scenarios/01-mote-pickup.json`, `02-light-lantern-win.json`, `tests/unit.test.js` |
| Cơ chế Tỏa sáng (`pulse`) | Tốn `2` đom đóm, bán kính `8m`, đẩy `6m`, choáng `3s`, hồi chiêu `2.5s` | Tạo lựa chọn chiến thuật rõ ràng giữa giữ sáng để thắp đèn hay tự vệ | `tests/scenarios/03-pulse-stun-push.json` |
| Va chạm Bóng Mực & Vùng an toàn | `flames: 3`, bất tử `1.5s`, rơi `50%` (`floor(carried * 0.5)`), `safe_radius: 6m` quanh đèn đã sáng | Có cơ hội sửa sai sau va chạm và khuyến khích chạy về đèn đã thắp để trú ẩn | `tests/scenarios/04-shade-hit-loss.json`, `05-safe-zone.json` |
| Độ dài Đêm 1 | `300` giây (`18000` tick ở `60Hz`), hết giờ mà chưa thắp đủ 5 đèn → thua (`dawn`) | Vừa đủ căng thẳng cho 5 đèn mà không quá dài khi chơi thử | `tests/scenarios/06-dawn-loss.json` |
| Sinh đom đóm & Bóng Mực ngẫu nhiên | Mặc định sinh `18` đom đóm (bù mỗi `3s`) và `2` Bóng Mực (tăng tối đa `3 + litCount`, trần `6`, mỗi `15s`); tắt khi `random_motes/shades: false` | Tạo nhịp chơi tăng dần trong game thật nhưng tách bạch hoàn toàn khi test scenario | `tests/contract.test.js` (determinism + `shade_spawned`) |

## 2. Khớp tham số `game.contract.json`

Toàn bộ các tham số trong `game.contract.json` được lấy trực tiếp từ `DEFAULT_TUNING` (`src/sim/config.js`) và được kiểm tra tự động qua `scripts/verify.js`:

- `player_speed: 8`, `shade_speed: 5.5`
- `pickup_radius: 2`, `interact_radius: 3.5`, `pulse_radius: 8`, `safe_radius: 6`, `shade_hit_radius: 1.4`
- `score`: `per_mote: 10`, `per_lantern: 150`, `per_stun: 25`, `per_second_left: 2`, `per_flame_left: 100`
- `fall_enabled: false` (không có sự kiện `player_hit` với `by: "fall"` trong Phase 1).
