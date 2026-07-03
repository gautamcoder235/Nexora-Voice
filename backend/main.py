import os
import sys
import tempfile
import time

# On Windows, add NVIDIA CUDA DLLs to the search path.
# First try local libs/ folder (self-contained), then fall back to venv site-packages.
if sys.platform == "win32":
    # Local libs directory (Nexora Voice/libs/nvidia/...)
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    local_libs = os.path.join(project_root, "libs")
    
    nvidia_dirs = ["cublas", "cudnn", "cuda_nvrtc", "cuda_runtime"]
    paths_to_add = []
    
    # 1. Check local libs/ folder first
    for lib in nvidia_dirs:
        local_path = os.path.join(local_libs, "nvidia", lib, "bin")
        if os.path.exists(local_path):
            paths_to_add.append(local_path)
    
    # 2. Fallback: check venv site-packages if local not found
    if not paths_to_add:
        import site
        site_packages_dirs = site.getsitepackages()
        if hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix):
            site_packages_dirs.append(os.path.join(sys.prefix, "Lib", "site-packages"))
        
        for sp_dir in site_packages_dirs:
            for lib in nvidia_dirs:
                p = os.path.join(sp_dir, "nvidia", lib, "bin")
                if os.path.exists(p):
                    paths_to_add.append(p)
    
    if paths_to_add:
        os.environ["PATH"] = ";".join(paths_to_add) + ";" + os.environ["PATH"]
        for p in paths_to_add:
            print(f"Adding DLL directory: {p}")
            try:
                os.add_dll_directory(p)
            except Exception as e:
                print(f"Failed to add DLL directory {p}: {e}")

import ctranslate2
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="Voice to Text API")

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Disable caching for static files to ensure CSS/JS changes show up immediately
@app.middleware("http")
async def disable_static_caching(request, call_next):
    response = await call_next(request)
    path = request.url.path.lower()
    if path.endswith((".css", ".js", ".html", ".ico")) or path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Load model
# We use Whisper small. If GPU/CUDA is available, we load on CUDA with float16.
# Otherwise, we fallback to CPU with int8.
try:
    cuda_available = ctranslate2.get_cuda_device_count() > 0
except Exception:
    cuda_available = False

device = "cuda" if cuda_available else "cpu"
compute_type = "float16" if device == "cuda" else "int8"
model_size = "small"

# Save downloaded models inside the Nexora Voice/models folder
models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))
os.makedirs(models_dir, exist_ok=True)

def is_model_cached(size: str) -> bool:
    expected_dir = os.path.join(models_dir, f"models--Systran--faster-whisper-{size}")
    if not os.path.exists(expected_dir):
        return False
    snapshots_dir = os.path.join(expected_dir, "snapshots")
    if os.path.exists(snapshots_dir):
        for root, dirs, files in os.walk(snapshots_dir):
            if any(f.endswith(".bin") or f.endswith(".json") for f in files):
                return True
    return False

@app.get("/api/models_status")
async def get_models_status():
    allowed_models = ["tiny", "base", "small", "medium"]
    status = {}
    for m in allowed_models:
        status[m] = {
            "cached": is_model_cached(m),
            "active": m == model_size
        }
    return status

print(f"Loading Whisper model '{model_size}' on device '{device}' with compute_type '{compute_type}' (downloading to {models_dir} if not cached)...")
try:
    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=models_dir)
    print("Model loaded successfully.")
except Exception as e:
    print(f"Failed to load model on {device}: {e}. Retrying on CPU...")
    device = "cpu"
    compute_type = "int8"
    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=models_dir)
    print("Model loaded successfully on CPU.")

class ModelSelection(BaseModel):
    model_size: str

@app.post("/api/select_model")
async def select_model(selection: ModelSelection):
    global model, model_size, device, compute_type
    
    allowed_models = ["tiny", "base", "small", "medium"]
    requested = selection.model_size.lower()
    
    if requested not in allowed_models:
        raise HTTPException(status_code=400, detail=f"Unsupported model size. Choose from: {allowed_models}")
        
    if requested == model_size:
        return {"status": "success", "message": f"Model {requested} is already loaded.", "model_size": model_size}
        
    print(f"Unloading current model '{model_size}' and loading '{requested}' on device '{device}'...")
    try:
        # Load new model first (so we don't break if it fails)
        new_model = WhisperModel(requested, device=device, compute_type=compute_type, download_root=models_dir)
        
        model = new_model
        model_size = requested
        
        print(f"Successfully switched to model '{requested}'.")
        return {"status": "success", "message": f"Successfully switched to model '{requested}'.", "model_size": model_size}
    except Exception as e:
        print(f"Failed to load '{requested}' on {device} ({e}). Trying CPU fallback...")
        try:
            fallback_device = "cpu"
            fallback_compute_type = "int8"
            new_model = WhisperModel(requested, device=fallback_device, compute_type=fallback_compute_type, download_root=models_dir)
            
            model = new_model
            model_size = requested
            device = fallback_device
            compute_type = fallback_compute_type
            
            print(f"Successfully switched to model '{requested}' on CPU.")
            return {"status": "success", "message": f"Successfully switched to model '{requested}' on CPU.", "model_size": model_size, "device": device}
        except Exception as cpu_e:
            raise HTTPException(status_code=500, detail=f"Failed to switch model to {requested}: {cpu_e}")



@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    global model, device, compute_type
    # Verify file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".aac", ".mp4", ".mpeg"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")
    
    # Save to a temporary file
    fd, temp_file_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    
    try:
        with open(temp_file_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")
            
    try:
        # Transcribe
        # beam_size=5 is standard. word_timestamps=True is extremely cool.
        start_time = time.time()
        try:
            segments, info = model.transcribe(temp_file_path, beam_size=5, word_timestamps=True)
        except Exception as e:
            # Catch DLL/CUDA loading errors and fallback to CPU
            err_msg = str(e).lower()
            if "cublas" in err_msg or "cuda" in err_msg or "cudnn" in err_msg or "dll" in err_msg:
                print(f"GPU execution failed ({e}). Re-loading model on CPU...")
                try:
                    device = "cpu"
                    compute_type = "int8"
                    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=models_dir)
                    segments, info = model.transcribe(temp_file_path, beam_size=5, word_timestamps=True)
                except Exception as cpu_e:
                    raise Exception(f"CPU fallback transcription failed: {cpu_e}") from e
            else:
                raise e

        result_segments = []
        full_text = []
        
        for segment in segments:
            words = []
            if segment.words:
                for w in segment.words:
                    words.append({
                        "word": w.word,
                        "start": w.start,
                        "end": w.end,
                        "probability": w.probability
                    })
            result_segments.append({
                "id": segment.id,
                "seek": segment.seek,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text,
                "avg_logprob": segment.avg_logprob,
                "compression_ratio": segment.compression_ratio,
                "no_speech_prob": segment.no_speech_prob,
                "words": words
            })
            full_text.append(segment.text.strip())

        # Calculate execution time after generator has been fully consumed (actual transcription)
        transcription_time = time.time() - start_time
            
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "transcription_time": round(transcription_time, 2),
            "text": " ".join(full_text),
            "segments": result_segments
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError:
                pass

@app.post("/api/transcribe_chunk")
async def transcribe_chunk(file: UploadFile = File(...), chunk_index: int = 0):
    global model, device, compute_type
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".wav", ".mp3"]:
        ext = ".wav"
    
    fd, temp_file_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    
    try:
        with open(temp_file_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")
            
    try:
        try:
            segments, info = model.transcribe(
                temp_file_path,
                beam_size=5,
                vad_filter=True,
                vad_parameters=dict(
                    threshold=0.35,
                    min_speech_duration_ms=200,
                    max_speech_duration_s=float("inf"),
                    min_silence_duration_ms=600,
                    speech_pad_ms=300,
                )
            )
        except Exception as e:
            err_msg = str(e).lower()
            if "cublas" in err_msg or "cuda" in err_msg or "cudnn" in err_msg or "dll" in err_msg:
                try:
                    device = "cpu"
                    compute_type = "int8"
                    model = WhisperModel(model_size, device=device, compute_type=compute_type, download_root=models_dir)
                    segments, info = model.transcribe(
                        temp_file_path,
                        beam_size=5,
                        vad_filter=True,
                        vad_parameters=dict(
                            threshold=0.35,
                            min_speech_duration_ms=200,
                            max_speech_duration_s=float("inf"),
                            min_silence_duration_ms=600,
                            speech_pad_ms=300,
                        )
                    )
                except Exception as cpu_e:
                    raise Exception(f"CPU fallback transcription failed: {cpu_e}") from e
            else:
                raise e

        full_text = []
        for segment in segments:
            full_text.append(segment.text.strip())

        return {
            "chunk_index": chunk_index,
            "text": " ".join(full_text).strip()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {e}")
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError:
                pass

# Entry point for direct execution
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
