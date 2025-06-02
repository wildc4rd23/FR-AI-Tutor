# backend/app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

from vosk_stt import transcribe_audio
from llm_agent import query_llm
from tts import synthesize_speech
from utils import get_user_temp_dir, cleanup_temp_dir

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# === Transkription (Vosk) ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    if 'audio' not in request.files:
        return jsonify({'error': 'Keine Audiodatei empfangen'}), 400

    temp_path, user_id = get_user_temp_dir()

    audio_path = os.path.join(temp_path, "audio_input.wav")
    request.files['audio'].save(audio_path)

    cleanup_temp_dir(temp_path, exclude_file=audio_path)

    text = transcribe_audio(audio_path)
    return jsonify({"text": text, "user_id": user_id})

# === Antwort (LLM + TTS) ===
@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    user_text = data.get("text", "")
    user_id = data.get("user_id", "")

    temp_path = os.path.join("static", f"temp_{user_id}")
    os.makedirs(temp_path, exist_ok=True)

    llm_response = query_llm(user_text)

    output_path = os.path.join(temp_path, "response.wav")
    synthesize_speech(llm_response, output_path)

    cleanup_temp_dir(temp_path, exclude_file=output_path)

    return jsonify({
        "response": llm_response,
        "audio_url": f"/{output_path.replace(os.sep, '/')}"
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)