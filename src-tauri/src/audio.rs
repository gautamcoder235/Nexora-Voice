use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample};
use std::fs::File;
use std::io::BufWriter;
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
        
        // 2. Subtract mean and calculate cleaned RMS
        let mut rms_sum = 0.0;
        for &sample in input {
            let f: f32 = sample.to_float_sample().to_sample();
            let cleaned = f - mean;
            state.samples.push(cleaned);
            
            rms_sum += cleaned * cleaned;
        }
        
        if count > 0 {
            let rms = (rms_sum / count as f32).sqrt();
            
            // Log RMS value every 50 callbacks to inspect actual microphone signal levels
            static mut LOG_COUNTER: usize = 0;
            unsafe {
                LOG_COUNTER += 1;
                if LOG_COUNTER % 50 == 0 {
                    println!("[AudioRecorder] Emitting RMS: {:.5}", rms);
                }
            }
            
            let _ = app.emit("audio-level", rms);
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

pub fn save_wav_file(samples: &[f32], path: &std::path::Path) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    let file = File::create(path).map_err(|e| e.to_string())?;
    let buf_writer = BufWriter::new(file);
    let mut writer = hound::WavWriter::new(buf_writer, spec).map_err(|e| e.to_string())?;
    
    for &sample in samples {
        // Convert f32 sample [-1.0, 1.0] to i16 [-32768, 32767]
        let amplified = (sample * 32768.0).clamp(-32768.0, 32767.0) as i16;
        writer.write_sample(amplified).map_err(|e| e.to_string())?;
    }
    
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}
