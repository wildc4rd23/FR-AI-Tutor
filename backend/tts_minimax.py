# backend/tts_minimax.py
import os
import requests
import logging

logger = logging.getLogger(__name__)

def synthesize_speech_minimax(text: str, output_path: str):
    """
    Synthesisiert Sprache mit Minimax TTS API
    """
    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        raise Exception("MINIMAX_API_KEY Umgebungsvariable fehlt")
    
    # Text validieren und bereinigen
    if not text or len(text.strip()) == 0:
        raise Exception("Leerer Text kann nicht synthetisiert werden")
    
    import re
    text = re.sub(r'<[^>]+>', '', text)  # HTML-Tags entfernen
    text = text.strip()    
    
    # Minimax hat ein Textlimit - bei zu langem Text truncaten
    if len(text) > 1000:
        text = text[:997] + "..."
        logger.warning("Text wurde auf 1000 Zeichen gekürzt")
    
    url = "https://api.minimaxi.chat/v1/t2a_pro" # Use t2a_pro for better results
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": text,
        "lang": "fr",              # Französisch
        "model": "speech-01",      # Spezifisches Modell für t2a_pro
        "voice_id": "female-lisa",  # Französische Stimme
        "response_format": "mp3",  # Explizit MP3 anfordern
        "speed": 1.0,
        "volume": 1.0,
        "pitch": 0
    }

    try:
        logger.info(f"Sending TTS request to Minimax for text: {text[:50]}...")
        
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        
        logger.info(f"Minimax Response Status: {response.status_code}")
        logger.info(f"Minimax Response Headers: {dict(response.headers)}")
        
        # Check for non-successful HTTP status codes first
        if not response.ok:
            content_type = response.headers.get('content-type', '')
            if 'application/json' in content_type:
                try:
                    error_data = response.json()
                    error_msg = error_data.get('message') or error_data.get('error') or 'Unbekannter API Fehler'
                except Exception:
                    error_msg = f"Fehler beim Parsen der JSON-Antwort: {response.text}"
                raise Exception(f"Minimax API Fehler ({response.status_code}): {error_msg}")
            else:
                raise Exception(f"Minimax API Fehler ({response.status_code}): {response.text[:200]}")

        # --- NEUE LOGGING-INFORMATIONEN HIER ---
        logger.info(f"Minimax response content length: {len(response.content) if response.content else 0} bytes")
        if not response.content:
            raise Exception("Leere Antwort von Minimax API erhalten (nach erfolgreichem Statuscode).")
        
        # Sicherstellen, dass das Verzeichnis existiert
        target_dir = os.path.dirname(output_path)
        logger.info(f"Attempting to create directory: {target_dir}")
        os.makedirs(target_dir, exist_ok=True)
        logger.info(f"Directory {target_dir} exists: {os.path.exists(target_dir)}")
        
        # Audio-Inhalt schreiben
        logger.info(f"Attempting to write audio to: {output_path}")
        with open(output_path, "wb") as f:
            f.write(response.content)
        
        # Validieren dass Datei geschrieben wurde
        logger.info(f"Checking if file was correctly saved: {output_path}")
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            file_size_after_write = os.path.getsize(output_path) if os.path.exists(output_path) else -1
            raise Exception(f"Audio-Datei wurde nicht korrekt gespeichert (existiert nicht oder Größe 0). Größe: {file_size_after_write} Bytes.")
        
        # Audio-Format validieren (erste Bytes prüfen)
        with open(output_path, "rb") as f:
            header = f.read(4)
            if not (header.startswith(b'ID3') or header[1:4] == b'MP3' or header.startswith(b'\xff\xfb')):
                logger.warning(f"Audio-Datei '{output_path}' scheint kein gültiges MP3 zu sein. Header: {header.hex()}")
            
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