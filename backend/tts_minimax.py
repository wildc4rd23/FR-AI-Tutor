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

    # Text validieren und bereinigen
    if not text or len(text.strip()) == 0:
        raise Exception("Leerer Text kann nicht synthetisiert werden")
    
    # Text bereinigen (HTML-Tags entfernen, etc.)
    import re
    text = re.sub(r'<[^>]+>', '', text)  # HTML-Tags entfernen
    text = text.strip()    
    
    # Minimax hat ein Textlimit - bei zu langem Text truncaten
    if len(text) > 1000:
        text = text[:997] + "..."
        logger.warning("Text wurde auf 1000 Zeichen gekürzt")
    
    # Minimax TTS API URL 
   # url = "https://api.minimaxi.chat/v1/t2a_v2"
    
   # headers = {
   #     "Authorization": f"Bearer {api_key}",
   #     "Content-Type": "application/json"
   # }

   # payload = {
   #     "text": text,
   #     "lang": "fr",              # Französisch
   #     "voice_id": "female-001",  # Weibliche Stimme
   #     "emotion": "neutral",      
   #     "speed": 1.0,              # Normale Geschwindigkeit
   #     "vol": 50,                 # Mittlere Lautstärke
   #     "pitch": 0,                # Normale Tonhöhe
   #     "audio_sample_rate": 22050,
   #     "bitrate": 128000
   # }

    # Korrekte Minimax TTS API URL und Parameter
    url = "https://api.minimaxi.chat/v1/t2a_pro"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Korrigierte Parameter für Minimax API
    payload = {
        "text": text,
        "lang": "fr",              # Französisch
        "model": "speech-01",  # Spezifisches Modell
        "voice_id": "female-lisa",  # Französische Stimme
        "response_format": "mp3",  # Explizit MP3 anfordern
        "speed": 1.0,
        "volume": 1.0,
        "pitch": 0
    }

    try:
        logger.info(f"Sending TTS request to Minimax for text: {text[:50]}...")
        
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        
        # Debug-Informationen
        logger.info(f"Minimax Response Status: {response.status_code}")
        logger.info(f"Minimax Response Headers: {dict(response.headers)}")
        
        # Detailliertere Fehlerbehandlung
        if response.status_code == 401:
            raise Exception("Minimax API Authentifizierung fehlgeschlagen - Prüfen Sie Ihren API Key")
        elif response.status_code == 429:
            raise Exception("Minimax API Rate Limit erreicht - Versuchen Sie es später erneut")
        elif response.status_code >= 500:
            raise Exception("Minimax Server Fehler - Versuchen Sie es später erneut")
        
        response.raise_for_status()
        
        # Content-Type prüfen
        content_type = response.headers.get('content-type', '')
        logger.info(f"Response Content-Type: {content_type}")
        
        # Prüfen ob Response Content vorhanden ist
        if not response.content:
            raise Exception("Leere Antwort von Minimax API erhalten")
        
        # Prüfen ob es sich um JSON-Fehler handelt
        if 'application/json' in content_type:
            try:
                error_data = response.json()
                error_msg = error_data.get('message') or error_data.get('error') or 'Unbekannter API Fehler'
            except Exception:
                error_msg = f"Fehler beim Parsen der JSON-Antwort: {response.text}"
            raise Exception(f"Minimax API Fehler ({response.status_code}): {error_msg}")
        else:
            # Kein JSON – z.B. Text oder HTML
            raise Exception(f"Minimax API Fehler ({response.status_code}): {response.text[:200]}")
        
        # Verzeichnis erstellen falls nicht vorhanden
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Audio-Datei speichern
        with open(output_path, "wb") as f:
            f.write(response.content)
        
        # Validieren dass Datei geschrieben wurde
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Audio-Datei wurde nicht korrekt gespeichert")
        
        # Audio-Format validieren (erste Bytes prüfen)
        with open(output_path, "rb") as f:
            header = f.read(4)
            if not (header.startswith(b'ID3') or header[1:4] == b'MP3' or header.startswith(b'\xff\xfb')):
                logger.warning("Audio-Datei scheint kein gültiges MP3 zu sein")
            
        logger.info(f"Audio erfolgreich gespeichert: {output_path} ({os.path.getsize(output_path)} bytes)")
            
    except requests.exceptions.Timeout:
        raise Exception("Minimax API Timeout - Anfrage dauerte zu lange")
    except requests.exceptions.HTTPError as e:
        error_msg = f"Minimax API HTTP Fehler: {e.response.status_code}"
        try:
            error_detail = e.response.json()
            error_msg += f" - {error_detail.get('message', error_detail)}"
        except:
            error_msg += f" - {e.response.text[:200]}"
        raise Exception(error_msg)
    except requests.exceptions.RequestException as e:
        raise Exception(f"Minimax API Verbindungsfehler: {str(e)}")
    except Exception as e:
        if "Minimax" in str(e):
            raise
        else:
            raise Exception(f"TTS Fehler: {str(e)}")