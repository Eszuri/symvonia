using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace Symvonia.Engine;

/// <summary>
/// NAudio playback pipeline: AudioFileReader → WasapiOut.
/// Supports WASAPI Exclusive (bit-perfect) and Shared modes.
/// All public members are thread-safe; NAudio callbacks arrive on worker threads.
/// </summary>
public sealed class AudioPlayer : IDisposable
{
    private readonly object _gate = new();

    private AudioFileReader? _reader;
    private PausableSampleProvider? _pausable;
    private WasapiOut? _output;
    private MMDevice? _device;
    private Timer? _progressTimer;

    private string? _currentPath;
    private string? _currentMode;
    private string? _requestId;
    private long? _generation;
    private float _volume = 1.0f;
    private bool _disposed;

    /// <summary>Natural end-of-track reached (not a user-initiated stop).</summary>
    public event Action? PlaybackEnded;

    public string? CurrentPath
    {
        get { lock (_gate) return _currentPath; }
    }

    public bool IsExclusive
    {
        get { lock (_gate) return _currentMode == "exclusive"; }
    }

    public string? CurrentMode
    {
        get { lock (_gate) return _currentMode; }
    }

    public string? RequestId
    {
        get { lock (_gate) return _requestId; }
    }

    public long? Generation
    {
        get { lock (_gate) return _generation; }
    }

    public bool IsPlaying
    {
        get
        {
            lock (_gate)
            {
                if (_currentMode == "shared")
                    return _output?.PlaybackState == PlaybackState.Playing;
                return _output?.PlaybackState == PlaybackState.Playing && _pausable != null && !_pausable.IsPaused;
            }
        }
    }

    public bool IsPaused
    {
        get
        {
            lock (_gate)
            {
                if (_currentMode == "shared")
                    return _output?.PlaybackState == PlaybackState.Paused;
                return _output?.PlaybackState == PlaybackState.Playing && _pausable != null && _pausable.IsPaused;
            }
        }
    }

    public (int? rate, int? bits) CurrentFormat
    {
        get
        {
            lock (_gate)
            {
                int? rate = _reader?.WaveFormat.SampleRate;
                if (rate == null && _output?.OutputWaveFormat is { } wf)
                    rate = wf.SampleRate;

                int? bits = null;
                if (_currentPath != null)
                {
                    var ext = Path.GetExtension(_currentPath).ToLowerInvariant();
                    bool isLossless = ext is ".flac" or ".wav" or ".alac" or ".aiff" or ".dsd" or ".dsf";
                    if (isLossless && _output?.OutputWaveFormat is { } wf2)
                    {
                        bits = wf2.BitsPerSample;
                    }
                }

                return (rate, bits);
            }
        }
    }

    public string? DeviceName
    {
        get { lock (_gate) return _device?.FriendlyName; }
    }

    /// <summary>
    /// Loads a file and starts playback in the requested WASAPI mode.
    /// Exclusive tries the source's native sample rate at float32 → PCM24 → PCM16.
    /// </summary>
    public void Play(string path, string mode, string? deviceId, string? requestId, long? generation, double? startAt)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("Audio file not found", path);

        if (mode != "shared" && mode != "exclusive")
            throw new ArgumentException($"Unsupported audio mode: {mode}", nameof(mode));

        lock (_gate)
        {
            StopLocked();

            _reader = CreatePositionedReader(path, startAt);
            _reader.Volume = _volume;
            _device = ResolveDevice(deviceId);
            _pausable = new PausableSampleProvider(_reader);

            if (mode == "exclusive")
            {
                _output = CreateExclusiveOutput(_device, _pausable);
            }
            else
            {
                _output = new WasapiOut(_device, AudioClientShareMode.Shared, true, 200);
                _output.Init(_pausable.ToWaveProvider());
            }

            _output.PlaybackStopped += OnPlaybackStopped;
            _currentPath = path;
            _currentMode = mode;
            _requestId = requestId;
            _generation = generation;
            _output.Play();
            StartProgressTimerLocked();
        }
    }

    private static AudioFileReader CreatePositionedReader(string path, double? startAt)
    {
        var reader = new AudioFileReader(path);
        try
        {
            var position = startAt.HasValue && double.IsFinite(startAt.Value)
                ? Math.Clamp(startAt.Value, 0, reader.TotalTime.TotalSeconds)
                : 0;
            if (position > 0)
            {
                var frame = new float[reader.WaveFormat.Channels];
                reader.Read(frame, 0, frame.Length);
                reader.CurrentTime = TimeSpan.FromSeconds(position);
            }
            return reader;
        }
        catch
        {
            reader.Dispose();
            throw;
        }
    }

    private static WasapiOut CreateExclusiveOutput(MMDevice device, ISampleProvider reader)
    {
        int sourceRate = reader.WaveFormat.SampleRate;
        int channels = reader.WaveFormat.Channels;

        var attempts = new List<(Func<ISampleProvider, IWaveProvider> wrap, string label)>
        {
            ((Func<ISampleProvider, IWaveProvider>)(r => r.ToWaveProvider()), $"float32 {sourceRate}Hz"),
            ((Func<ISampleProvider, IWaveProvider>)(r => new SampleToWaveProvider24(r)), $"pcm24 {sourceRate}Hz"),
            ((Func<ISampleProvider, IWaveProvider>)(r => new SampleToWaveProvider16(r)), $"pcm16 {sourceRate}Hz"),
        };

        Exception? lastError = null;
        foreach (var (wrap, label) in attempts)
        {
            IWaveProvider? provider = null;
            WasapiOut? candidate = null;
            try
            {
                provider = wrap(reader);
                candidate = new WasapiOut(device, AudioClientShareMode.Exclusive, true, 50);
                candidate.Init(provider);
                return candidate;
            }
            catch (Exception ex)
            {
                lastError = ex;
                try { candidate?.Dispose(); } catch { /* ignore */ }
            }
        }

        throw new InvalidOperationException(
            $"DAC does not support {channels}ch @ {sourceRate}Hz in WASAPI Exclusive mode (tried float32/24-bit/16-bit). {lastError?.Message}");
    }

    public void Pause()
    {
        lock (_gate)
        {
            if (_output?.PlaybackState == PlaybackState.Playing)
            {
                if (_currentMode == "shared")
                {
                    _output.Pause();
                }
                else if (_pausable != null)
                {
                    _pausable.IsPaused = true;
                }
            }
        }
    }

    public void Resume()
    {
        lock (_gate)
        {
            if (_output != null)
            {
                if (_currentMode == "shared")
                {
                    if (_output.PlaybackState == PlaybackState.Paused)
                    {
                        _output.Play();
                    }
                }
                else if (_pausable != null)
                {
                    _pausable.IsPaused = false;
                }
            }
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            StopLocked();
        }
    }

    private void StopLocked()
    {
        StopProgressTimerLocked();
        if (_output != null)
        {
            try { _output.PlaybackStopped -= OnPlaybackStopped; } catch { /* ignore */ }
            try { _output.Stop(); } catch { /* ignore */ }
            try { _output.Dispose(); } catch { /* ignore */ }
            _output = null;
        }
        if (_reader != null)
        {
            try { _reader.Dispose(); } catch { /* ignore */ }
            _reader = null;
        }
        if (_pausable != null)
        {
            _pausable.IsPaused = false;
            _pausable = null;
        }
        _currentPath = null;
        _currentMode = null;
        _requestId = null;
        _generation = null;
    }

    public void Seek(double seconds)
    {
        lock (_gate)
        {
            if (_reader == null) return;
            double clamped = Math.Clamp(seconds, 0, _reader.TotalTime.TotalSeconds);
            _reader.CurrentTime = TimeSpan.FromSeconds(clamped);
        }
    }

    public void SetVolume(float volume)
    {
        lock (_gate)
        {
            _volume = Math.Clamp(volume, 0f, 1f);
            if (_reader != null)
                _reader.Volume = _volume;
        }
    }

    public (double position, double duration) GetProgress()
    {
        lock (_gate)
        {
            if (_reader == null) return (0, 0);
            return (_reader.CurrentTime.TotalSeconds, _reader.TotalTime.TotalSeconds);
        }
    }

    public static List<Protocol.DeviceInfo> GetDevices()
    {
        var result = new List<Protocol.DeviceInfo>();
        using var enumerator = new MMDeviceEnumerator();
        MMDevice? defaultDevice = null;
        try { defaultDevice = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia); }
        catch { /* no default device */ }

        foreach (var dev in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            using (dev)
            {
                result.Add(new Protocol.DeviceInfo
                {
                    Id = dev.ID,
                    Name = dev.FriendlyName,
                    IsDefault = defaultDevice != null && dev.ID == defaultDevice.ID,
                });
            }
        }
        return result;
    }

    private static MMDevice ResolveDevice(string? deviceId)
    {
        var enumerator = new MMDeviceEnumerator();
        try
        {
            if (!string.IsNullOrEmpty(deviceId))
            {
                try
                {
                    return enumerator.GetDevice(deviceId);
                }
                catch
                {
                    // The Rust/cpal fallback exposes friendly names because
                    // cpal does not publish the underlying WASAPI endpoint id.
                    // Accept that identifier as well as the native endpoint id.
                    foreach (var endpoint in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
                    {
                        if (string.Equals(endpoint.FriendlyName, deviceId, StringComparison.Ordinal))
                            return endpoint;
                        endpoint.Dispose();
                    }

                    throw new InvalidOperationException($"Audio device not found: {deviceId}");
                }
            }
            return enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
        }
        catch
        {
            enumerator.Dispose();
            throw;
        }
    }

    private void StartProgressTimerLocked()
    {
        _progressTimer ??= new Timer(_ =>
        {
            try
            {
                bool playing;
                (double pos, double dur) progress;
                lock (_gate)
                {
                    playing = _output?.PlaybackState == PlaybackState.Playing && _pausable != null && !_pausable.IsPaused && _reader != null;
                    progress = GetProgressNoLock();
                }
                if (playing)
                    Protocol.EmitProgress(progress.pos, progress.dur, CurrentPath, CurrentMode, RequestId, Generation);
            }
            catch { /* ignore */ }
        }, null, TimeSpan.FromMilliseconds(50), TimeSpan.FromMilliseconds(100));
    }

    private (double pos, double dur) GetProgressNoLock()
    {
        if (_reader == null) return (0, 0);
        return (_reader.CurrentTime.TotalSeconds, _reader.TotalTime.TotalSeconds);
    }

    private void StopProgressTimerLocked()
    {
        _progressTimer?.Dispose();
        _progressTimer = null;
    }

    private void OnPlaybackStopped(object? sender, StoppedEventArgs e)
    {
        bool endedNaturally;
        lock (_gate)
        {
            endedNaturally = _reader != null
                && _reader.CurrentTime >= _reader.TotalTime - TimeSpan.FromMilliseconds(150);
        }

        if (e.Exception != null)
        {
            Protocol.EmitError(
                "PLAYBACK_FAILED",
                e.Exception.Message,
                "playback",
                CurrentMode,
                CurrentPath,
                RequestId,
                Generation);
            return;
        }

        if (endedNaturally)
        {
            try { PlaybackEnded?.Invoke(); } catch { /* ignore */ }
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        lock (_gate)
        {
            StopLocked();
        }
    }
}

internal class PausableSampleProvider : ISampleProvider
{
    private readonly ISampleProvider _source;
    private volatile bool _isPaused;

    public bool IsPaused
    {
        get => _isPaused;
        set => _isPaused = value;
    }

    public PausableSampleProvider(ISampleProvider source)
    {
        _source = source;
        WaveFormat = source.WaveFormat;
    }

    public WaveFormat WaveFormat { get; }

    public int Read(float[] buffer, int offset, int count)
    {
        if (_isPaused)
        {
            Array.Clear(buffer, offset, count);
            return count;
        }
        return _source.Read(buffer, offset, count);
    }
}
