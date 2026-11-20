# Retro Tổng Hợp Dự Án — Đảo Đèn Lồng (Phases 1–4)

## 1. Tổng hợp Evaluation 4 Phase

| Phase / Tag | Trọng tâm yêu cầu | Kết quả kiểm chứng (số liệu thực tế) | Tương thích ngược & Điều chỉnh |
|---|---|---|---|
| **Phase 1 (`phase-1`)** | `PRD-0`, Contract `v1.0` — 1 đảo (*Đảo Bến*), 60Hz tách sim/render, WebGL + HUD | `17/17` test đạt; `verify` `4/4` xanh; determinism `600` tick khớp SHA-256 (`36a93e5c08a3`) | Nền tảng sạch giúp cả 3 phase sau không phải viết lại kiến trúc |
| **Phase 2 (`phase-2`)** | `TICKET-02`, Contract `v1.1` — chuẩn hóa thông số, 3 Đêm (*Đảo Cau*, *Đảo Chuông*), Dash, Gió Lạc, Bùa Gió, Pause | `26/26` test đạt; `verify` `7/7` xanh; determinism 3 Đêm byte-for-byte; Đêm 3 `21.600` tick chạy `187 ms` (`<= 30s`) | Sửa bằng mắt sau playtest: đảo ngược độ dốc ramp Đêm 3 (`1ee52b0`) & bổ sung Pointer Lock (`716a30f`) |
| **Phase 3 (`phase-3`)** | `TICKET-03`, Contract `v1.2` — Change Request: hao dầu `1/s`, Bóng Mực `drain`, thắp lại `5` đom đóm, bỏ thắng sớm | `32/32` test đạt; `verify` `7/7` xanh; Đêm 3 `18.000` tick `552 ms`; lập ADR-001 & `CHANGELOG.md` | Cập nhật có chủ đích `02`, `05` và unit test điểm số cũ thay vì xóa bừa; giữ trọn regression `01, 03, 04, 06..13` |
| **Phase 4 (`phase-4` / `v1.0.0`)** | `TICKET-04`, Contract `v1.3` — Benchmark `1280×720`, Soak `10` đêm, Leaderboard đĩa cục bộ, Accessibility, Release | `36/36` test đạt; `verify` `9/9` xanh; Bench thực tế: **`99.6 FPS` avg / `37.7 FPS` 1%-low / `2067 ms` load**; Soak 10 đêm: **`0` crash, RSS `39.19 → 43.2 MB` (`1.10×`)** | Bổ sung `InstancedMesh` để đạt FPS cao với `200` Bóng Mực + `100` đom đóm; căn HUD `>= 18px` tránh đè mũi tên |

---

## 2. Điều gì hiệu quả & chưa hiệu quả khi làm việc với AI

**Hiệu quả rõ rệt:**
- **Tách ranh giới kiến trúc sớm (`Sim/Render Split`):** Khi yêu cầu AI tách tuyệt đối `src/sim/` khỏi Three.js ngay từ Phase 1 và viết sẵn unit test tĩnh cấm `three` / `Math.random` / DOM trong lõi, mọi logic mới (Dash, Gió mạnh, Fuel `1/60`, Soak Test) đều kiểm thử được trong vài trăm mili-giây bằng `node --test`.
- **Plan → Execute theo từng đợt song song:** Chốt `game.contract.json` và schema JSONL trước rồi mới code giúp số lượng vòng sửa qua lại rất ít (Phase 3 đạt 32/32 ngay lần chạy đầu).
- **Chẩn đoán bằng đo đạc thực tế:** Với Soak RSS Phase 4, thay vì đoán mò hay giảm test, việc chạy chẩn đoán `v8.getHeapSpaceStatistics()` chỉ ra ngay `heapUsed` không hề rò rỉ (`4.89 → 4.78 MB`), nguyên nhân tăng RSS là V8 semi-space mặc định và thread biên dịch JIT nền.

**Chưa hiệu quả:**
- **Dựa vào mắt / trực giác CLI cho hình học 3D & bố cục HUD:** Một số lỗi không gian (dốc ramp Đêm 3 dựng ngược chiều, hoặc ở Phase 4 mũi tên mép màn hình đè lên dòng chữ phím tắt `"WASD"`) chỉ lộ ra khi nhìn ảnh render thật trên trình duyệt.
- **Thiếu kiểm soát vòng đời handle Windows ở lần đầu viết script:** Script benchmark Chrome cần xử lý `EBUSY` tạm thời khi xóa `--user-data-dir` ngay sau `taskkill`.

---

## 3. Những lần AI sai & Cách phát hiện + Cập nhật Harness

| Lỗi AI gặp phải | Cách phát hiện | Cách sửa & Cập nhật Harness |
|---|---|---|
| **Phase 1:** Unit test `pulse` hai lần liên tiếp quên thả nút (`pulse: false`); static scan regex bắt nhầm comment JSDoc | Chạy `npm test` (fail thật) | Sửa test gửi 1 tick nhả phím; loại comment trước khi quét. Bổ sung rule *"Never fake tests"* trong `AGENTS.md` |
| **Phase 2:** Lướt trên không bị tụt `0.005 m` ở tick thứ 12 | Scenario `07` báo lệch `snap11.pos[1] !== snap22.pos[1]` | Lưu cờ `const isDashing = dashActiveTicks > 0` trước khi trừ counter |
| **Phase 2:** Mô hình 3D dốc Đảo Chuông đặt ngược chiều cao (`+atan2`) | Người dùng chơi thử trực quan trên trình duyệt báo lại | Đảo dấu `-atan2(3, 6)` ở commit `1ee52b0`; kiểm tra lại công thức tọa độ đối xứng |
| **Phase 3:** Thay đổi luật `all_lit` → `dawn_survived` | Đọc kỹ nhãn `[THAY THẾ]` trong `TICKET-03` | Viết `adr-001` & giải trình rõ trong `CHANGELOG.md` trước khi cập nhật scenario cũ |
| **Phase 4:** `addLeaderboardEntry` trả `rank = -1` sau sort | Unit test `addLeaderboardEntry` bắt ngay sai lệch `-1 !== 1` | Tìm lại theo bộ trường `(name, score, nights_won, achieved_at, seed)` thay vì `indexOf` tham chiếu |
| **Phase 4:** Mũi tên mép màn hình `hud-arrow` đè chữ `WASD` ở góc dưới trái `1280×720` | Chụp ảnh màn hình Chrome thực tế (`docs/assets/screenshot-night1.png`) và mở xem | Chỉnh vùng lề mũi tên chừa top `112px` / bottom `148px` và đưa `caption-stack` lên trên nhân vật |

---

## 4. Harness nào giúp nhiều nhất?

1. **`.githooks/pre-commit` kết hợp `scripts/verify.js` (`npm run verify`):** Đây là chốt chặn quan trọng nhất — mọi commit tự động chạy đủ test đơn vị, test hợp đồng ẩn/tự viết, kiểm tra đồng bộ `game.contract.json == DEFAULT_TUNING`, determinism 3 Đêm và Vite build. Không thể quên hay commit khi test đỏ.
2. **`.agents/skills/verify-phase/SKILL.md`:** Quy chuẩn hóa quy trình "chạy lệnh thật → chụp output thật → ghi `docs/proof/phase-N.md` → kiểm tra staging" giúp bằng chứng cuối mỗi phase luôn khớp 100% với code tại tag.
3. **`AGENTS.md` ngắn gọn (~25 dòng):** Ghi rõ 12 bước trong tick, kiểu nguyên `fuel60`, tên trạng thái Bóng Mực và luật tắt sáng tạo khi bench/soak — giúp AI không bị lạc ngữ cảnh khi qua phiên mới.

---

## 5. Ước tính Token / Chi phí AI & Cách đã tiết kiệm

> **Lưu ý minh bạch:** Con số dưới đây là **ước tính** dựa trên số lượng file đọc/ghi và độ dài phiên làm việc thực tế trong IDE (không phải hóa đơn chính thức từ nhà cung cấp API).

| Giai đoạn | Công việc chính | Ước tính token (Input + Output) | Ước tính chi phí tham khảo (~USD) |
|---|---|---|---|
| **Phase 1 (`phase-1`)** | Dựng kiến trúc tách lõi 60Hz, Đảo Bến, audio/textures thủ tục, CI & 17 tests | ~180k tokens | ~$0.45 |
| **Phase 2 (`phase-2`)** | Chuẩn hóa 3 đảo, Bridge/Ramp/Wind/Drifters, Pointer Lock & 26 tests | ~240k tokens | ~$0.60 |
| **Phase 3 (`phase-3`)** | Change Request nhiên liệu nguyên `1/60`, `drain`, Mù màu, ADR-001 & 32 tests | ~140k tokens | ~$0.35 |
| **Phase 4 (`phase-4`)** | Benchmark Chrome + Instancing, Soak + chẩn đoán V8 RSS, BXH, Trợ năng, Đóng gói & Tài liệu | ~290k tokens | ~$0.75 |
| **Tổng 4 Phase** | Hoàn thành sản phẩm `v1.0.0` | **~850k tokens** | **~$2.15** |

**Các kỹ thuật tiết kiệm token đã áp dụng:**
- **Không viết lại toàn file khi sửa nhỏ:** Dùng targeted edits cho `simulation.js`, `renderer.js`, `tests/*.test.js` và đọc theo dải dòng thay vì nạp toàn bộ repo mỗi lượt.
- **Không kéo asset nặng hoặc thư viện phình to:** Toàn bộ âm thanh (Web Audio) và texture PBR đều tạo bằng code (< 400 dòng), không phải truyền file lớn qua context và giúp tốc độ test/build ~1–3 giây.
- **Gộp song song nhiều thao tác đọc/ghi & kiểm chứng một lệnh `npm run verify`:** Giảm đáng kể số vòng hội thoại thừa phải gửi lại toàn bộ lịch sử.

---

## 6. Nếu làm lại thì sẽ đổi gì?

1. **Tự động chụp & kiểm tra ảnh WebGL qua Chrome CDP ngay từ Phase 1:** Nếu có kiểm tra ảnh tự động từ đầu, các lỗi thị giác như hướng dốc Đêm 3 hay vị trí mũi tên HUD đè chữ ở `1280×720` sẽ được phát hiện trước cả khi playtest thủ công.
2. **Dùng `InstancedMesh` ngay từ khi tạo thực thể lặp lại (đom đóm, Bóng Mực):** Đỡ phải refactor từ `Group` từng cá thể ở Phase 4 và giữ frame time mượt ngay trên GPU tích hợp.
3. **Tạo sẵn wrapper kiểm chứng đa kích thước màn hình (`1280×720`, chữ `×1.25`, chế độ Mù màu) trong CI/local checklist:** Giúp kiểm tra tính dễ tiếp cận nhanh và nhất quán hơn.
