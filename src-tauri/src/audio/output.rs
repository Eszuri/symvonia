#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub default_sample_rate: u32,
    pub max_channels: u16,
}

#[cfg(windows)]
pub fn get_audio_hosts_and_devices() -> Vec<AudioDeviceInfo> {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
        DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED, STGM_READ,
    };
    use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;

    let mut devices_info = Vec::new();

    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let Ok(enumerator) = CoCreateInstance::<_, IMMDeviceEnumerator>(
            &MMDeviceEnumerator,
            None,
            CLSCTX_INPROC_SERVER,
        ) else {
            return devices_info;
        };

        let pkey_device_friendly_name = PROPERTYKEY {
            fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
            pid: 14,
        };

        let get_device_id = |dev: &IMMDevice| -> Option<String> {
            let pwstr = dev.GetId().ok()?;
            let s = pwstr.to_string().ok();
            CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
            s.filter(|v| !v.is_empty())
        };

        let get_friendly_name = |dev: &IMMDevice| -> Option<String> {
            let store = dev.OpenPropertyStore(STGM_READ).ok()?;
            let prop = store.GetValue(&pkey_device_friendly_name).ok()?;
            let name = prop.to_string();
            if name.is_empty() {
                None
            } else {
                Some(name)
            }
        };

        let default_id = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()
            .and_then(|d| get_device_id(&d));

        let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) else {
            return devices_info;
        };

        let count = collection.GetCount().unwrap_or(0);
        for i in 0..count {
            if let Ok(dev) = collection.Item(i) {
                let Some(id) = get_device_id(&dev) else {
                    continue;
                };
                let name = get_friendly_name(&dev).unwrap_or_else(|| id.clone());
                let is_default = default_id.as_deref() == Some(id.as_str());
                devices_info.push(AudioDeviceInfo {
                    id,
                    name,
                    is_default,
                    default_sample_rate: 44100,
                    max_channels: 2,
                });
            }
        }
    }

    devices_info
}

#[cfg(not(windows))]
pub fn get_audio_hosts_and_devices() -> Vec<AudioDeviceInfo> {
    Vec::new()
}
