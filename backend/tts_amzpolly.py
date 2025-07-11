# backend/tts_amzpolly.py
import os
import boto3
import logging
from botocore.exceptions import ClientError, BotoCoreError

logger = logging.getLogger(__name__)

def synthesize_speech_amzpolly(text: str, output_path: str):
    """
    Synthetisiert Sprache mit Amazon Polly TTS
    
    Args:
        text (str): Text zum Synthetisieren
        output_path (str): Pfad für die Ausgabedatei
    
    Raises:
        Exception: Bei Konfiguration- oder API-Fehlern
    """
    # AWS Credentials und Region aus Umgebungsvariablen
    aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "eu-west-1")  # Standard: EU Frankfurt
    
    if not aws_access_key_id or not aws_secret_access_key:
        raise Exception("AWS_ACCESS_KEY_ID und AWS_SECRET_ACCESS_KEY Umgebungsvariablen fehlen")

    # Text validieren
    if not text or len(text.strip()) == 0:
        raise Exception("Leerer Text kann nicht synthetisiert werden")

    # Amazon Polly hat ein Limit von ~3000 Zeichen für Standard-Stimmen
    # und ~100.000 Zeichen für Neural-Stimmen
    if len(text) > 2900:
        text = text[:2897] + "..."
        logger.warning("Text wurde auf 2900 Zeichen gekürzt für Amazon Polly.")

    try:
        logger.info(f"Sending TTS request to Amazon Polly for text: {text[:50]}...")

        # Polly Client initialisieren
        polly_client = boto3.client(
            'polly',
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name=aws_region
        )

        # TTS-Parameter konfigurieren
        # Französische Stimmen in Amazon Polly:
        # - Céline (Standard, weiblich)
        # - Mathieu (Standard, männlich) 
        # - Léa (Neural, weiblich) - Höhere Qualität
        # - Rémi (Neural, männlich) - Höhere Qualität
        
        # Versuche zuerst Neural-Stimme (bessere Qualität), dann Standard als Fallback
        voice_configs = [
            {
                'VoiceId': 'Lea',  # Neural, weiblich, Französisch
                'Engine': 'neural',
                'LanguageCode': 'fr-FR'
            },
            {
                'VoiceId': 'Remi',  # Neural, männlich, Französisch  
                'Engine': 'neural',
                'LanguageCode': 'fr-FR'
            },
            {
                'VoiceId': 'Celine',  # Standard, weiblich, Französisch
                'Engine': 'standard',
                'LanguageCode': 'fr-FR'
            },
            {
                'VoiceId': 'Mathieu',  # Standard, männlich, Französisch
                'Engine': 'standard', 
                'LanguageCode': 'fr-FR'
            }
        ]

        # Versuche jede Stimme bis eine funktioniert
        response = None
        used_voice = None
        
        for voice_config in voice_configs:
            try:
                logger.info(f"Trying voice: {voice_config['VoiceId']} ({voice_config['Engine']})")
                
                response = polly_client.synthesize_speech(
                    Text=text,
                    OutputFormat='mp3',
                    VoiceId=voice_config['VoiceId'],
                    Engine=voice_config['Engine'],
                    LanguageCode=voice_config['LanguageCode'],
                    # Optional: Zusätzliche Parameter
                    SampleRate='22050',  # Standard-Sampling-Rate für gute Qualität
                    TextType='text'      # 'text' oder 'ssml' für erweiterte Kontrolle
                )
                
                used_voice = voice_config
                logger.info(f"Successfully using voice: {voice_config['VoiceId']}")
                break
                
            except ClientError as e:
                error_code = e.response['Error']['Code']
                logger.warning(f"Voice {voice_config['VoiceId']} failed with {error_code}, trying next...")
                
                # Bestimmte Fehler sofort weiterwerfen (keine Berechtigung, etc.)
                if error_code in ['InvalidParameterValue', 'AccessDenied', 'UnauthorizedOperation']:
                    continue
                else:
                    # Bei anderen Fehlern auch nächste Stimme versuchen
                    continue
        
        if not response:
            raise Exception("Alle konfigurierten Stimmen fehlgeschlagen")

        # Audio-Stream aus der Antwort extrahieren
        if 'AudioStream' not in response:
            raise Exception("Keine Audio-Daten in Polly-Antwort erhalten")

        # Verzeichnis erstellen falls nötig
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Audio-Daten in Datei schreiben
        with open(output_path, 'wb') as audio_file:
            # AudioStream ist ein StreamingBody, muss gelesen werden
            audio_file.write(response['AudioStream'].read())

        # Validierung der erstellten Datei
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("Amazon Polly TTS-Ausgabe ist leer oder konnte nicht gespeichert werden.")
        #neu zentral in app.py:
        #logger.info(f"Audio erfolgreich mit {used_voice['VoiceId']} ({used_voice['Engine']}) gespeichert: {output_path} ({os.path.getsize(output_path)} bytes)")

    except ClientError as e:
        error_code = e.response['Error']['Code']
        error_message = e.response['Error']['Message']
        logger.error(f"Amazon Polly API Fehler [{error_code}]: {error_message}")
        
        # Benutzerfreundliche Fehlermeldungen
        if error_code == 'AccessDenied':
            raise Exception("Amazon Polly Zugriff verweigert - prüfen Sie Ihre AWS-Berechtigung")
        elif error_code == 'InvalidParameterValue':
            raise Exception("Ungültige Parameter für Amazon Polly - möglicherweise unsupported Voice/Region")
        elif error_code == 'ServiceUnavailable':
            raise Exception("Amazon Polly Service temporär nicht verfügbar")
        elif error_code == 'ThrottlingException':
            raise Exception("Amazon Polly Rate-Limit erreicht - bitte warten Sie kurz")
        else:
            raise Exception(f"Amazon Polly Fehler: {error_message}")
    
    except BotoCoreError as e:
        logger.error(f"Amazon Polly BotoCore Fehler: {str(e)}")
        raise Exception(f"AWS SDK Fehler: {str(e)}")
    
    except Exception as e:
        logger.error(f"Unerwarteter Amazon Polly Fehler: {str(e)}")
        raise Exception(f"Amazon Polly TTS Fehler: {str(e)}")


def get_available_voices():
    """
    Hilfsfunktion: Listet verfügbare französische Stimmen auf
    Nützlich für Debugging oder Stimmen-Auswahl
    
    Returns:
        list: Liste der verfügbaren Stimmen mit Details
    """
    aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "eu-west-1")
    
    if not aws_access_key_id or not aws_secret_access_key:
        return []

    try:
        polly_client = boto3.client(
            'polly',
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name=aws_region
        )
        
        # Alle verfügbaren Stimmen abrufen
        response = polly_client.describe_voices(LanguageCode='fr-FR')
        
        voices = []
        for voice in response['Voices']:
            voices.append({
                'Id': voice['Id'],
                'Name': voice['Name'],
                'Gender': voice['Gender'],
                'LanguageCode': voice['LanguageCode'],
                'SupportedEngines': voice.get('SupportedEngines', [])
            })
        
        return voices
        
    except Exception as e:
        logger.error(f"Error getting available voices: {str(e)}")
        return []


# Optional: SSML-Unterstützung für erweiterte Sprachkontrolle
def synthesize_speech_amzpolly_ssml(ssml_text: str, output_path: str, voice_id: str = 'Lea'):
    """
    Erweiterte TTS-Funktion mit SSML-Unterstützung
    
    SSML ermöglicht:
    - Betonung: <emphasis level="strong">wichtig</emphasis>
    - Pausen: <break time="1s"/>
    - Aussprache: <phoneme alphabet="ipa" ph="bonjuːʁ">bonjour</phoneme>
    - Geschwindigkeit: <prosody rate="slow">langsamer Text</prosody>
    
    Args:
        ssml_text (str): SSML-formatierter Text
        output_path (str): Ausgabepfad
        voice_id (str): Polly Voice ID
    """
    aws_access_key_id = os.getenv("AWS_ACCESS_KEY_ID")
    aws_secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
    aws_region = os.getenv("AWS_REGION", "eu-west-1")
    
    if not aws_access_key_id or not aws_secret_access_key:
        raise Exception("AWS Credentials fehlen")
    
    # SSML in <speak> Tags einbetten falls nicht vorhanden
    if not ssml_text.strip().startswith('<speak>'):
        ssml_text = f'<speak>{ssml_text}</speak>'
    
    try:
        polly_client = boto3.client(
            'polly',
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            region_name=aws_region
        )
        
        response = polly_client.synthesize_speech(
            Text=ssml_text,
            OutputFormat='mp3',
            VoiceId=voice_id,
            Engine='neural',  # Neural Engine unterstützt SSML besser
            LanguageCode='fr-FR',
            TextType='ssml'  # WICHTIG: SSML als TextType angeben
        )
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'wb') as audio_file:
            audio_file.write(response['AudioStream'].read())
        
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise Exception("SSML TTS-Ausgabe ist leer")
            
        logger.info(f"SSML Audio erfolgreich erstellt: {output_path}")
        
    except Exception as e:
        logger.error(f"SSML TTS Fehler: {str(e)}")
        raise Exception(f"SSML TTS Fehler: {str(e)}")