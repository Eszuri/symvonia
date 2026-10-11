
pub fn initialize(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri::Manager;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let app = window.app_handle().clone();
        window
            .run_on_main_thread(move || {
                if let Err(error) = unsafe { platform::install(hwnd, app) } {
                    log::warn!("Taskbar controls: {error}");
                }
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn update_taskbar_controls(
    window: tauri::WebviewWindow,
    is_playing: bool,
    has_track: bool,
    language: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Taskbar controls are only available to the main window".into());
    }
    #[cfg(windows)]
    unsafe {
        use windows::Win32::{
            Foundation::{LPARAM, WPARAM},
            UI::WindowsAndMessaging::PostMessageW,
        };
        let flags = usize::from(is_playing)
            | (usize::from(has_track) << 1)
            | (usize::from(language == "id") << 2);
        PostMessageW(
            platform::hwnd(window.hwnd().map_err(|e| e.to_string())?.0 as isize),
            platform::update_message(),
            WPARAM(flags),
            LPARAM(0),
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
mod platform {
    use std::{cell::RefCell, rc::Rc};
    use tauri::Emitter;
    use windows::{
        core::w,
        Win32::{
            Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_APARTMENTTHREADED,
            },
            UI::{
                Shell::{
                    DefSubclassProc, ITaskbarList3, RemoveWindowSubclass, SetWindowSubclass,
                    TaskbarList, THBF_DISABLED, THBF_ENABLED, THBN_CLICKED, THB_FLAGS, THB_ICON,
                    THB_TOOLTIP, THUMBBUTTON,
                },
                WindowsAndMessaging::{
                    CreateIcon, DestroyIcon, RegisterWindowMessageW, HICON, WM_COMMAND,
                    WM_NCDESTROY,
                },
            },
        },
    };

    const SUBCLASS_ID: usize = 0x53594d54;
    const PREVIOUS: u32 = 0x5311;
    const TOGGLE: u32 = 0x5312;
    const NEXT: u32 = 0x5313;

    pub fn hwnd(value: isize) -> HWND {
        HWND(value as *mut _)
    }
    pub unsafe fn update_message() -> u32 {
        RegisterWindowMessageW(w!("Symvonia.TaskbarControls.Update"))
    }

    struct ComApartment(bool);
    impl Drop for ComApartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }
    struct Icon(HICON);
    impl Drop for Icon {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyIcon(self.0);
            }
        }
    }

    struct Toolbar {
        app: tauri::AppHandle,
        taskbar: ITaskbarList3,
        icons: [Icon; 4], // previous, play, pause, next
        taskbar_created: u32,
        update: u32,
        flags: usize,
        added: bool,
        _apartment: ComApartment,
    }

    impl Toolbar {
        unsafe fn refresh(&mut self, hwnd: HWND) -> windows::core::Result<()> {
            let playing = self.flags & 1 != 0;
            let enabled = self.flags & 2 != 0;
            let indonesian = self.flags & 4 != 0;
            let labels = if indonesian {
                [
                    "Sebelumnya",
                    if playing { "Jeda" } else { "Putar" },
                    "Berikutnya",
                ]
            } else {
                ["Previous", if playing { "Pause" } else { "Play" }, "Next"]
            };
            let buttons = std::array::from_fn::<_, 3, _>(|index| {
                let mut button = THUMBBUTTON::default();
                button.dwMask = THB_ICON | THB_TOOLTIP | THB_FLAGS;
                button.iId = [PREVIOUS, TOGGLE, NEXT][index];
                button.hIcon = self.icons[[0, if playing { 2 } else { 1 }, 3][index]].0;
                button.dwFlags = if enabled { THBF_ENABLED } else { THBF_DISABLED };
                for (dest, source) in button.szTip.iter_mut().zip(labels[index].encode_utf16()) {
                    *dest = source;
                }
                button
            });
            if self.added {
                self.taskbar.ThumbBarUpdateButtons(hwnd, &buttons)
            } else {
                self.taskbar.ThumbBarAddButtons(hwnd, &buttons)?;
                self.added = true;
                Ok(())
            }
        }
    }

    unsafe fn icon(kind: usize) -> windows::core::Result<Icon> {
        let inside = |x: i32, y: i32| -> bool {
            match kind {
                0 => {
                    (6..=9).contains(&x) && (7..=25).contains(&y)
                        || (12..=25).contains(&x) && (y - 16).abs() * 13 <= (x - 12) * 9
                }
                1 => (9..=25).contains(&x) && (y - 16).abs() * 16 <= (25 - x) * 10,
                2 => ((9..=13).contains(&x) || (19..=23).contains(&x)) && (7..=25).contains(&y),
                _ => {
                    (23..=26).contains(&x) && (7..=25).contains(&y)
                        || (7..=20).contains(&x) && (y - 16).abs() * 13 <= (20 - x) * 9
                }
            }
        };
        let mut mask = [255u8; 128];
        let mut pixels = [0u8; 32 * 32 * 4];
        for y in 0..32 {
            for x in 0..32 {
                if inside(x, y) {
                    let index = (y * 32 + x) as usize;
                    mask[index / 8] &= !(0x80 >> (index % 8));
                    let edge = !inside(x - 1, y)
                        || !inside(x + 1, y)
                        || !inside(x, y - 1)
                        || !inside(x, y + 1);
                    let color = if edge { 40 } else { 245 };
                    pixels[index * 4..index * 4 + 4].copy_from_slice(&[color, color, color, 255]);
                }
            }
        }
        CreateIcon(
            HINSTANCE::default(),
            32,
            32,
            1,
            32,
            mask.as_ptr(),
            pixels.as_ptr(),
        )
        .map(Icon)
    }

    pub unsafe fn install(value: isize, app: tauri::AppHandle) -> windows::core::Result<()> {
        let apartment = ComApartment(CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok());
        let taskbar: ITaskbarList3 = CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)?;
        taskbar.HrInit()?;
        let toolbar = Rc::new(RefCell::new(Toolbar {
            app,
            taskbar,
            icons: [icon(0)?, icon(1)?, icon(2)?, icon(3)?],
            taskbar_created: RegisterWindowMessageW(w!("TaskbarButtonCreated")),
            update: update_message(),
            flags: 0,
            added: false,
            _apartment: apartment,
        }));
        let data = Rc::into_raw(toolbar);
        if !SetWindowSubclass(hwnd(value), Some(window_proc), SUBCLASS_ID, data as usize).as_bool()
        {
            drop(Rc::from_raw(data));
            return Err(windows::core::Error::from_win32());
        }
        let _ = (*data).borrow_mut().refresh(hwnd(value));
        Ok(())
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _: usize,
        data: usize,
    ) -> LRESULT {
        let pointer = data as *const RefCell<Toolbar>;
        Rc::increment_strong_count(pointer);
        let toolbar = Rc::from_raw(pointer);
        if message == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID);
            drop(Rc::from_raw(pointer));
        } else if let Ok(mut state) = toolbar.try_borrow_mut() {
            if message == state.taskbar_created || message == state.update {
                if message == state.taskbar_created {
                    state.added = false;
                } else {
                    state.flags = wparam.0;
                }
                if let Err(error) = state.refresh(hwnd) {
                    log::debug!("Taskbar toolbar update: {error}");
                }
            } else if message == WM_COMMAND && (wparam.0 >> 16) as u32 == THBN_CLICKED {
                let action = match wparam.0 as u16 as u32 {
                    PREVIOUS => Some("prev"),
                    TOGGLE => Some("toggle"),
                    NEXT => Some("next"),
                    _ => None,
                };
                if let Some(action) = action {
                    if state.flags & 2 != 0 {
                        let _ = state.app.emit_to("main", "taskbar-media-action", action);
                    }
                    return LRESULT(0);
                }
            }
        }
        DefSubclassProc(hwnd, message, wparam, lparam)
    }
}
