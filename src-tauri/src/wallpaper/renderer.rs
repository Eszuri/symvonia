#![cfg(windows)]

use std::path::{Path, PathBuf};
use windows::core::{s, Interface, PCSTR};
use windows::Win32::Foundation::{ HWND, RECT };
use windows::Win32::Graphics::Direct3D::Fxc::D3DCompile;
use windows::Win32::Graphics::Direct3D::{
    ID3DBlob, D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST, D3D_DRIVER_TYPE_HARDWARE,
    D3D_DRIVER_TYPE_WARP, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Buffer, ID3D11Device, ID3D11DeviceContext, ID3D11PixelShader,
    ID3D11RenderTargetView, ID3D11SamplerState, ID3D11ShaderResourceView, ID3D11Texture2D,
    ID3D11VertexShader, D3D11_BIND_CONSTANT_BUFFER, D3D11_BIND_SHADER_RESOURCE, D3D11_BUFFER_DESC,
    D3D11_COMPARISON_NEVER, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_FILTER_MIN_MAG_MIP_LINEAR,
    D3D11_FLOAT32_MAX, D3D11_SAMPLER_DESC, D3D11_SDK_VERSION, D3D11_SUBRESOURCE_DATA,
    D3D11_TEXTURE2D_DESC, D3D11_TEXTURE_ADDRESS_WRAP, D3D11_USAGE_DEFAULT, D3D11_VIEWPORT,
};
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_R8G8B8A8_UNORM, DXGI_FORMAT_UNKNOWN, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIAdapter, IDXGIDevice, IDXGIFactory2, IDXGISwapChain1, DXGI_MWA_NO_ALT_ENTER,
    DXGI_PRESENT, DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1, DXGI_SWAP_CHAIN_FLAG,
    DXGI_SWAP_EFFECT_DISCARD, DXGI_USAGE_RENDER_TARGET_OUTPUT,
};
use windows::Win32::UI::WindowsAndMessaging::GetClientRect;

const FULLSCREEN_VS_HLSL: &[u8] =
    include_bytes!("../../../plugin/src-wallpaper-engine/shaders/fullscreen_vs.hlsl");
const COVER_REACTIVE_PS_HLSL: &[u8] =
    include_bytes!("../../../plugin/src-wallpaper-engine/shaders/cover_reactive_ps.hlsl");

const DXGI_STATUS_OCCLUDED_CODE: i32 = 0x087A0001u32 as i32;
const DXGI_ERROR_DEVICE_REMOVED_CODE: i32 = 0x887A0005u32 as i32;
const DXGI_ERROR_DEVICE_HUNG_CODE: i32 = 0x887A0006u32 as i32;
const DXGI_ERROR_DEVICE_RESET_CODE: i32 = 0x887A0007u32 as i32;
const DXGI_ERROR_DRIVER_INTERNAL_ERROR_CODE: i32 = 0x887A0020u32 as i32;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct FrameConstants {
    time: f32,
    intensity: f32,
    screen_width: f32,
    screen_height: f32,
    texture_width: f32,
    texture_height: f32,
    fit_mode: u32,
    effect: u32,
    transition_type: u32,
    transition_progress: f32,
    prev_texture_width: f32,
    prev_texture_height: f32,
}

const _: () = assert!(std::mem::size_of::<FrameConstants>() % 16 == 0);

pub enum RenderOutcome {
    Presented,
    Occluded,
    DeviceLost,
}

struct Surface {
    window: HWND,
    swap_chain: IDXGISwapChain1,
    render_target: Option<ID3D11RenderTargetView>,
    width: i32,
    height: i32,
}

pub struct Renderer {
    device: Option<ID3D11Device>,
    context: Option<ID3D11DeviceContext>,
    factory: Option<IDXGIFactory2>,
    vertex_shader: Option<ID3D11VertexShader>,
    pixel_shader: Option<ID3D11PixelShader>,
    frame_constants: Option<ID3D11Buffer>,
    sampler: Option<ID3D11SamplerState>,
    current_texture_view: Option<ID3D11ShaderResourceView>,
    next_texture_view: Option<ID3D11ShaderResourceView>,
    surfaces: Vec<Surface>,
    texture_width: f32,
    texture_height: f32,
    next_texture_width: f32,
    next_texture_height: f32,
    prev_texture_width: f32,
    prev_texture_height: f32,
    fit_mode: u32,
    effect: u32,
    transition_type: u32,
    transition_progress: f32,
    transition_duration: f32,
    last_frame_time: f32,
    has_valid_texture: bool,
    last_texture_path: Option<PathBuf>,
}

impl Default for Renderer {
    fn default() -> Self {
        Self::new()
    }
}

impl Renderer {
    pub fn new() -> Self {
        Self {
            device: None,
            context: None,
            factory: None,
            vertex_shader: None,
            pixel_shader: None,
            frame_constants: None,
            sampler: None,
            current_texture_view: None,
            next_texture_view: None,
            surfaces: Vec::new(),
            texture_width: 1.0,
            texture_height: 1.0,
            next_texture_width: 1.0,
            next_texture_height: 1.0,
            prev_texture_width: 1.0,
            prev_texture_height: 1.0,
            fit_mode: 0,        // Fill
            effect: 0,          // None / Clean
            transition_type: 1, // Fade
            transition_progress: 1.0,
            transition_duration: 0.65,
            last_frame_time: 0.0,
            has_valid_texture: false,
            last_texture_path: None,
        }
    }

    pub fn is_device_lost_hresult(code: i32) -> bool {
        matches!(
            code,
            DXGI_ERROR_DEVICE_REMOVED_CODE
                | DXGI_ERROR_DEVICE_HUNG_CODE
                | DXGI_ERROR_DEVICE_RESET_CODE
                | DXGI_ERROR_DRIVER_INTERNAL_ERROR_CODE
        )
    }

    pub fn release_resources(&mut self) {
        unsafe {
            if let Some(ref ctx) = self.context {
                ctx.OMSetRenderTargets(None, None);
                ctx.ClearState();
            }
        }
        self.surfaces.clear();
        self.next_texture_view = None;
        self.current_texture_view = None;
        self.sampler = None;
        self.frame_constants = None;
        self.pixel_shader = None;
        self.vertex_shader = None;
        self.factory = None;
        self.context = None;
        self.device = None;
        self.has_valid_texture = false;
    }

    pub fn initialize(&mut self) -> Result<(), String> {
        self.release_resources();

        unsafe {
            let feature_levels = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
            let mut selected_level = D3D_FEATURE_LEVEL::default();
            let mut device: Option<ID3D11Device> = None;
            let mut context: Option<ID3D11DeviceContext> = None;

            // Coba Hardware GPU terlebih dahulu; fallback ke WARP jika driver sedang reset/unavailable
            let hw_res = D3D11CreateDevice(
                None,
                D3D_DRIVER_TYPE_HARDWARE,
                None,
                D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                Some(&feature_levels),
                D3D11_SDK_VERSION,
                Some(&mut device),
                Some(&mut selected_level),
                Some(&mut context),
            );

            if hw_res.is_err() {
                D3D11CreateDevice(
                    None,
                    D3D_DRIVER_TYPE_WARP,
                    None,
                    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                    Some(&feature_levels),
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    Some(&mut selected_level),
                    Some(&mut context),
                )
                .map_err(|e| format!("D3D11CreateDevice gagal: {}", e))?;
            }

            let device = device.ok_or_else(|| "ID3D11Device kosong".to_string())?;
            let context = context.ok_or_else(|| "ID3D11DeviceContext kosong".to_string())?;

            let dxgi_device: IDXGIDevice = device
                .cast()
                .map_err(|e| format!("Cast IDXGIDevice gagal: {}", e))?;
            let adapter: IDXGIAdapter = dxgi_device
                .GetAdapter()
                .map_err(|e| format!("IDXGIDevice::GetAdapter gagal: {}", e))?;
            let factory: IDXGIFactory2 = adapter
                .GetParent()
                .map_err(|e| format!("IDXGIAdapter::GetParent(IDXGIFactory2) gagal: {}", e))?;

            let vs_blob = Self::compile_shader(FULLSCREEN_VS_HLSL, s!("fullscreen_vs.hlsl"), s!("vs_5_0"))?;
            let ps_blob = Self::compile_shader(COVER_REACTIVE_PS_HLSL, s!("cover_reactive_ps.hlsl"), s!("ps_5_0"))?;

            let vs_bytes = std::slice::from_raw_parts(
                vs_blob.GetBufferPointer() as *const u8,
                vs_blob.GetBufferSize(),
            );
            let mut vertex_shader: Option<ID3D11VertexShader> = None;
            device
                .CreateVertexShader(vs_bytes, None, Some(&mut vertex_shader))
                .map_err(|e| format!("CreateVertexShader gagal: {}", e))?;

            let ps_bytes = std::slice::from_raw_parts(
                ps_blob.GetBufferPointer() as *const u8,
                ps_blob.GetBufferSize(),
            );
            let mut pixel_shader: Option<ID3D11PixelShader> = None;
            device
                .CreatePixelShader(ps_bytes, None, Some(&mut pixel_shader))
                .map_err(|e| format!("CreatePixelShader gagal: {}", e))?;

            let buffer_desc = D3D11_BUFFER_DESC {
                ByteWidth: std::mem::size_of::<FrameConstants>() as u32,
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                ..Default::default()
            };
            let mut frame_constants: Option<ID3D11Buffer> = None;
            device
                .CreateBuffer(&buffer_desc, None, Some(&mut frame_constants))
                .map_err(|e| format!("CreateBuffer(FrameConstants) gagal: {}", e))?;

            let sampler_desc = D3D11_SAMPLER_DESC {
                Filter: D3D11_FILTER_MIN_MAG_MIP_LINEAR,
                AddressU: D3D11_TEXTURE_ADDRESS_WRAP,
                AddressV: D3D11_TEXTURE_ADDRESS_WRAP,
                AddressW: D3D11_TEXTURE_ADDRESS_WRAP,
                ComparisonFunc: D3D11_COMPARISON_NEVER,
                MinLOD: 0.0,
                MaxLOD: D3D11_FLOAT32_MAX,
                ..Default::default()
            };
            let mut sampler: Option<ID3D11SamplerState> = None;
            device
                .CreateSamplerState(&sampler_desc, Some(&mut sampler))
                .map_err(|e| format!("CreateSamplerState gagal: {}", e))?;

            // Buat tekstur default 1x1 berwarna gelap (#0B0F19)
            let fallback_rgba: [u8; 4] = [0x0B, 0x0F, 0x19, 0xFF];
            let default_view = Self::create_rgba_texture_view(&device, 1, 1, &fallback_rgba)?;

            self.device = Some(device);
            self.context = Some(context);
            self.factory = Some(factory);
            self.vertex_shader = vertex_shader;
            self.pixel_shader = pixel_shader;
            self.frame_constants = frame_constants;
            self.sampler = sampler;
            self.current_texture_view = Some(default_view);
            self.next_texture_view = None;
            self.texture_width = 1.0;
            self.texture_height = 1.0;
            self.prev_texture_width = 1.0;
            self.prev_texture_height = 1.0;
            self.transition_progress = 1.0;
            self.last_frame_time = 0.0;
            self.has_valid_texture = false;
        }

        // Jika sebelumnya sudah ada tekstur aktif (misal saat recovery dari GPU reset), muat ulang
        if let Some(saved_path) = self.last_texture_path.clone() {
            if saved_path.is_file() {
                let _ = self.set_texture(&saved_path);
            }
        }

        Ok(())
    }

    fn compile_shader(
        source: &[u8],
        source_name: PCSTR,
        target: PCSTR,
    ) -> Result<ID3DBlob, String> {
        unsafe {
            let mut blob: Option<ID3DBlob> = None;
            let mut error_blob: Option<ID3DBlob> = None;
            let res = D3DCompile(
                source.as_ptr() as *const std::ffi::c_void,
                source.len(),
                source_name,
                None,
                None,
                s!("main"),
                target,
                0,
                0,
                &mut blob,
                Some(&mut error_blob),
            );
            if let Err(e) = res {
                if let Some(err_b) = error_blob {
                    let msg_slice = std::slice::from_raw_parts(
                        err_b.GetBufferPointer() as *const u8,
                        err_b.GetBufferSize(),
                    );
                    let msg = String::from_utf8_lossy(msg_slice).trim().to_string();
                    return Err(format!("Kompilasi shader gagal: {}", msg));
                }
                return Err(format!("Kompilasi shader gagal: {}", e));
            }
            blob.ok_or_else(|| "D3DCompile tidak menghasilkan shader blob".to_string())
        }
    }

    unsafe fn create_rgba_texture_view(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        rgba_pixels: &[u8],
    ) -> Result<ID3D11ShaderResourceView, String> {
        let tex_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_R8G8B8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            ..Default::default()
        };
        let subresource = D3D11_SUBRESOURCE_DATA {
            pSysMem: rgba_pixels.as_ptr() as *const std::ffi::c_void,
            SysMemPitch: width * 4,
            SysMemSlicePitch: 0,
        };
        let mut texture: Option<ID3D11Texture2D> = None;
        device
            .CreateTexture2D(&tex_desc, Some(&subresource), Some(&mut texture))
            .map_err(|e| format!("CreateTexture2D gagal: {}", e))?;
        let texture = texture.ok_or_else(|| "ID3D11Texture2D kosong".to_string())?;

        let mut view: Option<ID3D11ShaderResourceView> = None;
        device
            .CreateShaderResourceView(&texture, None, Some(&mut view))
            .map_err(|e| format!("CreateShaderResourceView gagal: {}", e))?;
        view.ok_or_else(|| "ID3D11ShaderResourceView kosong".to_string())
    }

    pub fn attach(&mut self, window: HWND) -> Result<(), String> {
        if window.is_invalid() {
            return Err("HWND tidak valid.".to_string());
        }
        if self.surfaces.iter().any(|s| s.window == window) {
            return Ok(());
        }

        let device = self
            .device
            .as_ref()
            .ok_or_else(|| "Renderer belum diinisialisasi.".to_string())?;
        let factory = self
            .factory
            .as_ref()
            .ok_or_else(|| "DXGI Factory belum diinisialisasi.".to_string())?;

        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            BufferCount: 2,
            SwapEffect: DXGI_SWAP_EFFECT_DISCARD,
            Scaling: DXGI_SCALING_STRETCH,
            ..Default::default()
        };

        unsafe {
            let swap_chain = factory
                .CreateSwapChainForHwnd(device, window, &desc, None, None)
                .map_err(|e| format!("CreateSwapChainForHwnd gagal: {}", e))?;
            let _ = factory.MakeWindowAssociation(window, DXGI_MWA_NO_ALT_ENTER);

            self.surfaces.push(Surface {
                window,
                swap_chain,
                render_target: None,
                width: 1,
                height: 1,
            });
        }

        if let Err(e) = self.resize(window) {
            self.detach(window);
            return Err(e);
        }

        Ok(())
    }

    pub fn detach(&mut self, window: HWND) {
        if let Some(pos) = self.surfaces.iter().position(|s| s.window == window) {
            unsafe {
                if let Some(ref ctx) = self.context {
                    ctx.OMSetRenderTargets(None, None);
                }
            }
            self.surfaces.remove(pos);
        }
    }

    pub fn detach_all(&mut self) {
        unsafe {
            if let Some(ref ctx) = self.context {
                ctx.OMSetRenderTargets(None, None);
            }
        }
        self.surfaces.clear();
    }

    pub fn resize(&mut self, window: HWND) -> Result<(), String> {
        let device = self
            .device
            .as_ref()
            .ok_or_else(|| "Renderer belum diinisialisasi.".to_string())?
            .clone();
        let context = self
            .context
            .as_ref()
            .ok_or_else(|| "Context belum diinisialisasi.".to_string())?
            .clone();

        let surface = self
            .surfaces
            .iter_mut()
            .find(|s| s.window == window)
            .ok_or_else(|| "SwapChain surface tidak ditemukan.".to_string())?;

        unsafe {
            context.OMSetRenderTargets(None, None);
            surface.render_target = None;

            surface
                .swap_chain
                .ResizeBuffers(0, 0, 0, DXGI_FORMAT_UNKNOWN, DXGI_SWAP_CHAIN_FLAG(0))
                .map_err(|e| format!("ResizeBuffers gagal: {}", e))?;

            let mut rect = RECT::default();
            let _ = GetClientRect(window, &mut rect);
            surface.width = (rect.right - rect.left).max(1);
            surface.height = (rect.bottom - rect.top).max(1);

            let back_buffer: ID3D11Texture2D = surface
                .swap_chain
                .GetBuffer(0)
                .map_err(|e| format!("IDXGISwapChain::GetBuffer gagal: {}", e))?;

            let mut rtv: Option<ID3D11RenderTargetView> = None;
            device
                .CreateRenderTargetView(&back_buffer, None, Some(&mut rtv))
                .map_err(|e| format!("CreateRenderTargetView gagal: {}", e))?;
            surface.render_target = rtv;
        }

        Ok(())
    }

    pub fn set_fit_mode(&mut self, mode: &str) {
        self.fit_mode = match mode.to_lowercase().as_str() {
            "fit" => 1,
            "stretch" => 2,
            "center" => 3,
            "tile" => 4,
            _ => 0, // fill
        };
    }

    pub fn fit_mode(&self) -> &'static str {
        match self.fit_mode {
            1 => "fit",
            2 => "stretch",
            3 => "center",
            4 => "tile",
            _ => "fill",
        }
    }

    pub fn set_effect(&mut self, effect: &str) {
        self.effect = match effect.to_lowercase().as_str() {
            "reactive_glow" | "glow" | "reactive" => 1,
            "subtle_pulse" | "pulse" | "breathing" => 2,
            "cinematic_vignette" | "vignette" => 3,
            "grayscale" | "black_white" | "monochrome" => 4,
            "dimmed" | "dim" => 5,
            _ => 0, // none
        };
    }

    pub fn effect(&self) -> &'static str {
        match self.effect {
            1 => "reactive_glow",
            2 => "subtle_pulse",
            3 => "cinematic_vignette",
            4 => "grayscale",
            5 => "dimmed",
            _ => "none",
        }
    }

    pub fn set_transition(&mut self, transition: &str) {
        self.transition_type = match transition.to_lowercase().as_str() {
            "fade" | "crossfade" => 1,
            "zoom_in" | "zoom-in" | "zoomin" => 2,
            "zoom_out" | "zoom-out" | "zoomout" => 3,
            "slide" | "push" => 4,
            "none" | "instant" | "cut" => 0,
            _ => 1,
        };
    }

    pub fn transition(&self) -> &'static str {
        match self.transition_type {
            1 => "fade",
            2 => "zoom_in",
            3 => "zoom_out",
            4 => "slide",
            0 => "none",
            _ => "fade",
        }
    }

    pub fn set_texture(&mut self, path: &Path) -> Result<(), String> {
        if !path.is_file() {
            return Err(format!("File tekstur tidak ditemukan: {}", path.display()));
        }

        let device = self
            .device
            .as_ref()
            .ok_or_else(|| "Renderer belum diinisialisasi.".to_string())?
            .clone();

        let img = image::open(path)
            .map_err(|e| format!("Gagal membuka gambar tekstur: {}", e))?
            .to_rgba8();
        let (width, height) = img.dimensions();
        if width == 0 || height == 0 {
            return Err("Ukuran tekstur gambar tidak valid (0x0).".to_string());
        }

        let view = unsafe { Self::create_rgba_texture_view(&device, width, height, img.as_raw())? };
        self.last_texture_path = Some(path.to_path_buf());

        if !self.has_valid_texture || self.transition_type == 0 {
            self.current_texture_view = Some(view);
            self.texture_width = width as f32;
            self.texture_height = height as f32;
            self.prev_texture_width = self.texture_width;
            self.prev_texture_height = self.texture_height;
            self.transition_progress = 1.0;
            self.next_texture_view = None;
            self.has_valid_texture = true;
            return Ok(());
        }

        self.prev_texture_width = self.texture_width;
        self.prev_texture_height = self.texture_height;
        self.next_texture_view = Some(view);
        self.next_texture_width = width as f32;
        self.next_texture_height = height as f32;
        self.texture_width = self.next_texture_width;
        self.texture_height = self.next_texture_height;
        self.transition_progress = 0.0;

        Ok(())
    }

    pub fn render(
        &mut self,
        window: HWND,
        elapsed_seconds: f32,
        intensity: f32,
    ) -> Result<RenderOutcome, String> {
        let context = self
            .context
            .as_ref()
            .ok_or_else(|| "Context belum diinisialisasi.".to_string())?
            .clone();
        let frame_constants_buf = self
            .frame_constants
            .as_ref()
            .ok_or_else(|| "FrameConstants buffer belum diinisialisasi.".to_string())?
            .clone();
        let vs = self
            .vertex_shader
            .as_ref()
            .ok_or_else(|| "VertexShader belum diinisialisasi.".to_string())?
            .clone();
        let ps = self
            .pixel_shader
            .as_ref()
            .ok_or_else(|| "PixelShader belum diinisialisasi.".to_string())?
            .clone();
        let sampler = self
            .sampler
            .as_ref()
            .ok_or_else(|| "Sampler belum diinisialisasi.".to_string())?
            .clone();
        let current_view = self
            .current_texture_view
            .as_ref()
            .ok_or_else(|| "TextureView belum diinisialisasi.".to_string())?
            .clone();

        let mut delta_time = 0.016f32;
        if self.last_frame_time > 0.0 && elapsed_seconds > self.last_frame_time {
            delta_time = (elapsed_seconds - self.last_frame_time).min(0.1);
        }
        self.last_frame_time = elapsed_seconds;

        if self.transition_progress < 1.0 {
            self.transition_progress += delta_time / self.transition_duration.max(0.05);
            if self.transition_progress >= 1.0 {
                self.transition_progress = 1.0;
                if let Some(next_view) = self.next_texture_view.take() {
                    self.current_texture_view = Some(next_view);
                }
            }
        }

        let next_view = self
            .next_texture_view
            .as_ref()
            .cloned()
            .unwrap_or_else(|| current_view.clone());

        let surface = self
            .surfaces
            .iter()
            .find(|s| s.window == window)
            .ok_or_else(|| "Surface monitor tidak ditemukan.".to_string())?;
        let rtv = surface
            .render_target
            .as_ref()
            .ok_or_else(|| "RenderTargetView kosong.".to_string())?
            .clone();

        let screen_w = surface.width as f32;
        let screen_h = surface.height as f32;
        let tex_w = if self.texture_width > 0.0 {
            self.texture_width
        } else {
            screen_w
        };
        let tex_h = if self.texture_height > 0.0 {
            self.texture_height
        } else {
            screen_h
        };

        let constants = FrameConstants {
            time: elapsed_seconds,
            intensity,
            screen_width: screen_w,
            screen_height: screen_h,
            texture_width: tex_w,
            texture_height: tex_h,
            fit_mode: self.fit_mode,
            effect: self.effect,
            transition_type: self.transition_type,
            transition_progress: self.transition_progress,
            prev_texture_width: if self.prev_texture_width > 0.0 {
                self.prev_texture_width
            } else {
                tex_w
            },
            prev_texture_height: if self.prev_texture_height > 0.0 {
                self.prev_texture_height
            } else {
                tex_h
            },
        };

        unsafe {
            context.UpdateSubresource(
                &frame_constants_buf,
                0,
                None,
                &constants as *const FrameConstants as *const std::ffi::c_void,
                0,
                0,
            );

            let clear_color: [f32; 4] = [0.005, 0.007, 0.012, 1.0];
            let rtvs = [Some(rtv.clone())];
            context.OMSetRenderTargets(Some(&rtvs), None);

            let viewport = D3D11_VIEWPORT {
                TopLeftX: 0.0,
                TopLeftY: 0.0,
                Width: screen_w,
                Height: screen_h,
                MinDepth: 0.0,
                MaxDepth: 1.0,
            };
            context.RSSetViewports(Some(&[viewport]));
            context.ClearRenderTargetView(&rtv, &clear_color);
            context.IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            context.VSSetShader(&vs, None);
            context.PSSetShader(&ps, None);
            context.PSSetConstantBuffers(0, Some(&[Some(frame_constants_buf)]));
            context.PSSetShaderResources(0, Some(&[Some(current_view), Some(next_view)]));
            context.PSSetSamplers(0, Some(&[Some(sampler)]));
            context.Draw(3, 0);

            let hr = surface.swap_chain.Present(0, DXGI_PRESENT(0));
            if hr.0 == DXGI_STATUS_OCCLUDED_CODE {
                return Ok(RenderOutcome::Occluded);
            }
            if Self::is_device_lost_hresult(hr.0) {
                return Ok(RenderOutcome::DeviceLost);
            }
            if hr.is_err() {
                return Err(format!("SwapChain Present gagal (HRESULT 0x{:08X})", hr.0 as u32));
            }
        }

        Ok(RenderOutcome::Presented)
    }
}

impl Drop for Renderer {
    fn drop(&mut self) {
        self.release_resources();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compiles_embedded_hlsl_shaders_in_memory() {
        let vs = Renderer::compile_shader(FULLSCREEN_VS_HLSL, s!("fullscreen_vs.hlsl"), s!("vs_5_0"));
        assert!(vs.is_ok(), "Vertex shader failed to compile: {:?}", vs.err());

        let ps = Renderer::compile_shader(
            COVER_REACTIVE_PS_HLSL,
            s!("cover_reactive_ps.hlsl"),
            s!("ps_5_0"),
        );
        assert!(ps.is_ok(), "Pixel shader failed to compile: {:?}", ps.err());
    }

    #[test]
    fn initializes_d3d11_renderer_and_uploads_texture() {
        let mut renderer = Renderer::new();
        let res = renderer.initialize();
        assert!(res.is_ok(), "Renderer initialization failed: {:?}", res.err());
    }
}
