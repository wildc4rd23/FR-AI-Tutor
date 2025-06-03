# backend/tts_tacotron.py

import torch
from TTS.utils.synthesizer import Synthesizer

MODEL_DIR = "backend/models/tts/tts_models-fr-mai-tacotron2-DDC"
TACOTRON_MODEL_PATH = f"{MODEL_DIR}/model_file.pth"
TACOTRON_CONFIG_PATH = f"{MODEL_DIR}/config.json"

synthesizer = None  # Lazy Initialization

def load_model():
    global synthesizer
    if synthesizer is None:
        print("[INFO] Lade französisches Tacotron2-DDC Modell...")
        synthesizer = Synthesizer(
            tts_checkpoint=TACOTRON_MODEL_PATH,
            tts_config_path=TACOTRON_CONFIG_PATH,
            use_cuda=torch.cuda.is_available()
        )
        print("[INFO] Modell geladen.")

def synthesize_speech(text, output_path):
    load_model()
    wav = synthesizer.tts(text)
    synthesizer.save_wav(wav, output_path)