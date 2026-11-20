# Đảo Đèn Lồng (Lantern Island) — Phase 1

> **Video Demo:** *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*  
> **Màn chơi hiện tại:** Đêm 1 – Đảo Bến · **Test Contract:** `v1.0` (`game.contract.json`)

Game 3D góc nhìn thứ ba: điều khiển **Mây** (đội nón lá có treo đèn lồng nhỏ) đi gom **đom đóm**, mang về thắp lại **5 Đèn Lồng Lớn** trên Đảo Bến và tỏa sáng xua đuổi **Bóng Mực** trước khi bình minh đến hoặc mất hết ngọn lửa.

---

## Cài đặt & Chạy (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy trực tiếp trên macOS, Linux và Windows).

```bash
npm install      # 1. Cài đặt dependencies (Three.js, Vite)
npm run dev      # 2. Mở game 3D trên trình duyệt (mặc định http://localhost:5173)
npm run verify   # 3. Chạy kiểm chứng toàn bộ (unit tests, headless contract, determinism, build)
```

*(Để chạy bản web tĩnh sau build: `npm run build && npm run preview`.)*

---

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` hoặc `Phím mũi tên` | Di chuyển theo góc nhìn camera |
| `Space` | Nhảy |
| `F` hoặc `Enter` | Nạp ánh sáng vào Đèn Lồng Lớn gần nhất |
| `Shift` hoặc `X` | Tỏa sáng (tốn 2 đom đóm, làm choáng & đẩy lùi Bóng Mực) |
| `Q` / `E` hoặc **Kéo chuột** | Xoay camera quanh Mây |
| `M` | Bật / Tắt âm thanh |

---

## Luật chơi & Cách tính điểm

Các thông số gameplay được khai báo thống nhất tại [game.contract.json](game.contract.json) và [src/sim/config.js](src/sim/config.js):

- **Nhặt đom đóm:** `+10` điểm/con (mang tối đa `6`, bán kính nhặt `2m`).
- **Thắp Đèn Lồng Lớn:** Cần `4` đom đóm/đèn (`5` đèn `L1..L5`). Thắp sáng hoàn toàn: `+150` điểm và mở vùng an toàn `safe_radius = 6m` đẩy lùi Bóng Mực.
- **Tỏa sáng (`pulse`):** Tốn `2` đom đóm, bán kính `8m`, đẩy lùi `6m`, choáng `3s`, hồi chiêu `2.5s`, cộng `+25` điểm cho mỗi Bóng Mực bị choáng.
- **Bị Bóng Mực chạm (`shade_hit_radius = 1.4m`):** Mất `1` ngọn lửa (khởi đầu `3`), bất tử `1.5s`, đánh rơi `50%` số đom đóm đang mang (`hit_drop_ratio = 0.5`).
- **Rơi khỏi đảo (`fall_enabled = false`):** Không rơi khỏi đảo trong Phase 1; nhân vật được giữ trong bán kính Đảo Bến (`46m`).
- **Thắng:** Thắp đủ 5 đèn → thưởng thêm `+2` điểm/giây còn lại (`per_second_left`) và `+100` điểm/ngọn lửa còn lại (`per_flame_left`).
- **Thua:** Hết `3` ngọn lửa (`no_flames`) hoặc hết `300s` bình minh tới (`dawn`).

---

## Chế độ Headless (Test Contract v1.0)

Logic mô phỏng 60Hz thuần tách biệt hoàn toàn khỏi Three.js tại `src/sim/`, chạy không cần cửa sổ hay GPU:

```bash
node src/headless/cli.js --seed <int> --night 1 \
  [--scenario <file.json>] [--inputs <file.json>] \
  --ticks <int> --out <file.jsonl> [--snapshot-every 10]
```

- Thoát `0` khi hoàn tất; thoát `2` khi file `--scenario` hoặc `--inputs` sai JSON/schema; thoát khác `0` khi lỗi tham số/IO.
- Đảm bảo tính tất định byte-for-byte với cùng `--seed`, `--scenario` và `--inputs`.

---

## Sáng tạo của tôi

Toàn bộ phần mở rộng được giữ **100% ở tầng hiển thị & âm thanh** (`src/game/`), hoàn toàn không can thiệp vào `src/sim/` hay đầu ra JSONL của Test Contract:

1. **Dòng đom đóm dẫn đường (`src/game/renderer.js`):** Khi Mây mang đủ ánh sáng thắp một đèn (`>= 4` đom đóm), các tia sáng vàng ấm bay thành vòng cung nhẹ từ đèn nón lá chỉ hướng về Đèn Lồng chưa sáng gần nhất.
2. **Thắp sáng bầu trời 5 tầng & Ký Ức Đảo Bến (`src/game/renderer.js`, `src/game/hud.js`):** Mỗi lần thắp thêm một Đèn Lồng Lớn, sương đêm loãng dần, ánh sáng chuyển từ tím đêm sang hoàng hôn vàng ấm, 3 đèn trời nhỏ bay lên và hiện một câu chuyện ngắn về Đảo Bến.
3. **Âm thanh ngũ cung Web Audio (`src/game/audio.js`):** Tự tổng hợp chuông gió, tiếng nạp đèn và sóng tỏa sáng theo thang âm ngũ cung Việt Nam (D-E-G-A-B), không cần file âm thanh ngoài.

**Bằng chứng phần lõi không bị ảnh hưởng:**
- `tests/unit.test.js` kiểm tra tĩnh xác nhận `src/sim/` và `src/headless/` không import `three` hay API trình duyệt/random không tất định.
- `npm run verify` kiểm chứng tất cả 17 test và băm SHA-256 (`36a93e5c08a3`) hai lần chạy headless giống hệt nhau từng byte.

---

## Tài liệu & Harness SDLC

- Bằng chứng Phase 1: [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Giả định & tiêu chí nghiệm thu: [docs/notes/phase-1-assumptions.md](docs/notes/phase-1-assumptions.md)
- Nhật ký dùng AI & token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- AI Harness: [AGENTS.md](AGENTS.md) · Skill: [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · Hook: [.githooks/pre-commit](.githooks/pre-commit)
- Tài liệu gốc của Lab: [GUIDE.md](GUIDE.md) · [SUBMISSION.md](SUBMISSION.md) · [RUBRIC.md](RUBRIC.md) · [RULES.md](RULES.md) · [CHECKPOINTS.md](CHECKPOINTS.md)
- Nguồn & Giấy phép: [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
