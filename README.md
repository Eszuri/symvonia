<p align="center">
  <img src="public/icon.png" alt="Symvonia" width="96" />
</p>

# Symvonia — Desktop Music Player for Windows

**Symvonia** is a free, open-source desktop music player for Windows 
built with Tauri, Rust, and Next.js

<p align="center">
  <img src="screenshots/hero.png" alt="Symvonia Screenshot" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/eszuri/symvonia/releases/latest">
    <img src="https://img.shields.io/github/v/release/eszuri/symvonia?style=flat-square&color=22c55e" alt="Release" />
  </a>
  <a href="https://github.com/eszuri/symvonia/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/eszuri/symvonia?style=flat-square&color=22c55e" alt="License" />
  </a>
  <a href="https://github.com/eszuri/symvonia">
    <img src="https://img.shields.io/github/stars/eszuri/symvonia?style=flat-square&color=22c55e" alt="Stars" />
  </a>
</p>

---

## Tentang Symvonia

Symvonia adalah desktop music player untuk Windows yang dirancang untuk pecinta musik dengan koleksi file audio lokal. Berbeda dengan music player biasa, Symvonia memiliki fitur unik: **wallpaper desktop otomatis berubah mengikuti cover art lagu yang sedang diputar**.

Setiap lagu yang kamu putar akan mengubah tampilan desktop secara instan, menciptakan pengalaman mendengarkan musik yang lebih imersif dan personal.

Symvonia juga mendukung **streaming web** — buka YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, Bandcamp, Deezer, Tidal, atau URL media apapun langsung dari dalam aplikasi melalui jendela webview terintegrasi, dengan riwayat pemutaran yang tersimpan secara otomatis.

---

## Fitur Utama

### Pemutaran Musik Lokal

- **Play, Pause, Next, Previous** — Kontrol dasar dengan respons instan
- **Shuffle** — Putar lagu secara acak dari playlist yang sedang aktif
- **Repeat** — Ulangi satu lagu (Repeat One), seluruh playlist (Repeat All), atau matikan
- **Auto-advance** — Otomatis pindah ke lagu berikutnya saat lagu selesai
- **Playlist persisten** — Navigasi ke folder lain tidak menghentikan playlist yang sedang berjalan
- **Multiple audio formats** — MP3, FLAC, OGG, WAV, M4A, WMA, dengan filter format yang bisa dikustomisasi

### Streaming Web

Putar media dari platform streaming langsung di jendela terpisah tanpa meninggalkan aplikasi:

- **8 platform siap pakai** — YouTube, YouTube Music, Spotify, SoundCloud, Apple Music, Bandcamp, Deezer, Tidal
- **URL Media** — Tempel URL dari platform manapun untuk diputar di webview
- **History otomatis** — URL yang pernah diputar tercatat dan dikelompokkan per domain, bisa dihapus per grup atau semua
- **Polling URL** — Tauri webview secara otomatis memantau navigasi SPA (pushState/replaceState) dan mencatat perubahan URL
- **Deteksi media otomatis** — Mendeteksi halaman track, album, playlist, shorts, dan episode dari berbagai platform

### Auto Wallpaper

Fitur unggulan Symvonia. Saat lagu diputar, cover art yang tertanam di file audio akan otomatis menjadi wallpaper desktop kamu.

- **Aktif/nonaktifkan** — Toggle di Settings jika tidak ingin wallpaper berubah
- **Default wallpaper** — Pilih gambar sendiri sebagai wallpaper saat lagu tanpa cover art atau saat aplikasi ditutup
- **Reset saat tutup** — Opsi kembalikan wallpaper ke default saat aplikasi ditutup, agar desktop kembali normal

### Eksplorasi File

- **Folder picker** — Pilih folder mana saja di komputer sebagai koleksi musik
- **Navigasi folder** — Masuk ke subfolder, kembali ke folder induk dengan mudah
- **Filter format** — Tampilkan hanya format yang kamu inginkan (MP3, FLAC, OGG, WAV, M4A, WMA, atau custom via Settings)
- **Sorting fleksibel** — Urutkan folder dan file berdasarkan nama, tanggal modifikasi, tanggal dibuat, ukuran, atau tipe file, dengan arah ascending/descending

### Info & Metadata

Panel detail di sisi kanan menampilkan informasi lengkap tentang lagu yang sedang diputar:

- **Info lagu** — Judul, artis, album, genre, tahun, nomor track, nomor disc
- **Info teknis** — Bitrate, sample rate, channel, durasi
- **Info file** — Nama file, ukuran, lokasi, tanggal dibuat dan dimodifikasi
- **Cover art** — Tampilan besar cover art yang tertanam di file audio
- **Komentar** — Menampilkan comment tag jika tersedia

### Keyboard Shortcuts

Kontrol musik tanpa menyentuh mouse:

| Tombol | Fungsi |
|--------|--------|
| `Space` | Play / Pause |
| `N` | Lagu berikutnya |
| `P` | Lagu sebelumnya |
| `→` | Volume naik (step 0.05) |
| `←` | Volume turun (step 0.05) |
| `F12` | Buka DevTools (debug) |

### Kustomisasi Tampilan

- **14 warna aksen** — Green, Blue, Purple, Pink, Red, Orange, Yellow, Teal, Cyan, Indigo, Rose, Lime, Amber, Emerald
- **Custom color** — Pilih warna aksen sendiri via color picker atau input hex
- **Dark theme** — Tampilan gelap yang nyaman di mata dengan efek blur dan animasi halus
- **Resizable layout** — Sidebar kiri (daftar lagu) dan panel kanan (detail metadata) bisa di-drag untuk mengatur lebar sesuai preferensi
- **Compact mode** — Otomatis mengaktifkan mode ringkas saat window diperkecil (&lt;900px), dengan tombol toggle sidebar List dan Info

### Settings

Semua preferensi tersimpan otomatis dan persisten di localStorage:

- **General** — Folder musik, auto wallpaper, default wallpaper, reset on close, check for update
- **Sort** — Urutan folder dan file, arah urutan (ascending/descending), serta filter format audio yang ditampilkan (MP3, FLAC, OGG, WAV, M4A, WMA, atau custom)
- **Style** — Tema, warna aksen (14 preset + custom color picker/hex), reset lebar sidebar
- **About** — Info versi app, tech stack badges, dan tautan GitHub
- **Debug** — Log viewer (console.error, console.warn, unhandled errors, rejections) untuk troubleshooting

### Auto Update

Symvonia bisa memeriksa dan menginstall update secara otomatis langsung dari aplikasi menggunakan `tauri-plugin-updater`. Cukup klik **Check for Update** di Settings > General. Proses download menampilkan progress, dan update diinstall otomatis setelah selesai.

### Error Handling & Notifikasi

- **Toast notification** — Notifikasi error muncul di pojok kanan atas dengan animasi halus, menghilang otomatis setelah 4 detik
- **Debug log** — Semua error dan warning tercatat di panel Debug dengan timestamp, bisa digunakan untuk troubleshooting

---

## Screenshots

<p align="center">
  <img src="screenshots/player.png" alt="Player View" width="49%" />
  <img src="screenshots/settings.png" alt="Settings" width="49%" />
</p>

---

## Instalasi

### Installer (Windows)

Download file `.msi` atau `.exe` dari [Releases](https://github.com/eszuri/symvonia/releases/latest), lalu jalankan installer.

### Development

```bash
git clone https://github.com/Eszuri/symvonia.git
cd symvonia
npm install
npm run tauri dev
```

> **Prerequisites:**
> - **Node.js** ≥ 18.18 (untuk Next.js 16)
> - **Rust toolchain** ≥ 1.77.2 (rustc, cargo — [install via rustup](https://rustup.rs/))
> - **System deps** — Windows: Microsoft Visual Studio Build Tools atau [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (diperlukan oleh Tauri)

### Build dari Source

```bash
npm run tauri build
```

Output installer ada di `src-tauri/target/release/bundle/`.

---

## Cara Penggunaan

1. **Buka Symvonia** — Aplikasi akan menampilkan halaman welcome dengan tombol "Pilih Folder Musik"
2. **Pilih folder musik** — Klik tombol "Pilih Folder Musik" dan pilih folder yang berisi koleksi audio kamu
3. **Putar lagu** — Double-click file audio dari daftar di sidebar kiri
4. **Streaming** (opsional) — Klik tombol **Streaming** di pojok kiri atas header untuk membuka modal platform streaming atau memasukkan URL media
5. **Nikmati** — Wallpaper desktop akan otomatis berubah mengikuti cover art lagu

---

## Tech Stack

| Layer        | Teknologi                                      |
| ------------ | ---------------------------------------------- |
| Framework    | Next.js 16.2.6 (App Router, Static Export)    |
| UI           | React 19.2.4, TypeScript 5                    |
| Styling      | Tailwind CSS v4                                |
| Animation    | Framer Motion ≥12.40                           |
| Desktop      | Tauri 2.11.2 (Rust)                            |
| *JS API*     | @tauri-apps/api 2.11, @tauri-apps/plugin-updater 2.10 |
| Audio Meta   | lofty 0.22 (Rust)                              |
| Image Proc   | image 0.25 (Rust)                              |
| File Dialog  | rfd 0.15 (Rust)                                |
| Encoding     | base64 0.22 (Rust)                             |
| Ser/De       | serde 1.0 + serde_json (Rust)                  |
| Logging      | tauri-plugin-log 2 + log 0.4 (Rust)            |
| Updater      | tauri-plugin-updater 2 (Rust)                  |
| MSRV         | Rust 1.77.2 (edition 2021)                     |

---

## Struktur Proyek

```
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── lib/
│   │   └── colors.ts            # Accent color system (14 preset + custom CSS vars)
│   └── components/
│       ├── ConfirmDialog.tsx     # Konfirmasi modal (folder change)
│       ├── FolderExplorer.tsx    # Sidebar file tree (resizable)
│       ├── MetadataPanel.tsx     # Panel detail metadata (resizable)
│       ├── PlayerPanel.tsx       # Cover art + info lagu
│       ├── PlaybackControls.tsx  # Play/Prev/Next + Shuffle/Repeat toggle
│       ├── SeekBar.tsx           # Progress bar + time display
│       ├── SettingsModal.tsx     # Settings (5 sections: General, Sort, Style, About, Debug)
│       ├── StreamingModal.tsx    # Streaming platform grid + URL media + history
│       └── VolumeControl.tsx     # Volume slider + mute
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json            # Permissions (core + updater)
│   ├── icons/
│   │   ├── icon.png
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── icon.icns
│   │   └── icon.ico
│   └── src/
│       ├── lib.rs                  # Tauri commands (list_files, get_metadata, wallpaper, streaming webview)
│       └── main.rs                 # Entry point
├── public/
│   └── icon.png                    # App icon
├── screenshots/
│   ├── hero.png
│   ├── player.png
│   └── settings.png
├── next.config.ts
└── package.json
```

---

## Tauri Commands

| Command | Deskripsi |
|---------|-----------|
| `list_files` | List file + folder dengan sort/filter |
| `get_metadata` | Baca metadata audio (tag, cover art, tech info) |
| `set_wallpaper` | Set desktop wallpaper dari cover art (base64 → BMP) |
| `clear_wallpaper` | Kembalikan ke wallpaper default atau kosongkan |
| `pick_folder` | Dialog folder picker |
| `pick_wallpaper` | Dialog file picker untuk gambar wallpaper |
| `set_default_wallpaper_path` | Simpan path wallpaper default |
| `get_default_wallpaper_path` | Ambil path wallpaper default |
| `set_reset_on_close` | Toggle reset wallpaper saat aplikasi ditutup |
| `open_webview_stream` | Buka URL di jendela webview baru + polling URL SPA |

---

## Lisensi

MIT
