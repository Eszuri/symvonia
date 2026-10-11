// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(windows)]
  {
    let flag = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,HardwareMediaKeyHandling,MediaSessionService,GlobalMediaControls";
    let combined = match std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
      Ok(existing) if !existing.is_empty() => {
        if !existing.contains("HardwareMediaKeyHandling") {
          format!("{} {}", existing, flag)
        } else {
          existing
        }
      }
      _ => flag.to_string(),
    };
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", combined);
  }

  symvonia_lib::run();
}
