# backend/tts.py
from TTS.api import TTS
import os

# Der Pfad ist korrekt zur render.yaml abgestimmt
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "tts", "tts_models-fr-mai-tacotron2-DDC")

tts = TTS(model_path=MODEL_PATH)

def synthesize_speech(text, filename="static/response.wav"):
    tts.tts_to_file(text=text, file_path=filename)
    return filename