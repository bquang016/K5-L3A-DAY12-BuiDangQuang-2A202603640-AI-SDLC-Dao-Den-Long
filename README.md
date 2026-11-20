# Đảo Đèn Lồng (Lantern Island) — Phase 2: Ba Hòn Đảo

> **Video Demo:** *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*  
> **Màn chơi:** Đêm 1 (Đảo Bến) · Đêm 2 (Đảo Cau) · Đêm 3 (Đảo Chuông) · **Test Contract:** `v1.1` ([game.contract.json](game.contract.json))

Game 3D góc nhìn thứ ba qua **3 Đêm**: điều khiển **Mây** (áo sáng `#E8E2D0`, khăn đỏ `#C8102E`, đội nón lá treo đèn lồng) thu thập đom đóm thắp lại toàn bộ Đèn Lồng Lớn, tránh rơi xuống biển mây và đối phó **Bóng Mực**, **Gió Lạc** cùng cơn gió mạnh trên Đảo Chuông.

---

## Cài đặt & Chạy (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy trên macOS, Linux, Windows).

```bash
npm install      # 1. Cài đặt Three.js & Vite
npm run dev      # 2. Chơi chuỗi 3 Đêm trên trình duyệt (http://localhost:5173)
npm run verify   # 3. Kiểm chứng toàn bộ (26 test, determinism 3 Đêm, hiệu năng 21600 tick <= 30s, build)
```

---

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` / `Phím mũi tên` | Di chuyển (`6.0 m/s`, giữ điều khiển đầy đủ trên không) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, chỉ nhảy khi chạm đất) |
| `Shift` | Lướt (`14 m/s` trong `0.2s`, hồi chiêu `1.5s`, giữ nguyên độ cao) |
| `E` *(hoặc `F` / `Enter`)* | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (trong `2.0 m`) |
| `Q` *(hoặc `X`)* | Tỏa Sáng (`3` đom đóm, bán kính 3D `5 m`, đẩy `4 m`, choáng `2 s`, hồi `3 s`) |
| `Kéo chuột` *(hoặc `[` / `]`)* | Xoay camera (chỉnh độ nhạy & âm lượng trong **Cài đặt**) |
| `Esc` / `P` | Tạm dừng (`Tiếp tục`, `Chơi lại Đêm`, `Cài đặt`, `Về menu`) |
| `M` | Tắt / Bật nhanh âm thanh |

---

## Bản đồ 3 Đêm & Cơ chế mới

1. **Đêm 1 — Đảo Bến (`300s`):** Đảo tròn `r = 40 m`, `5` Đèn Lồng (`L1..L5`), Bóng Mực `4.0 m/s` sinh lúc `5s` (2 con) và mỗi `8s` (tối đa 6).
2. **Đêm 2 — Đảo Cau (`330s`):** Hai đảo `r = 28 m` nối bằng cầu tre (`x ∈ [26, 44], z ∈ [-2, 2]`), `2` bục nhảy phóng qua biển mây, `6` Đèn Lồng (`L1..L6`), **Bùa Gió** (`C1`) tăng tốc `7.2 m/s` + Lướt `0s` hồi chiêu trong `10s`, và **Gió Lạc** (`D1..D2`) rình cướp tối đa `3` đom đóm khi Mây mang `>= 5`.
3. **Đêm 3 — Đảo Chuông (`360s`):** Đảo `r = 45 m` gồm 3 tầng (`Y = 0, 3, 6`), vách đứng, `2` dốc thẳng tại góc `30°` & `150°`, bục nhảy lên tầng 2 cạnh **Tháp chuông** (`r = 2 m`), `7` Đèn Lồng (`L1..L7`), Bóng Mực `4.5 m/s` (tối đa 10), `2` Bùa Gió (`C1, C2`), và **gió mạnh** mỗi `30s` thổi `5s` (`2 m/s`, báo trước `2s`).

### Cách tính điểm chuẩn hóa (`game.contract.json` v1.1)
- `+10` mỗi đom đóm **nạp** vào đèn (`per_mote`)
- `+100` mỗi đèn được thắp sáng (`per_lantern`)
- `+5` mỗi Bóng Mực trúng Tỏa Sáng (`per_stun`, kể cả khi đang choáng)
- Thưởng khi thắng Đêm: `+ floor(giây còn lại) × 2 + Ngọn Lửa còn lại × 50`
- Tổng điểm hành trình là tổng điểm của các Đêm đã thắng.

---

## Chế độ Headless (Test Contract v1.1)

```bash
node src/headless/cli.js --seed <int> --night <1|2|3> \
  [--scenario <file.json>] [--inputs <file.json>] \
  --ticks <int> --out <file.jsonl> [--snapshot-every 10]
```

- Đạt **187 ms** cho một Đêm 3 đầy đủ `21.600` tick (vượt xa ngưỡng `<= 30s`).
- Thoát `0` khi thành công, `2` khi `--scenario`/`--inputs` sai JSON/schema, khác `0` khi lỗi CLI/IO.

---

## Sáng tạo của tôi

Toàn bộ mở rộng nằm hoàn toàn trong `src/game/`, giữ nguyên 100% đầu ra headless theo Contract v1.1:

1. **Dòng đom đóm dẫn đường (`src/game/renderer.js`):** Khi mang đủ `>= 10` đom đóm, các hạt sáng vàng bay dẫn hướng tới Đèn Lồng chưa sáng gần nhất.
2. **Đèn trời & Lời nhắn Ông Đăng (`src/game/renderer.js`, `src/game/hud.js`):** Giới thiệu từng Đêm qua lời dặn của Ông Đăng, thả 3 đèn trời mỗi lần thắp đèn và nhắc tương tác theo ngữ cảnh.
3. **Nhạc nền & Hiệu ứng âm thanh ngũ cung Web Audio (`src/game/audio.js`):** Tổng hợp thời gian thực toàn bộ âm thanh (nhạc đêm, nhặt, nạp, thắp đèn, nhảy, bục nhảy, lướt, tỏa sáng, va chạm, Bóng Mực xuất hiện, Gió Lạc cướp, gió mạnh, đếm ngược 10s cuối) mà không cần file audio ngoài.

**Bằng chứng phần lõi không bị ảnh hưởng:** `tests/unit.test.js` kiểm tra tĩnh xác nhận `src/sim/` và `src/headless/` không phụ thuộc render/API trình duyệt; `npm run verify` vượt qua 26/26 test và trùng khớp SHA-256 trên cả 3 Đêm.

---

## Tài liệu & Harness SDLC

- Đặc tả & tiêu chí nghiệm thu Phase 2: [docs/notes/phase-2-spec.md](docs/notes/phase-2-spec.md)
- Bằng chứng Phase 2: [docs/proof/phase-2.md](docs/proof/phase-2.md) · Phase 1: [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Nhật ký AI & token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Harness AI: [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.githooks/pre-commit](.githooks/pre-commit)
- Giấy phép & Nguồn: [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
