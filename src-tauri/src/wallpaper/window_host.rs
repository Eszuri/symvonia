#![cfg(windows)]

use std::sync::atomic::{AtomicBool, Ordering};
use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, LRESULT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayMonitors, GetMonitorInfoW, InvalidateRect, HDC, HMONITOR, MONITORINFO,
    MONITORINFOEXW,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, EnumWindows, FindWindowExW,
    FindWindowW, GetClassNameW, GetWindowRect, IsWindow, LoadCursorW, PeekMessageW,
    RegisterClassExW, SendMessageTimeoutW, SetParent, SetWindowLongPtrW, SetWindowPos,
    TranslateMessage, CS_HREDRAW, CS_VREDRAW, GWL_STYLE, HTTRANSPARENT, HWND_BOTTOM, IDC_ARROW,
    MA_NOACTIVATE, MSG, PM_REMOVE, SMTO_NORMAL, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_SHOWWINDOW,
    WM_DEVICECHANGE, WM_DISPLAYCHANGE, WM_ERASEBKGND, WM_MOUSEACTIVATE, WM_NCHITTEST, WM_QUIT,
    WM_SETCURSOR, WNDCLASSEXW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_EX_NOACTIVATE,
    WS_EX_TOOLWINDOW, WS_POPUP, WS_VISIBLE,
};

const WORKER_MESSAGE: u32 = 0x052C;

static DISPLAY_CHANGED: AtomicBool = AtomicBool::new(false);

#[derive(Clone, Debug)]
pub struct DesktopWindow {
    pub handle: HWND,
    pub monitor_rect: RECT,
    pub monitor_name: String,
}

#[derive(Default)]
struct WorkerSearch {
    def_view_parent: Option<HWND>,
    worker_behind_def_view: Option<HWND>,
    fallback_worker: Option<HWND>,
}

pub struct WindowHost {
    parent_window: Option<HWND>,
    windows: Vec<DesktopWindow>,
}

impl Default for WindowHost {
    fn default() -> Self {
        Self::new()
    }
}

impl WindowHost {
    pub fn new() -> Self {
        Self {
            parent_window: None,
            windows: Vec::new(),
        }
    }

    pub fn initialize(&mut self) -> Result<(), String> {
        Self::register_class()?;
        self.parent_window = Self::find_desktop_host();
        self.rebuild()
    }

    pub fn windows(&self) -> &[DesktopWindow] {
        &self.windows
    }

    /// Memeriksa apakah jendela WorkerW induk dan seluruh HWND monitor masih hidup
    /// (mengantisipasi apabila explorer.exe di-restart oleh pengguna/sistem).
    pub fn is_host_alive(&self) -> bool {
        if self.windows.is_empty() {
            return false;
        }
        unsafe {
            if let Some(parent) = self.parent_window {
                if !parent.is_invalid() && !IsWindow(parent).as_bool() {
                    return false;
                }
            }
            for w in &self.windows {
                if w.handle.is_invalid() || !IsWindow(w.handle).as_bool() {
                    return false;
                }
            }
        }
        true
    }

    pub fn consume_display_change(&self) -> bool {
        DISPLAY_CHANGED.swap(false, Ordering::SeqCst)
    }

    pub fn pump_messages(&self, quit_requested: &mut bool) {
        unsafe {
            let mut message = MSG::default();
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                if message.message == WM_QUIT {
                    *quit_requested = true;
                    continue;
                }
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    }

    pub fn rebuild(&mut self) -> Result<(), String> {
        self.destroy();

        let monitors = Self::enumerate_monitors();
        if monitors.is_empty() {
            return Err("Tidak ada monitor aktif yang terdeteksi.".to_string());
        }

        self.parent_window = Self::find_desktop_host();

        let mut parent_rect = RECT::default();
        unsafe {
            if let Some(parent) = self.parent_window {
                let _ = GetWindowRect(parent, &mut parent_rect);
            }

            let instance = GetModuleHandleW(None)
                .map_err(|e| format!("GetModuleHandleW gagal: {}", e))?;

            for mut monitor in monitors {
                let mut x = monitor.monitor_rect.left;
                let mut y = monitor.monitor_rect.top;
                let width = (monitor.monitor_rect.right - monitor.monitor_rect.left).max(1);
                let height = (monitor.monitor_rect.bottom - monitor.monitor_rect.top).max(1);

                if self.parent_window.is_some() {
                    x -= parent_rect.left;
                    y -= parent_rect.top;
                }

                let hwnd = CreateWindowExW(
                    WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                    w!("SymvoniaWallpaperEngineWindow"),
                    w!("Symvonia Wallpaper Engine"),
                    WS_POPUP | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | WS_VISIBLE,
                    x,
                    y,
                    width,
                    height,
                    None,
                    None,
                    instance,
                    None,
                )
                .map_err(|e| format!("CreateWindowExW gagal: {}", e))?;

                if hwnd.is_invalid() {
                    return Err("CreateWindowExW mengembalikan HWND invalid.".to_string());
                }

                if let Some(parent) = self.parent_window {
                    let _ = SetParent(hwnd, parent);
                    let child_style =
                        (WS_CHILD.0 | WS_CLIPSIBLINGS.0 | WS_CLIPCHILDREN.0 | WS_VISIBLE.0) as isize;
                    SetWindowLongPtrW(hwnd, GWL_STYLE, child_style);
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_BOTTOM,
                        x,
                        y,
                        width,
                        height,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                    );
                } else {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_BOTTOM,
                        x,
                        y,
                        width,
                        height,
                        SWP_NOACTIVATE | SWP_SHOWWINDOW,
                    );
                }

                monitor.handle = hwnd;
                self.windows.push(monitor);
            }
        }

        Ok(())
    }

    pub fn destroy(&mut self) {
        unsafe {
            for window in self.windows.drain(..) {
                if !window.handle.is_invalid() && IsWindow(window.handle).as_bool() {
                    let _ = DestroyWindow(window.handle);
                }
            }
            if let Some(parent) = self.parent_window {
                if !parent.is_invalid() && IsWindow(parent).as_bool() {
                    let _ = InvalidateRect(parent, None, true);
                }
            }
        }
    }

    fn register_class() -> Result<(), String> {
        unsafe {
            let instance = GetModuleHandleW(None)
                .map_err(|e| format!("GetModuleHandleW gagal: {}", e))?;
            let cursor = LoadCursorW(None, IDC_ARROW).unwrap_or_default();

            let wc = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                style: CS_HREDRAW | CS_VREDRAW,
                lpfnWndProc: Some(Self::window_proc),
                hInstance: instance.into(),
                hCursor: cursor,
                lpszClassName: w!("SymvoniaWallpaperEngineWindow"),
                ..Default::default()
            };

            let atom = RegisterClassExW(&wc);
            if atom == 0 {
                // Jika class sudah teregistrasi pada pemanggilan sebelumnya di proses yang sama, abaikan error.
                let err = windows::core::Error::from_win32();
                // ERROR_CLASS_ALREADY_EXISTS = 1410 (0x80070582)
                if err.code().0 != -2147023486 && err.code().0 != 0 {
                    return Err(format!("RegisterClassExW gagal: {}", err));
                }
            }
        }
        Ok(())
    }

    fn find_desktop_host() -> Option<HWND> {
        unsafe {
            if let Ok(progman) = FindWindowW(w!("Progman"), PCWSTR::null()) {
                if !progman.is_invalid() {
                    let mut result: usize = 0;
                    let _ = SendMessageTimeoutW(
                        progman,
                        WORKER_MESSAGE,
                        WPARAM(0x0000000D),
                        LPARAM(0),
                        SMTO_NORMAL,
                        1000,
                        Some(&mut result),
                    );
                    let _ = SendMessageTimeoutW(
                        progman,
                        WORKER_MESSAGE,
                        WPARAM(0x0000000D),
                        LPARAM(1),
                        SMTO_NORMAL,
                        1000,
                        Some(&mut result),
                    );
                    let _ = SendMessageTimeoutW(
                        progman,
                        WORKER_MESSAGE,
                        WPARAM(0),
                        LPARAM(0),
                        SMTO_NORMAL,
                        1000,
                        Some(&mut result),
                    );
                }
            }

            let mut search = WorkerSearch::default();
            let _ = EnumWindows(
                Some(Self::worker_enum_proc),
                LPARAM(&mut search as *mut WorkerSearch as isize),
            );

            if let Some(worker) = search.worker_behind_def_view {
                if !worker.is_invalid() {
                    return Some(worker);
                }
            }
            if let Some(fallback) = search.fallback_worker {
                if !fallback.is_invalid() {
                    return Some(fallback);
                }
            }
            if let Some(def_parent) = search.def_view_parent {
                if !def_parent.is_invalid() {
                    return Some(def_parent);
                }
            }
            None
        }
    }

    unsafe extern "system" fn worker_enum_proc(hwnd: HWND, data: LPARAM) -> BOOL {
        if data.0 == 0 {
            return BOOL(0);
        }
        let search = &mut *(data.0 as *mut WorkerSearch);

        if let Ok(def_view) = FindWindowExW(hwnd, None, w!("SHELLDLL_DefView"), PCWSTR::null()) {
            if !def_view.is_invalid() {
                search.def_view_parent = Some(hwnd);
                if let Ok(worker) = FindWindowExW(None, hwnd, w!("WorkerW"), PCWSTR::null()) {
                    if !worker.is_invalid() {
                        search.worker_behind_def_view = Some(worker);
                    }
                }
                return BOOL(1);
            }
        }

        let mut class_name = [0u16; 256];
        let len = GetClassNameW(hwnd, &mut class_name);
        if len > 0 {
            let name = String::from_utf16_lossy(&class_name[..len as usize]);
            if name == "WorkerW" {
                search.fallback_worker = Some(hwnd);
            }
        }
        BOOL(1)
    }

    unsafe extern "system" fn monitor_enum_proc(
        monitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        data: LPARAM,
    ) -> BOOL {
        if data.0 == 0 {
            return BOOL(0);
        }
        let list = &mut *(data.0 as *mut Vec<DesktopWindow>);

        let mut info = MONITORINFOEXW {
            monitorInfo: MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFOEXW>() as u32,
                ..Default::default()
            },
            ..Default::default()
        };

        if GetMonitorInfoW(monitor, &mut info.monitorInfo).as_bool() {
            let nul_pos = info
                .szDevice
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(info.szDevice.len());
            let name = String::from_utf16_lossy(&info.szDevice[..nul_pos]);
            list.push(DesktopWindow {
                handle: HWND::default(),
                monitor_rect: info.monitorInfo.rcMonitor,
                monitor_name: name,
            });
        }
        BOOL(1)
    }

    fn enumerate_monitors() -> Vec<DesktopWindow> {
        let mut monitors: Vec<DesktopWindow> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                None,
                None,
                Some(Self::monitor_enum_proc),
                LPARAM(&mut monitors as *mut Vec<DesktopWindow> as isize),
            );
        }
        monitors.sort_by(|left, right| {
            if left.monitor_rect.top != right.monitor_rect.top {
                left.monitor_rect.top.cmp(&right.monitor_rect.top)
            } else {
                left.monitor_rect.left.cmp(&right.monitor_rect.left)
            }
        });
        monitors
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        match message {
            WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
            WM_ERASEBKGND => LRESULT(1),
            WM_DISPLAYCHANGE | WM_DEVICECHANGE => {
                DISPLAY_CHANGED.store(true, Ordering::SeqCst);
                LRESULT(0)
            }
            WM_NCHITTEST => LRESULT(HTTRANSPARENT as isize),
            WM_SETCURSOR => LRESULT(1),
            _ => DefWindowProcW(hwnd, message, w_param, l_param),
        }
    }
}

impl Drop for WindowHost {
    fn drop(&mut self) {
        self.destroy();
    }
}
