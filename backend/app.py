# backend/app.py
from flask import Flask, request, jsonify, send_from_directory, abort, url_for
from flask_cors import CORS
import os
import requests
import logging
import uuid
from datetime import datetime

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
from llm_agent_mistral import query_llm_mistral, query_llm_for_scenario, get_intro_for_scenario
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

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Session-Management für Backend-Historie
user_sessions = {}

def get_user_session(user_id):
    """Holt oder erstellt eine Benutzersession"""
    if user_id not in user_sessions:
        user_sessions[user_id] = {
            'history': [],
            'scenario': 'libre',
            'created_at': datetime.now()
        }
    return user_sessions[user_id]

# Bestimme das Projekt-Root-Verzeichnis (eine Ebene über dem 'backend'-Ordner)
PROJECT_ROOT = os.path.dirname(app.root_path)
# Dies ist der Basisordner, in dem ALLE temporären Audio-Dateien gespeichert werden
TEMP_AUDIO_DIR_ROOT = os.path.join(PROJECT_ROOT, 'temp_audio')
os.makedirs(TEMP_AUDIO_DIR_ROOT, exist_ok=True)

# Generische TTS-Funktion basierend auf dem aktiven Anbieter
def generate_tts(text, user_id, prefix="response"):
    """Generiert TTS-Audio für den gegebenen Text und User"""
    temp_path_absolute, _ = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
    output_filename = f"{prefix}.mp3"
    output_path_absolute = os.path.join(temp_path_absolute, output_filename)
    
    try:
        if ACTIVE_TTS_PROVIDER == "GOOGLE":
            synthesize_speech_google(text, output_path_absolute)
        elif ACTIVE_TTS_PROVIDER == "MINIMAX":
            synthesize_speech_minimax(text, output_path_absolute)
        elif ACTIVE_TTS_PROVIDER == "OPENAI":
            synthesize_speech_openai(text, output_path_absolute)
        elif ACTIVE_TTS_PROVIDER == "AMAZON_POLLY":
            synthesize_speech_amzpolly(text, output_path_absolute)
        else:
            raise Exception(f"Ungültiger TTS-Anbieter konfiguriert: {ACTIVE_TTS_PROVIDER}")
            
        if os.path.exists(output_path_absolute) and os.path.getsize(output_path_absolute) > 0:
            return output_path_absolute
        else:
            raise Exception("TTS-Ausgabe ist leer oder konnte nicht gespeichert werden")
            
    except Exception as e:
        logger.error(f"TTS-Fehler für User {user_id}: {str(e)}")
        
        # Tacotron Fallback (für späteren Einsatz)
        if ACTIVE_TTS_PROVIDER != "TACOTRON": # Verhindert Endlosschleife
            # from tts_tacotron import synthesize_speech as synthesize_tacotron # Import hier, wenn Tacotron verwendet wird
            logger.warning(f"Primärer TTS ({ACTIVE_TTS_PROVIDER}) fehlgeschlagen, versuche Tacotron-Fallback...")
            fallback_output_path = os.path.join(temp_path_absolute, f"{prefix}_tacotron.mp3")
            try:
                # synthesize_tacotron(text, fallback_output_path)
                # Dummy-Fallback bis Tacotron implementiert ist
                if True: # Simuliere Erfolg
                    # Erstelle eine Dummy-Datei, wenn Tacotron noch nicht integriert ist
                    if not os.path.exists(fallback_output_path) or os.path.getsize(fallback_output_path) == 0:
                        with open(fallback_output_path, "wb") as f:
                            f.write(b"Dummy Tacotron Audio") # Füge hier echte Tacotron-Synthese ein
                    logger.info(f"Tacotron Fallback erfolgreich für User {user_id} (Dummy)")
                    return fallback_output_path
            except Exception as fallback_e:
                logger.error(f"Tacotron-Fallback fehlgeschlagen für User {user_id}: {str(fallback_e)}")
                raise Exception(f"{ACTIVE_TTS_PROVIDER}: {str(e)}, Tacotron-Fallback: {str(fallback_e)}")
        
        raise e

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# === Route zum Servieren temporärer Audio-Dateien ===
@app.route('/temp_audio/<path:filename>')
def serve_temp_audio(filename):
    full_audio_path = os.path.join(TEMP_AUDIO_DIR_ROOT, filename)
    logger.info(f"Versuche, temporäre Audio-Datei zu servieren: {full_audio_path}")

    if not os.path.exists(full_audio_path):
        logger.error(f"Audio-Datei nicht gefunden: {full_audio_path}")
        abort(404)

    try:
        return send_from_directory(TEMP_AUDIO_DIR_ROOT, filename)
    except Exception as e:
        logger.error(f"Fehler beim Servieren der Audio-Datei {filename}: {str(e)}")
        abort(500)

# === NEUE Route: Conversation Starter ===
@app.route('/api/start_conversation', methods=['POST'])
def start_conversation():
    """Optimierte Conversation-Starter ohne doppelte LLM-Calls"""
    try:
        data = request.get_json()
        scenario = data.get('scenario', 'libre')
        user_id = data.get('userId')
        
        if not user_id:
            return jsonify({'error': 'User ID erforderlich'}), 400
            
        logger.info(f"🚀 Starting conversation for user {user_id}, scenario: {scenario}")
        
        # Session initialisieren
        session = get_user_session(user_id)
        session['scenario'] = scenario
        session['history'] = []  # Neue Konversation
        
        # Direkte Starter-Nachricht (ohne LLM)
        intro_message = get_intro_for_scenario(scenario)
        
        # Zur Session-Historie hinzufügen
        session['history'].append({
            'role': 'assistant',
            'content': intro_message
        })
        
        logger.info(f"📝 Intro message prepared: {intro_message[:50]}...")
        
        # TTS für Intro
        audio_file = None
        audio_url = None
        
        try:
            audio_file = generate_tts(intro_message, user_id, prefix="intro")
            if audio_file:
                relative_path = os.path.relpath(audio_file, start=TEMP_AUDIO_DIR_ROOT)
                audio_url = f"/temp_audio/{relative_path.replace(os.sep, '/')}"
                logger.info(f"🎵 TTS generated: {audio_url}")
        except Exception as tts_error:
            logger.error(f"❌ TTS generation failed: {tts_error}")
        
        response_data = {
            'response': intro_message,
            'audio_url': audio_url
        }
        
        logger.info("✅ Conversation started successfully")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error starting conversation: {str(e)}")
        return jsonify({'error': str(e)}), 500

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

# === Transkription (Vosk für später) - Angepasst für Dateispeicherung ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    user_id = request.form.get('user_id')
    audio_file = request.files['audio']

    temp_path_for_stt, user_id = get_user_temp_dir(user_id, base_dir=TEMP_AUDIO_DIR_ROOT)
    
    # Dateierweiterung aus dem Original-Dateinamen extrahieren
    # Das Frontend sendet jetzt den korrekten Dateinamen, z.B. "recording.webm"
    original_filename = audio_file.filename
    file_extension = os.path.splitext(original_filename)[1] # Z.B. .webm

    # Generiere einen eindeutigen Dateinamen, um Konflikte zu vermeiden
    audio_filename = f"recording_{uuid.uuid4()}{file_extension}"
    audio_path_absolute = os.path.join(temp_path_for_stt, audio_filename)

    try:
        audio_file.save(audio_path_absolute)
        logger.info(f"Benutzeraufnahme für User {user_id} als {audio_path_absolute} gespeichert.")
        
        if os.path.exists(audio_path_absolute) and os.path.getsize(audio_path_absolute) > 0:
            logger.info(f"Aufnahme erfolgreich gespeichert: {audio_path_absolute} ({os.path.getsize(audio_path_absolute)} bytes)")
        else:
            logger.error(f"Aufnahme nicht korrekt gespeichert: {audio_path_absolute}")
            return jsonify({'error': 'Fehler beim Speichern der Audiodatei'}), 500
        
        # VOSK STT Integration (für späteren Einsatz)
        # from vosk_stt import transcribe_audio # Import hier, wenn Vosk verwendet wird
        # try:
        #     transcript = transcribe_audio(audio_path_absolute) # Funktion von vosk_stt.py
        #     logger.info(f"Audio für User {user_id} transkribiert: {transcript[:50]}...")
        #     return jsonify({
        #         'transcript': transcript, 
        #         'audio_path': f"/temp_audio/{os.path.relpath(audio_path_absolute, start=TEMP_AUDIO_DIR_ROOT).replace(os.sep, '/')}"
        #     })
        # except Exception as e:
        #     logger.error(f"Fehler bei Vosk-Transkription für User {user_id}: {str(e)}")
        #     return jsonify({
        #         'error': f'Fehler bei Transkription: {str(e)}', 
        #         'audio_path': f"/temp_audio/{os.path.relpath(audio_path_absolute, start=TEMP_AUDIO_DIR_ROOT).replace(os.sep, '/')}"
        #     }), 500
        
        # Wenn Vosk nicht verwendet wird, einfach eine Erfolgsmeldung zurückgeben.
        # Die Transkription wird im Frontend durchgeführt.
        # WICHTIG: Den Pfad zur gespeicherten Datei zurückgeben
        relative_audio_path = os.path.relpath(audio_path_absolute, start=TEMP_AUDIO_DIR_ROOT).replace(os.sep, '/')
        return jsonify({
            'message': 'Audio erfolgreich gespeichert.',
            'user_id': user_id,
            'audio_path': f"/temp_audio/{relative_audio_path}" # Korrekter Pfad für Frontend-Wiedergabe
        })

    except Exception as e:
        logger.error(f"Fehler beim Speichern der Audio-Transkription für User {user_id}: {str(e)}")
        return jsonify({'error': f'Fehler beim Speichern der Audio: {str(e)}'}), 500

# === LLM Response & TTS (ANGEPASST für Session-Management) ===
@app.route('/api/respond', methods=['POST'])
def respond():
    """Optimierte Response-Verarbeitung mit Backend-Historie"""
    try:
        data = request.get_json()
        message = data.get('message', '').strip()
        user_id = data.get('userId')
        scenario = data.get('scenario', 'libre')
        retry_audio = data.get('retry_audio', False)
        
        if not message:
            return jsonify({'error': 'Nachricht erforderlich'}), 400
        if not user_id:
            return jsonify({'error': 'User ID erforderlich'}), 400
            
        logger.info(f"📨 Processing message from user {user_id}")
        logger.info(f"🎭 Scenario: {scenario}")
        logger.info(f"📝 Message: {message}")
        
        # Session holen
        session = get_user_session(user_id)
        session['scenario'] = scenario
        
        # Benutzer-Nachricht zur Historie hinzufügen
        session['history'].append({
            'role': 'user',
            'content': message
        })
        
        logger.info(f"📚 Session history length: {len(session['history'])}")
        
        # LLM-Antwort generieren
        try:
            llm_response = query_llm_for_scenario(
                message, 
                scenario=scenario, 
                history=session['history'][:-1],  # Ohne die gerade hinzugefügte User-Message
                max_tokens=160
            )
            
            logger.info(f"🤖 LLM response generated: {llm_response[:50]}...")
            
            # LLM-Antwort zur Historie hinzufügen
            session['history'].append({
                'role': 'assistant',
                'content': llm_response
            })
            
        except Exception as llm_error:
            logger.error(f"❌ LLM error: {llm_error}")
            return jsonify({'error': f'LLM-Fehler: {str(llm_error)}'}), 500
        
        # TTS generieren
        audio_file = None
        audio_url = None
        
        try:
            audio_file = generate_tts(llm_response, user_id)
            if audio_file:
                relative_path = os.path.relpath(audio_file, start=TEMP_AUDIO_DIR_ROOT)
                audio_url = f"/temp_audio/{relative_path.replace(os.sep, '/')}"
                logger.info(f"🎵 TTS generated: {audio_url}")
        except Exception as tts_error:
            logger.error(f"❌ TTS generation failed: {tts_error}")
            if not retry_audio:
                logger.info("⚠️ TTS failed, but not a retry - continuing")
        
        response_data = {
            'response': llm_response,
            'audio_url': audio_url
        }
        
        logger.info("✅ Response sent successfully")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"❌ Error in /api/respond: {str(e)}")
        return jsonify({'error': str(e)}), 500

# === Session-Cleanup ===
@app.route('/api/reset_session', methods=['POST'])
def reset_session():
    """Setzt die Benutzer-Session zurück"""
    try:
        data = request.get_json()
        user_id = data.get('userId')
        
        if user_id and user_id in user_sessions:
            del user_sessions[user_id]
            logger.info(f"🔄 Session reset for user {user_id}")
        
        return jsonify({'status': 'Session reset'})
        
    except Exception as e:
        logger.error(f"❌ Error resetting session: {str(e)}")
        return jsonify({'error': str(e)}), 500

# === Health Check für Render ===
@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'service': 'FR-AI-Tutor'}), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=os.getenv('PORT', 5000))