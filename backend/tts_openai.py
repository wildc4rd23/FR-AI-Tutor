# backend/tts_openai.py
import os
from openai import OpenAI
import logging

logger = logging.getLogger(__name__)

def synthesize_speech_openai(text: str, output_path: str):
    """
    Synthesisiert Sprache mit OpenAI TTS API
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise Exception("OPENAI_API_KEY Umgebungsvariable fehlt")

    client = OpenAI(api_key=api_key)

    # Text validieren und truncaten, falls zu lang
    if not text or len(text.strip()) == 0:
        raise Exception("Leerer Text kann nicht synthetisiert werden")

    # OpenAI hat ein Limit von 4096 Zeichen pro Anfrage
    if len(text) > 4096:
        text = text[:4093] + "..."
        logger.warning("Text wurde auf 4096 Zeichen gekürzt für OpenAI TTS.")

    try:
        logger.info(f"Sending TTS request to OpenAI for text: {text[:50]}...")

        # OpenAI TTS Synthese
        # Modell: 'tts-1' ist schneller, 'tts-1-hd' ist HD-Qualität (teurer)
        # Stimme: 'nova' und 'onyx' sind beliebte Optionen.
        # Sprache wird durch den Text erkannt, aber die Stimmen sind "generisch" und funktionieren gut für Französisch.
        response = client.audio.speech.create(
            model="gpt-4o-mini-tts",  # Oder "tts-1", oder "tts-1-hd" für höhere Qualität
            voice="coral",   # Eine der verfügbaren Stimmen: 'alloy', 'echo', 'fable', 'mira', 'nova', 'onyx'
            input=text,
            response_format="mp3"
        )

        # Audioinhalt speichern
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        response.stream_to_file(output_path)

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("OpenAI TTS-Ausgabe ist leer oder konnte nicht gespeichert werden.")

        logger.info(f"Audio erfolgreich gespeichert: {output_path} ({os.path.getsize(output_path)} bytes)")

    except Exception as e:
        logger.error(f"OpenAI TTS Fehler: {str(e)}")
        raise Exception(f"OpenAI TTS Fehler: {str(e)}")
