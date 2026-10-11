use std::env;

fn main() {
    for name in [
        "SYMVONIA_AUDIO_PLUGIN_SHA256",
        "SYMVONIA_AI_PLUGIN_SHA256",
        "SYMVONIA_WALLPAPER_PLUGIN_SHA256",
        "SYMVONIA_PLUGIN_RELEASE_TAG",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
        if let Ok(value) = env::var(name) {
            println!("cargo:rustc-env={name}={value}");
        }
    }

    tauri_build::build();
}
