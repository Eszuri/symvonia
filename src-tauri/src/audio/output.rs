use cpal::traits::{DeviceTrait, HostTrait};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    /// The cpal backend does not expose the WASAPI endpoint id, so the
    /// friendly name is used as a portable fallback identifier (the C# engine
    /// resolves it by name).
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub default_sample_rate: u32,
    pub max_channels: u16,
}

pub fn get_audio_hosts_and_devices() -> Vec<AudioDeviceInfo> {
    let host = cpal::default_host();
    let default_device_name = host.default_output_device().and_then(|d| d.name().ok());
    let mut devices_info = Vec::new();

    if let Ok(devices) = host.output_devices() {
        for dev in devices {
            if let Ok(name) = dev.name() {
                let is_default = default_device_name.as_ref() == Some(&name);

                // Device discovery is used by the settings picker only. Calling
                // `default_output_config()` for every endpoint makes CPAL query
                // the Windows audio service repeatedly and can block for seconds
                // when an endpoint is waking up. The actual stream setup below
                // resolves the format lazily for the selected device, so keep
                // discovery limited to the cheap identity/default checks.
                let default_sr = 44100;
                let max_ch = 2;
                devices_info.push(AudioDeviceInfo {
                    id: name.clone(),
                    name,
                    is_default,
                    default_sample_rate: default_sr,
                    max_channels: max_ch,
                });
            }
        }
    }

    devices_info
}
