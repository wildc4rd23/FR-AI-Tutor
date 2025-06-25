from flask import Flask, jsonify
import os

app = Flask(__name__)

@app.route('/')
def hello():
    return jsonify({"message": "Hello from Render!", "status": "success"})

@app.route('/api/test')
def test():
    return jsonify({"status": "OK", "message": "Server läuft!"})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"🚀 Server startet auf Port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)