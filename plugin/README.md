# Symvonia Plugins Directory

Direktori ini berisi kode sumber untuk plugin eksternal yang digunakan oleh **Symvonia Player** sebagai *headless sidecar background engines* via komunikasi **Stdio JSON IPC**.

---

## 🧩 Daftar Plugin

### 1. `src-ai-lyrics` — Local AI Lyrics Generator Engine
Engine transkripsi lirik otomatis offline menggunakan model kecerdasan buatan (AI) Speech-to-Text lokal.

- **Teknologi**: .NET 8.0, `Whisper.net` (v1.9.1), NAudio
- **Nama Executable**: `symvonia-ai-lyrics.exe`
- **Fitur**:
  - Transkripsi lirik otomatis dengan timestamp format LRC (`[mm:ss.xx]`)
  - 100% Offline & Lokal tanpa ketergantungan koneksi internet
  - Mendukung 12+ pilihan bahasa (`auto`, `id`, `en`, `ja`, `ko`, `zh`, `es`, `fr`, `de`, `ru`, `pt`, `it`)
  - Mendukung berbagai ukuran model Whisper (`base`, `tiny`, `small`)
  - Pengunduhan model otomatis dari HuggingFace jika belum tersedia

#### Struktur Berkas & Dependency Native:
Agar engine `Whisper.net` dapat memuat *native C++ library*, struktur output publish harus menyertakan berkas DLL berikut di folder utama dan di subdirektori `runtimes/win-x64/`:
- `symvonia-ai-lyrics.exe`
- `whisper.dll`
- `ggml-whisper.dll`
- `ggml-base-whisper.dll`
- `ggml-cpu-whisper.dll`
- `runtimes/win-x64/*.dll`

#### Perintah Build:
```bash
dotnet publish plugin/src-ai-lyrics/AiLyricsPlugin.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o plugin/src-ai-lyrics/publish
```
*Atau gunakan skrip otomatis:* `.\build-plugin-lyrics.bat`

### 2. `src-wallpaper-engine` — Standalone Direct3D11/HLSL Wallpaper Renderer
Engine wallpaper desktop mandiri untuk Windows yang tidak bergantung pada Tauri atau audio engine.

- **Teknologi**: C++20, Win32, Direct3D 11, HLSL Shader Model 5
- **Nama Executable**: `symvonia-wallpaper-engine.exe`
- **Fitur MVP**:
  - Satu render window per monitor di belakang ikon desktop (`WorkerW`/`Progman`)
  - Fullscreen triangle shader dengan parameter waktu, resolusi, dan intensitas
  - Texture cover PNG/JPEG/BMP melalui Windows Imaging Component
  - Kontrol pause/resume/stop, FPS, shader parameter, dan `get_state`
  - Line-delimited JSON IPC melalui `stdin`/`stdout`
- **Tidak bergantung pada**: Tauri, `AppHandle`, atau runtime audio

#### Build Wallpaper Engine

```powershell
.\build-plugin-wallpaper.bat
```

Output berada di `plugin/src-wallpaper-engine/publish/` bersama folder `shaders/` dan `manifest.json`.

---

## 📡 Protokol Komunikasi (Stdio JSON IPC)

Setiap plugin berjalan sebagai *standalone headless console application* yang menerima perintah JSON per baris melalui `stdin` dan mengirim respons/event JSON per baris melalui `stdout`.

### Contoh Format Perintah (`stdin`):
```json
{
  "command": "transcribe",
  "path": "C:\\Music\\song.flac",
  "modelName": "base",
  "language": "id",
  "modelsDir": "C:\\Users\\...\\AppData\\...\\plugins\\ai-lyrics\\models"
}
```

### Contoh Format Event (`stdout`):
```json
{
  "event": "progress",
  "percent": 45,
  "segmentText": "Aku ingin mencintaimu dengan sederhana",
  "timestamp": "[01:23.45]"
}
```

---

## 📂 Lokasi Instalasi Runtime pada Symvonia Player

Saat diunduh atau diimpor oleh Symvonia Player, plugin dipasang pada direktori `AppData` pengguna:
- **AI Lyrics Plugin**: `%APPDATA%\com.symvonia.player\plugins\ai-lyrics\`
- **Wallpaper Engine**: `%APPDATA%\com.symvonia.player\plugins\wallpaper-engine\`

---

## ⚡ Perintah Terminal Unduh Manual (PowerShell)

Jika Anda ingin mengunduh model AI Whisper atau berkas plugin secara manual menggunakan Terminal (PowerShell / Command Prompt), gunakan perintah berikut:

### 1. Membuat Folder Target Model AI:
```powershell
$modelsDir = "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models"
New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
```

### 2. Mengunduh Model Whisper AI:

- **Model Base (141 MB - Standard / Recommended)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-base.bin"
```

- **Model Tiny (74 MB - Ringan & Cepat)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-tiny.bin"
```

- **Model Small (465 MB - Akurasi Tinggi)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-small.bin"
```

- **Model Medium (1.46 GB - Presisi Sangat Tinggi)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-medium.bin"
```

- **Model Large v3 Turbo (1.54 GB - Generasi Terbaru Cepat & Presisi)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-large-v3-turbo.bin"
```

- **Model Large v3 (2.95 GB - Presisi & Akurasi Maksimal)**:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin" -OutFile "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models\ggml-large-v3.bin"
```

---

### 3. Mengunduh Seluruh Model Sekaligus (PowerShell One-Liner):
```powershell
$m = "$env:APPDATA\com.symvonia.player\plugins\ai-lyrics\models"; New-Item -ItemType Directory -Path $m -Force; @("tiny","base","small","medium","large-v3-turbo","large-v3") | ForEach-Object { Write-Host "Downloading ggml-$_.bin..."; Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$_.bin" -OutFile "$m\ggml-$_.bin" }
```
