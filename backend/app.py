# backend/app.py
from flask import Flask, request, jsonify, send_from_directory, abort # <-- GEÄNDERT: 'abort' hier importieren
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
    logger = logging.getLogger(__name__)
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
    logger.info("Aktiver TTS-Anbieter: Amazon Polly TTS")
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

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Logging konfigurieren
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# GEÄNDERT: Bestimme das Projekt-Root-Verzeichnis (eine Ebene über dem 'backend'-Ordner)
PROJECT_ROOT = os.path.dirname(app.root_path)
# GEÄNDERT: Dies ist der Basisordner, in dem ALLE temporären Audio-Dateien gespeichert werden
TEMP_AUDIO_DIR_ROOT = os.path.join(PROJECT_ROOT, 'temp_audio')
os.makedirs(TEMP_AUDIO_DIR_ROOT, exist_ok=True) # GEÄNDERT: Stelle sicher, dass der Ordner existiert

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    # GEÄNDERT: Diese Route sollte ausschließlich für statische Frontend-Dateien sein (z.B. CSS, JS, Bilder)
    # Temporäre Audio-Dateien werden von der neuen 'serve_temp_audio'-Route serviert.
    # Entfernen Sie hier jeden Aufruf zu serve_temp_audio, falls vorhanden.
    return send_from_directory(app.static_folder, path)

# === NEUE Route zum Servieren temporärer Audio-Dateien ===
# GEÄNDERT: Diese Route fängt Anfragen wie /temp_audio/intro_.../response.mp3 ab
@app.route('/temp_audio/<path:filename>')
def serve_temp_audio(filename):
    full_audio_path = os.path.join(TEMP_AUDIO_DIR_ROOT, filename)
    logger.info(f"Versuche, temporäre Audio-Datei zu servieren: {full_audio_path}")

    if not os.path.exists(full_audio_path):
        logger.error(f"Audio-Datei nicht gefunden: {full_audio_path}")
        abort(404) # GEÄNDERT: 'abort' ist jetzt importiert

    try:
        # send_from_directory benötigt das Basisverzeichnis (TEMP_AUDIO_DIR_ROOT)
        # und den relativen Pfad der Datei (filename) innerhalb dieses Basisverzeichnisses.
        return send_from_directory(TEMP_AUDIO_DIR_ROOT, filename)
    except Exception as e:
        logger.error(f"Fehler beim Servieren der Audio-Datei {filename}: {str(e)}")
        abort(500) # GEÄNDERT: 'abort' ist jetzt importiert


# === Transkription (Vosk für später) ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    # GEÄNDERT: `get_user_temp_dir` sollte jetzt wissen, dass es innerhalb von `TEMP_AUDIO_DIR_ROOT` arbeiten soll.
    temp_path_for_stt, user_id = get_user_temp_dir(base_dir=TEMP_AUDIO_DIR_ROOT)
    audio_path = os.path.join(temp_path_for_stt, "audio_input.wav")

    try:
        request.files['audio'].save(audio_path)

        # TEMPORÄR: Dummy-Antwort für STT, bis Vosk implementiert ist
        dummy_transcript = "Ceci est une transcription de test."
        logger.info(f"Dummy Transkription für User {user_id}: {dummy_transcript}")

        return jsonify({'transcript': dummy_transcript})

    except Exception as e:
        logger.error(f"Fehler bei der Audio-Transkription für User {user_id}: {str(e)}")
        return jsonify({'error': f'Fehler bei der Transkription: {str(e)}'}), 500


@app.route('/api/respond', methods=['POST'])
def respond():
    user_message = request.json.get('message')
    user_id = request.json.get('userId')
    scenario = request.json.get('scenario') # Szenario-Info erhalten

    if not user_message:
        return jsonify({'error': 'Nachricht fehlt'}), 400

    # GEÄNDERT: `temp_path_absolute` ist der vollständige Pfad zum temporären Ordner des Benutzers.
    # `get_user_temp_dir` muss sicherstellen, dass dieser Pfad unter `TEMP_AUDIO_DIR_ROOT` liegt.
    temp_path_absolute, user_id = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
    output_filename = "response.mp3"
    output_path_absolute = os.path.join(temp_path_absolute, output_filename)

    # GEÄNDERT: Der relative Pfad, der in der URL verwendet wird.
    # Dieser muss relativ zum `TEMP_AUDIO_DIR_ROOT` sein, damit die `serve_temp_audio`-Route funktioniert.
    # Beispiel: Wenn output_path_absolute = '/project/root/temp_audio/intro_123/user_abc/response.mp3'
    # Dann output_path_relative = 'intro_123/user_abc/response.mp3'
    output_path_relative = os.path.relpath(output_path_absolute, start=TEMP_AUDIO_DIR_ROOT)


    llm_response = ""
    audio_url = None
    tts_error = None

    try:
        logger.info(f"Anfrage an LLM für User {user_id} mit Nachricht: {user_message[:50]}...")
        if scenario:
            logger.info(f"Szenario für LLM: {scenario}")
            llm_response = query_llm_for_scenario(user_message, scenario)
        else:
            llm_response = query_llm_mistral(user_message)

        logger.info(f"LLM-Antwort für User {user_id}: {llm_response[:50]}...")

        # Text-to-Speech (TTS)
        logger.info(f"Starte TTS-Synthese für User {user_id} mit {ACTIVE_TTS_PROVIDER}...")

        try:
            if ACTIVE_TTS_PROVIDER == "GOOGLE":
                # synthesize_speech_google(llm_response, output_path_absolute)
                pass
            elif ACTIVE_TTS_PROVIDER == "MINIMAX":
                # synthesize_speech_minimax(llm_response, output_path_absolute)
                pass
            elif ACTIVE_TTS_PROVIDER == "OPENAI":
                # synthesize_speech_openai(llm_response, output_path_absolute)
                pass
            elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
                synthesize_speech_amzpolly(llm_response, output_path_absolute)
            else:
                raise Exception(f"Ungültiger TTS-Anbieter konfiguriert: {ACTIVE_TTS_PROVIDER}")

            if os.path.exists(output_path_absolute) and os.path.getsize(output_path_absolute) > 0:
                audio_url = f"/temp_audio/{output_path_relative.replace(os.sep, '/')}" # <-- GEÄNDERT: Neue URL-Struktur
                logger.info(f"TTS erfolgreich für User {user_id} mit {ACTIVE_TTS_PROVIDER}. Audio-URL: {audio_url}")
            else:
                tts_error = "TTS-Ausgabe ist leer oder konnte nicht gespeichert werden."

        except Exception as e:
            logger.error(f"{ACTIVE_TTS_PROVIDER} TTS fehlgeschlagen für User {user_id}: {str(e)}")
            tts_error = str(e)

        # Cleanup (aber behalte die Audio-Datei)
        if audio_url:
            cleanup_temp_dir(temp_path_absolute, exclude_file=output_path_absolute)

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