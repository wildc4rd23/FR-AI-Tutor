# FR-AI-Tutor

Ein KI-basierter Französisch-Sprachtrainer mit Spracheingabe, Transkription (Vosk), Sprachsynthese (Coqui TTS) und LLM-Antworten (z.B. Ollama).

## Projektstruktur

- `backend/`: Flask API Backend
- `frontend/`: HTML/JS-Frontend
- `models/`: Modelle für Vosk, Coqui, Ollama

## Voraussetzungen

- Python 3.11+
- Siehe `requirements.txt`

## Lokaler Start

```bash
cd backend
pip install -r ../requirements.txt
python app.py
```

## Deployment

Empfohlen wird Render (kostenlos möglich).
