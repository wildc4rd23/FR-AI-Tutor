# backend/app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import requests
import logging

# Aktive Imports
from llm_agent_mistral import query_llm_mistral
from tts_minimax import synthesize_speech_minimax
from utils import get_user_temp_dir, cleanup_temp_dir

# Fallback Imports (für späteren Einsatz)
# from vosk_stt import transcribe_audio
# from tts_tacotron import synthesize_speech as synthesize_tacotron

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# Logging konfigurieren
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# === Transkription (Vosk für später) ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    temp_path, user_id = get_user_temp_dir()
    audio_path = os.path.join(temp_path, "audio_input.wav")
    
    try:
        request.files['audio'].save(audio_path)
        
        # TEMPORÄR: Dummy-Transkription für Testing
        text = "Bonjour, comment allez-vous?"
        
        # FALLBACK: Vosk STT (auskommentiert wegen Render-Größe)
        # cleanup_temp_dir(temp_path, exclude_file=audio_path)
        # text = transcribe_audio(audio_path)
        
        logger.info(f"Audio transkribiert für User {user_id}: {text}")
        return jsonify({"text": text, "user_id": user_id})
        
    except Exception as e:
        logger.error(f"Transkriptionsfehler: {str(e)}")
        return jsonify({'error': f'Transkriptionsfehler: {str(e)}'}), 500

# === Antwort (LLM + Minimax TTS mit Tacotron Fallback) ===
@app.route('/api/respond', methods=['POST'])
def respond():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Keine JSON-Daten empfangen'}), 400
            
        user_text = data.get("text", "")
        user_id = data.get("user_id", "")
        
        if not user_text:
            return jsonify({'error': 'Kein Text empfangen'}), 400

        # Temp-Verzeichnis erstellen
        temp_path = os.path.join("static", f"temp_{user_id}")
        os.makedirs(temp_path, exist_ok=True)

        # LLM Response mit besserer Französisch-Instruktion
        try:
            # Erweiterte Instruktion für bessere Französisch-Antworten
            enhanced_prompt = f"""Tu es un professeur de français expérimenté qui aide des apprenants de niveau B1/B2. 
            Réponds naturellement en français à la question suivante, en utilisant un vocabulaire et une grammaire appropriés pour ce niveau.
            Si l'apprenant fait des erreurs, corrige-les gentiment et explique brièvement.
            
            Question de l'apprenant: {user_text}"""
            
            llm_response = query_llm_mistral(enhanced_prompt)
            logger.info(f"LLM Response für User {user_id}: {llm_response[:100]}...")
            
        except Exception as e:
            logger.error(f"LLM Fehler: {str(e)}")
            llm_response = f"Excusez-moi, j'ai rencontré un problème technique. Pouvez-vous répéter votre question?"

        # TTS: Minimax Primary, Tacotron Fallback
        audio_url = None
        tts_error = None
        
        try:
            # PRIMARY: Minimax TTS
            output_path = os.path.join(temp_path, "response.mp3")
            synthesize_speech_minimax(llm_response, output_path)
            
            # Prüfen ob Datei erfolgreich erstellt wurde
            if os.path.exists(output_path) and os.path.getsize(output_path) > 512:
                # Optional: Header-Check ergänzen
                with open(output_path, "rb") as f:
                    header = f.read(4)
                    if not (header.startswith(b'ID3') or header[1:4] == b'MP3' or header.startswith(b'\xff\xfb')):
                        raise Exception("Ungültige MP3-Datei (Headercheck fehlgeschlagen)")
    
                audio_url = f"/{output_path.replace(os.sep, '/')}"
                logger.info(f"Minimax TTS erfolgreich für User {user_id}"))
            else:
                raise Exception("Audio-Datei wurde nicht korrekt erstellt")
                
        except Exception as e:
            logger.warning(f"Minimax fehlgeschlagen für User {user_id}: {str(e)}")
            tts_error = str(e)
            
            # FALLBACK: Tacotron TTS (auskommentiert wegen Render-Größe)
            # try:
            #     output_path = os.path.join(temp_path, "response.wav")
            #     synthesize_tacotron(llm_response, output_path)
            #     if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            #         audio_url = f"/{output_path.replace(os.sep, '/')}"
            #         logger.info(f"Tacotron Fallback erfolgreich für User {user_id}")
            #         tts_error = None
            # except Exception as fallback_e:
            #     logger.error(f"Tacotron-Fallback fehlgeschlagen für User {user_id}: {str(fallback_e)}")
            #     tts_error = f"Minimax: {str(e)}, Tacotron: {str(fallback_e)}"

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
    # Port richtig abfragen
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting FR-AI-Tutor on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)