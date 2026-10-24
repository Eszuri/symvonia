use windows::core::{GUID, HSTRING};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IAudioClient, IAudioRenderClient, IMMDevice, IMMDeviceEnumerator,
    MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_EXCLUSIVE,
    AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    AUDCLNT_STREAMFLAGS_EVENTCALLBACK, AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
    DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVEFORMATEXTENSIBLE_0,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoTaskMemFree, CLSCTX_INPROC_SERVER, STGM_READ,
};
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, CreateEventW,
    WaitForSingleObject,
};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;

const KSDATAFORMAT_SUBTYPE_PCM: GUID = GUID::from_u128(0x00000001_0000_0010_8000_00aa00389b71);
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID =
    GUID::from_u128(0x00000003_0000_0010_8000_00aa00389b71);

// HRESULTs for WASAPI
const AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED: i32 = -2004287463; // 0x88890019

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputSampleFormat {
    Float32,
    Pcm24In32,
    Pcm24Packed,
    Pcm32,
    Pcm16,
}

impl OutputSampleFormat {
    pub fn bits_per_sample(self) -> u16 {
        match self {
            OutputSampleFormat::Float32 => 32,
            OutputSampleFormat::Pcm24In32 => 24,
            OutputSampleFormat::Pcm24Packed => 24,
            OutputSampleFormat::Pcm32 => 32,
            OutputSampleFormat::Pcm16 => 16,
        }
    }

    pub fn container_bytes_per_sample(self) -> u16 {
        match self {
            OutputSampleFormat::Float32 => 4,
            OutputSampleFormat::Pcm24In32 => 4,
            OutputSampleFormat::Pcm24Packed => 3,
            OutputSampleFormat::Pcm32 => 4,
            OutputSampleFormat::Pcm16 => 2,
        }
    }
}

pub struct MmcssGuard {
    handle: HANDLE,
}

impl MmcssGuard {
    pub fn enter_pro_audio() -> Option<Self> {
        unsafe {
            let mut task_index: u32 = 0;
            let name = HSTRING::from("Pro Audio");
            let handle = AvSetMmThreadCharacteristicsW(&name, &mut task_index).ok()?;
            if handle.is_invalid() {
                None
            } else {
                Some(Self { handle })
            }
        }
    }
}

impl Drop for MmcssGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = AvRevertMmThreadCharacteristics(self.handle);
        }
    }
}

pub struct WasapiOutput {
    client: IAudioClient,
    render_client: IAudioRenderClient,
    event_handle: HANDLE,
    pub buffer_frames: u32,
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: OutputSampleFormat,
    pub exclusive: bool,
    pub device_name: String,
    started: bool,
}

impl WasapiOutput {
    pub fn open(
        device_id: Option<&str>,
        exclusive: bool,
        source_rate: u32,
        source_channels: u16,
    ) -> Result<Self, (String, String)> {
        let (device, device_name) = resolve_device_strict(device_id)?;

        if exclusive {
            Self::open_exclusive(&device, device_name, source_rate, source_channels)
        } else {
            Self::open_shared(&device, device_name, source_rate, source_channels)
        }
    }

    fn open_shared(
        device: &IMMDevice,
        device_name: String,
        source_rate: u32,
        source_channels: u16,
    ) -> Result<Self, (String, String)> {
        unsafe {
            let client: IAudioClient = device
                .Activate(CLSCTX_INPROC_SERVER, None)
                .map_err(|e| ("ENGINE_ERROR".to_string(), format!("Failed to activate IAudioClient: {}", e)))?;

            let wfx_ext = build_waveformat_extensible(
                source_rate,
                source_channels,
                OutputSampleFormat::Float32,
            );
            let wfx_ptr = &wfx_ext.Format as *const WAVEFORMATEX;

            let flags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK
                | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM
                | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;

            // 200ms buffer in 100-ns units (matches NAudio WasapiOut shared mode)
            let buffer_duration: i64 = 2_000_000;

            client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    flags,
                    buffer_duration,
                    0,
                    wfx_ptr,
                    None,
                )
                .map_err(|e| {
                    (
                        "ENGINE_ERROR".to_string(),
                        format!("Failed to initialize WASAPI Shared mode: {}", e),
                    )
                })?;

            Self::finish_setup(
                client,
                device_name,
                source_rate,
                source_channels,
                OutputSampleFormat::Float32,
                false,
            )
        }
    }

    fn open_exclusive(
        device: &IMMDevice,
        device_name: String,
        source_rate: u32,
        source_channels: u16,
    ) -> Result<Self, (String, String)> {
        let candidates = exclusive_format_candidates();
        let mut last_err = String::new();

        for &(fmt, use_extensible) in candidates {
            match Self::try_init_exclusive(device, source_rate, source_channels, fmt, use_extensible) {
                Ok(client) => unsafe {
                    return Self::finish_setup(
                        client,
                        device_name,
                        source_rate,
                        source_channels,
                        fmt,
                        true,
                    );
                },
                Err(e) => {
                    last_err = e;
                }
            }
        }

        Err((
            "EXCLUSIVE_NOT_SUPPORTED".to_string(),
            format!(
                "DAC does not support {}ch @ {}Hz in WASAPI Exclusive mode (tried float32/24-bit/16-bit). {}",
                source_channels, source_rate, last_err
            ),
        ))
    }

    fn try_init_exclusive(
        device: &IMMDevice,
        sample_rate: u32,
        channels: u16,
        format: OutputSampleFormat,
        use_extensible: bool,
    ) -> Result<IAudioClient, String> {
        unsafe {
            let client: IAudioClient = device
                .Activate(CLSCTX_INPROC_SERVER, None)
                .map_err(|e| format!("Activate failed: {}", e))?;

            let wfx_ext = build_waveformat_extensible(sample_rate, channels, format);
            let wfx_plain = build_waveformat_plain(sample_rate, channels, format);
            let wfx_ptr: *const WAVEFORMATEX = if use_extensible {
                &wfx_ext.Format
            } else {
                &wfx_plain
            };

            // Check if driver supports this format before attempting Initialize (S_OK == 0)
            let hr = client.IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, wfx_ptr, None);
            if hr.0 != 0 {
                return Err(format!("Format {:?} not supported (HRESULT 0x{:08x})", format, hr.0 as u32));
            }

            let mut default_period: i64 = 0;
            let mut min_period: i64 = 0;
            let _ = client.GetDevicePeriod(Some(&mut default_period), Some(&mut min_period));
            // 50ms target buffer (500,000 in 100-ns units), matching NAudio Exclusive mode
            let period = if default_period > 0 {
                default_period.max(250_000).min(500_000)
            } else {
                500_000
            };

            let try_period = |p: i64| -> Result<IAudioClient, windows::core::Error> {
                let c: IAudioClient = device.Activate(CLSCTX_INPROC_SERVER, None)?;
                let res = c.Initialize(
                    AUDCLNT_SHAREMODE_EXCLUSIVE,
                    AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                    p,
                    p,
                    wfx_ptr,
                    None,
                );
                match res {
                    Ok(()) => Ok(c),
                    Err(err) if err.code().0 == AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED => {
                        let aligned_frames = c.GetBufferSize()?;
                        drop(c);
                        let aligned_period =
                            ((10_000_000.0 * aligned_frames as f64 / sample_rate as f64) + 0.5) as i64;
                        let c2: IAudioClient = device.Activate(CLSCTX_INPROC_SERVER, None)?;
                        c2.Initialize(
                            AUDCLNT_SHAREMODE_EXCLUSIVE,
                            AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                            aligned_period,
                            aligned_period,
                            wfx_ptr,
                            None,
                        )?;
                        Ok(c2)
                    }
                    Err(err) => Err(err),
                }
            };

            drop(client);

            match try_period(period) {
                Ok(c) => Ok(c),
                Err(first_err) if default_period > 0 && default_period != period => {
                    try_period(default_period)
                        .map_err(|e| format!("Initialize {:?} failed: {} (fallback: {})", format, first_err, e))
                }
                Err(err) => Err(format!("Initialize {:?} failed: {}", format, err)),
            }
        }
    }

    unsafe fn finish_setup(
        client: IAudioClient,
        device_name: String,
        sample_rate: u32,
        channels: u16,
        sample_format: OutputSampleFormat,
        exclusive: bool,
    ) -> Result<Self, (String, String)> {
        let event_handle = CreateEventW(None, false, false, None)
            .map_err(|e| ("ENGINE_ERROR".to_string(), format!("CreateEventW failed: {}", e)))?;

        if let Err(e) = client.SetEventHandle(event_handle) {
            let _ = CloseHandle(event_handle);
            return Err((
                "ENGINE_ERROR".to_string(),
                format!("SetEventHandle failed: {}", e),
            ));
        }

        let buffer_frames = match client.GetBufferSize() {
            Ok(frames) => frames,
            Err(e) => {
                let _ = CloseHandle(event_handle);
                return Err((
                    "ENGINE_ERROR".to_string(),
                    format!("GetBufferSize failed: {}", e),
                ));
            }
        };

        let render_client: IAudioRenderClient = match client.GetService() {
            Ok(rc) => rc,
            Err(e) => {
                let _ = CloseHandle(event_handle);
                return Err((
                    "ENGINE_ERROR".to_string(),
                    format!("GetService(IAudioRenderClient) failed: {}", e),
                ));
            }
        };

        Ok(Self {
            client,
            render_client,
            event_handle,
            buffer_frames,
            sample_rate,
            channels,
            sample_format,
            exclusive,
            device_name,
            started: false,
        })
    }

    pub fn start(&mut self) -> Result<(), String> {
        if !self.started {
            unsafe {
                self.client
                    .Start()
                    .map_err(|e| format!("IAudioClient::Start failed: {}", e))?;
            }
            self.started = true;
        }
        Ok(())
    }

    pub fn stop(&mut self) {
        if self.started {
            unsafe {
                let _ = self.client.Stop();
            }
            self.started = false;
        }
    }

    pub fn reset(&mut self) {
        self.stop();
        unsafe {
            let _ = self.client.Reset();
        }
    }

    /// Waits up to `timeout_ms` for the WASAPI buffer-ready event.
    /// Returns `true` if the event was signaled.
    pub fn wait_for_buffer(&self, timeout_ms: u32) -> bool {
        unsafe { WaitForSingleObject(self.event_handle, timeout_ms) == WAIT_OBJECT_0 }
    }

    /// Queries how many frames can be written right now.
    pub fn available_frames(&self) -> Result<u32, String> {
        if self.exclusive && self.started {
            // In event-driven Exclusive mode, the entire period buffer is available when signaled.
            return Ok(self.buffer_frames);
        }
        unsafe {
            let padding = self
                .client
                .GetCurrentPadding()
                .map_err(|e| format!("GetCurrentPadding failed: {}", e))?;
            Ok(self.buffer_frames.saturating_sub(padding))
        }
    }

    /// Writes up to `frames_to_write` frames into the WASAPI render buffer by pulling from `fill_fn`.
    /// `fill_fn` receives a mutable `f32` slice of length `frames_to_write * channels` and returns
    /// the number of `f32` samples actually decoded.
    pub fn write_frames<F>(
        &self,
        frames_to_write: u32,
        volume: f32,
        scratch: &mut Vec<f32>,
        mut fill_fn: F,
    ) -> Result<u32, String>
    where
        F: FnMut(&mut [f32]) -> Result<usize, String>,
    {
        if frames_to_write == 0 {
            return Ok(0);
        }

        let ch = self.channels as usize;
        let total_samples = frames_to_write as usize * ch;
        scratch.resize(total_samples, 0.0);

        let samples_read = fill_fn(&mut scratch[..total_samples])?;
        if samples_read < total_samples {
            scratch[samples_read..total_samples].fill(0.0);
        }

        unsafe {
            let dst_ptr = self
                .render_client
                .GetBuffer(frames_to_write)
                .map_err(|e| format!("IAudioRenderClient::GetBuffer failed: {}", e))?;

            if samples_read == 0 {
                let _ = self
                    .render_client
                    .ReleaseBuffer(frames_to_write, AUDCLNT_BUFFERFLAGS_SILENT.0 as u32);
                return Ok(0);
            }

            let bytes_per_sample = self.sample_format.container_bytes_per_sample() as usize;
            let total_bytes = total_samples * bytes_per_sample;
            let dst_bytes = std::slice::from_raw_parts_mut(dst_ptr, total_bytes);

            pack_samples(&scratch[..total_samples], volume, self.sample_format, dst_bytes);

            self.render_client
                .ReleaseBuffer(frames_to_write, 0)
                .map_err(|e| format!("IAudioRenderClient::ReleaseBuffer failed: {}", e))?;
        }

        let frames_decoded = if ch > 0 { (samples_read / ch) as u32 } else { 0 };
        Ok(frames_decoded)
    }
}

impl Drop for WasapiOutput {
    fn drop(&mut self) {
        self.stop();
        unsafe {
            if !self.event_handle.is_invalid() {
                let _ = CloseHandle(self.event_handle);
            }
        }
    }
}

pub fn exclusive_format_candidates() -> &'static [(OutputSampleFormat, bool)] {
    &[
        (OutputSampleFormat::Float32, true),
        (OutputSampleFormat::Float32, false),
        (OutputSampleFormat::Pcm24In32, true),
        (OutputSampleFormat::Pcm24Packed, true),
        (OutputSampleFormat::Pcm24Packed, false),
        (OutputSampleFormat::Pcm32, true),
        (OutputSampleFormat::Pcm16, true),
        (OutputSampleFormat::Pcm16, false),
    ]
}

pub fn pack_samples(src: &[f32], volume: f32, format: OutputSampleFormat, dst: &mut [u8]) {
    let apply_vol = (volume - 1.0).abs() > 1e-6;

    match format {
        OutputSampleFormat::Float32 => {
            for (s, chunk) in src.iter().zip(dst.chunks_exact_mut(4)) {
                let v = if apply_vol { *s * volume } else { *s };
                chunk.copy_from_slice(&v.to_le_bytes());
            }
        }
        OutputSampleFormat::Pcm24In32 => {
            for (s, chunk) in src.iter().zip(dst.chunks_exact_mut(4)) {
                let v = (if apply_vol { *s * volume } else { *s }).clamp(-1.0, 1.0);
                let scaled = (v as f64 * 8_388_607.0).round() as i32;
                let shifted = scaled << 8;
                chunk.copy_from_slice(&shifted.to_le_bytes());
            }
        }
        OutputSampleFormat::Pcm24Packed => {
            for (s, chunk) in src.iter().zip(dst.chunks_exact_mut(3)) {
                let v = (if apply_vol { *s * volume } else { *s }).clamp(-1.0, 1.0);
                let scaled = (v as f64 * 8_388_607.0).round() as i32;
                let bytes = scaled.to_le_bytes();
                chunk[0] = bytes[0];
                chunk[1] = bytes[1];
                chunk[2] = bytes[2];
            }
        }
        OutputSampleFormat::Pcm32 => {
            for (s, chunk) in src.iter().zip(dst.chunks_exact_mut(4)) {
                let v = (if apply_vol { *s * volume } else { *s }).clamp(-1.0, 1.0);
                let scaled = (v as f64 * 2_147_483_647.0).round() as i32;
                chunk.copy_from_slice(&scaled.to_le_bytes());
            }
        }
        OutputSampleFormat::Pcm16 => {
            for (s, chunk) in src.iter().zip(dst.chunks_exact_mut(2)) {
                let v = (if apply_vol { *s * volume } else { *s }).clamp(-1.0, 1.0);
                let scaled = (v * 32767.0).round() as i16;
                chunk.copy_from_slice(&scaled.to_le_bytes());
            }
        }
    }
}

fn channel_mask_for(channels: u16) -> u32 {
    match channels {
        1 => 0x4,   // SPEAKER_FRONT_CENTER
        2 => 0x3,   // SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT
        4 => 0x33,  // Quad
        6 => 0x3F,  // 5.1
        8 => 0x63F, // 7.1
        _ => 0,
    }
}

pub(crate) fn build_waveformat_extensible(
    sample_rate: u32,
    channels: u16,
    format: OutputSampleFormat,
) -> WAVEFORMATEXTENSIBLE {
    let container_bytes = format.container_bytes_per_sample();
    let container_bits = container_bytes * 8;
    let valid_bits = format.bits_per_sample();
    let block_align = channels * container_bytes;
    let avg_bytes = sample_rate * block_align as u32;
    let subformat = match format {
        OutputSampleFormat::Float32 => KSDATAFORMAT_SUBTYPE_IEEE_FLOAT,
        _ => KSDATAFORMAT_SUBTYPE_PCM,
    };

    WAVEFORMATEXTENSIBLE {
        Format: WAVEFORMATEX {
            wFormatTag: 0xFFFE, // WAVE_FORMAT_EXTENSIBLE
            nChannels: channels,
            nSamplesPerSec: sample_rate,
            nAvgBytesPerSec: avg_bytes,
            nBlockAlign: block_align,
            wBitsPerSample: container_bits,
            cbSize: 22,
        },
        Samples: WAVEFORMATEXTENSIBLE_0 {
            wValidBitsPerSample: valid_bits,
        },
        dwChannelMask: channel_mask_for(channels),
        SubFormat: subformat,
    }
}

pub(crate) fn build_waveformat_plain(
    sample_rate: u32,
    channels: u16,
    format: OutputSampleFormat,
) -> WAVEFORMATEX {
    let container_bytes = format.container_bytes_per_sample();
    let container_bits = container_bytes * 8;
    let block_align = channels * container_bytes;
    let avg_bytes = sample_rate * block_align as u32;
    let tag = match format {
        OutputSampleFormat::Float32 => 3, // WAVE_FORMAT_IEEE_FLOAT
        _ => 1,                           // WAVE_FORMAT_PCM
    };

    WAVEFORMATEX {
        wFormatTag: tag,
        nChannels: channels,
        nSamplesPerSec: sample_rate,
        nAvgBytesPerSec: avg_bytes,
        nBlockAlign: block_align,
        wBitsPerSample: container_bits,
        cbSize: 0,
    }
}

pub(crate) fn resolve_device_strict(device_id: Option<&str>) -> Result<(IMMDevice, String), (String, String)> {
    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_INPROC_SERVER).map_err(|e| {
                (
                    "ENGINE_ERROR".to_string(),
                    format!("Failed to create MMDeviceEnumerator: {}", e),
                )
            })?;

        let pkey_device_friendly_name = PROPERTYKEY {
            fmtid: GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
            pid: 14,
        };

        let get_friendly_name = |dev: &IMMDevice| -> String {
            if let Ok(store) = dev.OpenPropertyStore(STGM_READ) {
                if let Ok(prop) = store.GetValue(&pkey_device_friendly_name) {
                    let s = prop.to_string();
                    if !s.is_empty() {
                        return s;
                    }
                }
            }
            "Audio Device".to_string()
        };

        if let Some(raw_id) = device_id {
            let trimmed = raw_id.trim();
            if !trimmed.is_empty() {
                // 1. Direct lookup by WASAPI endpoint ID
                if let Ok(dev) = enumerator.GetDevice(&HSTRING::from(trimmed)) {
                    let name = get_friendly_name(&dev);
                    return Ok((dev, name));
                }

                // 2. Fallback lookup by friendly name (supports legacy configs)
                if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
                {
                    let count = collection.GetCount().unwrap_or(0);
                    for i in 0..count {
                        if let Ok(dev) = collection.Item(i) {
                            let name = get_friendly_name(&dev);
                            let id_str = dev
                                .GetId()
                                .ok()
                                .and_then(|pwstr| {
                                    let s = pwstr.to_string().ok();
                                    CoTaskMemFree(Some(pwstr.as_ptr() as *const _));
                                    s
                                })
                                .unwrap_or_default();

                            if name.eq_ignore_ascii_case(trimmed) || id_str == trimmed {
                                return Ok((dev, name));
                            }
                        }
                    }
                }

                return Err((
                    "DEVICE_NOT_FOUND".to_string(),
                    format!("Audio device not found: {}", trimmed),
                ));
            }
        }

        let dev = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| {
                (
                    "DEVICE_NOT_FOUND".to_string(),
                    format!("Audio device not found: Default audio endpoint unavailable ({})", e),
                )
            })?;
        let name = get_friendly_name(&dev);
        Ok((dev, name))
    }
}

/// When a DAC in WASAPI Exclusive mode does not support the source track's exact
/// `(sample_rate, channels)` (e.g. a mono file on a stereo-only DAC or a 44.1kHz file
/// on a 48kHz-locked USB DSP DAC), finds the closest hardware-supported `(rate, channels)`.
pub fn find_fallback_exclusive_format(
    device_id: Option<&str>,
    source_rate: u32,
    source_channels: u16,
) -> Option<(u32, u16)> {
    let (device, _) = resolve_device_strict(device_id).ok()?;
    unsafe {
        let client: IAudioClient = device.Activate(CLSCTX_INPROC_SERVER, None).ok()?;

        let mut mix_rate = 48000u32;
        if let Ok(mix_ptr) = client.GetMixFormat() {
            mix_rate = (*mix_ptr).nSamplesPerSec;
            CoTaskMemFree(Some(mix_ptr as *const _));
        }

        let mut rate_candidates = Vec::with_capacity(8);
        rate_candidates.push(source_rate);
        if !rate_candidates.contains(&mix_rate) {
            rate_candidates.push(mix_rate);
        }
        for &r in &[48000u32, 44100, 96000, 88200, 192000, 176400] {
            if !rate_candidates.contains(&r) {
                rate_candidates.push(r);
            }
        }

        let ch_candidates: &[u16] = if source_channels == 2 {
            &[2]
        } else {
            &[2, source_channels]
        };

        for &rate in &rate_candidates {
            for &ch in ch_candidates {
                if rate == source_rate && ch == source_channels {
                    continue;
                }
                for &(fmt, use_extensible) in exclusive_format_candidates() {
                    let wfx_ext = build_waveformat_extensible(rate, ch, fmt);
                    let wfx_plain = build_waveformat_plain(rate, ch, fmt);
                    let wfx_ptr: *const WAVEFORMATEX = if use_extensible {
                        &wfx_ext.Format
                    } else {
                        &wfx_plain
                    };
                    if client
                        .IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE, wfx_ptr, None)
                        .0
                        == 0
                    {
                        return Some((rate, ch));
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exclusive_format_candidates_order_is_bit_perfect_first() {
        let candidates = exclusive_format_candidates();
        assert!(!candidates.is_empty());
        assert_eq!(candidates[0], (OutputSampleFormat::Float32, true));
        assert!(candidates.contains(&(OutputSampleFormat::Pcm24In32, true)));
        assert!(candidates.contains(&(OutputSampleFormat::Pcm24Packed, true)));
        assert!(candidates.contains(&(OutputSampleFormat::Pcm32, true)));
        assert!(candidates.contains(&(OutputSampleFormat::Pcm16, true)));
    }

    #[test]
    fn pack_samples_float32_preserves_exact_bits_at_unity_volume() {
        let samples = [0.0f32, 0.5, -0.5, 1.0, -1.0];
        let mut dst = vec![0u8; samples.len() * 4];
        pack_samples(&samples, 1.0, OutputSampleFormat::Float32, &mut dst);
        for (i, &s) in samples.iter().enumerate() {
            let chunk = &dst[i * 4..(i + 1) * 4];
            assert_eq!(chunk, &s.to_le_bytes());
        }
    }

    #[test]
    fn pack_samples_pcm16_scales_and_clamps() {
        let samples = [0.0f32, 1.0, -1.0, 2.0];
        let mut dst = vec![0u8; samples.len() * 2];
        pack_samples(&samples, 1.0, OutputSampleFormat::Pcm16, &mut dst);
        let s0 = i16::from_le_bytes([dst[0], dst[1]]);
        let s1 = i16::from_le_bytes([dst[2], dst[3]]);
        let s2 = i16::from_le_bytes([dst[4], dst[5]]);
        let s3 = i16::from_le_bytes([dst[6], dst[7]]);
        assert_eq!(s0, 0);
        assert_eq!(s1, 32767);
        assert_eq!(s2, -32767);
        assert_eq!(s3, 32767);
    }

    #[test]
    fn pack_samples_pcm24_packed_and_in32_encode_correctly() {
        let samples = [1.0f32, -1.0];
        let mut packed = vec![0u8; 6];
        pack_samples(&samples, 1.0, OutputSampleFormat::Pcm24Packed, &mut packed);
        assert_eq!(&packed[0..3], &[0xFF, 0xFF, 0x7F]);

        let mut in32 = vec![0u8; 8];
        pack_samples(&samples, 1.0, OutputSampleFormat::Pcm24In32, &mut in32);
        assert_eq!(&in32[0..4], &[0x00, 0xFF, 0xFF, 0x7F]);
    }
}
