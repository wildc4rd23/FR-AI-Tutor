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

# Setup
app = Flask(__name__, static_folder='../frontend')
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

# === LLM & Hilfsmodule ===
from llm_agent_mistral import query_llm_for_scenario, get_scenario_starter
from utils import get_user_temp_dir, log_request, add_to_history#, cleanup_temp_dir
#from vosk_stt import transcribe_audio #momentan nicht verwendet

# === Dummy-TTS (nur Fallback) ===
def dummy_synthesize_tts(text, output_path):
    logger.warning("Dummy TTS wird verwendet.")
    with open(output_path, "wb") as f:
        f.write(b"Dummy Audio")

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
        synthesize_tts = dummy_synthesize_tts
except ImportError:
    synthesize_tts = dummy_synthesize_tts

# === Session-Speicher ===
user_sessions = {}
PROJECT_ROOT = os.path.dirname(app.root_path)
TEMP_AUDIO_DIR_ROOT = os.path.join(PROJECT_ROOT, 'temp_audio')
os.makedirs(TEMP_AUDIO_DIR_ROOT, exist_ok=True)

# === Hilfsfunktionen: ===

def safe_synthesize_tts(text, output_path, max_retries=2):
    """TTS mit begrenzten Wiederholungsversuchen"""
    for attempt in range(max_retries):
        try:
            synthesize_tts(text, output_path)
            return True
        except Exception as e:
            logger.warning(f"TTS Versuch {attempt + 1} fehlgeschlagen: {str(e)[:100]}")
            if attempt == max_retries - 1:
                # Letzter Versuch - erstelle Dummy-Datei
                with open(output_path, "wb") as f:
                    f.write(b"Dummy Audio")
                return False
            time.sleep(1)  # Kurze Pause zwischen Versuchen
    return False



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
    audio_url = None
    user_dir = get_user_temp_dir(user_id)
    timestamp = int(time.time())
    output_path = os.path.join(user_dir, f"llm_{timestamp}.mp3")
    
    if safe_synthesize_tts(llm_response, output_path):
        rel = os.path.relpath(output_path, TEMP_AUDIO_DIR_ROOT)
        audio_url = f"/temp_audio/{rel.replace(os.sep, '/')}"
        log_request(user_id, "TTS success")
    else:
        log_request(user_id, "TTS failed")

    return {'response': llm_response, 'audio_url': audio_url}

# === API-Routen ===

@app.route('/api/start_conversation', methods=['POST'])
def start_conversation():
    data = request.get_json()
    scenario = data.get('scenario', 'libre')
    user_id = data.get('userId')
    force_reset = data.get('force_reset', True)

    if not user_id:
        return jsonify({'error': 'User ID erforderlich'}), 400

    session = user_sessions.setdefault(user_id, {'history': [], 'scenario': scenario, 'created_at': datetime.now()})

    if force_reset:
        session['history'] = []
        starter_text = get_scenario_starter(scenario)
        result = generate_llm_and_tts_response(user_id, scenario, starter_text, is_user_message=False)
        if result.get('audio_url'):
            try:
                app.test_client().post('/api/delete-audio', json={'userId': user_id})
            except Exception as e:
                logger.warning(f"Fehler bei Audio-Bereinigung nach Start: {e}")
        return jsonify(result)
    else:
        last = next((m['content'] for m in reversed(session['history']) if m['role'] == 'assistant'), "Bonjour !")
        return jsonify({'response': last, 'audio_url': None})

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
            app.test_client().post('/api/delete-audio', json={'userId': user_id})
        except Exception as e:
            logger.warning(f"Fehler bei Audio-Bereinigung nach Antwort: {e}")
    return jsonify(result)

@app.route('/api/delete-audio', methods=['POST'])
def delete_audio():
    data = request.get_json()
    user_id = data.get('userId')
    if not user_id:
        return jsonify({'error': 'User ID erforderlich'}), 400

    user_dir = get_user_temp_dir(user_id)
    deleted = []
    MAX_LLM_FILES = 2
    MAX_RECORDING_FILES = 2

    if not os.path.exists(user_dir):
        return jsonify({'deleted': deleted})

    all_files = os.listdir(user_dir)

    llm_files = sorted([f for f in all_files if f.startswith("llm")], key=lambda f: os.path.getmtime(os.path.join(user_dir, f)))
    for f in llm_files[:-MAX_LLM_FILES]:
        try:
            os.remove(os.path.join(user_dir, f))
            deleted.append(f)
        except Exception as e:
            logger.warning(f"Fehler beim Löschen von {f}: {e}")

    recording_files = sorted([f for f in all_files if f.startswith("recording")], key=lambda f: os.path.getmtime(os.path.join(user_dir, f)))
    for f in recording_files[:-MAX_RECORDING_FILES]:
        try:
            os.remove(os.path.join(user_dir, f))
            deleted.append(f)
        except Exception as e:
            logger.warning(f"Fehler beim Löschen von {f}: {e}")

    return jsonify({'deleted': deleted})

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    user_id = request.form.get('user_id')
    if not user_id:
        return jsonify({'error': 'User ID erforderlich'}), 400

    audio_file = request.files['audio']
    user_dir = get_user_temp_dir(user_id)

    timestamp = int(time.time())
    ext = os.path.splitext(audio_file.filename)[1] or '.webm'
    filename = f"recording_{timestamp}{ext}"
    path = os.path.join(user_dir, filename)
    
    audio_file.save(path)
    logger.info(f"[{user_id}] Aufnahme gespeichert: {filename}")

    return jsonify({
        'message': 'Audio gespeichert.',
        'user_id': user_id,
        'audio_path': f"/temp_audio/{user_id}/{filename}"
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
        abort(404)
    return send_from_directory(TEMP_AUDIO_DIR_ROOT, filename)

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    # Für Render deployment optimiert
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)