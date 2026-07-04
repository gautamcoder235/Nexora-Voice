use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct SendStream(pub cpal::Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

pub struct ChunkedState {
    pub is_recording: bool,
    pub samples: Vec<f32>,
    pub stream: Option<SendStream>,
    pub native_sample_rate: u32,
    pub native_channels: u16,
    pub chunk_index: usize,
    pub partial_transcripts: Vec<(usize, String)>,
    pub start_time: Option<std::time::Instant>,
}

pub struct ChunkedRecorder {
    pub state: Arc<Mutex<ChunkedState>>,
}

impl ChunkedRecorder {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ChunkedState {
                is_recording: false,
                samples: Vec::new(),
                stream: None,
                native_sample_rate: 16000,
                native_channels: 1,
                chunk_index: 0,
                partial_transcripts: Vec::new(),
                start_time: None,
            })),
        }
    }

    pub fn start(&self, app_handle: AppHandle) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock recorder state")?;
        if state.is_recording {
            return Ok(());
        }

        state.samples.clear();
        state.partial_transcripts.clear();
        state.chunk_index = 0;
        state.start_time = Some(std::time::Instant::now());
        state.is_recording = true;

        // Setup cpal input stream
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default microphone input device found".to_string())?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        let cpal_config = config.config();
        let native_sr = cpal_config.sample_rate.0;
        let native_ch = cpal_config.channels;

        state.native_sample_rate = native_sr;
        state.native_channels = native_ch;

        println!("[ChunkedRecorder] Using native config: {}Hz, {} channel(s)", native_sr, native_ch);

        let state_clone = self.state.clone();
        let app_clone = app_handle.clone();

        let err_fn = |err| eprintln!("[ChunkedRecorder] Stream error: {}", err);
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &cpal_config,
                move |data: &[f32], _: &_| {
                    write_input_data::<f32, f32>(data, &state_clone, &app_clone);
                },
                err_fn,
                None
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &cpal_config,
                move |data: &[i16], _: &_| {
                    write_input_data::<i16, f32>(data, &state_clone, &app_clone);
                },
                err_fn,
                None
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &cpal_config,
                move |data: &[u16], _: &_| {
                    write_input_data::<u16, f32>(data, &state_clone, &app_clone);
                },
                err_fn,
                None
            ),
            _ => return Err("Unsupported sample format".to_string()),
        }.map_err(|e| format!("Failed to build input stream: {}", e))?;

        stream.play().map_err(|e| format!("Failed to start audio stream: {}", e))?;
        state.stream = Some(SendStream(stream));

        println!("[ChunkedRecorder] Chunked recording started.");
        Ok(())
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        if let Ok(state) = self.state.lock() {
            state.is_recording
        } else {
            false
        }
    }

    /// Drains a 5-second chunk of samples from the buffer, leaving a 1-second overlap.
    /// Returns the resampled (16kHz mono) chunk data and the chunk index.
    pub fn drain_chunk(&self) -> Option<(Vec<f32>, usize)> {
        let mut state = self.state.lock().ok()?;
        if !state.is_recording {
            return None;
        }

        let sr = state.native_sample_rate;
        let ch = state.native_channels;
        
        // 5 seconds of native multi-channel audio
        let samples_needed = (sr as usize) * (ch as usize) * 5;
        // 1 second of overlap to keep
        let overlap_samples = (sr as usize) * (ch as usize) * 1;

        if state.samples.len() < samples_needed {
            return None; // Not enough samples gathered yet
        }

        // Slice out the 5-second chunk
        let chunk_raw = state.samples[..samples_needed].to_vec();

        // Retain the remaining samples, keeping the last 1 second overlap in front
        let keep_index = samples_needed - overlap_samples;
        if state.samples.len() > keep_index {
            state.samples = state.samples[keep_index..].to_vec();
        } else {
            state.samples.clear();
        }

        let idx = state.chunk_index;
        state.chunk_index += 1;

        // Convert chunk to mono (in-place)
        let mono: Vec<f32> = if ch > 1 {
            chunk_raw
                .chunks(ch as usize)
                .map(|frame| frame.iter().sum::<f32>() / ch as f32)
                .collect()
        } else {
            chunk_raw
        };

        // Resample mono chunk to 16000Hz for Whisper
        let resampled = if sr != 16000 {
            super::audio::resample(&mono, sr, 16000)
        } else {
            mono
        };

        Some((resampled, idx))
    }

    /// Add a transcribed partial segment response text
    pub fn add_partial(&self, index: usize, text: String) {
        if let Ok(mut state) = self.state.lock() {
            println!("[ChunkedRecorder] Stored chunk {}: \"{}\"", index, text);
            state.partial_transcripts.push((index, text));
        }
    }

    /// Stops recording and returns:
    /// 1. Any remaining audio samples left in the buffer (resampled to 16kHz mono).
    /// 2. All stored partial transcripts so far.
    /// 3. The final chunk index (for naming the tail).
    /// 4. The total elapsed time in milliseconds of the recording session.
    pub fn stop(&self) -> Result<(Vec<f32>, Vec<(usize, String)>, usize, u32), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        if !state.is_recording {
            return Ok((Vec::new(), Vec::new(), 0, 0));
        }

        state.is_recording = false;
        if let Some(send_stream) = state.stream.take() {
            let _ = send_stream.0.pause();
        }

        let raw_remaining = std::mem::take(&mut state.samples);
        let partials = std::mem::take(&mut state.partial_transcripts);
        let tail_idx = state.chunk_index;
        let elapsed_ms = match state.start_time {
            Some(t) => t.elapsed().as_millis() as u32,
            None => 0,
        };
        let sr = state.native_sample_rate;
        let ch = state.native_channels;

        println!("[ChunkedRecorder] Stopped. Got {} raw remaining samples", raw_remaining.len());

        // Process remaining tail audio to mono and resample to 16kHz
        let mono = if ch > 1 {
            raw_remaining
                .chunks(ch as usize)
                .map(|frame| frame.iter().sum::<f32>() / ch as f32)
                .collect()
        } else {
            raw_remaining
        };

        let resampled = if sr != 16000 {
            super::audio::resample(&mono, sr, 16000)
        } else {
            mono
        };

        Ok((resampled, partials, tail_idx, elapsed_ms))
    }
}

fn write_input_data<T, U>(input: &[T], state: &Arc<Mutex<ChunkedState>>, app: &AppHandle)
where
    T: Sample,
    U: Sample + FromSample<T> + FromSample<f32>,
{
    if let Ok(mut state) = state.lock() {
        if !state.is_recording {
            return;
        }

        let mut sum = 0.0;
        let mut count = 0;

        // 1. Calculate the mean (DC offset) of this chunk
        for &sample in input {
            let f: f32 = sample.to_float_sample().to_sample();
            sum += f;
            count += 1;
        }

        let mean = if count > 0 { sum / count as f32 } else { 0.0 };

        // 2. Subtract mean, store cleaned samples, and collect for frequency analysis
        let mut cleaned_samples: Vec<f32> = Vec::with_capacity(count);
        let mut rms_sum = 0.0;
        for &sample in input {
            let f: f32 = sample.to_float_sample().to_sample();
            let cleaned = f - mean;
            state.samples.push(cleaned);
            cleaned_samples.push(cleaned);
            rms_sum += cleaned * cleaned;
        }

        if count > 0 {
            let rms = (rms_sum / count as f32).sqrt();

            // 3. Compute 7 frequency band energies using Goertzel's algorithm
            // Bands: ~100Hz, ~250Hz, ~500Hz, ~1kHz, ~2kHz, ~4kHz, ~6kHz
            let sr = state.native_sample_rate as f32;
            let target_freqs: [f32; 7] = [150.0, 300.0, 500.0, 1000.0, 2000.0, 4000.0, 6000.0];
            let mut bands: [f32; 7] = [0.0; 7];
            let n = cleaned_samples.len() as f32;

            for (i, &freq) in target_freqs.iter().enumerate() {
                let k = (freq * n / sr).round();
                let omega = 2.0 * std::f32::consts::PI * k / n;
                let coeff = 2.0 * omega.cos();
                let mut s0: f32;
                let mut s1: f32 = 0.0;
                let mut s2: f32 = 0.0;

                for &sample in &cleaned_samples {
                    s0 = sample + coeff * s1 - s2;
                    s2 = s1;
                    s1 = s0;
                }

                let power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
                bands[i] = (power / n).sqrt().min(1.0);
            }

            // Emit combined audio data: [rms, band0, band1, ..., band6]
            let payload: Vec<f32> = std::iter::once(rms)
                .chain(bands.iter().copied())
                .collect();
            let _ = app.emit("audio-level", payload);
        }
    }
}
