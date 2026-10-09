'use client';

import {type Lang} from '../../lib/translations';


const changelogEn = [
    {
        version: '1.0.6',
        items: [
            'Direct3D 11 Wallpaper Engine: Hardware-accelerated desktop shader engine with visual effects and cover art transitions.',
            'Dual Wallpaper Modes: Dedicated controls for native Windows wallpaper (WinAPI) and Direct3D 11 shader engine.',
            'Library Caching & Performance: Instant folder loading with native cache indexing and real-time directory watcher.',
            'Customizable Toolbar Columns: Reorder, show, or hide audio metadata columns in the track explorer.',
            'Storage & Cache Settings: New section to view disk usage and clear library cache.',
            'Audio Engine Improvements: More reliable device handling and mode switching during playback.',
        ],
    },
    {
        version: '1.0.5',
        items: [
            'Unified Audio Engine: Merged WASAPI Shared & Exclusive playback, Equalizer DSP, and Tag Editor into a single plugin.',
            'Simplified Plugin Architecture: Reduced to 2 plugins — Unified Audio Engine & AI Lyrics Generator.',
            'Fixed WASAPI pause/resume in both Shared and Exclusive modes.',
        ],
    },
    {
        version: '1.0.4',
        items: [
            'Bug fixes and stability improvements.',
        ],
    },
    {
        version: '1.0.3',
        items: [
            'Local AI Lyrics Generator: Generate synchronized LRC lyrics offline using Whisper AI models (Tiny, Base, Small, Medium, Large) with real-time progress and CPU multi-threading.',
            'AI Vocal Separation & Extraction: Integrated AI vocal isolation (Demucs ONNX) to extract clear vocal tracks and boost transcription accuracy.',
            'Online Lyrics Search (LRCLIB): Search, preview, and fetch synchronized or plain lyrics directly within the app with one-click file and ID3 metadata saving.',
            'Track Metadata Editor: View and edit audio tags (Title, Artist, Album, Genre, Year) and embed cover art directly into audio files.',
            'Spotify-Style Layout & New Accent Themes: Added Spotify-style interface layout option and new "Sky" and "Zinc" accent color themes.',
            'Plugin Security & SHA-256 Integrity: Automated release checksums, download integrity verification, and dynamic JSON challenge-response handshake for audio and AI plugins.',
            'Audio Engine & Equalizer Enhancements: Improved Web Audio graph initialization, seamless AudioContext resumption, and multi-band equalizer persistence (5, 10, 15, and 31 bands).',
            'UI Performance & State Optimization and thorough cleanup on component unmount.',
        ],
    },
    {
        version: '1.0.2',
        items: [


            'Bit-Perfect Engine Enhancements: Fixed WASAPI Exclusive pause/resume audio distortion, realtime seekbar tracking, and playlist/state sync across page reloads.',
            'Multi-Layer Local Plugin Security: Added a 5-layer verification pipeline (PE Header, CUI Subsystem, & Dynamic Challenge-Response Token) for local .exe plugin imports.',
            'Plugin Download Controls: Added a dedicated "Cancel Download" button and automatic background stream termination on app close.',
            'Metadata & Lyrics Tab Persistence: Remembers and restores your last active tab (Metadata / Lyrics) in the right panel upon application startup or reload.',
            'Clean Alert Toast Notifications: Relocated inline file explorer error banners into floating toast popups.',
            'Refined Plugin Manager UI: Redesigned plugin management interface with capsule status badges, executable path info, SVG icons, and polished terminology.',
            'Resolved Windows OS Error 1224: Timestamped wallpaper temp files to eliminate file mapping locks on startup.',
        ],
    },
    {
        version: '1.0.1',
        items: [
            'Added Audio Fade In & Fade Out on play, pause, resume, and track skipping with customizable duration in Settings.',
            'Embedded lyrics feature directly inside the right-hand Metadata Panel with a horizontal navbar switcher.',
            'Synchronized timestamp auto-scrolling, click-to-seek, and manual LRC file import for lyrics.',
            'Strict & accurate Hi-Res Audio detection based on JEITA/RIAA standards (lossless formats only: FLAC, WAV, ALAC, AIFF, DSD).',
            'Added Bit Depth metadata extraction and display in technical specifications.',
            'Updated navbar tab switcher icons with modern document/audio design.',
            'Cleaned up top header UI by removing redundant center title text.',
            'Fixed missing translation and updated UI language dictionaries.',
        ],
    },
    {
        version: '1.0.0',
        items: [
            'Full bilingual support — all UI text, notifications, and messages now follow the selected language.',
            'Added per-field hover descriptions throughout the app for a clearer, more informative experience.',
            'Status bar now shows contextual notifications: cover art saved confirmation and volume limit warnings.',
            'Cover art size is now displayed in the metadata panel.',
            'Playlist now correctly stays in the original folder when navigating the file explorer during playback.',
            'Playlist automatically updates when sort or format settings change.',
            'Session is now fully restored on startup — next/prev works immediately without needing to press play first.',
            'Wallpaper updates are now non-blocking, eliminating the brief freeze after pressing play.',
            'Right-click menu is now available across all interactive areas of the app.',
            'Significant performance improvements: reduced re-renders, faster startup, and lower resource usage.',
            'Improved skeleton loading screens.',
        ],
    },
    {
        version: '0.9.5',
        items: [
            'Smoother, more consistent animations throughout the app.',
            'Added loading screens for a better experience while content loads.',
            'Improved fullscreen album art view with auto-hiding controls.',
            'More options in the right-click menu, including saving cover images and folder actions.',
            'The app now remembers the last song and playback position.',
            'Major improvements to the audio player for smoother playback and better volume control.',
            'Better volume syncing with Windows.',
            'General performance and visual improvements.',
            'Small improvements to prevent accidental page reloads.',
        ],
    },
    {
        version: '0.9.0',
        items: [
            'Fixed a small display issue in the alerts box.',
            'Added right-click menus throughout the app.',
            'New fullscreen album art mode with auto-hiding controls.',
            'Smoother volume syncing with Windows.',
            'Added hover descriptions and a status bar.',
            'Added automatic pause when muted or volume is at zero.',
        ],
    },
    {
        version: '0.8.5',
        items: [
            'Improved layout for smaller screens.',
            'Fixed overlapping header buttons.',
            'Fixed text display issues.',
        ],
    },
    {
        version: '0.8.0',
        items: [
            'Improved app security.',
            'Behind-the-scenes build improvements.',
            'Added a changelog section in Settings.',
        ],
    },
    {
        version: '0.7.5',
        items: [
            'Added update notifications with download progress.',
            'Added an option to postpone updates.',
        ],
    },
    {
        version: '0.7.0',
        items: [
            'Added bilingual support (English/Indonesian).',
            'Language preference is now remembered.',
            'Improved translation support throughout the app.',
            'Added an easy-to-understand About section.',
        ],
    },
    {
        version: '0.6.0',
        items: [
            'Added customizable keyboard shortcuts.',
            'Added system volume control with safety limits.',
            'General stability improvements.',
            'Added volume limit warnings.',
        ],
    },
    {
        version: '0.5.0',
        items: [
            'Smoother scrolling for large music libraries.',
            'Songs can now be sorted by title.',
            'Behind-the-scenes release improvements.',
            'Added automatic update support.',
        ],
    },
    {
        version: '0.4.0',
        items: [
            'Added streaming support for YouTube, Spotify, SoundCloud, and more.',
            'Streaming now works directly inside the app.',
            'Added recognition of links from various platforms.',
        ],
    },
    {
        version: '0.3.0',
        items: [
            'Added a Settings window with General, Sort, and Style options.',
            'Added 14 accent color themes.',
            'Added a default wallpaper option.',
            'Added audio format filtering.',
        ],
    },
    {
        version: '0.2.0',
        items: [
            'Added automatic wallpaper using album cover art.',
            'Added default wallpaper support.',
            'Improved folder selection.',
            'Added resizable sidebars.',
            'Playlist state is now remembered.',
        ],
    },
    {
        version: '0.1.0',
        items: [
            'Initial release.',
            'Basic audio player with play, pause, next, and previous.',
            'Added local music folder browsing.',
            'Added volume control and seek bar.',
            'Added support for MP3, FLAC, OGG, and WAV.',
        ],
    },
];

const changelogId = [
    {
        version: '1.0.6',
        items: [
            'Direct3D 11 Wallpaper Engine: Engine render shader desktop berbasis GPU dengan efek visual dan transisi cover art.',
            'Pilihan Mode Wallpaper: Kontrol terpisah untuk Wallpaper Sistem (WinAPI) dan engine shader Direct3D 11.',
            'Sistem Cache Library: Pemuatan folder instan dengan indexing cache native dan pemantauan direktori otomatis.',
            'Kustomisasi Kolom Toolbar: Atur urutan, tampilkan, atau sembunyikan kolom metadata audio pada daftar lagu.',
            'Menu Penyimpanan & Cache: Pemantauan penggunaan ruang penyimpanan dan pembersihan cache library.',
            'Peningkatan Mesin Audio: Penanganan perangkat audio dan perpindahan mode output yang lebih stabil.',
        ],
    },
    {
        version: '1.0.5',
        items: [
            'Unified Audio Engine: Menggabungkan WASAPI Shared & Exclusive, Equalizer DSP, dan Tag Editor ke dalam satu plugin.',
            'Penyederhanaan Plugin: Dipangkas menjadi 2 plugin — Unified Audio Engine & Pembuat Lirik AI.',
            'Perbaikan jeda/resume WASAPI mode Shared dan Exclusive.',
        ],
    },
    {
        version: '1.0.4',
        items: [
            'Perbaikan bug dan peningkatan stabilitas.',
        ],
    },
    {
        version: '1.0.3',
        items: [
            'Pembuat Lirik AI Lokal: Pembuatan lirik tersinkronisasi (.lrc) secara offline menggunakan model Whisper AI (Tiny, Base, Small, Medium, Large) dengan progres realtime dan optimasi multi-thread CPU.',
            'Pemisahan & Isolasi Vokal AI: Integrasi ekstraksi vokal berbasis AI (Demucs ONNX) untuk memisahkan vokal dari instrumen dan meningkatkan akurasi transkripsi lirik.',
            'Pencarian Lirik Online (LRCLIB): Cari, tinjau, dan unduh lirik sinkron atau teks biasa langsung dari aplikasi dengan penyimpanan otomatis ke file atau tag ID3.',
            'Editor Metadata Audio: Tinjau dan ubah informasi trek musik (Judul, Artis, Album, Genre, Tahun) serta simpan sampul album langsung ke dalam file audio.',
            'Tata Letak Spotify & Tema Warna Baru: Pilihan tampilan antarmuka gaya Spotify serta penambahan 2 tema warna aksen baru ("Sky" dan "Zinc").',
            'Keamanan Plugin & Integritas SHA-256: Verifikasi checksum SHA-256 otomatis dari rilis, validasi integritas unduhan, dan handshake JSON challenge-response dinamis.',
            'Peningkatan Mesin Audio & Equalizer: Inisialisasi audio graph yang lebih andal, pemulihan AudioContext otomatis, serta persistensi equalizer multi-band (5, 10, 15, dan 31 band).',
            'Optimasi Performa & Render UI dan pembersihan memori leak menyeluruh.',
        ],
    },
    {
        version: '1.0.2',
        items: [


            'Peningkatan Pemutaran Bit-Perfect: Perbaikan komprehensif WASAPI Exclusive mode (jeda/resume tanpa distorsi, sinkronisasi seekbar realtime, serta pemulihan playlist & tombol play/pause saat reload).',
            'Verifikasi Keamanan Plugin Lokal: Fitur verifikasi otomatis 5 lapis (Header PE, Subsystem CUI, & Dynamic Challenge-Response Token) saat impor berkas plugin .exe lokal.',
            'Kontrol Pengunduhan Plugin: Penambahan tombol "Batal Unduh" beserta penghentian otomatis unduhan latar belakang saat aplikasi ditutup.',
            'Penyimpanan Tab Aktif Panel Kanan: Otomatis menyimpan dan memulihkan tab terakhir (Metadata / Lirik) pada panel kanan saat startup atau reload.',
            'Notifikasi Alert Toast Melayang: Memindahkan banner error di bawah playlist ke notifikasi toast melayang agar tampilan daftar lagu tetap bersih.',
            'Pembaruan Antarmuka Pengelola Plugin: Tampilan baru menu plugin dengan lencana status kapsul, detail lokasi berkas, dan ikon SVG modern.',
            'Pencegahan Error Wallpaper 1224: Penulisan berkas temporer wallpaper dengan timestamp dinamis untuk mencegah konflik file mapping Windows.',
        ],
    },
    {
        version: '1.0.1',
        items: [
            'Menambahkan fitur Audio Fade In & Fade Out saat play, pause, resume, dan ganti lagu dengan durasi yang dapat diatur di Setting.',
            'Integrasi fitur lirik lagu langsung di Panel Metadata kanan dengan tombol switch navbar horizontal.',
            'Highlight otomatis lirik tersinkronisasi, auto-scroll halus, klik-ke-timestamp, dan impor file .lrc/.txt manual.',
            'Deteksi Hi-Res Audio akurat sesuai standar resmi JEITA/RIAA (khusus format lossless: FLAC, WAV, ALAC, AIFF, DSD).',
            'Ekstraksi dan tampilan informasi Kedalaman Bit (Bit Depth) pada rincian teknis metadata.',
            'Pembaruan ikon switcher navbar dengan desain dokumen & audio modern.',
            'Pembersihan UI header atas dengan menghapus teks judul tengah yang tidak diperlukan.',
            'Perbaikan terjemahan bahasa Indonesia dan Inggris di seluruh aplikasi.',
        ],
    },
    {
        version: '1.0.0',
        items: [
            'Dukungan dua bahasa penuh — semua teks UI, notifikasi, dan pesan kini mengikuti bahasa yang dipilih.',
            'Deskripsi hover per-field di seluruh aplikasi untuk pengalaman yang lebih jelas dan informatif.',
            'Status bar kini menampilkan notifikasi: konfirmasi cover art tersimpan dan peringatan batas volume.',
            'Ukuran cover art kini ditampilkan di panel metadata.',
            'Playlist kini tetap di folder asal saat menjelajahi file explorer selama pemutaran.',
            'Playlist otomatis diperbarui saat pengaturan sort atau format berubah.',
            'Sesi kini dipulihkan sepenuhnya saat startup — next/prev langsung berfungsi tanpa perlu menekan play terlebih dahulu.',
            'Pembaruan wallpaper kini tidak memblokir antarmuka, menghilangkan jeda singkat setelah menekan play.',
            'Menu klik kanan kini tersedia di semua area interaktif aplikasi.',
            'Peningkatan performa signifikan: render lebih sedikit, startup lebih cepat, dan penggunaan sumber daya lebih rendah.',
            'Tampilan loading skeleton yang lebih halus.',
        ],
    },
    {
        version: '0.9.5',
        items: [
            'Animasi di seluruh aplikasi menjadi lebih halus dan konsisten.',
            'Menambahkan tampilan pemuatan agar pengalaman lebih nyaman saat konten dimuat.',
            'Peningkatan mode fullscreen cover album dengan kontrol yang tersembunyi otomatis.',
            'Penambahan pilihan pada menu klik-kanan, termasuk simpan gambar sampul dan aksi folder.',
            'Aplikasi kini mengingat lagu dan posisi pemutaran terakhir.',
            'Perbaikan besar pada pemutar audio untuk pemutaran lebih lancar dan kontrol volume lebih baik.',
            'Sinkronisasi volume dengan Windows menjadi lebih baik.',
            'Peningkatan performa dan tampilan secara umum.',
            'Perbaikan kecil untuk mencegah reload halaman secara tidak sengaja.',
        ],
    },
    {
        version: '0.9.0',
        items: [
            'Memperbaiki tampilan kecil pada kotak peringatan.',
            'Menambahkan menu klik-kanan di seluruh aplikasi.',
            'Mode fullscreen album art baru dengan kontrol tersembunyi otomatis.',
            'Sinkronisasi volume dengan Windows lebih baik.',
            'Menambahkan deskripsi saat kursor diarahkan dan bilah status.',
            'Menambahkan jeda otomatis saat mute atau volume nol.',
        ],
    },
    {
        version: '0.8.5',
        items: [
            'Tampilan lebih baik untuk layar kecil.',
            'Memperbaiki tombol header yang bertumpuk.',
            'Memperbaiki masalah tampilan teks.',
        ],
    },
    {
        version: '0.8.0',
        items: [
            'Peningkatan keamanan aplikasi.',
            'Perbaikan di balik layar untuk proses build.',
            'Menambahkan bagian Changelog di Settings.',
        ],
    },
    {
        version: '0.7.5',
        items: [
            'Menambahkan notifikasi update dengan progres unduhan.',
            'Menambahkan opsi untuk menunda pembaruan.',
        ],
    },
    {
        version: '0.7.0',
        items: [
            'Menambahkan dukungan dwibahasa (Inggris/Indonesia).',
            'Pilihan bahasa kini diingat aplikasi.',
            'Peningkatan dukungan terjemahan di seluruh aplikasi.',
            'Menambahkan bagian About yang mudah dipahami.',
        ],
    },
    {
        version: '0.6.0',
        items: [
            'Menambahkan pintasan keyboard yang dapat disesuaikan.',
            'Menambahkan kontrol volume sistem dengan batas aman.',
            'Peningkatan stabilitas secara umum.',
            'Menambahkan peringatan batas volume.',
        ],
    },
    {
        version: '0.5.0',
        items: [
            'Scrolling lebih lancar untuk koleksi musik besar.',
            'Lagu kini dapat diurutkan berdasarkan judul.',
            'Perbaikan di balik layar untuk proses rilis.',
            'Menambahkan dukungan pembaruan otomatis.',
        ],
    },
    {
        version: '0.4.0',
        items: [
            'Menambahkan dukungan streaming untuk YouTube, Spotify, SoundCloud, dan lainnya.',
            'Streaming kini berjalan langsung di dalam aplikasi.',
            'Menambahkan pengenalan tautan dari berbagai platform.',
        ],
    },
    {
        version: '0.3.0',
        items: [
            'Menambahkan jendela Settings dengan pilihan General, Sort, dan Style.',
            'Menambahkan 14 tema warna aksen.',
            'Menambahkan pilihan wallpaper default.',
            'Menambahkan filter format audio.',
        ],
    },
    {
        version: '0.2.0',
        items: [
            'Menambahkan fitur wallpaper otomatis dari gambar sampul album.',
            'Menambahkan dukungan gambar wallpaper default.',
            'Peningkatan pemilihan folder.',
            'Menambahkan sidebar yang dapat diubah ukurannya.',
            'Status playlist kini diingat aplikasi.',
        ],
    },
    {
        version: '0.1.0',
        items: [
            'Rilis awal.',
            'Pemutar audio dasar dengan play, pause, next, dan previous.',
            'Menambahkan penjelajahan folder musik lokal.',
            'Menambahkan kontrol volume dan seek bar.',
            'Menambahkan dukungan MP3, FLAC, OGG, dan WAV.',
        ],
    },
];


export default function ChangelogSection({lang}: {lang: Lang}) {
    const data = lang === 'id' ? changelogId : changelogEn;
    return (
        <div className="space-y-5">
            {data.map((release) => (
                <div key={release.version} className="bg-zinc-900/60 rounded-xl border border-zinc-800/60 p-4">
                    <h4 className="text-sm font-semibold text-green-400 mb-2">v{release.version}</h4>
                    <ul className="space-y-1.5">
                        {release.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                                <span className="text-green-500/70 mt-0.5 shrink-0">•</span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
