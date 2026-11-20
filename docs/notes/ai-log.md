# Phase 1 — Nhật ký dùng AI & Đánh giá (AI Log & Evaluation)

## 1. Quy trình làm việc với AI trong Phase 1

1. **Đọc & Lập kế hoạch trước (Plan-first)**: Đọc toàn bộ PRD-0 và Test Contract v1.0, chốt toàn bộ bộ số `tuning`, kiến trúc tách `src/sim/` (thuần JS ESM 60Hz) khỏi `src/game/` (Three.js + Web Audio + HUD) trước khi viết dòng code nào.
2. **Xây dựng theo từng commit nhỏ**:
   - Commit 1: `package.json`, `game.contract.json`, `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.githooks/pre-commit`.
   - Commit 2: `src/sim/*` + `src/headless/cli.js`.
   - Commit 3: `index.html` + `src/game/*` + build Vite.
   - Commit 4: 6 kịch bản scenario, unit tests, contract tests, `scripts/verify.js`, GitHub Actions CI.
   - Commit 5: Tài liệu giả định, nhật ký AI, bằng chứng thật, `README.md`, `LICENSE`, `CREDITS.md`.
3. **Harness AI đã dùng**:
   - `AGENTS.md`: quy tắc tách tuyệt đối `src/sim/` khỏi render/ngẫu nhiên không kiểm soát, quy tắc đồng bộ `game.contract.json`.
   - `.agents/skills/verify-phase/SKILL.md`: chuẩn hóa quy trình chạy `npm run verify` và ghi bằng chứng thật trước khi gắn tag.
   - `.githooks/pre-commit`: chạy `npm test` tự động trước mỗi commit.
   - `.github/workflows/ci.yml`: tự động chạy `npm run verify` trên Ubuntu Node 22 khi push/PR.

## 2. Tiết kiệm token & chi phí (Token Discipline)

- **Ước tính tiêu thụ Phase 1**: ~1 lượt lập kế hoạch chi tiết + 5 lượt thực thi gộp song song các lệnh đọc/viết độc lập; tổng ngữ cảnh rất gọn vì không dùng TypeScript/build trung gian cho logic lõi và không cài thêm framework UI nặng (React/Tailwind).
- **Cách tiết kiệm**:
  - Giữ `AGENTS.md` dưới 30 dòng, chỉ ghi lệnh và bất biến bắt buộc.
  - Viết `src/sim/` bằng JavaScript ESM chuẩn chạy trực tiếp trên cả Node.js lẫn Vite mà không cần bước compile riêng.
  - Gộp nhiều thao tác đọc/tạo file độc lập trong cùng một lượt gọi công cụ; không lặp lại lệnh kiểm tra nếu chưa có chỉnh sửa mới.

## 3. Lỗi phát hiện & cách chỉnh sửa trong Phase 1

| Vấn đề phát hiện khi chạy test | Nguyên nhân | Cách sửa & bài học |
|---|---|---|
| Lỗi `git commit` trong sandbox (`index.lock` permission denied) | Sandbox giới hạn ghi vào `.git/` | Tách lệnh git khỏi bước cài đặt/kiểm thử để chạy sạch |
| Test 8 (`shade_spawned` trong `--ticks 950`) ban đầu fail | Khi đứng yên không input ở Đêm 1 mặc định, 2 Bóng Mực chạm hết 3 ngọn lửa vào khoảng tick 565 trước khi tới mốc tick 900 | Giữ test determinism ở 600 tick mặc định và thêm kịch bản sống sót (`flames: 10`) 950 tick để kiểm chứng `shade_spawned` chính xác tại tick 900 |
| Test 15 (`pulse`) fail ở lần gọi thứ 2 | Chưa nhả phím (`pulse: false`) giữa hai lần gọi `step({ pulse: true })` nên cạnh lên `false -> true` không xảy ra | Sửa test gửi `step({ pulse: false })` ở giữa — đồng thời xác nhận logic edge-trigger hoạt động đúng |
| Test 17 kiểm tra từ cấm trong `src/sim/` báo lỗi ở `prng.js` | Quét chuỗi thô bắt trúng dòng comment JSDoc `"Never delegates to Math.random()"` | Lọc bỏ comment `/* ... */` và `// ...` trước khi quét regex mã thực thi |

## 4. Đánh giá Phase 1 (Evaluation)

- **Đạt**: Toàn bộ Test Contract v1.0 (headless CLI, schema validation exit code 2, 60Hz fixed tick, tọa độ XZ, làm tròn 3 chữ số, tính tất định SHA-256 giống nhau tuyệt đối, bundle Vite 3D sạch).
- **Giới hạn ghi nhận trung thực**: Trong môi trường CLI không có màn hình tương tác trực tiếp của người dùng, khung hình WebGL thực tế được kiểm chứng thông qua bundle production (`npm run build`) và kiến trúc tách lớp; cần người dùng mở `npm run dev` để chơi thử trực quan trước khi gắn tag `phase-1`.
