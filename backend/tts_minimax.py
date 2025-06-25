# backend/tts_minimax.py
import os
import requests

def synthesize_speech_minimax(text: str, output_path: str):
    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        raise Exception("MINIMAX_API_KEY Umgebungsvariable fehlt")
    
    # Minimax TTS API URL 
    url = "https://api.minimaxi.chat/v1/t2a_v2"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": text,
        "lang": "fr",              
        "voice_id": "female-001",  
        "emotion": "neutral",      
        "speed": 1.0,
        "vol": 50,
        "pitch": 0,
        "audio_sample_rate": 22050,
        "bitrate": 128000
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        # Speichere die Audio-Datei
        with open(output_path, "wb") as f:
            f.write(response.content)
            
    except requests.exceptions.RequestException as e:
        raise Exception(f"Minimax API Fehler: {str(e)}")
    except Exception as e:
        raise Exception(f"TTS Fehler: {str(e)}")