# backend/app.py
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
import os
import requests
import logging

# =========================================================
# TTS KONFIGURATION: Wählen Sie hier Ihren aktiven TTS-Anbieter
# Mögliche Werte: "GOOGLE", "MINIMAX", "OPENAI", "AMAZON_POLLY"
ACTIVE_TTS_PROVIDER = "AMAZON_POLLY" # <--- HIER KÖNNEN SIE DEN ANBIETER WECHSELN
# =========================================================

# Aktive Imports basierend auf der Konfiguration
from llm_agent_mistral import query_llm_mistral, query_llm_for_scenario
from utils import get_user_temp_dir, cleanup_temp_dir

# Bedingte TTS-Importe
if ACTIVE_TTS_PROVIDER == "GOOGLE":
    from tts_google import synthesize_speech_google
    logger = logging.getLogger(__name__) # Logger neu initialisieren, falls vorheriger Import ihn überschreibt
    logger.info("Aktiver TTS-Anbieter: Google Cloud Text-to-Speech")
elif ACTIVE_TTS_PROVIDER == "MINIMAX":
    from tts_minimax import synthesize_speech_minimax
    logger = logging.getLogger(__name__)
    logger.info("Aktiver TTS-Anbieter: Minimax TTS")
elif ACTIVE_TTS_PROVIDER == "OPENAI": 
    from tts_openai import synthesize_speech_openai
    logger = logging.getLogger(__name__)
    logger.info("Aktiver TTS-Anbieter: OpenAI TTS")
elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
    from tts_amzpolly import synthesize_speech_amzpolly
    logger = logging.getLogger(__name__)
    logger.info("Aktiver TTS-Anbieter: Amazon Polly")
else:
    logger = logging.getLogger(__name__)
    logger.error(f"Unbekannter TTS_PROVIDER: {ACTIVE_TTS_PROVIDER}. Keine TTS-Synthese wird ausgeführt.")
    # Fallback, wenn ein unbekannter Anbieter konfiguriert ist
    def dummy_synthesize_speech(text, output_path):
        raise NotImplementedError(f"Kein gültiger TTS-Anbieter konfiguriert: {ACTIVE_TTS_PROVIDER}.")
    synthesize_speech_google = dummy_synthesize_speech
    synthesize_speech_minimax = dummy_synthesize_speech
    synthesize_speech_openai = dummy_synthesize_speech 
    synthesize_speech_amzpolly = dummy_synthesize_speech

# Fallback Imports (für späteren Einsatz, auskommentiert)
# from vosk_stt import transcribe_audio
# from tts_tacotron import synthesize_speech as synthesize_tacotron

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Logging konfigurieren
# Dies sollte nach allen anderen möglichen Logger-Initialisierungen erfolgen
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__) # Sicherstellen, dass der Logger nach der Konfiguration korrekt ist

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    # Spezielle Behandlung für Audio-Dateien
    if path.startswith('temp_') and path.endswith('.mp3'):
        return serve_temp_audio(path)
    return send_from_directory(app.static_folder, path)

# === Audio-Serving Route ===
@app.route('/temp_audio/<path:filepath>')
def serve_temp_audio(filepath):
    """Serviert temporäre Audio-Dateien"""
    try:
        # Basis-Pfad für temp-Dateien - KORRIGIERT
        # Wir arbeiten vom aktuellen Verzeichnis aus, nicht vom static_folder
        temp_audio_base = os.getcwd()
        full_path = os.path.join(temp_audio_base, filepath)
        
        logger.info(f"Suche Audio-Datei: {full_path}")
        
        # Sicherheitscheck: Datei muss existieren und im erlaubten Bereich sein
        if not os.path.exists(full_path):
            logger.error(f"Audio-Datei nicht gefunden: {full_path}")
            # Versuche auch im Backend-Verzeichnis
            backend_path = os.path.join(os.path.dirname(__file__), filepath)
            logger.info(f"Versuche Backend-Pfad: {backend_path}")
            if os.path.exists(backend_path):
                full_path = backend_path
            else:
                abort(404)
        
        # Verzeichnis und Dateiname extrahieren
        directory = os.path.dirname(full_path)
        filename = os.path.basename(full_path)
        
        logger.info(f"Serving audio file: {full_path}")
        return send_from_directory(directory, filename, mimetype='audio/mpeg')
        
    except Exception as e:
        logger.error(f"Fehler beim Servieren der Audio-Datei {filepath}: {str(e)}")
        abort(404)


# === Transkription (Vosk für später) ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    temp_path, user_id = get_user_temp_dir()
    audio_path = os.path.join(temp_path, "audio_input.wav")
    
    try:
        request.files['audio'].save(audio_path)
        
        # TEMPORÄR: Dummy-Antwort oder tatsächliche Transkription, wenn Vosk aktiv ist
        # Falls Sie Vosk aktivieren möchten:
        # from vosk_stt import transcribe_audio
        # transcribed_text = transcribe_audio(audio_path)
        # return jsonify({'transcribed_text': transcribed_text})

        return jsonify({'text': 'Dies ist ein Platzhalter für Ihre Transkription.'})
        
    except Exception as e:
        logger.error(f"Fehler bei der Transkription: {str(e)}")
        return jsonify({'error': f'Fehler bei der Transkription: {str(e)}'}), 500

# === LLM Response & TTS ===
@app.route('/api/respond', methods=['POST'])
def respond():
    # Sowohl 'message' als auch 'text' unterstützen für Kompatibilität
    request_data = request.get_json()
    if not request_data:
        return jsonify({'error': 'Keine JSON-Daten empfangen'}), 400
    
    user_message = request_data.get('message') or request_data.get('text')
    user_id = request_data.get('userId') or request_data.get('user_id')
    
    if not user_message:
        logger.error(f"Keine Nachricht erhalten. Request data: {request_data}")
        return jsonify({'error': 'Nachricht fehlt'}), 400

    temp_path, user_id = get_user_temp_dir(user_id) # Sicherstellen, dass temp_path für user_id erstellt wird
    output_path = os.path.join(temp_path, "response.mp3")
    
    llm_response = ""
    audio_url = None
    tts_error = None

    try:
        logger.info(f"Anfrage an LLM für User {user_id} mit Nachricht: {user_message[:50]}...")
        llm_response = query_llm_for_scenario(user_message, scenario="restaurant", max_tokens=120)
        logger.info(f"LLM-Antwort für User {user_id}: {llm_response[:50]}...")
        
        # Text-to-Speech (TTS)
        logger.info(f"Starte TTS-Synthese für User {user_id}...")
        
        try:
            if ACTIVE_TTS_PROVIDER == "GOOGLE":
                synthesize_speech_google(llm_response, output_path)
            elif ACTIVE_TTS_PROVIDER == "MINIMAX":
                synthesize_speech_minimax(llm_response, output_path)
            elif ACTIVE_TTS_PROVIDER == "OPENAI": 
                synthesize_speech_openai(llm_response, output_path)
            elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
                synthesize_speech_amzpolly(llm_response, output_path)
            else:
                raise Exception(f"Ungültiger TTS-Anbieter konfiguriert: {ACTIVE_TTS_PROVIDER}")
            
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                # KORRIGIERTE URL-Generierung
                # Relativer Pfad vom aktuellen Arbeitsverzeichnis aus
                relative_path = os.path.relpath(output_path, os.getcwd())
                audio_url = f"/temp_audio/{relative_path.replace(os.sep, '/')}"
                logger.info(f"TTS erfolgreich für User {user_id} mit {ACTIVE_TTS_PROVIDER}")
                logger.info(f"Audio URL: {audio_url}")
                logger.info(f"Vollständiger Pfad: {output_path}")
                logger.info(f"Relativer Pfad: {relative_path}")
            else:
                tts_error = "TTS-Ausgabe ist leer oder konnte nicht gespeichert werden."

        except Exception as e:
            logger.error(f"{ACTIVE_TTS_PROVIDER} TTS fehlgeschlagen für User {user_id}: {str(e)}")
            tts_error = str(e)
            
            # --- Hier der Tacotron Fallback (auskommentiert) ---
            # Wenn der primäre TTS-Anbieter fehlschlägt, versuchen Sie Tacotron als Fallback
            # from tts_tacotron import synthesize_speech as synthesize_tacotron
            # logger.warning(f"{ACTIVE_TTS_PROVIDER} fehlgeschlagen, versuche Tacotron-Fallback für User {user_id}...")
            # try:
            #     fallback_output_path = os.path.join(temp_path, "response_fallback.mp3") # Separater Pfad für Fallback
            #     synthesize_tacotron(llm_response, fallback_output_path)
            #     if os.path.exists(fallback_output_path) and os.path.getsize(fallback_output_path) > 0:
            #         audio_url = f"/{fallback_output_path.replace(os.sep, '/')}"
            #         logger.info(f"Tacotron Fallback erfolgreich für User {user_id}")
            #         tts_error = None # Fehler zurücksetzen, da Fallback erfolgreich war
            # except Exception as fallback_e:
            #     logger.error(f"Tacotron-Fallback fehlgeschlagen für User {user_id}: {str(fallback_e)}")
            #     tts_error = f"{ACTIVE_TTS_PROVIDER}: {str(e)}, Tacotron: {str(fallback_e)}"

        # Cleanup (aber behalte die Audio-Datei)
        if audio_url:
            cleanup_temp_dir(temp_path, exclude_file=output_path)
        
        response_data = {
            "response": llm_response,
            "audio_url": audio_url
        }
        
        if tts_error:
            response_data["tts_error"] = tts_error
            
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Allgemeiner Fehler in /api/respond: {str(e)}")
        return jsonify({
            'error': f'Serverfehler: {str(e)}',
            'response': 'Excusez-moi, il y a eu un problème technique.'
        }), 500

# === Health Check für Render ===
@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'service': 'FR-AI-Tutor'}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=os.getenv('PORT', 5000))