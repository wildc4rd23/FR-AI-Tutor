# backend/tts_google.py
import os
from google.cloud import texttospeech
import logging

logger = logging.getLogger(__name__)

# Stellen Sie sicher, dass die Umgebungsvariable GOOGLE_APPLICATION_CREDENTIALS gesetzt ist
# oder die 'google_credentials.json' im selben Verzeichnis wie die App liegt.
# Alternativ können Sie den Pfad hier direkt angeben:
# os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/path/to/your/google_credentials.json"


def synthesize_speech_google(text: str, output_path: str):
    """
    Synthesisiert Sprache mit Google Cloud Text-to-Speech API
    """
    try:
        client = texttospeech.TextToSpeechClient()

        synthesis_input = texttospeech.SynthesisInput(text=text)

        # Konfigurieren Sie die Stimme und das Audioformat
        # Sie können verschiedene Stimmen und Sprachen ausprobieren.
        # Eine Liste finden Sie hier: https://cloud.google.com/text-to-speech/docs/voices
        voice = texttospeech.VoiceSelectionParams(
            language_code="fr-FR",  # Französisch (Frankreich)
            name="fr-FR-Wavenet-A", # Eine natürliche klingende Wavenet-Stimme
            ssml_gender=texttospeech.SsmlVoiceGender.FEMALE # Weibliche Stimme
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=1.0,  # Sprechgeschwindigkeit (0.25 - 4.0)
            pitch=0.0           # Tonhöhe (-20.0 - 20.0)
        )

        logger.info(f"Sending TTS request to Google Cloud for text: {text[:50]}...")
        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        # Die synthetisierte Audioausgabe speichern
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "wb") as out:
            out.write(response.audio_content)
            logger.info(f"Audio erfolgreich gespeichert: {output_path} ({os.path.getsize(output_path)} bytes)")

    except Exception as e:
        logger.error(f"Google Cloud TTS Fehler: {str(e)}")
        raise Exception(f"Google Cloud TTS Fehler: {str(e)}")