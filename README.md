# Symvonia

Desktop music player untuk memutar file audio lokal, dibangun dengan **Next.js SSG** + **Tauri 2** + **Rust**. Membaca metadata lagu (cover art, title, artist, album, genre, dan lainnya), auto wallpaper dari cover art, serta UI modern dengan animasi dan aksen warna kustom.

> Author: Eszuri  
> Website: [example.com](https://example.com)

## Fitur

### Musik
- **Playback** — Play/Pause, Next/Previous, Shuffle, Repeat (Off/All/One)
- **Seek Bar** — Progress slider dengan gradient aksen dan glow hover
- **Volume** — Slider + mute toggle dengan SVG icon dinamis
- **Playlist** — Auto-advance ke lagu berikutnya, playlist tidak terpengaruh navigasi folder
- **Keyboard Shortcuts** — `Space` play/pause, `N` next, `P` previous, `←→` volume

### UI/UX
- **3-Panel Layout** — Sidebar file list | Player tengah | Detail metadata kanan
- **Resizable Sidebars** — Lebar sidebar kiri & panel detail bisa di-drag (disimpan otomatis)
- **Responsive Compact** — Window < 900px: sidebar auto collapse, toggle buttons di header
- **Accent Color** — 14 preset warna + custom via color picker
- **Dark Theme** — Full dark dengan backdrop blur dan animasi
- **Framer Motion** — Animasi transisi, hover, stagger children di seluruh UI
- **Confirm Dialog** — Dialog konfirmasi dengan backdrop blur sebelum aksi destruktif

### Metadata & Detail
- **Info Lagu** — Title, Artist, Album, Genre, Year, Track (N/D), Disc (N/D), Duration
- **Info Teknis** — Bitrate, Sample Rate, Channel, Format, Ukuran file
- **Info File** — Nama file, tanggal dibuat & dimodifikasi, lokasi full path
- **Komentar** — Menampilkan comment tag jika tersedia

### Wallpaper
- **Auto Wallpaper** — Cover art lagu otomatis jadi wallpaper desktop (toggle di Settings)
- **Default Wallpaper** — Gambar kustom sebagai wallpaper saat lagu tanpa cover / aplikasi tutup
- **Reset on Close** — Opsi kembalikan wallpaper default saat aplikasi ditutup (toggle)

### Settings
- **General** — Folder Musik (pick/dialog), Auto Wallpaper, Wallpaper Default, Reset on Close, Check for Update
- **Sort** — Urutkan folder/file berdasarkan Nama, Modified Time, Size, Type, Created Time; Ascending/Descending
- **Format Filter** — Pilih format file (mp3, flac, ogg, dll) + custom format
- **Style** — Tema, Aksen warna (14 preset + custom hex), Reset lebar sidebar
- **Debug** — Log viewer real-time dengan level warna, auto-scroll
- **About** — Version 0.3.0, author, website, tech stack detail

### Auto-Update
- **GitHub Releases** — Cek versi baru via `tauri-plugin-updater`, download + install otomatis dari Settings

## Tech Stack

| Layer       | Teknologi                                 |
| ----------- | ----------------------------------------- |
| Framework   | Next.js 16.2 (App Router, Static Export) |
| UI          | React 19.2, TypeScript 5                 |
| Styling     | Tailwind CSS v4                           |
| Animation   | Framer Motion 12.4                        |
| Desktop     | Tauri 2.11 (Rust)                         |
| Audio Meta  | Lofty 0.22                                |
| Image       | image 0.25                                |
| File Dialog | rfd 0.15                                  |
| Encoding    | base64 0.22                               |
| Ser/De      | serde 1.0 + serde_json                    |
| Updater     | tauri-plugin-updater 2                    |

## Struktur Proyek

```
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── lib/
│   │   └── colors.ts            # Accent color system (14 preset + custom CSS vars)
│   └── components/
│       ├── ConfirmDialog.tsx     # Konfirmasi modal
│       ├── FolderExplorer.tsx    # Sidebar file tree (resizable)
│       ├── MetadataPanel.tsx     # Panel detail metadata (resizable)
│       ├── PlayerPanel.tsx       # Cover art + info lagu
│       ├── PlaybackControls.tsx  # Play/Prev/Next + Shuffle/Repeat toggle
│       ├── SeekBar.tsx           # Progress bar + time display
│       ├── SettingsModal.tsx     # Settings (5 sections)
│       └── VolumeControl.tsx     # Volume slider + mute
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json            # Permissions (core + updater)
│   ├── icons/
│   └── src/
│       ├── lib.rs                  # Tauri commands
│       └── main.rs                 # Entry point
├── public/
│   └── icon.png                    # App icon
├── next.config.ts
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) (stable, 1.77+)
- [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

## Build Installer (Windows)

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/msi/` (`.msi` / `.exe`)

## License

MIT
