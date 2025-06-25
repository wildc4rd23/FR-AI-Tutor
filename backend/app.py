# backend/app.py - MINIMAL VERSION FÜR DEBUGGING
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import requests

app = Flask(__name__, static_folder='../frontend')
CORS(app)

# === Frontend ===
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

# === Test Route ===
@app.route('/api/test')
def test():
    return jsonify({"status": "OK", "message": "Server läuft!"})

# === Dummy Transcribe ===
@app.route('/api/transcribe', methods=['POST'])
def transcribe():
    return jsonify({"text": "Bonjour, comment allez-vous?", "user_id": "test123"})

# === Mistral LLM (inline) ===
def query_mistral(prompt):
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        return "MISTRAL_API_KEY fehlt in Umgebungsvariablen"
    
    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "mistral-small",
        "messages": [{"role": "user", "content": prompt}]
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Mistral Fehler: {str(e)}"

# === Respond Route ===
@app.route('/api/respond', methods=['POST'])
def respond():
    data = request.get_json()
    user_text = data.get("text", "")
    
    llm_response = query_mistral(user_text)
    
    return jsonify({
        "response": llm_response,
        "audio_url": None  # Erstmal ohne TTS
    })

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Server startet auf Port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)