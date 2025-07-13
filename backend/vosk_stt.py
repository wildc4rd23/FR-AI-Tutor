# backend/vosk_stt.py momentan nicht verwendet
import os
import wave
import json
from vosk import Model, KaldiRecognizer

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "stt", "vosk", "vosk-model-small-fr-0.22")
model = Model(MODEL_PATH)

def transcribe_audio(audio_path):
    wf = wave.open(audio_path, "rb")
    if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getframerate() not in [8000, 16000, 44100]:
        raise ValueError("Audio must be WAV format mono PCM")

    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)
    results = []

    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            result = json.loads(rec.Result())
            results.append(result.get("text", ""))
    results.append(json.loads(rec.FinalResult()).get("text", ""))

    return " ".join(results).strip()
