# Phase 2 — Đặc tả, Tiêu chí nghiệm thu & Nhật ký thay đổi (TICKET-02)

## 1. Thay đổi từ Phase 1 sang Phase 2 (Change Log & Lý do)

| Hạng mục | Phase 1 (`PRD-0`) | Phase 2 (`TICKET-02` / Contract `v1.1`) | Lý do & Cách xử lý test cũ |
|---|---|---|---|
| Số liệu điều khiển | `player_speed: 8`, không dash, `fall_enabled: false` | `player_speed: 6`, nhảy `7.0 m/s` (`-20 m/s²`), Dash `14 m/s` (`0.2s` / hồi `1.5s`), rơi `Y < -10` (`fall_enabled: true`) | Chuẩn hóa cảm giác điều khiển thống nhất trên toàn bộ bài nộp |
| Đom đóm & Đèn | Sức chứa `6`, đèn cần `4`, bán kính nhặt `2m` / nạp `3.5m` | Sức chứa `10`, đèn cần `10`, bán kính nhặt `1.0m` / nạp `2.0m`, sinh `20` đầu màn, trần `30`, bù mỗi `240` tick | Kéo dài nhịp khám phá và phù hợp bản đồ 3 Đêm |
| Tỏa Sáng (`pulse`) | Chi phí `2`, bán kính `8m`, đẩy `6m`, choáng `3s`, hồi `2.5s` | Chi phí `3`, bán kính 3D `5m` (tâm `Y + 0.8`), đẩy `4m` trong `15` tick, choáng `120` tick (`2s`), hồi `3s` | Cân bằng tự vệ trước Bóng Mực và Gió Lạc |
| Điểm số (`score`) | `+10` lúc nhặt, `+150` đèn, `+25` stun, `+100` ngọn lửa | `+10` lúc **nạp** đom đóm, `+100` đèn, `+5` stun, `+50` ngọn lửa còn lại | Tránh farm điểm bằng nhặt mà không mang về thắp đèn; **Sửa test 01 & 02** kèm lý do |
| Bóng Mực & Vùng an toàn | Trạng thái có `flee`, sinh `2` con ngay tick `0` | Bắt buộc dùng đúng `spawning, wander, chase, recoil, stunned`; sinh `2` con tại tick `300`, sau đó theo chu kỳ từng Đêm; đẩy ra mép `6m` tối đa `30` tick không gây sát thương | Chuẩn hóa Test Contract v1.1; cập nhật toàn bộ scenario `01..06` sang số liệu mới |

---

## 2. Tiêu chí nghiệm thu Phần 3 (Acceptance Criteria)

| Tính năng mới | Tiêu chí nghiệm thu kiểm chứng được | Cách kiểm chứng |
|---|---|---|
| **Lướt (Dash)** | Nhấn Lướt phóng `14 m/s` trong `12` tick (`2.8m`), giữ nguyên độ cao khi lướt trên không, hồi chiêu `90` tick (`1.5s`) từ lúc bắt đầu lướt | Scenario `07-dash-and-cooldown.json` |
| **Rơi khỏi đảo & Hồi sinh** | Rơi `Y < -10` kích hoạt đúng 1 lần (bỏ qua bất tử): `-1` Ngọn Lửa, mất toàn bộ đom đóm (`lost`), chờ `60` tick, hồi sinh tại điểm xuất phát với bất tử `90` tick; hết Ngọn Lửa → thua ngay | Scenario `08-fall-and-respawn.json` |
| **Đêm 1 — Đảo Bến** | Đảo tròn `r=40m`, `5` đèn `L1..L5`, `24` điểm đom đóm, `12` điểm Bóng Mực `r=37m`, sinh mỗi `8s` tối đa `6` | `src/sim/maps.js` + `tests/unit.test.js` |
| **Đêm 2 — Đảo Cau** | 2 đảo `r=28m` tại `(0,0)` & `(70,0)` nối cầu tre `x∈[26,44], z∈[-2,2]`; 2 bục nhảy phóng `vy=14, vh=24` đáp vào đảo đích; `6` đèn `L1..L6`; `C1 (35,0,0)` | Scenario `09-night2-bridge-and-jumppad.json` + unit test cầu tre |
| **Đêm 3 — Đảo Chuông** | Đảo `r=45m` 3 tầng (`Y=0,3,6`), vách đứng, 2 dốc `30°/150°` rộng `3m`, bục nhảy `(0,3,13)` lên tầng 2, tháp chuông `r=2m` chặn xuyên, `7` đèn, gió mạnh mỗi `30s` kéo dài `5s` (`2 m/s`) báo trước `2s` | Scenario `12` + `tests/unit.test.js` (dốc & tháp chuông) |
| **Gió Lạc (Drifters)** | Đêm 2 & 3, tối đa `2`, sinh tick `1200, 2400...`; `idle` (`2 m/s`) → `chase` (`7 m/s`) khi `carried >= 5` & `<= 15m`; chạm (`<= 1.2m`) cướp `min(3, carried)` phát `drifter_steal`; Tỏa Sáng khi `flee` thả lại đom đóm phát `drifter_drop`, rồi biến mất sau `120` tick | Scenario `10-drifter-steal-and-drop.json` |
| **Bùa Gió (Charms)** | Nhặt `C1/C2` tăng tốc `7.2 m/s` & Lướt không hồi chiêu trong `600` tick (`nhấn khi đang lướt vẫn bỏ qua`), hồi sinh sau `2700` tick | Scenario `11-charm-speed-and-dash.json` |
| **Tạm dừng (Pause)** | `Esc/P` hoặc input `pause`: `tick` tăng, `sim_tick`, `time_left_s`, cooldown và TTL đom đóm đứng yên, snapshot ghi `state: "paused"`, Resume phát `resumed` | Scenario `13-pause-and-resume.json` |
| **Chuỗi 3 Đêm, Cài đặt, Âm thanh, HUD & Bảng màu** | Menu chính, lời Ông Đăng, thắng Đêm 3 hiện Bình Minh + tổng điểm; lưu âm lượng/độ nhạy chuột vào `localStorage`; âm thanh đầy đủ sự kiện + 10s cuối; HUD đủ 10 ô, đồng hồ đỏ nhấp nháy `<= 30s`, mũi tên chỉ đèn ngoài màn hình; màu chuẩn + cường độ môi trường `0.15 + 0.55*(lit/total)` | Kiểm tra mã `src/game/*` + `npm run build` sạch; chơi thử trực tiếp qua `npm run dev` |

## 3. Ghi chú về Gió Lạc trạng thái `removed`
Khi bộ đếm `flee` của Gió Lạc đếm về `0` (sau `240` tick mang đồ hoặc `120` tick sau khi bị Tỏa Sáng thả đồ), thực thể Gió Lạc biến mất khỏi danh sách hoạt động (`this.drifters`) để nhường chỗ cho lượt sinh kế tiếp (`max 2`). Schema validator vẫn hỗ trợ nhận giá trị `'removed'` trong file scenario đầu vào để tương thích kiểm thử.
