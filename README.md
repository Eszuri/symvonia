# My Music

Desktop music player untuk memutar file audio lokal (`D:\Anime_Ost`), dibangun dengan **Next.js** + **Tauri**.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, TypeScript
- **Desktop:** Tauri 2 (Rust)
- **Audio Metadata:** Lofty (Rust crate)

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Output installer ada di `src-tauri/target/release/bundle/`.
