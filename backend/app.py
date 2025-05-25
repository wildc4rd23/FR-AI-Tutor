from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# === FRONTEND SERVING ===
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    return send_from_directory(app.static_folder, path)

# === API ROUTES ===

@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    return jsonify({"text": "Bonjour, comment ça va ?"})

@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    user_text = data.get("text", "")
    response_text = f"Super! Du hast gesagt: {user_text}"
    return jsonify({
        "response": response_text,
        "audio_url": "/sample_audio.mp3"
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 10000))
    app.run(host='0.0.0.0', port=port)
