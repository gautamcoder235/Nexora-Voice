use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct SendStream(pub cpal::Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

pub struct RecorderState {
    pub is_recording: bool,
    pub samples: Vec<f32>,
    pub stream: Option<SendStream>,
    pub native_sample_rate: u32,
    pub native_channels: u16,
}

pub struct AudioRecorder {
    pub state: Arc<Mutex<RecorderState>>,
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(RecorderState {
                is_recording: false,
                samples: Vec::new(),
                stream: None,
                native_sample_rate: 16000,
                native_channels: 1,
            })),
        }
    }

    pub fn start(&self, app_handle: AppHandle) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock recorder state")?;
        if state.is_recording {
            return Ok(());
        }

        state.samples.clear();
        state.is_recording = true;

        // Setup cpal input stream
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default microphone input device found".to_string())?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        // Use the device's native config to avoid unsupported format errors
        let cpal_config = config.config();
        let native_sr = cpal_config.sample_rate.0;
        let native_ch = cpal_config.channels;
        
        state.native_sample_rate = native_sr;
        state.native_channels = native_ch;

        println!("[AudioRecorder] Using device native config: {}Hz, {} channel(s), format {:?}", 
            native_sr, native_ch, config.sample_format());

        let state_clone = self.state.clone();
        let app_clone = app_handle.clone();

        // Audio callback
        let err_fn = |err| eprintln!("[AudioRecorder] Stream error: {}", err);
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

        println!("[AudioRecorder] Recording started.");
        Ok(())
    }

    pub fn stop(&self) -> Result<Vec<f32>, String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock recorder state")?;
        if !state.is_recording {
            return Ok(Vec::new());
        }

        state.is_recording = false;
        if let Some(send_stream) = state.stream.take() {
            let _ = send_stream.0.pause();
        }

        let raw_samples = std::mem::take(&mut state.samples);
        let native_sr = state.native_sample_rate;
        let native_ch = state.native_channels;

        println!("[AudioRecorder] Stopped. Got {} raw samples at {}Hz {}ch", 
            raw_samples.len(), native_sr, native_ch);

        // Convert multi-channel to mono by averaging channels
        let mono: Vec<f32> = if native_ch > 1 {
            raw_samples
                .chunks(native_ch as usize)
                .map(|frame| frame.iter().sum::<f32>() / native_ch as f32)
                .collect()
        } else {
            raw_samples
        };

        // Resample from native rate to 16000Hz for Whisper
        let resampled = if native_sr != 16000 {
            resample(&mono, native_sr, 16000)
        } else {
            mono
        };

        println!("[AudioRecorder] After resample: {} samples at 16000Hz", resampled.len());
        Ok(resampled)
    }
}

fn write_input_data<T, U>(input: &[T], state: &Arc<Mutex<RecorderState>>, app: &AppHandle)
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

/// Simple linear interpolation resampler
pub fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() {
        return input.to_vec();
    }
    
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);
    
    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let idx = src_idx as usize;
        let frac = src_idx - idx as f64;
        
        if idx + 1 < input.len() {
            let sample = input[idx] as f64 * (1.0 - frac) + input[idx + 1] as f64 * frac;
            output.push(sample as f32);
        } else if idx < input.len() {
            output.push(input[idx]);
        }
    }
    
    output
}

