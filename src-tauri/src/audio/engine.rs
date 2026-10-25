use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use crate::audio::decoder::MfDecoder;
use crate::audio::output::get_audio_hosts_and_devices;
#[cfg(windows)]
use crate::audio::wasapi::{find_fallback_exclusive_format, MmcssGuard, WasapiOutput};

static ENGINE_TX: Mutex<Option<Sender<WorkerMsg>>> = Mutex::new(None);
static ENGINE_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingCommand {
    #[serde(rename = "command")]
    pub name: Option<String>,
    pub path: Option<String>,
    pub mode: Option<String>,
    pub exclusive: Option<bool>,
    pub device_id: Option<String>,
    pub request_id: Option<String>,
    pub generation: Option<i64>,
    pub start_at: Option<f64>,
    pub position: Option<f64>,
    pub volume: Option<f32>,
}

impl IncomingCommand {
    pub fn resolved_mode(&self) -> Option<String> {
        if let Some(ref m) = self.mode {
            let trimmed = m.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        self.exclusive
            .map(|ex| if ex { "exclusive".to_string() } else { "shared".to_string() })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StateEventPayload<'a> {
    event: &'static str,
    state: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<&'a str>,
    exclusive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    sample_rate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bit_depth: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    device_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEventPayload<'a> {
    event: &'static str,
    position: f64,
    duration: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEventPayload<'a> {
    event: &'static str,
    code: &'a str,
    message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation: Option<i64>,
    recoverable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceItemPayload {
    id: String,
    name: String,
    is_default: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DevicesEventPayload<'a> {
    event: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<&'a str>,
    devices: Vec<DeviceItemPayload>,
}

enum WorkerMsg {
    Command(String),
    StopSession(mpsc::SyncSender<()>),
}

fn emit_json<T: Serialize>(app: &AppHandle, payload: &T) {
    if let Ok(line) = serde_json::to_string(payload) {
        let _ = app.emit("audio-event", line);
    }
}

fn round2(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}

fn is_lossless_path(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(ext.as_str(), "flac" | "wav" | "alac" | "aiff" | "aif" | "dsd" | "dsf")
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PlaybackState {
    Stopped,
    Playing,
    Paused,
}

#[cfg(windows)]
struct ActiveSession {
    decoder: MfDecoder,
    output: WasapiOutput,
    path: String,
    mode: String,
    request_id: Option<String>,
    generation: Option<i64>,
    sample_rate: u32,
    bit_depth: Option<u32>,
}

#[cfg(windows)]
impl ActiveSession {
    fn device_name(&self) -> &str {
        &self.output.device_name
    }
}

#[cfg(windows)]
struct AudioWorker {
    app: AppHandle,
    state: PlaybackState,
    session: Option<ActiveSession>,
    volume: f32,
    scratch: Vec<f32>,
    last_progress_emit: Instant,
    draining_eof: bool,
    pausing: bool,
}

#[cfg(windows)]
impl AudioWorker {
    fn new(app: AppHandle) -> Self {
        Self {
            app,
            state: PlaybackState::Stopped,
            session: None,
            volume: 1.0,
            scratch: Vec::with_capacity(8192),
            last_progress_emit: Instant::now(),
            draining_eof: false,
            pausing: false,
        }
    }

    fn emit_current_state(&self, override_state: Option<&str>) {
        let state_str = override_state.unwrap_or(match self.state {
            PlaybackState::Playing => "playing",
            PlaybackState::Paused => "paused",
            PlaybackState::Stopped => "stopped",
        });

        if let Some(ref s) = self.session {
            emit_json(
                &self.app,
                &StateEventPayload {
                    event: "state",
                    state: state_str,
                    path: Some(&s.path),
                    mode: Some(&s.mode),
                    exclusive: s.mode == "exclusive",
                    sample_rate: Some(s.sample_rate),
                    bit_depth: s.bit_depth,
                    device_name: Some(s.device_name()),
                    request_id: s.request_id.as_deref(),
                    generation: s.generation,
                },
            );
        } else {
            emit_json(
                &self.app,
                &StateEventPayload {
                    event: "state",
                    state: state_str,
                    path: None,
                    mode: None,
                    exclusive: false,
                    sample_rate: None,
                    bit_depth: None,
                    device_name: None,
                    request_id: None,
                    generation: None,
                },
            );
        }
    }

    fn emit_current_progress(&self) {
        if let Some(ref s) = self.session {
            let pos = s.decoder.position_secs();
            let dur = s.decoder.duration_secs;
            emit_json(
                &self.app,
                &ProgressEventPayload {
                    event: "progress",
                    position: round2(pos),
                    duration: round2(dur),
                    path: Some(&s.path),
                    mode: Some(&s.mode),
                    request_id: s.request_id.as_deref(),
                    generation: s.generation,
                },
            );
        }
    }

    fn emit_error(
        &self,
        code: &str,
        message: &str,
        context: Option<&str>,
        mode: Option<&str>,
        path: Option<&str>,
        request_id: Option<&str>,
        generation: Option<i64>,
    ) {
        emit_json(
            &self.app,
            &ErrorEventPayload {
                event: "error",
                code,
                message,
                context,
                mode,
                path,
                request_id,
                generation,
                recoverable: false,
            },
        );
    }

    fn stop_session(&mut self) {
        if let Some(mut s) = self.session.take() {
            s.output.stop();
        }
        self.state = PlaybackState::Stopped;
        self.draining_eof = false;
        self.pausing = false;
    }

    fn handle_json(&mut self, json_line: &str) -> bool {
        let trimmed = json_line.trim();
        if trimmed.is_empty() {
            return true;
        }

        let cmd: IncomingCommand = match serde_json::from_str(trimmed) {
            Ok(c) => c,
            Err(_) => {
                self.emit_error("ENGINE_ERROR", "Invalid command JSON", Some("parse"), None, None, None, None);
                return true;
            }
        };

        let Some(ref name) = cmd.name else {
            self.emit_error("ENGINE_ERROR", "Invalid command JSON", Some("parse"), None, None, None, None);
            return true;
        };

        match name.as_str() {
            "play" => self.cmd_play(cmd),
            "pause" => self.cmd_pause(),
            "resume" => self.cmd_resume(),
            "stop" => self.cmd_stop(),
            "seek" => self.cmd_seek(cmd.position),
            "set_volume" => self.cmd_set_volume(cmd.volume),
            "get_devices" => self.cmd_get_devices(cmd.request_id.as_deref()),
            "get_state" => self.emit_current_state(None),
            "ping" => {
                let _ = self.app.emit("audio-event", r#"{"event":"pong"}"#.to_string());
            }
            "shutdown" => {
                self.stop_session();
                let _ = self.app.emit("audio-event", r#"{"event":"bye"}"#.to_string());
                return false;
            }
            other => {
                self.emit_error(
                    "ENGINE_ERROR",
                    &format!("Unknown command: {}", other),
                    Some("unknown"),
                    None,
                    None,
                    cmd.request_id.as_deref(),
                    cmd.generation,
                );
            }
        }

        true
    }

    fn cmd_play(&mut self, cmd: IncomingCommand) {
        let req_id = cmd.request_id.clone();
        let gen_id = cmd.generation;
        let resolved_mode = cmd.resolved_mode();

        let Some(path) = cmd.path.clone().filter(|p| !p.is_empty()) else {
            self.emit_error(
                "AUDIO_FILE_NOT_FOUND",
                "Missing 'path' for play command",
                Some("play"),
                resolved_mode.as_deref(),
                None,
                req_id.as_deref(),
                gen_id,
            );
            return;
        };

        let Some(mode) = resolved_mode else {
            self.emit_error(
                "INVALID_MODE",
                "Missing 'mode' for play command",
                Some("play"),
                None,
                Some(&path),
                req_id.as_deref(),
                gen_id,
            );
            return;
        };

        if mode != "shared" && mode != "exclusive" {
            self.emit_error(
                "INVALID_MODE",
                &format!("Unsupported audio mode: {}", mode),
                Some("play"),
                Some(&mode),
                Some(&path),
                req_id.as_deref(),
                gen_id,
            );
            return;
        }

        if let Some(vol) = cmd.volume {
            if vol.is_finite() {
                self.volume = vol.clamp(0.0, 1.0);
            }
        }

        self.stop_session();

        let mut decoder = match MfDecoder::open(&path, cmd.start_at) {
            Ok(d) => d,
            Err(e) => {
                let code = if e.starts_with("AUDIO_FILE_NOT_FOUND") {
                    "AUDIO_FILE_NOT_FOUND"
                } else {
                    "ENGINE_ERROR"
                };
                self.emit_error(
                    code,
                    &e,
                    Some("play"),
                    Some(&mode),
                    Some(&path),
                    req_id.as_deref(),
                    gen_id,
                );
                return;
            }
        };

        let exclusive = mode == "exclusive";
        let mut output = match WasapiOutput::open(
            cmd.device_id.as_deref(),
            exclusive,
            decoder.sample_rate,
            decoder.channels,
        ) {
            Ok(o) => o,
            Err((code, msg)) => {
                // If Exclusive mode rejected the file's native (sample_rate, channels)
                // (e.g. mono file on stereo-only DAC, or 44.1kHz file on 48kHz-locked USB DSP DAC),
                // try adapting MfDecoder to the DAC's hardware-supported Exclusive rate/channels.
                let mut fallback_succeeded = None;
                if exclusive && code == "EXCLUSIVE_NOT_SUPPORTED" {
                    if let Some((fb_rate, fb_ch)) = find_fallback_exclusive_format(
                        cmd.device_id.as_deref(),
                        decoder.sample_rate,
                        decoder.channels,
                    ) {
                        if let Ok(fb_decoder) = MfDecoder::open_with_target(
                            &path,
                            cmd.start_at,
                            Some(fb_rate),
                            Some(fb_ch),
                        ) {
                            if let Ok(fb_out) = WasapiOutput::open(
                                cmd.device_id.as_deref(),
                                true,
                                fb_decoder.sample_rate,
                                fb_decoder.channels,
                            ) {
                                decoder = fb_decoder;
                                fallback_succeeded = Some(fb_out);
                            }
                        }
                    }
                }

                match fallback_succeeded {
                    Some(fb_out) => fb_out,
                    None => {
                        self.emit_error(
                            &code,
                            &msg,
                            Some("play"),
                            Some(&mode),
                            Some(&path),
                            req_id.as_deref(),
                            gen_id,
                        );
                        return;
                    }
                }
            }
        };

        // Pre-fill initial buffer before starting hardware clock to avoid initial click/underrun
        let init_frames = output.buffer_frames;
        let vol = self.volume;
        if let Err(e) = output.write_frames(init_frames, vol, &mut self.scratch, |buf| {
            decoder.read_samples(buf)
        }) {
            self.emit_error(
                "ENGINE_ERROR",
                &e,
                Some("play"),
                Some(&mode),
                Some(&path),
                req_id.as_deref(),
                gen_id,
            );
            return;
        }

        if let Err(e) = output.start() {
            self.emit_error(
                "ENGINE_ERROR",
                &e,
                Some("play"),
                Some(&mode),
                Some(&path),
                req_id.as_deref(),
                gen_id,
            );
            return;
        }

        let bit_depth = if is_lossless_path(&path) {
            Some(
                decoder
                    .source_bits_per_sample
                    .unwrap_or_else(|| output.sample_format.bits_per_sample()) as u32,
            )
        } else {
            None
        };

        let sample_rate = decoder.sample_rate;
        self.session = Some(ActiveSession {
            decoder,
            output,
            path,
            mode,
            request_id: req_id,
            generation: gen_id,
            sample_rate,
            bit_depth,
        });
        self.state = PlaybackState::Playing;
        self.draining_eof = false;
        self.last_progress_emit = Instant::now();
        self.emit_current_state(Some("playing"));
        self.emit_current_progress();
    }

    fn cmd_pause(&mut self) {
        if self.state == PlaybackState::Playing && !self.pausing {
            if let Some(ref mut s) = self.session {
                s.decoder.arm_fade_out();
                self.pausing = true;
            } else {
                self.state = PlaybackState::Paused;
            }
        }
        self.emit_current_state(Some("paused"));
        self.emit_current_progress();
    }

    fn cmd_resume(&mut self) {
        if self.state == PlaybackState::Paused || self.pausing {
            if let Some(ref mut s) = self.session {
                s.decoder.arm_fade_in();
            }
            self.pausing = false;
            self.state = PlaybackState::Playing;
            self.last_progress_emit = Instant::now();
        }
        self.emit_current_state(Some("playing"));
        self.emit_current_progress();
    }

    fn cmd_stop(&mut self) {
        let prev_mode = self.session.as_ref().map(|s| s.mode.clone());
        let prev_device = self.session.as_ref().map(|s| s.device_name().to_string());
        let prev_req = self.session.as_ref().and_then(|s| s.request_id.clone());
        let prev_gen = self.session.as_ref().and_then(|s| s.generation);

        self.stop_session();

        emit_json(
            &self.app,
            &StateEventPayload {
                event: "state",
                state: "stopped",
                path: None,
                mode: prev_mode.as_deref(),
                exclusive: prev_mode.as_deref() == Some("exclusive"),
                sample_rate: None,
                bit_depth: None,
                device_name: prev_device.as_deref(),
                request_id: prev_req.as_deref(),
                generation: prev_gen,
            },
        );
    }

    fn cmd_seek(&mut self, position: Option<f64>) {
        let Some(pos) = position.filter(|p| p.is_finite()) else {
            self.emit_error("ENGINE_ERROR", "Missing 'position' for seek command", Some("seek"), None, None, None, None);
            return;
        };

        if let Some(ref mut s) = self.session {
            let was_playing = self.state == PlaybackState::Playing;

            // Stop output clock and reset WASAPI hardware buffer before seeking to prevent
            // buffer underrun, DMA clock pointer desync, and clicks/distortions from leftover audio.
            if was_playing {
                s.output.stop();
            }
            let _ = s.output.reset();

            if let Err(e) = s.decoder.seek(pos) {
                let mode = s.mode.clone();
                let path = s.path.clone();
                let req_id = s.request_id.clone();
                let gen_id = s.generation;
                self.emit_error(
                    "ENGINE_ERROR",
                    &e,
                    Some("seek"),
                    Some(&mode),
                    Some(&path),
                    req_id.as_deref(),
                    gen_id,
                );
                return;
            }
            self.draining_eof = false;

            if was_playing {
                // Pre-fill initial buffer at the new seek position (with decoder fade-in ramp)
                // before starting the hardware DMA clock.
                let init_frames = s.output.buffer_frames;
                let vol = self.volume;
                let _ = s.output.write_frames(init_frames, vol, &mut self.scratch, |buf| {
                    s.decoder.read_samples(buf)
                });
                let _ = s.output.start();
            } else if self.state == PlaybackState::Paused {
                // In paused state, pre-fill with silence so WASAPI endpoint stays active.
                let init_frames = s.output.buffer_frames;
                let _ = s.output.write_silence(init_frames);
                let _ = s.output.start();
            }
        }

        if self.pausing {
            self.pausing = false;
            self.state = PlaybackState::Paused;
        }

        self.last_progress_emit = Instant::now();
        self.emit_current_progress();
    }

    fn cmd_set_volume(&mut self, volume: Option<f32>) {
        if let Some(v) = volume.filter(|v| v.is_finite()) {
            self.volume = v.clamp(0.0, 1.0);
        } else {
            self.emit_error(
                "ENGINE_ERROR",
                "Missing 'volume' for set_volume command",
                Some("set_volume"),
                None,
                None,
                None,
                None,
            );
        }
    }

    fn cmd_get_devices(&self, request_id: Option<&str>) {
        let devices = get_audio_hosts_and_devices()
            .into_iter()
            .map(|d| DeviceItemPayload {
                id: d.id,
                name: d.name,
                is_default: d.is_default,
            })
            .collect();

        emit_json(
            &self.app,
            &DevicesEventPayload {
                event: "devices",
                request_id,
                devices,
            },
        );
    }

    fn pump_audio(&mut self) {
        if self.state == PlaybackState::Stopped {
            return;
        }

        let Some(ref mut s) = self.session else {
            self.state = PlaybackState::Stopped;
            return;
        };

        let signaled = s.output.wait_for_buffer(20);
        if !signaled && s.output.exclusive {
            if self.state == PlaybackState::Playing
                && self.last_progress_emit.elapsed() >= Duration::from_millis(100)
            {
                self.last_progress_emit = Instant::now();
                self.emit_current_progress();
            }
            return;
        }

        if self.state == PlaybackState::Paused {
            if let Ok(available) = s.output.available_frames() {
                if available > 0 {
                    let _ = s.output.write_silence(available);
                }
            }
            return;
        }

        if self.draining_eof {
            // One buffer period has elapsed after EOF was written; finish track cleanly.
            let path = s.path.clone();
            let mode = s.mode.clone();
            let dev_name = s.device_name().to_string();
            let req_id = s.request_id.clone();
            let gen_id = s.generation;

            self.stop_session();

            emit_json(
                &self.app,
                &StateEventPayload {
                    event: "state",
                    state: "ended",
                    path: Some(&path),
                    mode: Some(&mode),
                    exclusive: mode == "exclusive",
                    sample_rate: None,
                    bit_depth: None,
                    device_name: Some(&dev_name),
                    request_id: req_id.as_deref(),
                    generation: gen_id,
                },
            );
            return;
        }

        let available = match s.output.available_frames() {
            Ok(f) => f,
            Err(e) => {
                let mode = s.mode.clone();
                let path = s.path.clone();
                let req_id = s.request_id.clone();
                let gen_id = s.generation;
                self.stop_session();
                self.emit_error(
                    "PLAYBACK_FAILED",
                    &e,
                    Some("playback"),
                    Some(&mode),
                    Some(&path),
                    req_id.as_deref(),
                    gen_id,
                );
                return;
            }
        };

        if available > 0 {
            let vol = self.volume;
            let write_res = s.output.write_frames(available, vol, &mut self.scratch, |buf| {
                s.decoder.read_samples(buf)
            });

            match write_res {
                Ok(_frames_written) => {
                    if self.pausing && s.decoder.fade_out_done() {
                        self.pausing = false;
                        self.state = PlaybackState::Paused;
                        return;
                    }
                    if s.decoder.is_eof() {
                        self.draining_eof = true;
                    }
                }
                Err(e) => {
                    let mode = s.mode.clone();
                    let path = s.path.clone();
                    let req_id = s.request_id.clone();
                    let gen_id = s.generation;
                    self.stop_session();
                    self.emit_error(
                        "PLAYBACK_FAILED",
                        &e,
                        Some("playback"),
                        Some(&mode),
                        Some(&path),
                        req_id.as_deref(),
                        gen_id,
                    );
                    return;
                }
            }
        }

        if self.last_progress_emit.elapsed() >= Duration::from_millis(100) {
            self.last_progress_emit = Instant::now();
            self.emit_current_progress();
        }
    }
}

#[cfg(windows)]
fn run_worker_loop(app: AppHandle, rx: Receiver<WorkerMsg>) {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

    ENGINE_RUNNING.store(true, Ordering::SeqCst);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let _mmcss = MmcssGuard::enter_pro_audio();

        let mut worker = AudioWorker::new(app.clone());

        loop {
            if worker.state != PlaybackState::Stopped {
                // Drain all queued commands non-blockingly, coalescing consecutive seek commands
                let mut keep_running = true;
                let mut pending_seek: Option<String> = None;
                while let Ok(msg) = rx.try_recv() {
                    match msg {
                        WorkerMsg::Command(json) => {
                            if json.contains(r#""seek""#) {
                                pending_seek = Some(json);
                                continue;
                            }
                            if let Some(seek_json) = pending_seek.take() {
                                if !worker.handle_json(&seek_json) {
                                    keep_running = false;
                                    break;
                                }
                            }
                            if !worker.handle_json(&json) {
                                keep_running = false;
                                break;
                            }
                        }
                        WorkerMsg::StopSession(ack) => {
                            pending_seek = None;
                            worker.stop_session();
                            let _ = ack.send(());
                        }
                    }
                }
                if !keep_running {
                    break;
                }
                if let Some(seek_json) = pending_seek.take() {
                    if !worker.handle_json(&seek_json) {
                        break;
                    }
                }
                worker.pump_audio();
            } else {
                // Stopped: block until a command arrives (0% CPU usage)
                match rx.recv() {
                    Ok(WorkerMsg::Command(json)) => {
                        if !worker.handle_json(&json) {
                            break;
                        }
                    }
                    Ok(WorkerMsg::StopSession(ack)) => {
                        worker.stop_session();
                        let _ = ack.send(());
                    }
                    Err(_) => {
                        worker.stop_session();
                        break;
                    }
                }
            }
        }

        CoUninitialize();
    }));

    ENGINE_RUNNING.store(false, Ordering::SeqCst);

    if result.is_err() {
        emit_json(
            &app,
            &ErrorEventPayload {
                event: "error",
                code: "ENGINE_ERROR",
                message: "Native audio engine worker encountered an internal panic and recovered",
                context: Some("playback"),
                mode: None,
                path: None,
                request_id: None,
                generation: None,
                recoverable: true,
            },
        );
    }
}

#[cfg(windows)]
fn ensure_worker(app: &AppHandle) -> Result<Sender<WorkerMsg>, String> {
    let mut guard = ENGINE_TX.lock().map_err(|e| e.to_string())?;
    if let Some(ref tx) = *guard {
        if ENGINE_RUNNING.load(Ordering::SeqCst) {
            return Ok(tx.clone());
        }
    }

    let (tx, rx) = mpsc::channel::<WorkerMsg>();
    let app_clone = app.clone();
    ENGINE_RUNNING.store(true, Ordering::SeqCst);
    if let Err(e) = std::thread::Builder::new()
        .name("symvonia-wasapi-engine".to_string())
        .spawn(move || {
            run_worker_loop(app_clone, rx);
        })
    {
        ENGINE_RUNNING.store(false, Ordering::SeqCst);
        return Err(format!("Failed to spawn native audio thread: {}", e));
    }

    *guard = Some(tx.clone());
    Ok(tx)
}

#[cfg(windows)]
pub fn send_command(app: &AppHandle, json: &str) -> Result<(), String> {
    let tx = ensure_worker(app)?;
    if tx.send(WorkerMsg::Command(json.to_string())).is_err() {
        // Thread died between check and send; respawn once
        {
            if let Ok(mut guard) = ENGINE_TX.lock() {
                *guard = None;
            }
            ENGINE_RUNNING.store(false, Ordering::SeqCst);
        }
        let tx2 = ensure_worker(app)?;
        tx2.send(WorkerMsg::Command(json.to_string()))
            .map_err(|e| format!("Failed to send command to native audio engine: {}", e))?;
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn send_command(_app: &AppHandle, _json: &str) -> Result<(), String> {
    Err("Native WASAPI audio engine is only available on Windows".to_string())
}

pub fn stop_engine() -> Result<(), String> {
    if !ENGINE_RUNNING.load(Ordering::SeqCst) {
        return Ok(());
    }
    let sender = if let Ok(guard) = ENGINE_TX.lock() {
        guard.clone()
    } else {
        None
    };

    if let Some(tx) = sender {
        let (ack_tx, ack_rx) = mpsc::sync_channel::<()>(1);
        if tx.send(WorkerMsg::StopSession(ack_tx)).is_ok() {
            let _ = ack_rx.recv_timeout(Duration::from_millis(500));
        }
    }
    Ok(())
}

pub fn is_running() -> bool {
    ENGINE_RUNNING.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_play_command_and_resolves_mode() {
        let json = r#"{"command":"play","path":"C:\\Music\\track.flac","mode":"exclusive","exclusive":true,"deviceId":"dev-1","requestId":"req-1","generation":42,"startAt":12.5,"volume":0.75}"#;
        let cmd: IncomingCommand = serde_json::from_str(json).expect("valid command JSON");
        assert_eq!(cmd.name.as_deref(), Some("play"));
        assert_eq!(cmd.path.as_deref(), Some("C:\\Music\\track.flac"));
        assert_eq!(cmd.resolved_mode().as_deref(), Some("exclusive"));
        assert_eq!(cmd.device_id.as_deref(), Some("dev-1"));
        assert_eq!(cmd.request_id.as_deref(), Some("req-1"));
        assert_eq!(cmd.generation, Some(42));
        assert_eq!(cmd.start_at, Some(12.5));
        assert_eq!(cmd.volume, Some(0.75));
    }

    #[test]
    fn resolves_mode_from_exclusive_bool_fallback() {
        let cmd_ex: IncomingCommand =
            serde_json::from_str(r#"{"command":"play","exclusive":true}"#).unwrap();
        assert_eq!(cmd_ex.resolved_mode().as_deref(), Some("exclusive"));

        let cmd_sh: IncomingCommand =
            serde_json::from_str(r#"{"command":"play","exclusive":false}"#).unwrap();
        assert_eq!(cmd_sh.resolved_mode().as_deref(), Some("shared"));
    }

    #[test]
    fn state_event_matches_frontend_contract() {
        let payload = StateEventPayload {
            event: "state",
            state: "playing",
            path: Some("C:/Music/song.flac"),
            mode: Some("exclusive"),
            exclusive: true,
            sample_rate: Some(96000),
            bit_depth: Some(24),
            device_name: Some("USB DAC"),
            request_id: Some("r1"),
            generation: Some(3),
        };
        let s = serde_json::to_string(&payload).unwrap();
        let val: serde_json::Value = serde_json::from_str(&s).unwrap();
        assert_eq!(val["event"], "state");
        assert_eq!(val["state"], "playing");
        assert_eq!(val["exclusive"], true);
        assert_eq!(val["sampleRate"], 96000);
        assert_eq!(val["bitDepth"], 24);
        assert_eq!(val["deviceName"], "USB DAC");
        assert_eq!(val["requestId"], "r1");
        assert_eq!(val["generation"], 3);
    }

    #[cfg(windows)]
    #[test]
    fn decoder_seeks_forward_backward_and_near_eof_cleanly() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        // Generate a 2-second 44100 Hz stereo 16-bit PCM WAV file in temp dir
        let sample_rate: u32 = 44100;
        let channels: u16 = 2;
        let num_frames: u32 = sample_rate * 2;
        let data_bytes = num_frames * (channels as u32) * 2;
        let mut wav = Vec::with_capacity(44 + data_bytes as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&(sample_rate * channels as u32 * 2).to_le_bytes());
        wav.extend_from_slice(&(channels * 2).to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_bytes.to_le_bytes());
        for i in 0..(num_frames * channels as u32) {
            let sample = ((i % 100) as i16) * 100;
            wav.extend_from_slice(&sample.to_le_bytes());
        }

        let temp_path = std::env::temp_dir().join("symvonia_seek_test.wav");
        std::fs::write(&temp_path, &wav).expect("write temp wav");
        let path_str = temp_path.to_string_lossy().to_string();

        let mut decoder = MfDecoder::open(&path_str, None).expect("open wav");
        let mut buf = vec![0.0f32; 4096];
        let n1 = decoder.read_samples(&mut buf).expect("initial read");
        assert!(n1 > 0);

        // Seek forward to 1.0s
        decoder.seek(1.0).expect("seek to 1.0s");
        assert!((decoder.position_secs() - 1.0).abs() < 0.05);
        let n2 = decoder.read_samples(&mut buf).expect("read after forward seek");
        assert!(n2 > 0);

        // Seek backward to 0.25s
        decoder.seek(0.25).expect("seek to 0.25s");
        assert!((decoder.position_secs() - 0.25).abs() < 0.05);
        let n3 = decoder.read_samples(&mut buf).expect("read after backward seek");
        assert!(n3 > 0);
        // First sample after seek must start at 0.0 due to the 15ms fade-in ramp
        assert_eq!(buf[0], 0.0);

        // Arm fade-in (as done on resume from pause) and verify smooth ramp
        decoder.arm_fade_in();
        let n4 = decoder.read_samples(&mut buf).expect("read after resume fade-in");
        assert!(n4 > 0);
        assert_eq!(buf[0], 0.0);

        // Seek a 3rd time to 1.5s
        decoder.seek(1.5).expect("seek to 1.5s");
        assert!((decoder.position_secs() - 1.5).abs() < 0.05);
        let n5 = decoder.read_samples(&mut buf).expect("read after 3rd seek");
        assert!(n5 > 0);

        // Seek right to the end (2.0s)
        decoder.seek(2.0).expect("seek to end");
        let _ = decoder.read_samples(&mut buf).expect("read near eof");

        for &exclusive in &[false, true] {
            decoder.seek(0.0).expect("reset decoder to 0.0");
            if let Ok(mut output) = WasapiOutput::open(
                None,
                exclusive,
                decoder.sample_rate,
                decoder.channels,
            ) {
                let mut scratch = Vec::with_capacity(8192);
                let init_frames = output.buffer_frames;
                if output
                    .write_frames(init_frames, 0.0, &mut scratch, |b| decoder.read_samples(b))
                    .is_err()
                {
                    continue;
                }
                if output.start().is_err() {
                    continue;
                }

                for _ in 0..4 {
                    let signaled = output.wait_for_buffer(50);
                    if !signaled && output.exclusive {
                        continue;
                    }
                    let avail = output.available_frames().expect("available_frames playing");
                    if avail > 0 {
                        output
                            .write_frames(avail, 0.0, &mut scratch, |b| decoder.read_samples(b))
                            .expect("write_frames playing");
                    }
                }
                let pos_before_pause = decoder.position_secs();
                assert!(pos_before_pause > 0.0);

                for _ in 0..4 {
                    let signaled = output.wait_for_buffer(50);
                    if !signaled && output.exclusive {
                        continue;
                    }
                    let avail = output.available_frames().expect("available_frames paused");
                    if avail > 0 {
                        output
                            .write_silence(avail)
                            .expect("write_silence while paused");
                    }
                }
                assert_eq!(decoder.position_secs(), pos_before_pause);

                decoder.arm_fade_in();
                for _ in 0..4 {
                    let signaled = output.wait_for_buffer(50);
                    if !signaled && output.exclusive {
                        continue;
                    }
                    let avail = output.available_frames().expect("available_frames resumed");
                    if avail > 0 {
                        output
                            .write_frames(avail, 0.0, &mut scratch, |b| decoder.read_samples(b))
                            .expect("write_frames resumed");
                    }
                }
                assert!(decoder.position_secs() > pos_before_pause);

                for &target in &[1.2, 0.3, 1.5] {
                    decoder.seek(target).expect("seek while playing");
                    for _ in 0..3 {
                        let signaled = output.wait_for_buffer(50);
                        if !signaled && output.exclusive {
                            continue;
                        }
                        let avail = output
                            .available_frames()
                            .expect("available_frames after seek");
                        if avail > 0 {
                            output
                                .write_frames(avail, 0.0, &mut scratch, |b| decoder.read_samples(b))
                                .expect("write_frames after seek");
                        }
                    }
                    assert!(decoder.position_secs() > target);
                }

                output.stop();
            }
        }

        let _ = std::fs::remove_file(&temp_path);
    }

    #[cfg(windows)]
    #[test]
    fn flac_seek_and_wasapi_pump_works_cleanly() {
        use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        fn crc8(data: &[u8]) -> u8 {
            let mut crc: u8 = 0;
            for &b in data {
                crc ^= b;
                for _ in 0..8 {
                    if (crc & 0x80) != 0 {
                        crc = (crc << 1) ^ 0x07;
                    } else {
                        crc <<= 1;
                    }
                }
            }
            crc
        }

        fn crc16(data: &[u8]) -> u16 {
            let mut crc: u16 = 0;
            for &b in data {
                crc ^= (b as u16) << 8;
                for _ in 0..8 {
                    if (crc & 0x8000) != 0 {
                        crc = (crc << 1) ^ 0x8005;
                    } else {
                        crc <<= 1;
                    }
                }
            }
            crc
        }

        let sample_rate: u32 = 44100;
        let block_size: u16 = 4096;
        let num_blocks: u32 = 22; // ~2.04 seconds
        let total_samples: u64 = (block_size as u64) * (num_blocks as u64);

        let mut flac = Vec::new();
        flac.extend_from_slice(b"fLaC");
        flac.push(0x80);
        flac.extend_from_slice(&[0, 0, 34]);
        flac.extend_from_slice(&block_size.to_be_bytes());
        flac.extend_from_slice(&block_size.to_be_bytes());
        flac.extend_from_slice(&[0; 6]);
        let sr_ch_bps_ts: u64 = ((sample_rate as u64) << 44)
            | (1u64 << 41) // 2 channels -> 1
            | (15u64 << 36) // 16 bits -> 15
            | (total_samples & 0x0F_FFFF_FFFF);
        flac.extend_from_slice(&sr_ch_bps_ts.to_be_bytes());
        flac.extend_from_slice(&[0; 16]);

        for blk in 0..num_blocks {
            let frame_start = flac.len();
            flac.push(0xFF);
            flac.push(0xF8);
            // blocksize=4096 (0b1100 = 12), sample_rate=44100 (0b1001 = 9) -> 0xC9
            flac.push(0xC9);
            flac.push(0x18);
            flac.push(blk as u8);
            let c8 = crc8(&flac[frame_start..]);
            flac.push(c8);

            for ch in 0..2u16 {
                flac.push(0x02);
                for s in 0..block_size {
                    let val: i16 = (((s as i32 + blk as i32 * 17 + ch as i32 * 7) % 200) - 100) as i16 * 120;
                    flac.extend_from_slice(&val.to_be_bytes());
                }
            }

            let c16 = crc16(&flac[frame_start..]);
            flac.extend_from_slice(&c16.to_be_bytes());
        }

        let flac_path = std::env::temp_dir().join("symvonia_synthetic_test.flac");
        std::fs::write(&flac_path, &flac).expect("write synthetic flac");
        let flac_str = flac_path.to_string_lossy().to_string();

        let (done_tx, done_rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let flac_str_clone = flac_str.clone();
        std::thread::spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            let mut dec = MfDecoder::open(&flac_str_clone, None).expect("open synthetic flac");
            let mut buf = vec![0.0f32; 4096];
            let r0 = dec.read_samples(&mut buf).expect("initial flac read");
            assert!(r0 > 0);

            for &pos in &[1.0, 0.2, 1.5, 0.5, 1.8, 0.1, 0.9] {
                println!("Calling dec.seek({})...", pos);
                if let Err(e) = dec.seek(pos) {
                    let _ = done_tx.send(Err(format!("seek({}) failed: {}", pos, e)));
                    return;
                }
                println!("dec.seek({}) returned, calling read_samples...", pos);
                match dec.read_samples(&mut buf) {
                    Ok(rn) => {
                        println!(
                            "Synthetic FLAC seek({}) -> rn={}, pos={}, eof={}",
                            pos,
                            rn,
                            dec.position_secs(),
                            dec.is_eof()
                        );
                        if rn == 0 {
                            let _ = done_tx.send(Err(format!("0 samples at {}", pos)));
                            return;
                        }
                    }
                    Err(e) => {
                        let _ = done_tx.send(Err(format!("read_samples({}) failed: {}", pos, e)));
                        return;
                    }
                }
            }
            dec.seek(1.4).expect("rapid seek 1");
            dec.seek(0.3).expect("rapid seek 2");
            dec.seek(0.4).expect("small forward seek within read-ahead window");
            let rn = dec.read_samples(&mut buf).expect("read after rapid seeks");
            assert!(rn > 0);
            let _ = done_tx.send(Ok(()));
        });

        let res = done_rx
            .recv_timeout(Duration::from_secs(3))
            .expect("FLAC seek timed out (>3s hang in Media Foundation!)");
        let _ = std::fs::remove_file(&flac_path);
        res.expect("FLAC seek test failed");
    }
}
