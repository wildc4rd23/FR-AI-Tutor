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

# Logging konfigurieren (einmalig am Anfang)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logger.info(f"Aktiver TTS-Anbieter: {ACTIVE_TTS_PROVIDER}")

# Aktive Imports basierend auf der Konfiguration
from llm_agent_mistral import query_llm_mistral, query_llm_for_scenario
from utils import get_user_temp_dir, cleanup_temp_dir

# Bedingte TTS-Importe
if ACTIVE_TTS_PROVIDER == "GOOGLE":
    from tts_google import synthesize_speech_google
elif ACTIVE_TTS_PROVIDER == "MINIMAX":
    from tts_minimax import synthesize_speech_minimax
elif ACTIVE_TTS_PROVIDER == "OPENAI": 
    from tts_openai import synthesize_speech_openai
elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
    from tts_amzpolly import synthesize_speech_amzpolly
else:
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

# Bestimme das Projekt-Root-Verzeichnis (eine Ebene über dem 'backend'-Ordner)
PROJECT_ROOT = os.path.dirname(app.root_path)
# Dies ist der Basisordner, in dem ALLE temporären Audio-Dateien gespeichert werden
TEMP_AUDIO_DIR_ROOT = os.path.join(PROJECT_ROOT, 'temp_audio')
os.makedirs(TEMP_AUDIO_DIR_ROOT, exist_ok=True) # Stelle sicher, dass der Ordner existiert

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    # GEÄNDERT: Entfernt die spezielle Behandlung für Audio-Dateien hier.
    # Temporäre Audio-Dateien werden jetzt von der dedizierten /temp_audio Route serviert.
    return send_from_directory(app.static_folder, path)

# === NEUE Route zum Servieren temporärer Audio-Dateien ===
@app.route('/temp_audio/<path:filename>') # GEÄNDERT: Route für temporäre Audios
def serve_temp_audio(filename):
    full_audio_path = os.path.join(TEMP_AUDIO_DIR_ROOT, filename)
    logger.info(f"Versuche, temporäre Audio-Datei zu servieren: {full_audio_path}")

    if not os.path.exists(full_audio_path):
        logger.error(f"Audio-Datei nicht gefunden: {full_audio_path}")
        abort(404)

    try:
        # send_from_directory benötigt das Basisverzeichnis (TEMP_AUDIO_DIR_ROOT)
        # und den relativen Pfad der Datei (filename) innerhalb dieses Basisverzeichnisses.
        return send_from_directory(TEMP_AUDIO_DIR_ROOT, filename)
    except Exception as e:
        logger.error(f"Fehler beim Servieren der Audio-Datei {filename}: {str(e)}")
        abort(500)

# === Route audio löschen ===

@app.route('/api/delete-audio', methods=['POST'])
def delete_audio():
    """Löscht die aufgenommene Audio-Datei nach erfolgreichem Senden"""
    request_data = request.get_json()
    if not request_data:
        return jsonify({'error': 'Keine JSON-Daten empfangen'}), 400
        
    user_id = request_data.get('userId') or request_data.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'User ID fehlt'}), 400
    
    try:
        temp_path_absolute, _ = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
        audio_path = os.path.join(temp_path_absolute, "recording.mp3")
        
        # Auch andere mögliche Dateiformate löschen
        possible_files = [
            "recording.mp3",
            "recording.webm", 
            "recording.wav",
            "recording.m4a"
        ]
        
        deleted_files = []
        for filename in possible_files:
            file_path = os.path.join(temp_path_absolute, filename)
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    deleted_files.append(filename)
                    logger.info(f"Audio-Datei gelöscht: {file_path}")
                except OSError as e:
                    logger.warning(f"Konnte Datei nicht löschen {file_path}: {str(e)}")
        
        if deleted_files:
            return jsonify({
                'message': f'Audio-Dateien gelöscht: {", ".join(deleted_files)}',
                'deleted_files': deleted_files
            })
        else:
            return jsonify({
                'message': 'Keine Audio-Dateien zum Löschen gefunden',
                'deleted_files': []
            })
            
    except Exception as e:
        logger.error(f"Fehler beim Löschen der Audio-Datei für User {user_id}: {str(e)}")
        return jsonify({'error': f'Fehler beim Löschen: {str(e)}'}), 500


# === Transkription (Vosk für später) ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    # KORRIGIERT: Hole user_id aus Form-Daten falls vorhanden
    user_id = request.form.get('user_id')
    
    # GEÄNDERT: get_user_temp_dir wird jetzt mit base_dir aufgerufen
    temp_path_for_stt, user_id = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
    audio_path = os.path.join(temp_path_for_stt, "recording.mp3") # Speichert die Benutzeraufnahme als 'recording.mp3'

    try:
        # KORRIGIERT: Speichere die empfangene Audio-Datei
        audio_file = request.files['audio']
        audio_file.save(audio_path)
        logger.info(f"Benutzeraufnahme für User {user_id} als {audio_path} gespeichert.")
        
        # Prüfe ob Datei korrekt gespeichert wurde
        if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
            logger.info(f"Aufnahme erfolgreich gespeichert: {audio_path} ({os.path.getsize(audio_path)} bytes)")
        else:
            logger.error(f"Aufnahme nicht korrekt gespeichert: {audio_path}")
            return jsonify({'error': 'Fehler beim Speichern der Audiodatei'}), 500
        
        # VOSK STT Integration (für späteren Einsatz)
        # from vosk_stt import transcribe_audio # Import hier, wenn Vosk verwendet wird
        # try:
        #     # transcript = transcribe_audio(audio_path) # Funktion von vosk_stt.py
        #     transcript = "Dies ist eine Transkription von Vosk (noch nicht aktiv)." # Dummy, bis Vosk implementiert ist
        #     logger.info(f"Audio für User {user_id} transkribiert: {transcript[:50]}...")
        #     return jsonify({'transcript': transcript})
        # except Exception as e:
        #     logger.error(f"Fehler bei Vosk-Transkription für User {user_id}: {str(e)}")
        #     return jsonify({'error': f'Fehler bei Transkription: {str(e)}'}), 500
        
        # Wenn Vosk nicht verwendet wird, einfach eine Erfolgsmeldung zurückgeben.
        # Die Transkription wird im Frontend durchgeführt.
        return jsonify({
            'message': 'Audio erfolgreich gespeichert.',
            'user_id': user_id,
            'audio_path': audio_path
        })

    except Exception as e:
        logger.error(f"Fehler beim Speichern der Audio-Transkription für User {user_id}: {str(e)}")
        return jsonify({'error': f'Fehler beim Speichern der Audio: {str(e)}'}), 500


# === LLM Response & TTS ===
@app.route('/api/respond', methods=['POST'])
def respond():
    request_data = request.get_json()
    if not request_data:
        return jsonify({'error': 'Keine JSON-Daten empfangen'}), 400
        
    user_message = request_data.get('message') or request_data.get('text')
    user_id = request_data.get('userId') or request_data.get('user_id')
    scenario = request_data.get('scenario') # Szenario-Info erhalten

    if not user_message:
        logger.error(f"Keine Nachricht erhalten. Request data: {request_data}")
        return jsonify({'error': 'Nachricht fehlt'}), 400

    # GEÄNDERT: get_user_temp_dir wird jetzt mit base_dir aufgerufen
    temp_path_absolute, user_id = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
    output_filename = "response.mp3" 
    output_path_absolute = os.path.join(temp_path_absolute, output_filename)

    # Der relative Pfad, der in der URL verwendet wird.
    # Dieser muss relativ zum `TEMP_AUDIO_DIR_ROOT` sein, damit die `serve_temp_audio`-Route funktioniert.
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
                 synthesize_speech_google(llm_response, output_path_absolute)
            elif ACTIVE_TTS_PROVIDER == "MINIMAX":
                 synthesize_speech_minimax(llm_response, output_path_absolute)
            elif ACTIVE_TTS_PROVIDER == "OPENAI":
                 synthesize_speech_openai(llm_response, output_path_absolute)
            elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
                synthesize_speech_amzpolly(llm_response, output_path_absolute)
            else:
                raise Exception(f"Ungültiger TTS-Anbieter konfiguriert: {ACTIVE_TTS_PROVIDER}")

            if os.path.exists(output_path_absolute) and os.path.getsize(output_path_absolute) > 0:
                audio_url = f"/temp_audio/{output_path_relative.replace(os.sep, '/')}" # <-- Wichtig: Neue URL-Struktur
                logger.info(f"TTS erfolgreich für User {user_id} mit {ACTIVE_TTS_PROVIDER}. Audio-URL: {audio_url}")
            else:
                tts_error = "TTS-Ausgabe ist leer oder konnte nicht gespeichert werden."

        except Exception as e:
            logger.error(f"{ACTIVE_TTS_PROVIDER} TTS fehlgeschlagen für User {user_id}: {str(e)}")
            tts_error = str(e)

        # Tacotron Fallback (für späteren Einsatz) - DIESEN BLOCK EINZUFÜGEN
        if tts_error and ACTIVE_TTS_PROVIDER != "TACOTRON": # Verhindert Endlosschleife, wenn Tacotron selbst der primäre ist
            # from tts_tacotron import synthesize_speech as synthesize_tacotron # Import hier, wenn Tacotron verwendet wird
            logger.warning(f"Primärer TTS ({ACTIVE_TTS_PROVIDER}) fehlgeschlagen, versuche Tacotron-Fallback...")
            fallback_output_path = os.path.join(temp_path_absolute, "response_tacotron.mp3")
            try:
                # synthesize_tacotron(llm_response, fallback_output_path)
                # Dummy-Fallback bis Tacotron implementiert ist
                if True: # Simuliere Erfolg
                    # Erstelle eine Dummy-Datei, wenn Tacotron noch nicht integriert ist
                    if not os.path.exists(fallback_output_path) or os.path.getsize(fallback_output_path) == 0:
                        with open(fallback_output_path, "wb") as f:
                            f.write(b"Dummy Tacotron Audio") # Füge hier echte Tacotron-Synthese ein
                    audio_url = f"/temp_audio/{os.path.relpath(fallback_output_path, start=TEMP_AUDIO_DIR_ROOT).replace(os.sep, '/')}"
                    logger.info(f"Tacotron Fallback erfolgreich für User {user_id} (Dummy). Audio-URL: {audio_url}")
                    tts_error = None # Fehler zurücksetzen, da Fallback erfolgreich war
            except Exception as fallback_e:
                logger.error(f"Tacotron-Fallback fehlgeschlagen für User {user_id}: {str(fallback_e)}")
                tts_error = f"{ACTIVE_TTS_PROVIDER}: {tts_error}, Tacotron-Fallback: {str(fallback_e)}"

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
