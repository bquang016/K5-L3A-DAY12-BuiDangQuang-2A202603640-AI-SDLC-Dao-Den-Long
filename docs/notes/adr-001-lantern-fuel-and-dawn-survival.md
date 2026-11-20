# ADR-001: Mô hình nhiên liệu Đèn Lồng, Bóng Mực hút dầu và Luật thắng Bình Minh (Phase 3)

- **Trạng thái:** Chấp thuận (Phase 3 — `TICKET-03`, Contract `v1.2`)
- **Bối cảnh:** Ở Phase 1–2, người chơi thắp đủ tất cả Đèn Lồng Lớn sẽ thắng sớm ngay lập tức, làm giảm áp lực giữ đảo vào cuối Đêm. `TICKET-03` thay thế luật thắng sớm bằng cơ chế **Đèn cạn dầu** và mục tiêu sống sót giữ tối thiểu `ceil(0.6 × tổng đèn)` đèn sáng tới khi bình minh.

---

## 1. Quyết định thiết kế

### A. Mô hình nhiên liệu số nguyên `1/60` (`fuel60`)
- Mỗi Đèn Lồng lưu trạng thái nội bộ `fuel60 ∈ [0, 6000]` (đơn vị `1/60` của điểm nhiên liệu `0..100`) cùng hai cờ `everLit` và `relitCount`.
- **Lý do:** Dùng số cộng trừ nguyên tránh hoàn toàn sai số tích lũy IEEE-754 qua `18.000` tick (`6000 - 1*t - 5*d`), đảm bảo điều kiện `fuel60 >= 1800` (`fuel === 30`) và tính tất định giữa các máy chấm hoàn toàn chính xác. Chỉ làm tròn 1 chữ số thập phân (`round1(fuel60 / 60)`) khi xuất snapshot/event.

### B. Chuỗi trạng thái Đèn & Tương tác châm dầu / thắp lại
- **Chưa từng sáng (`lit: false, everLit: false`):** cần `10` đom đóm để thắp (`+100` điểm, `fuel60 = 6000`, `successfulLights += 1`).
- **Đang sáng (`lit: true`):** tự hao `1/60` mỗi tick. Nếu `fuel60 < 1800` (`fuel < 30`) thì mất vùng an toàn `6m`. Khi `fuel60 <= 0` ngay sau bước 2 của tick, đèn chuyển `lit: false, deposited: 0, everLit: true`, phát `lantern_out`.
- **Châm dầu (`lit: true, fuel60 < 6000`):** chọn đèn nhận được gần nhất; tiêu thụ `used = min(carried, ceil((100 - fuel)/10))`, tăng `fuel60 = min(6000, fuel60 + used*600)`, `+5*used` điểm, phát `refuel`. Đèn `fuel = 100` không được chọn.
- **Thắp lại (`lit: false, everLit: true`):** chỉ cần `relight_cost = 5` đom đóm (`+40` điểm, `relitCount += 1`, `successfulLights += 1`).
- **Sức chứa động:** `carry_capacity = min(20, 10 + 2 * successfulLights)` (không tính đèn đặt sẵn qua scenario).

### C. Bóng Mực trạng thái `drain` & Vùng an toàn động
- Chỉ Bóng Mực `wander` mới đi tìm đèn sáng yếu (`fuel < 30`) gần nhất; khi vào `<= 2m` chuyển `drain` (hút `5/60` mỗi tick, cộng dồn nhiều con, phát `fuel_drain` mỗi `60` tick). Bóng `chase` giữ nguyên mục tiêu đuổi Mây.
- Rời `drain`: vào `chase` nếu Mây vào `<= 6m`; vào `stunned` nếu trúng Tỏa Sáng (`+15` điểm thay vì `+5`); về `wander` nếu đèn tắt, đèn được châm lên `>= 30`, hoặc cách `> 2m`. Khi đèn vừa thắp hoặc được châm lên `>= 30`, Bóng Mực trong vùng `6m` bị đẩy ra ngoài trong `<= 30` tick không gây sát thương.

### D. Luật thắng Bình Minh & Ưu tiên tick cuối
- Bỏ hoàn toàn thắng sớm `all_lit`; thời lượng Đêm chuẩn hóa thành `240 / 270 / 300s`.
- Ở bước 11 sau mọi cập nhật của tick: `flames <= 0` luôn thua `no_flames` trước (kể cả đúng tick bình minh); còn sống tại `time_left_s <= 0` thắng `dawn_survived` nếu `lit >= ceil(0.6 * total)` (`3/5`, `4/6`, `5/7`), ngược lại thua `dawn`.

---

## 2. Ảnh hưởng & Cập nhật kiểm thử cũ
- Các scenario `02-light-lantern-win.json`, `05-safe-zone.json` và các unit test tính điểm Phase 2 (`+10` deposit, `all_lit`, thưởng giây còn lại) bị thay thế bởi luật mới trong `TICKET-03`. Toàn bộ đã được cập nhật kèm ghi chú rõ ràng và bổ sung 5 scenario mới (`14..18`) kiểm chứng toàn bộ hành vi Phase 3.
