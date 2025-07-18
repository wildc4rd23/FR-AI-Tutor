# backend/tts_minimax.py
import os
import requests
import logging
import json #  json Modul importieren

logger = logging.getLogger(__name__)

def synthesize_speech_minimax(text: str, output_path: str):
    """
    Synthesisiert Sprache mit Minimax TTS API
    """
    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        raise Exception("MINIMAX_API_KEY Umgebungsvariable fehlt")
    
    # Text validieren und truncaten falls zu lang
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
    
    # Korrigierte Minimax TTS API URL für t2a_v2
    url = "https://api.minimax.io/v1/t2a_v2" 
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json" # Bleibt application/json
    }

    # NEUE PAYLOAD-STRUKTUR BASIEREND AUF IHRER DOKUMENTATION
    payload_dict = {
        "model":"speech-02-hd",  
        "text": text,  
        "stream":False,  
        "lang": "fr",              # Französisch
        "voice_setting":{
            "voice_id": "Friendly_Person",
            "speed":1,    
            "vol":1,       # vol als Integer, wie im Beispiel
            "pitch":0  
        },  
        "audio_setting":{    
            "sample_rate":32000, 
            "bitrate":128000,    
            "format":"mp3",    
            "channel":1  
        }
    }

    # Das Payload-Dictionary in einen JSON-String umwandeln
    payload_json = json.dumps(payload_dict)

    try:
        logger.info(f"Sending TTS request to Minimax for text: {text[:50]}...")
        # Payload als 'data' senden, da es bereits ein JSON-String ist
        response = requests.post(url, headers=headers, data=payload_json, timeout=45) 
        
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
        
        # Prüfen ob es sich um JSON-Fehler handelt (auch bei 200 OK Status)
        if 'application/json' in content_type:
            logger.error(f"Minimax API returned JSON with 200 OK status. Raw JSON: {response.text}")
            try:
                error_data = response.json()
                # Versuche, spezifischere Fehlermeldungen zu extrahieren
                error_msg = error_data.get('message') or \
                            error_data.get('error') or \
                            error_data.get('base_resp', {}).get('status_msg') or \
                            'Unbekannter API Fehler'
            except Exception:
                error_msg = f"Fehler beim Parsen der JSON-Antwort: {response.text}"
            raise Exception(f"Minimax API Fehler ({response.status_code}): {error_msg}. Erwartet: audio/mpeg, Erhalten: {content_type}")
        
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