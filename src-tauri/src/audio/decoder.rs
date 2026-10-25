use std::path::Path;
use windows::core::{GUID, HSTRING, PROPVARIANT};
use windows::Win32::Media::MediaFoundation::{
    IMFMediaBuffer, IMFMediaType, IMFSample, IMFSourceReader, MFCreateMediaType,
    MFCreateSourceReaderFromURL, MFMediaType_Audio, MFStartup, MFAudioFormat_Float,
    MFAudioFormat_PCM, MF_API_VERSION, MF_MT_AUDIO_BITS_PER_SAMPLE, MF_MT_AUDIO_NUM_CHANNELS,
    MF_MT_AUDIO_SAMPLES_PER_SECOND, MF_MT_MAJOR_TYPE, MF_MT_SUBTYPE, MF_PD_DURATION,
    MF_SDK_VERSION, MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED, MF_SOURCE_READERF_ENDOFSTREAM,
    MF_SOURCE_READERF_ERROR, MF_SOURCE_READER_ALL_STREAMS, MF_SOURCE_READER_FIRST_AUDIO_STREAM,
    MF_SOURCE_READER_MEDIASOURCE, MFSTARTUP_NOSOCKET,
};

const MF_VERSION: u32 = (MF_SDK_VERSION << 16) | MF_API_VERSION;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DecodedSampleFormat {
    Float32,
    Pcm16,
    Pcm24,
    Pcm32,
}

pub struct MfDecoder {
    reader: IMFSourceReader,
    path: String,
    target_rate: Option<u32>,
    target_channels: Option<u16>,
    pub sample_rate: u32,
    pub channels: u16,
    pub source_bits_per_sample: Option<u16>,
    pub duration_secs: f64,
    sample_format: DecodedSampleFormat,
    residual: Vec<f32>,
    residual_pos: usize,
    current_frame: u64,
    eof: bool,
    fade_in_frames_total: u32,
    fade_in_frames_remaining: u32,
    fade_out_frames_total: u32,
    fade_out_frames_remaining: u32,
    fade_out_active: bool,
}

impl MfDecoder {
    pub fn open(path: &str, start_at_secs: Option<f64>) -> Result<Self, String> {
        Self::open_with_target(path, start_at_secs, None, None)
    }

    pub fn open_with_target(
        path: &str,
        start_at_secs: Option<f64>,
        target_rate: Option<u32>,
        target_channels: Option<u16>,
    ) -> Result<Self, String> {
        let file_path = Path::new(path);
        if !file_path.exists() {
            return Err(format!("AUDIO_FILE_NOT_FOUND: Audio file not found: {}", path));
        }

        unsafe {
            MFStartup(MF_VERSION, MFSTARTUP_NOSOCKET)
                .map_err(|e| format!("Failed to initialize Media Foundation: {}", e))?;

            let url = HSTRING::from(path);
            let reader: IMFSourceReader = MFCreateSourceReaderFromURL(&url, None)
                .map_err(|e| format!("Failed to open audio file with Media Foundation: {}", e))?;

            let all_streams = MF_SOURCE_READER_ALL_STREAMS.0 as u32;
            let first_audio = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

            let _ = reader.SetStreamSelection(all_streams, false);
            reader
                .SetStreamSelection(first_audio, true)
                .map_err(|e| format!("No audio stream found in file: {}", e))?;

            let source_bits_per_sample = reader
                .GetNativeMediaType(first_audio, 0)
                .ok()
                .and_then(|native_mt| native_mt.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).ok())
                .map(|b| b as u16)
                .filter(|&b| b > 0);

            // Prefer IEEE 32-bit float output; fall back to uncompressed PCM if codec refuses float.
            let sample_format = if Self::configure_output_subtype(
                &reader,
                first_audio,
                &MFAudioFormat_Float,
                target_rate,
                target_channels,
            )
            .is_ok()
            {
                DecodedSampleFormat::Float32
            } else {
                Self::configure_output_subtype(
                    &reader,
                    first_audio,
                    &MFAudioFormat_PCM,
                    target_rate,
                    target_channels,
                )?;
                let current_mt = reader
                    .GetCurrentMediaType(first_audio)
                    .map_err(|e| format!("Failed to query decoded PCM media type: {}", e))?;
                let bits = current_mt.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).unwrap_or(16);
                match bits {
                    24 => DecodedSampleFormat::Pcm24,
                    32 => DecodedSampleFormat::Pcm32,
                    _ => DecodedSampleFormat::Pcm16,
                }
            };

            let current_mt: IMFMediaType = reader
                .GetCurrentMediaType(first_audio)
                .map_err(|e| format!("Failed to get current audio media type: {}", e))?;

            let sample_rate = current_mt
                .GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND)
                .map_err(|e| format!("Failed to get audio sample rate: {}", e))?;
            let channels = current_mt
                .GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS)
                .map_err(|e| format!("Failed to get audio channel count: {}", e))? as u16;

            if sample_rate == 0 || channels == 0 {
                return Err("Invalid audio format (0 Hz or 0 channels)".to_string());
            }

            let duration_secs = Self::read_duration(&reader).unwrap_or(0.0);

            let mut decoder = Self {
                reader,
                path: path.to_string(),
                target_rate,
                target_channels,
                sample_rate,
                channels,
                source_bits_per_sample,
                duration_secs,
                sample_format,
                residual: Vec::with_capacity(sample_rate as usize * channels as usize / 10),
                residual_pos: 0,
                current_frame: 0,
                eof: false,
                fade_in_frames_total: 0,
                fade_in_frames_remaining: 0,
                fade_out_frames_total: 0,
                fade_out_frames_remaining: 0,
                fade_out_active: false,
            };

            if let Some(start) = start_at_secs {
                if start.is_finite() && start > 0.0 {
                    // Match NAudio's warm-up behavior: read one small block before seeking
                    // so Media Foundation initializes its internal stream state cleanly.
                    let mut warmup = vec![0.0f32; channels as usize];
                    let _ = decoder.read_samples(&mut warmup);
                    decoder.seek(start)?;
                }
            }

            Ok(decoder)
        }
    }

    unsafe fn configure_output_subtype(
        reader: &IMFSourceReader,
        stream_index: u32,
        subtype: &GUID,
        target_rate: Option<u32>,
        target_channels: Option<u16>,
    ) -> Result<(), String> {
        let partial_mt: IMFMediaType = MFCreateMediaType()
            .map_err(|e| format!("MFCreateMediaType failed: {}", e))?;
        partial_mt
            .SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Audio)
            .map_err(|e| format!("SetGUID MF_MT_MAJOR_TYPE failed: {}", e))?;
        partial_mt
            .SetGUID(&MF_MT_SUBTYPE, subtype)
            .map_err(|e| format!("SetGUID MF_MT_SUBTYPE failed: {}", e))?;
        if let Some(rate) = target_rate {
            let _ = partial_mt.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND, rate);
        }
        if let Some(ch) = target_channels {
            let _ = partial_mt.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS, ch as u32);
        }
        reader
            .SetCurrentMediaType(stream_index, None, &partial_mt)
            .map_err(|e| format!("SetCurrentMediaType failed: {}", e))?;
        Ok(())
    }

    unsafe fn read_duration(reader: &IMFSourceReader) -> Option<f64> {
        let var: PROPVARIANT = reader
            .GetPresentationAttribute(MF_SOURCE_READER_MEDIASOURCE.0 as u32, &MF_PD_DURATION)
            .ok()?;
        let ticks = u64::try_from(&var).ok()?;
        if ticks > 0 {
            Some(ticks as f64 / 10_000_000.0)
        } else {
            None
        }
    }

    pub fn seek(&mut self, seconds: f64) -> Result<(), String> {
        let clamped = if self.duration_secs > 0.0 {
            seconds.clamp(0.0, (self.duration_secs - 0.05).max(0.0))
        } else {
            seconds.max(0.0)
        };
        let hns = (clamped * 10_000_000.0) as i64;

        unsafe {
            let url = HSTRING::from(self.path.as_str());
            if let Ok(new_reader) = MFCreateSourceReaderFromURL(&url, None) {
                let all_streams = MF_SOURCE_READER_ALL_STREAMS.0 as u32;
                let first_audio = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;
                let _ = new_reader.SetStreamSelection(all_streams, false);
                if new_reader.SetStreamSelection(first_audio, true).is_ok() {
                    let fmt_ok = if Self::configure_output_subtype(
                        &new_reader,
                        first_audio,
                        &MFAudioFormat_Float,
                        self.target_rate,
                        self.target_channels,
                    )
                    .is_ok()
                    {
                        self.sample_format = DecodedSampleFormat::Float32;
                        true
                    } else if Self::configure_output_subtype(
                        &new_reader,
                        first_audio,
                        &MFAudioFormat_PCM,
                        self.target_rate,
                        self.target_channels,
                    )
                    .is_ok()
                    {
                        let bits = new_reader
                            .GetCurrentMediaType(first_audio)
                            .ok()
                            .and_then(|mt| mt.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).ok())
                            .unwrap_or(16);
                        self.sample_format = match bits {
                            24 => DecodedSampleFormat::Pcm24,
                            32 => DecodedSampleFormat::Pcm32,
                            _ => DecodedSampleFormat::Pcm16,
                        };
                        true
                    } else {
                        false
                    };
                    if fmt_ok {
                        self.reader = new_reader;
                        self.residual.clear();
                        self.residual_pos = 0;
                        self.eof = false;
                        self.current_frame = 0;
                        self.fade_in_frames_remaining = 0;
                        if hns > 0 {
                            let mut warmup = vec![0.0f32; self.channels as usize];
                            let _ = self.read_samples(&mut warmup);
                        }
                    }
                }
            }

            let var = PROPVARIANT::from(hns);
            self.reader
                .SetCurrentPosition(&GUID::zeroed(), &var)
                .map_err(|e| format!("Failed to seek audio stream: {}", e))?;
        }

        self.residual.clear();
        self.residual_pos = 0;
        self.eof = false;
        self.current_frame = (clamped * self.sample_rate as f64) as u64;
        self.arm_fade_in();
        let _ = self.decode_next_packet();
        Ok(())
    }

    pub fn arm_fade_in(&mut self) {
        // ~20ms smooth fade-in ramp to suppress post-seek / post-resume transients & clicks
        let ramp_frames = (self.sample_rate / 50).max(64);
        self.fade_in_frames_total = ramp_frames;
        self.fade_in_frames_remaining = ramp_frames;
        self.fade_out_active = false;
        self.fade_out_frames_remaining = 0;
    }

    pub fn arm_fade_out(&mut self) {
        let ramp_frames = (self.sample_rate / 50).max(64);
        self.fade_out_frames_total = ramp_frames;
        self.fade_out_frames_remaining = ramp_frames;
        self.fade_out_active = true;
        self.fade_in_frames_remaining = 0;
    }

    pub fn fade_out_done(&self) -> bool {
        self.fade_out_active && self.fade_out_frames_remaining == 0
    }

    pub fn position_secs(&self) -> f64 {
        if self.sample_rate == 0 {
            return 0.0;
        }
        let pos = self.current_frame as f64 / self.sample_rate as f64;
        if self.duration_secs > 0.0 {
            pos.min(self.duration_secs)
        } else {
            pos
        }
    }

    pub fn is_eof(&self) -> bool {
        self.eof && self.residual_pos >= self.residual.len()
    }

    /// Reads interleaved `f32` samples into `out`.
    /// Returns the number of `f32` samples written (always a multiple of `channels` when possible).
    pub fn read_samples(&mut self, out: &mut [f32]) -> Result<usize, String> {
        let mut written = 0;
        let ch = self.channels as usize;

        let out: &mut [f32] = if self.fade_out_active {
            let max = (self.fade_out_frames_remaining as usize * ch).min(out.len());
            &mut out[..max]
        } else {
            out
        };

        while written < out.len() {
            let avail = self.residual.len().saturating_sub(self.residual_pos);
            if avail > 0 {
                let to_copy = avail.min(out.len() - written);
                out[written..written + to_copy]
                    .copy_from_slice(&self.residual[self.residual_pos..self.residual_pos + to_copy]);
                self.residual_pos += to_copy;
                written += to_copy;
                if self.residual_pos >= self.residual.len() {
                    self.residual.clear();
                    self.residual_pos = 0;
                }
                continue;
            }

            if self.eof {
                break;
            }

            if !self.decode_next_packet()? {
                break;
            }
        }

        if ch > 0 {
            let frames_written = written / ch;
            if self.fade_in_frames_remaining > 0 && self.fade_in_frames_total > 0 {
                let total = self.fade_in_frames_total as f32;
                let to_ramp = frames_written.min(self.fade_in_frames_remaining as usize);
                for f in 0..to_ramp {
                    let progressed = (self.fade_in_frames_total - self.fade_in_frames_remaining) as f32 + f as f32;
                    let gain = (progressed / total).clamp(0.0, 1.0);
                    let base = f * ch;
                    for c in 0..ch {
                        out[base + c] *= gain;
                    }
                }
                self.fade_in_frames_remaining = self
                    .fade_in_frames_remaining
                    .saturating_sub(to_ramp as u32);
            }
            if self.fade_out_active && self.fade_out_frames_total > 0 {
                let total = self.fade_out_frames_total as f32;
                let to_ramp = frames_written.min(self.fade_out_frames_remaining as usize);
                for f in 0..to_ramp {
                    let left = self.fade_out_frames_remaining as f32 - f as f32;
                    let gain = ((left - 1.0) / total).clamp(0.0, 1.0);
                    let base = f * ch;
                    for c in 0..ch {
                        out[base + c] *= gain;
                    }
                }
                self.fade_out_frames_remaining = self
                    .fade_out_frames_remaining
                    .saturating_sub(to_ramp as u32);
            }
            self.current_frame += frames_written as u64;
        }

        Ok(written)
    }

    fn decode_next_packet(&mut self) -> Result<bool, String> {
        let first_audio = MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32;

        unsafe {
            let mut empty_retries = 0u32;
            loop {
                let mut flags: u32 = 0;
                let mut timestamp: i64 = 0;
                let mut sample_opt: Option<IMFSample> = None;

                self.reader
                    .ReadSample(
                        first_audio,
                        0,
                        None,
                        Some(&mut flags),
                        Some(&mut timestamp),
                        Some(&mut sample_opt),
                    )
                    .map_err(|e| format!("Error reading audio sample: {}", e))?;

                if (flags & MF_SOURCE_READERF_ERROR.0 as u32) != 0 {
                    return Err("Media Foundation stream error during playback".to_string());
                }

                if (flags & MF_SOURCE_READERF_ENDOFSTREAM.0 as u32) != 0 {
                    self.eof = true;
                    return Ok(false);
                }

                if (flags & MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED.0 as u32) != 0 {
                    if let Ok(mt) = self.reader.GetCurrentMediaType(first_audio) {
                        if let Ok(sr) = mt.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND) {
                            if sr > 0 {
                                self.sample_rate = sr;
                            }
                        }
                        if let Ok(ch) = mt.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS) {
                            if ch > 0 {
                                self.channels = ch as u16;
                            }
                        }
                        if let Ok(sub) = mt.GetGUID(&MF_MT_SUBTYPE) {
                            if sub == MFAudioFormat_Float {
                                self.sample_format = DecodedSampleFormat::Float32;
                            } else if sub == MFAudioFormat_PCM {
                                let bits = mt.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).unwrap_or(16);
                                self.sample_format = match bits {
                                    24 => DecodedSampleFormat::Pcm24,
                                    32 => DecodedSampleFormat::Pcm32,
                                    _ => DecodedSampleFormat::Pcm16,
                                };
                            }
                        }
                    }
                }

                let Some(sample) = sample_opt else {
                    empty_retries += 1;
                    if empty_retries > 64 {
                        return Err(format!(
                            "Media Foundation returned >64 empty packets (flags=0x{:x})",
                            flags
                        ));
                    }
                    continue;
                };

                if sample.GetBufferCount().unwrap_or(0) == 0 {
                    continue;
                }

                let Ok(buffer): Result<IMFMediaBuffer, _> = sample.ConvertToContiguousBuffer() else {
                    continue;
                };

                let mut data_ptr: *mut u8 = std::ptr::null_mut();
                let mut current_len: u32 = 0;

                buffer
                    .Lock(&mut data_ptr, None, Some(&mut current_len))
                    .map_err(|e| format!("IMFMediaBuffer::Lock failed: {}", e))?;

                let result = if !data_ptr.is_null() && current_len > 0 {
                    let bytes = std::slice::from_raw_parts(data_ptr, current_len as usize);
                    self.append_bytes_as_f32(bytes);
                    true
                } else {
                    false
                };

                let _ = buffer.Unlock();

                if result && !self.residual.is_empty() {
                    return Ok(true);
                }
            }
        }
    }

    fn append_bytes_as_f32(&mut self, bytes: &[u8]) {
        self.residual.clear();
        self.residual_pos = 0;

        match self.sample_format {
            DecodedSampleFormat::Float32 => {
                let count = bytes.len() / 4;
                self.residual.reserve(count);
                for chunk in bytes.chunks_exact(4) {
                    let val = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                    self.residual.push(if val.is_finite() { val } else { 0.0 });
                }
            }
            DecodedSampleFormat::Pcm16 => {
                let count = bytes.len() / 2;
                self.residual.reserve(count);
                for chunk in bytes.chunks_exact(2) {
                    let s = i16::from_le_bytes([chunk[0], chunk[1]]);
                    self.residual.push(s as f32 / 32768.0);
                }
            }
            DecodedSampleFormat::Pcm24 => {
                let count = bytes.len() / 3;
                self.residual.reserve(count);
                for chunk in bytes.chunks_exact(3) {
                    let sign_ext = if (chunk[2] & 0x80) != 0 { 0xFF } else { 0x00 };
                    let s = i32::from_le_bytes([chunk[0], chunk[1], chunk[2], sign_ext]);
                    self.residual.push(s as f32 / 8_388_608.0);
                }
            }
            DecodedSampleFormat::Pcm32 => {
                let count = bytes.len() / 4;
                self.residual.reserve(count);
                for chunk in bytes.chunks_exact(4) {
                    let s = i32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                    self.residual.push(s as f32 / 2_147_483_648.0);
                }
            }
        }

        let ch = self.channels as usize;
        if ch > 1 {
            let rem = self.residual.len() % ch;
            if rem != 0 {
                self.residual.truncate(self.residual.len() - rem);
            }
        }
    }
}
