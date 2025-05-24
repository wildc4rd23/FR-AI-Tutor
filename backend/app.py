from flask import Flask, request, jsonify
from llm_agent import generate_reply
from tts import speak_text
from vosk_stt import transcribe_audio

app = Flask(__name__)

@app.route("/process", methods=["POST"])
def process():
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "No audio uploaded"}), 400

    transcript = transcribe_audio(audio)
    response_text = generate_reply(transcript)
    tts_url = speak_text(response_text)

    return jsonify({
        "transcript": transcript,
        "response": response_text,
        "tts_url": tts_url
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
