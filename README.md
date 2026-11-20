# Đảo Đèn Lồng (Lantern Island) — Phase 3: Đèn Cạn Dầu

> **Video Demo:** *(Sẽ cập nhật ở Phase 4 / Release `v1.0.0`)*  
> **Màn chơi:** Đêm 1 (Đảo Bến) · Đêm 2 (Đảo Cau) · Đêm 3 (Đảo Chuông) · **Test Contract:** `v1.2` ([game.contract.json](game.contract.json))

Game 3D góc nhìn thứ ba qua **3 Đêm**: giữ lửa sống sót tới bình minh và bảo vệ đủ số Đèn Lồng Lớn không bị cạn dầu trước sức ép của **Bóng Mực hút dầu**, **Gió Lạc** và gió mạnh.

---

## Cài đặt & Chạy (tối đa 3 lệnh)

Yêu cầu: **Node.js >= 20** (macOS, Linux, Windows).

```bash
npm install      # 1. Cài đặt Three.js & Vite
npm run dev      # 2. Chơi chuỗi 3 Đêm trên trình duyệt (http://localhost:5173)
npm run verify   # 3. Kiểm chứng toàn bộ (32 test, determinism 3 Đêm, hiệu năng 18000 tick <= 30s, build)
```

---

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` / `Phím mũi tên` | Di chuyển (`6.0 m/s`, điều khiển đầy đủ trên không) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`) |
| `Shift` | Lướt (`14 m/s` trong `0.2s`, hồi chiêu `1.5s`, giữ nguyên độ cao) |
| `E` *(hoặc `F` / `Enter`)* | Nạp đom đóm vào đèn tắt, **thắp lại** (`5` đom đóm), hoặc **châm dầu** (`+10` dầu/đom đóm) |
| `Q` *(hoặc `X`)* | Tỏa Sáng (`3` đom đóm, bán kính 3D `5 m`, đẩy `4 m`, choáng `2 s`, hồi `3 s`) |
| `Kéo chuột` / `Ẩn chuột (Pointer Lock)` + `Cuộn` | Xoay camera 360° & Zoom góc nhìn (điều chỉnh độ nhạy & chế độ trong **Cài đặt**) |
| `C` | Chuyển đổi chế độ **Ẩn chuột xoay tự do** / **Kéo chuột** |
| `Esc` / `P` | Tạm dừng (`Tiếp tục`, `Chơi lại Đêm`, `Cài đặt` gồm **Chế độ mù màu**, `Về menu`) |
| `M` | Tắt / Bật nhanh âm thanh |

---

## Luật chơi Phase 3 & Cách tính điểm (`v1.2`)

1. **Nhiên liệu đèn (`0..100`):** Đèn đang sáng hao `1.0/s`. Đứng gần bấm `E` để châm dầu (`+10` dầu mỗi đom đóm). Khi `fuel < 30`, đèn & thanh dầu nhấp nháy chậm `1 Hz` và **mất vùng an toàn `6m`**.
2. **Bóng Mực hút dầu (`drain`):** Bóng Mực ở trạng thái `wander` tự tìm tới đèn sáng có `fuel < 30`, áp sát `<= 2m` để hút `5/s` (cộng dồn). Tỏa Sáng làm choáng Bóng Mực đang `drain` được **`+15` điểm** (thay vì `+5`). Châm dầu lên `>= 30` sẽ đẩy Bóng Mực trong `6m` ra ngoài.
3. **Thắp lại & Sức chứa tăng dần:** Đèn cạn dầu sẽ tắt (`lantern_out`), thắp lại chỉ cần **`5` đom đóm** (`+40` điểm). Mỗi lần thắp thành công (mới hoặc thắp lại) tăng sức chứa thêm `+2` (tối đa **`20`**).
4. **Thắng ở Bình Minh (`dawn_survived`):** Thời lượng Đêm là `240s / 270s / 300s`. Không còn thắng sớm khi thắp hết đèn; phải sống sót tới bình minh với số đèn sáng **`>= ceil(0.6 × tổng đèn)`** (`3/5` Đêm 1, `4/6` Đêm 2, `5/7` Đêm 3).
5. **Điểm số (`v1.2`):** `+5` mỗi đom đóm nạp/châm · `+100` thắp lần đầu · `+40` thắp lại · `+5` Tỏa Sáng (`+15` nếu đang `drain`) · Khi thắng bình minh: `+ (50 + floor(fuel))` mỗi đèn đang sáng `+ 50` mỗi Ngọn Lửa còn lại.
6. **Chế độ mù màu (Cài đặt):** Đổi viền & mắt Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`, và đèn tắt xẹp `20%` kèm vết rách trên giấy đèn.

---

## Chế độ Headless (Test Contract v1.2)

```bash
node src/headless/cli.js --seed <int> --night <1|2|3> \
  [--scenario <file.json>] [--inputs <file.json>] \
  --ticks <int> --out <file.jsonl> [--snapshot-every 10]
```

- Đạt **552 ms** cho Đêm 3 đầy đủ `18.000` tick (vượt xa ngưỡng `<= 30s`).
- Thoát `0` khi thành công, `2` khi `--scenario`/`--inputs` sai JSON/schema, khác `0` khi lỗi CLI/IO.

---

## Sáng tạo của tôi

Toàn bộ mở rộng chỉ nằm trong `src/game/`, giữ nguyên 100% đầu ra headless theo Contract `v1.2`:

1. **Dòng đom đóm dẫn đường thích ứng (`src/game/renderer.js`):** Tự động ưu tiên dẫn đường về đèn sắp cạn dầu (`fuel < 30`) khi đang mang đom đóm, hoặc đèn tắt gần nhất khi đủ ánh sáng thắp/thắp lại.
2. **Đèn trời & Lời nhắn Ông Đăng (`src/game/renderer.js`, `src/game/hud.js`):** Giới thiệu luật từng Đêm qua lời Ông Đăng, thả đèn trời khi thắp sáng và thông báo sức chứa mới.
3. **Âm thanh ngũ cung Web Audio (`src/game/audio.js`) & Đồ họa PBR thủ tục + Pointer Lock (`src/game/textures.js`, `src/game/input.js`):** Âm thanh tổng hợp thời gian thực, texture gỗ/cỏ/cát/đá, mặt trăng, cỏ lay gió instanced, và chế độ ẩn chuột xoay 360° (`C`).

**Bằng chứng phần lõi không bị ảnh hưởng:** `tests/unit.test.js` kiểm tra tĩnh `src/sim/` và `src/headless/` hoàn toàn sạch phụ thuộc render; `npm run verify` vượt qua **32/32 test** và trùng khớp SHA-256 trên cả 3 Đêm.

---

## Tài liệu & Harness SDLC

- ADR thay đổi Phase 3: [docs/notes/adr-001-lantern-fuel-and-dawn-survival.md](docs/notes/adr-001-lantern-fuel-and-dawn-survival.md)
- Changelog & Breaking Changes: [CHANGELOG.md](CHANGELOG.md)
- Bằng chứng: [docs/proof/phase-3.md](docs/proof/phase-3.md) · [docs/proof/phase-2.md](docs/proof/phase-2.md) · [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Nhật ký AI & Đặc tả: [docs/notes/ai-log.md](docs/notes/ai-log.md) · [docs/notes/phase-2-spec.md](docs/notes/phase-2-spec.md)
- Harness AI: [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.githooks/pre-commit](.githooks/pre-commit)
- Giấy phép & Nguồn: [CREDITS.md](CREDITS.md) · [LICENSE](LICENSE)
