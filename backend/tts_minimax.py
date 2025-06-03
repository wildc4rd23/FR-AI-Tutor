# backend/tts.py
import os
import requests

MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY")  # aus Umgebungsvariablen laden
MINIMAX_URL = "https://api.minimaxi.chat/v1/t2a_v2"

def synthesize_speech_minimax(text: str, output_path: str):
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": text,
        "lang": "fr",
        "voice_id": "female-001",  # Optional: andere Stimme oder Emotion
        "emotion": "neutral"
    }

    response = requests.post(MINIMAX_URL, headers=headers, json=payload)

    if response.status_code == 200:
        with open(output_path, "wb") as f:
            f.write(response.content)
    else:
        raise Exception(f"Minimax API Fehler: {response.status_code} {response.text}")