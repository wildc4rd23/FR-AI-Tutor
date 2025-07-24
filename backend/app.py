# Vollständige app.py mit dynamischem TTS, Tacotron-Fallback, Audioverwaltung und allen API-Routen

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from datetime import datetime
import os
import time
import logging

# =========================================================
# LLM KONFIGURATION
MAX_HISTORY_LENGTH = 20  # Begrenzt Historie auf Nachrichtenanzahl

# =========================================================
# TTS KONFIGURATION: Wählen Sie hier Ihren aktiven TTS-Anbieter
# Mögliche Werte: "GOOGLE", "MINIMAX", "OPENAI", "AMAZON_POLLY"
ACTIVE_TTS_PROVIDER = "AMAZON_POLLY" # <--- HIER KÖNNEN SIE DEN ANBIETER WECHSELN
# =========================================================

# Setup für Render
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# Optimiertes Logging für Render Free Tier
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Reduziere Logs für externe Bibliotheken
logging.getLogger('urllib3').setLevel(logging.WARNING)
logging.getLogger('requests').setLevel(logging.WARNING)
logging.getLogger('boto3').setLevel(logging.WARNING)
logging.getLogger('botocore').setLevel(logging.WARNING)

# === Dummy-TTS (nur Fallback) ===
def dummy_synthesize_tts(text, output_path):
    logger.warning("Dummy TTS wird verwendet.")
    with open(output_path, "wb") as f:
        f.write(b"Dummy Audio")
    return True # Dummy-Funktion sollte Erfolg signalisieren, da sie immer eine Datei "schreibt"

# === Dynamische TTS-Auswahl ===
try:
    if ACTIVE_TTS_PROVIDER == "GOOGLE":
        from tts_google import synthesize_speech_google as synthesize_tts
    elif ACTIVE_TTS_PROVIDER == "MINIMAX":
        from tts_minimax import synthesize_speech_minimax as synthesize_tts
    elif ACTIVE_TTS_PROVIDER == "OPENAI":
        from tts_openai import synthesize_speech_openai as synthesize_tts
    elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
        from tts_amzpolly import synthesize_speech_amzpolly as synthesize_tts
    elif ACTIVE_TTS_PROVIDER == "TACOTRON":
        from tts_tacotron import synthesize_speech as synthesize_tts
    else:
        synthesize_tts = dummy_synthesize_tts # Fallback auf Dummy
except ImportError as e:
    logger.error(f"TTS-Anbieter '{ACTIVE_TTS_PROVIDER}' konnte nicht geladen werden: {e}. Verwende Dummy TTS.")
    synthesize_tts = dummy_synthesize_tts # Immer einen Fallback haben

# === Session-Speicher  und temporäre Verzeichnisse ===
# Diese Variablen sollten NACH der App-Initialisierung stehen
user_sessions = {}
PROJECT_ROOT = os.path.dirname(app.root_path)
TEMP_AUDIO_DIR_ROOT = os.path.join(PROJECT_ROOT, 'temp_audio')
os.makedirs(TEMP_AUDIO_DIR_ROOT, exist_ok=True) # Sicherstellen, dass das Root-Verzeichnis existiert

# === LLM & Hilfsmodule ===
from llm_agent_mistral import get_initial_llm_response_for_scenario, query_llm_for_scenario
from utils import get_user_temp_dir, log_request, add_to_history#, cleanup_temp_dir
#from vosk_stt import transcribe_audio #momentan nicht verwendet

# === Hilfsfunktionen: ===

def safe_synthesize_tts(text, output_path, user_id, max_retries=2):
    """TTS mit begrenzten Wiederholungsversuchen"""
    logger.info(f"[{user_id}] TTS starten für Text: '{text[:50]}...'")
    logger.info(f"[{user_id}] Ausgabepfad: {output_path}")
    
    for attempt in range(max_retries):
        try:
            synthesize_tts(text, output_path)
            
            # Prüfen, ob Datei wirklich erstellt wurde und groß genug ist
            if os.path.exists(output_path):
                file_size = os.path.getsize(output_path)
                logger.info(f"[{user_id}] TTS-Datei erstellt - Größe: {file_size} bytes")
                
                # Dummy-Dateien sind sehr klein (nur "Dummy Audio" = ~11 bytes)
                if file_size > 100:  # Echte Audio-Dateien sind größer
                    return True
                else:
                    logger.warning(f"[{user_id}] TTS-Datei zu klein ({file_size} bytes) - wahrscheinlich Dummy")
            else:
                logger.warning(f"[{user_id}] TTS-Datei nicht erstellt")
                
        except Exception as e:
            logger.warning(f"[{user_id}] TTS Versuch {attempt + 1} fehlgeschlagen: {str(e)}")
            if attempt == max_retries - 1:
                with open(output_path, "wb") as f:
                    f.write(b"Dummy Audio")
                logger.error(f"[{user_id}] Alle TTS Versuche fehlgeschlagen. Dummy-Datei erstellt.")
                return False
            time.sleep(1)
    return False # Sollte nie erreicht werden, aber zur Sicherheit



# === Hauptfunktion: LLM-Antwort + TTS optimized===
def generate_llm_and_tts_response(user_id, scenario, prompt, is_user_message=True):
    """Speicher-optimierte Version der Hauptfunktion"""
    session = user_sessions.setdefault(user_id, {
        'history': [], 'scenario': 'libre', 'created_at': datetime.now()
    })
    
    session['scenario'] = scenario

    if is_user_message:
        add_to_history(session, 'user', prompt)
        log_request(user_id, "User input", prompt)

    try:
        llm_response = query_llm_for_scenario(prompt, scenario, session['history'], max_tokens=160)
        log_request(user_id, "LLM response", llm_response)
        add_to_history(session, 'assistant', llm_response)
    except Exception as e:
        logger.error(f"[{user_id}] LLM Fehler: {str(e)[:100]}")
        llm_response = "Désolé, je ne peux pas répondre maintenant."
        add_to_history(session, 'assistant', llm_response)

    # TTS nur wenn erfolgreich
    # KORREKTUR: Entpacke user_dir_path und user_dir_name
    user_dir_path, user_dir_name = get_user_temp_dir(user_id, TEMP_AUDIO_DIR_ROOT) 
    
    audio_url = None
    timestamp_for_filename = int(time.time())
    output_filename = f"llm_{timestamp_for_filename}.mp3"
    output_path = os.path.join(user_dir_path, output_filename)
    
    if safe_synthesize_tts(llm_response, output_path, user_id): # Nutze user_id für TTS-Logging
        #  URL-Konstruktion, die user_dir_name beinhaltet
        audio_url = f"/temp_audio/{user_dir_name}/{output_filename}"
        log_request(user_id, "TTS success", {'url': audio_url}) # Nutze user_id für Logging
    else:
        log_request(user_id, "TTS failed", {'response_text': llm_response[:50]}) # Nutze user_id für Logging

    return {'response': llm_response, 'audio_url': audio_url}

# === API-Routen ===

@app.route('/api/start_conversation', methods=['POST'])
def start_conversation():
    data = request.get_json()
    scenario = data.get('scenario', 'libre')
    user_id = data.get('userId')
    force_reset = data.get('force_reset', True)

    if not user_id:
        logger.error("User ID fehlt in Start Conversation Request.")
        return jsonify({'error': 'User ID erforderlich'}), 400

    # KORREKTUR: Entpacke user_dir_path und user_dir_name
    user_dir_path, user_dir_name = get_user_temp_dir(user_id, TEMP_AUDIO_DIR_ROOT)
    # Nutze user_id direkt für die Session und Logging
    # user_id bleibt die saubere ID vom Frontend

    # Initialisiere Session
    session = user_sessions.setdefault(user_id, {'history': [], 'scenario': scenario, 'created_at': datetime.now()})

    if force_reset:
        session['history'] = []
        session['scenario'] = scenario
        logger.info(f"[{user_id}] Konversationshistorie und Szenario zurückgesetzt auf '{scenario}'.")

    #from llm_agent_mistral import get_initial_llm_response_for_scenario, get_scenario_system_prompt

    try:
        logger.info(f"[{user_id}] Anforderung der ersten inhaltlichen LLM-Antwort für Szenario '{scenario}'.")
        llm_initial_response_data = get_initial_llm_response_for_scenario(scenario, user_id)
        llm_initial_response_text = llm_initial_response_data.get('response', 'Bonjour !') # Sicherstellen, dass Text vorhanden ist
        
        logger.info(f"[{user_id}] Erhaltene erste LLM-Antwort (Anfang): '{llm_initial_response_text[:100]}...'")
        add_to_history(session, 'assistant', llm_initial_response_text)
        
        audio_url = None
        timestamp_for_filename = int(time.time())
        output_filename = f"llm_initial_{timestamp_for_filename}.mp3"
        output_path = os.path.join(user_dir_path, output_filename)

        logger.info(f"[{user_id}] Versuche, TTS für initiale Antwort zu generieren.")
        if safe_synthesize_tts(llm_initial_response_text, output_path, user_id):
            # KORREKTUR: URL-Konstruktion mit user_dir_name
            audio_url = f"/temp_audio/{user_dir_name}/{output_filename}"
            logger.info(f"[{user_id}] TTS für initiale Antwort erfolgreich: {audio_url}")
        else:
            logger.warning(f"[{user_id}] TTS für initiale Antwort fehlgeschlagen.")

        return jsonify({'response': llm_initial_response_text, 'audioUrl': audio_url, 'scenario': scenario, 'userId': user_id})

    except Exception as e:
        logger.critical(f"[{user_id}] KRITISCHER FEHLER beim Starten der Konversation: {str(e)}", exc_info=True)
        return jsonify({'error': f'Interner Serverfehler beim Starten der Konversation.'}), 500


@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    message = data.get('message', '').strip()
    user_id = data.get('userId')
    scenario = data.get('scenario', 'libre')

    if not message or not user_id:
        return jsonify({'error': 'Message und User ID erforderlich'}), 400

    result = generate_llm_and_tts_response(user_id, scenario, prompt=message, is_user_message=True)
    if result.get('audio_url'):
        try:
            # Nutze app.test_client().post, um den /api/delete-audio Endpunkt zu triggern
            app.test_client().post('/api/delete-audio', json={'userId': user_id})
        except Exception as e:
            logger.warning(f"[{user_id}] Fehler bei Audio-Bereinigung nach Antwort: {e}")
            
    return jsonify(result)

@app.route('/api/delete-audio', methods=['POST'])
def delete_audio():
    data = request.get_json()
    user_id = data.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID erforderlich'}), 400

    # KORREKTUR: Entpacke user_dir_path und user_dir_name
    user_dir_path, user_dir_name = get_user_temp_dir(user_id, TEMP_AUDIO_DIR_ROOT)

    deleted = []
    MAX_LLM_FILES = 2
    MAX_RECORDING_FILES = 2

    if not os.path.exists(user_dir_path):
        return jsonify({'deleted': deleted})

    all_files = os.listdir(user_dir_path)

    llm_files = sorted([f for f in all_files if f.startswith("llm")], key=lambda f: os.path.getmtime(os.path.join(user_dir_path, f)))
    for f in llm_files[:-MAX_LLM_FILES]:
        try:
            os.remove(os.path.join(user_dir_path, f))
            deleted.append(f)
        except Exception as e:
            logger.warning(f"[{user_id}] Fehler beim Löschen von {f}: {e}") # Nutze user_id für Logging

    recording_files = sorted([f for f in all_files if f.startswith("recording")], key=lambda f: os.path.getmtime(os.path.join(user_dir_path, f)))
    for f in recording_files[:-MAX_RECORDING_FILES]:
        try:
            os.remove(os.path.join(user_dir_path, f))
            deleted.append(f)
        except Exception as e:
            logger.warning(f"[{user_id}] Fehler beim Löschen von {f}: {e}") # Nutze user_id für Logging

    return jsonify({'deleted': deleted})

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        logger.error("Keine Audiodatei empfangen in Transcribe Request.")
        return jsonify({'error': 'Keine Audiodateie empfangen'}), 400

    user_id = request.form.get('user_id')
    if not user_id:
        logger.error("User ID fehlt in Transcribe Request.")
        return jsonify({'error': 'User ID erforderlich'}), 400

    audio_file = request.files['audio']
    # KORREKTUR: Entpacke user_dir_path und user_dir_name
    user_dir_path, user_dir_name = get_user_temp_dir(user_id, TEMP_AUDIO_DIR_ROOT) 

    timestamp_for_filename = int(time.time())
    ext = os.path.splitext(audio_file.filename)[1] or '.webm'
    filename = f"user_recording_{timestamp_for_filename}{ext}"
    path = os.path.join(user_dir_path, filename)
    
    audio_file.save(path)
    logger.info(f"[{user_id}] Aufnahme gespeichert: {filename} im Pfad: {user_dir_path}") # Nutze user_id für Logging

    transcription_text = ""
    try:
        # --- HIER MÜSSEN SIE IHRE EIGENTLICHE TRANSKRIPTIONSLOGIK EINFÜGEN ---
        transcription_text = "Platzhalter Transkription: Bitte implementieren Sie Ihre STT-Logik hier." 
        # ---------------------------------------------------------------------
        
        logger.info(f"[{user_id}] Transkription erfolgreich (Platzhalter): {transcription_text[:50]}...") # Nutze user_id für Logging
        log_request(user_id, 'Transkription erfolgreich', {'text': transcription_text[:50]}) # Nutze user_id für Logging

    except Exception as e:
        logger.critical(f"[{user_id}] KRITISCHER FEHLER bei Transkription: {str(e)}", exc_info=True) # Nutze user_id für Logging
        transcription_text = "Fehler bei der Transkription." 

    # KORREKTUR: URL-Konstruktion mit user_dir_name
    audio_url_path = f"{user_dir_name}/{filename}"

    return jsonify({
        'message': 'Audio gespeichert und transkribiert.',
        'user_id': user_dir_name, # Sende den Verzeichnisnamen als user_id zurück
        'audio_path': f"/temp_audio/{audio_url_path}",
        'transcription': transcription_text
    })

@app.route('/api/reset_session', methods=['POST'])
def reset_session():
    data = request.get_json()
    user_id = data.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID erforderlich'}), 400
        
    if user_id in user_sessions:
        del user_sessions[user_id]
        logger.info(f"[{user_id}] Session zurückgesetzt.")
    return jsonify({'status': 'Session reset'})

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'active_sessions': len(user_sessions),
        'tts_provider': ACTIVE_TTS_PROVIDER,
        'memory_usage': f"{len(str(user_sessions))} chars"  # Grobe Schätzung
    })

@app.route('/temp_audio/<path:filename>')
def serve_temp_audio(filename):
    full_path = os.path.join(TEMP_AUDIO_DIR_ROOT, filename)
    if not os.path.exists(full_path):
        logger.warning(f"404: Datei nicht gefunden: {full_path}")
        abort(404)
    return send_from_directory(TEMP_AUDIO_DIR_ROOT, filename)

# === KORRIGIERTE ROUTEN FÜR STATISCHE DATEIEN ===

# Spezifische Route für statische Dateien im static Ordner
@app.route('/static/<path:filename>')
def static_files(filename):
    """Serviert Dateien aus dem static Ordner"""
    static_dir = os.path.join(app.static_folder, 'static')
    if os.path.exists(os.path.join(static_dir, filename)):
        return send_from_directory(static_dir, filename)
    abort(404)

# Root Route für index.html
@app.route('/')
def index():
    """Serviert die index.html Datei"""
    return send_from_directory(app.static_folder, 'index.html')

# Catch-all Route für SPA (Single Page Application)
@app.route('/<path:path>')
def catch_all(path):
    """Catch-all Route für SPA Routing"""
    # Prüfe zuerst, ob es eine echte Datei ist
    file_path = os.path.join(app.static_folder, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(app.static_folder, path)
    
    # Ansonsten serviere index.html für SPA Routing
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # Für Render deployment optimiert
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=True)