# backend/tts_minimax.py
import os
import requests
import logging

logger = logging.getLogger(__name__)

def synthesize_speech_minimax(text: str, output_path: str):
    """
    Synthesiert Sprache mit Minimax TTS API
    """
    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        raise Exception("MINIMAX_API_KEY Umgebungsvariable fehlt")
    
    # Text validieren und truncaten falls zu lang
    if not text or len(text.strip()) == 0:
        raise Exception("Leerer Text kann nicht synthetisiert werden")
    
    # Minimax hat ein Textlimit - bei zu langem Text truncaten
    if len(text) > 1000:
        text = text[:997] + "..."
        logger.warning("Text wurde auf 1000 Zeichen gekürzt")
    
    # Minimax TTS API URL 
    url = "https://api.minimaxi.chat/v1/t2a_v2"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": text,
        "lang": "fr",              # Französisch
        "voice_id": "female-001",  # Weibliche Stimme
        "emotion": "neutral",      
        "speed": 1.0,              # Normale Geschwindigkeit
        "vol": 50,                 # Mittlere Lautstärke
        "pitch": 0,                # Normale Tonhöhe
        "audio_sample_rate": 22050,
        "bitrate": 128000
    }

    try:
        logger.info(f"Sending TTS request to Minimax for text: {text[:50]}...")
        
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        # Debug-Informationen
        logger.info(f"Minimax Response Status: {response.status_code}")
        logger.info(f"Minimax Response Headers: {dict(response.headers)}")
        
        response.raise_for_status()
        
        # Prüfen ob Response Content vorhanden ist
        if not response.content:
            raise Exception("Leere Antwort von Minimax API erhalten")
        
        # Verzeichnis erstellen falls nicht vorhanden
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Speichere die Audio-Datei
        with open(output_path, "wb") as f:
            f.write(response.content)
        
        # Validieren dass Datei geschrieben wurde
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Audio-Datei wurde nicht korrekt gespeichert")
            
        logger.info(f"Audio erfolgreich gespeichert: {output_path} ({os.path.getsize(output_path)} bytes)")
            
    except requests.exceptions.Timeout:
        raise Exception("Minimax API Timeout - Anfrage dauerte zu lange")
    except requests.exceptions.HTTPError as e:
        error_msg = f"Minimax API HTTP Fehler: {e.response.status_code}"
        try:
            error_detail = e.response.json()
            error_msg += f" - {error_detail}"
        except:
            error_msg += f" - {e.response.text}"
        raise Exception(error_msg)
    except requests.exceptions.RequestException as e:
        raise Exception(f"Minimax API Verbindungsfehler: {str(e)}")
    except Exception as e:
        raise Exception(f"TTS Fehler: {str(e)}")