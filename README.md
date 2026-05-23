# My Music

Desktop music player untuk memutar file audio lokal, dibangun dengan **Next.js** + **Tauri** + **Rust**. Menampilkan metadata lagu (cover art, title, artist, album) dari file audio dan dapat mengatur wallpaper desktop secara otomatis sesuai cover art yang sedang diputar.

## Fitur

- **File Explorer** — navigasi folder dan file audio (mp3, flac, ogg, wav, m4a, wma)
- **Metadata** — membaca title, artist, album, cover art dari embedded tag audio via Rust/Lofty
- **Playback** — play/pause, next/prev, seek bar, volume control
- **Auto Wallpaper** — cover art lagu otomatis menjadi wallpaper desktop Windows
- **Default Wallpaper** — gambar kustom (`src-tauri/default.png`) sebagai wallpaper saat lagu tanpa cover atau aplikasi ditutup
- **Dark Theme** — UI gelap dengan aksen hijau

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Desktop | Tauri 2 (Rust) |
| Audio Metadata | Lofty 0.22 |
| Image Processing | image 0.25 |
| Target Platform | Windows |

## Struktur Proyek

```
├── app/
│   ├── layout.tsx              # Root layout (Geist font)
│   ├── page.tsx                # Halaman utama (single-page)
│   ├── globals.css             # Global styles + Tailwind
│   └── components/
│       ├── FolderExplorer.tsx   # Sidebar file tree
│       ├── PlayerPanel.tsx      # Cover art + metadata
│       ├── SeekBar.tsx          # Progress slider
│       ├── PlaybackControls.tsx # Prev/Play/Next
│       └── VolumeControl.tsx    # Volume slider
├── src-tauri/
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri config
│   ├── default.png             # Default wallpaper image
│   ├── icons/                  # App icons
│   └── src/
│       ├── lib.rs              # Tauri commands (Rust)
│       └── main.rs             # Entry point
├── public/                     # Static assets
├── next.config.ts              # Next.js SSG config
└── package.json
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (system dependencies)

## Development

```bash
npm install
npm run tauri dev
```

## Build Installer

```bash
npm run tauri build
```

Output installer (`.msi` / `.exe`) ada di `src-tauri/target/release/bundle/msi/`.

## Kustomisasi

### Default Wallpaper

Ubah file atau tempatkan file di `src-tauri/default.png` dengan gambar yang diinginkan. Gambar akan di-embed ke binary dan dikonversi ke BMP secara otomatis saat runtime.

### Root Music Path

Root path audio saat ini hardcoded di `app/page.tsx:10`:

```typescript
const ROOT_PATH = 'MUSIC_FOLDDER';
```

Sesuaikan dengan lokasi folder musik kamu.
