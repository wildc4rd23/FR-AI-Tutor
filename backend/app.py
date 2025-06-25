# backend/app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

# Aktive Imports
from llm_agent_mistral import query_llm_mistral
from tts_minimax import synthesize_speech_minimax
from utils import get_user_temp_dir, cleanup_temp_dir

# Fallback Imports (für späteren Einsatz)
# from vosk_stt import transcribe_audio
# from tts_tacotron import synthesize_speech as synthesize_tacotron

app = Flask(__name__, static_folder='../frontend')
CORS(app)

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
    request.files['audio'].save(audio_path)

    # TEMPORÄR: Dummy-Transkription
    text = "Bonjour, comment allez-vous?"
    
    # FALLBACK: Vosk STT (auskommentiert wegen Render-Größe)
    # cleanup_temp_dir(temp_path, exclude_file=audio_path)
    # text = transcribe_audio(audio_path)
    
    return jsonify({"text": text, "user_id": user_id})

# === Antwort (LLM + Minimax TTS mit Tacotron Fallback) ===
@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    user_text = data.get("text", "")
    user_id = data.get("user_id", "")

    temp_path = os.path.join("static", f"temp_{user_id}")
    os.makedirs(temp_path, exist_ok=True)

    # LLM Response
    try:
        llm_response = query_llm_mistral(user_text)
    except Exception as e:
        llm_response = f"Entschuldigung, ein Fehler ist aufgetreten: {str(e)}"

    # TTS: Minimax Primary, Tacotron Fallback
    try:
        # PRIMARY: Minimax TTS
        output_path = os.path.join(temp_path, "response.mp3")
        synthesize_speech_minimax(llm_response, output_path)
        audio_url = f"/{output_path.replace(os.sep, '/')}"
        
    except Exception as e:
        print(f"[WARN] Minimax fehlgeschlagen, Tacotron-Fallback aktiviert: {e}")
        
        # FALLBACK: Tacotron TTS (auskommentiert wegen Render-Größe)
        # try:
        #     output_path = os.path.join(temp_path, "response.wav")
        #     synthesize_tacotron(llm_response, output_path)
        #     audio_url = f"/{output_path.replace(os.sep, '/')}"
        # except Exception as fallback_e:
        #     print(f"[ERROR] Auch Tacotron-Fallback fehlgeschlagen: {fallback_e}")
        #     return jsonify({
        #         "response": llm_response,
        #         "audio_url": None,
        #         "tts_error": f"Minimax: {str(e)}, Tacotron: {str(fallback_e)}"
        #     })
        
        # TEMPORÄRER FALLBACK: Kein Audio
        return jsonify({
            "response": llm_response,
            "audio_url": None,
            "tts_error": str(e)
        })

    cleanup_temp_dir(temp_path, exclude_file=output_path)
    
    return jsonify({
        "response": llm_response,
        "audio_url": audio_url
    })

if __name__ == '__main__':
    # KORREKTUR: Port richtig abfragen
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)