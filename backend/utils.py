# backend/utils.py
import os
import uuid
import shutil # Hinzugefügt für robustere Verzeichnisbereinigung
import time   # Hinzugefügt für Zeitstempel in Verzeichnisnamen
import logging # Hinzugefügt für Logging

logger = logging.getLogger(__name__) # Logger initialisieren

# Importiere MAX_HISTORY_LENGTH aus app.py
# Dies setzt voraus, dass utils.py im selben Verzeichnis oder einem zugänglichen Pfad wie app.py liegt.
# Eine Alternative wäre, MAX_HISTORY_LENGTH als Parameter an add_to_history zu übergeben.
try:
    from app import MAX_HISTORY_LENGTH
except ImportError:
    # Fallback, falls der Import fehlschlägt (z.B. bei unabhängigem Testen von utils.py)
    logger.warning("Konnte MAX_HISTORY_LENGTH nicht aus app.py importieren. Verwende Standardwert.")
    MAX_HISTORY_LENGTH = 20 # Standardwert

def get_user_temp_dir(user_id=None, base_dir=None):
    """
    Erstellt ein temporäres Verzeichnis für einen Benutzer unterhalb des Basisverzeichnisses,
    direkt benannt nach der Benutzer-ID.

    Args:
        user_id (str, optional): Die ID des Benutzers. Wenn None, wird eine neue UUID generiert.
        base_dir (str, optional): Das Basisverzeichnis, in dem die temporären Ordner erstellt werden sollen.
                                  Dies sollte das von Flask's app.py festgelegte TEMP_AUDIO_DIR_ROOT sein.
                                  Wenn None, wird ein Fallback-Pfad verwendet.

    Returns:
        tuple: (full_user_path: str, user_id: str)
               Der vollständige Pfad zum Benutzer-Temp-Verzeichnis und die Benutzer-ID.
    """
    if user_id is None:
        user_id = str(uuid.uuid4())

    if base_dir is None:
        logger.warning("get_user_temp_dir wurde ohne base_dir aufgerufen. Verwende Fallback: /opt/render/project/src/temp_audio")
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        base_dir = os.path.join(project_root, 'temp_audio')

    # NEU: Das Verzeichnis ist direkt der user_id untergeordnet
    user_dir_path = os.path.join(base_dir, f"user_{user_id}")

    try:
        os.makedirs(user_dir_path, exist_ok=True)
        logger.info(f"Temporäres Verzeichnis erstellt: {user_dir_path}")
    except OSError as e:
        logger.error(f"Fehler beim Erstellen des Verzeichnisses {user_dir_path}: {e}")
        raise

    # KEIN timestamp mehr im Return-Wert
    return user_dir_path, user_id

def cleanup_temp_dir(dir_path, exclude_file=None):  # momentan nicht verwendet
    """
    Löscht alle Dateien und leere Unterverzeichnisse in einem gegebenen Pfad rekursiv,
    mit Ausnahme einer spezifischen Datei.

    Args:
        dir_path (str): Der absolute Pfad des Verzeichnisses, das bereinigt werden soll.
        exclude_file (str, optional): Der absolute Pfad einer Datei, die nicht gelöscht werden soll.
                                      Standardmäßig None, d.h. keine Datei wird ausgeschlossen.
    """
    if not os.path.exists(dir_path):
        logger.warning(f"Bereinigung: Verzeichnis existiert nicht: {dir_path}")
        return

    logger.info(f"Starte Bereinigung von: {dir_path}")

    # Stelle sicher, dass exclude_file ein absoluter Pfad ist, um Vergleiche zu erleichtern
    abs_exclude_file = os.path.abspath(exclude_file) if exclude_file else None

    # Iteriere über alle Elemente im Verzeichnis
    for item in os.listdir(dir_path):
        item_path = os.path.join(dir_path, item)
        abs_item_path = os.path.abspath(item_path)

        # Überspringe die auszuschließende Datei
        if abs_exclude_file and abs_item_path == abs_exclude_file:
            logger.info(f"Bereinigung: Datei ausgeschlossen: {item_path}")
            continue

        if os.path.isfile(item_path):
            try:
                os.remove(item_path)
                logger.info(f"Bereinigung: Datei gelöscht: {item_path}")
            except OSError as e:
                logger.error(f"Bereinigung: Fehler beim Löschen der Datei {item_path}: {e}")
        elif os.path.isdir(item_path):
            try:
                # Rekursiv das Unterverzeichnis bereinigen
                cleanup_temp_dir(item_path) # Ruft sich selbst auf
                # Versuche, das Unterverzeichnis zu löschen, wenn es leer ist
                if not os.listdir(item_path): # Prüfe erneut, falls durch Rekursion geleert
                    os.rmdir(item_path)
                    logger.info(f"Bereinigung: Leeres Unterverzeichnis gelöscht: {item_path}")
            except OSError as e:
                logger.error(f"Bereinigung: Fehler beim Löschen des Verzeichnisses {item_path}: {e}")
    
    # Versuche, das ursprüngliche dir_path selbst zu löschen, wenn es jetzt leer ist
    # Dies ist wichtig, um leere Benutzer- oder Sitzungsverzeichnisse zu entfernen.
    try:
        if not os.listdir(dir_path): # Überprüfe, ob das Verzeichnis nach der Bereinigung leer ist
            os.rmdir(dir_path)
            logger.info(f"Bereinigung: Ursprüngliches Verzeichnis gelöscht (leer): {dir_path}")
    except OSError as e:
        logger.error(f"Bereinigung: Fehler beim Löschen des Hauptverzeichnisses {dir_path}: {e}")

def log_request(user_id, action, details=None):
    """Minimales Logging für Render Free"""
    if details:
        logger.info(f"[{user_id}] {action}: {str(details)[:50]}...")
    else:
        logger.info(f"[{user_id}] {action}")

def add_to_history(session, role, content):
    """
    Fügt eine Nachricht zur Historie hinzu und begrenzt deren Länge basierend auf MAX_HISTORY_LENGTH.
    System-Nachrichten am Anfang der Historie werden dabei beibehalten.
    """
    # Stelle sicher, dass der 'history'-Schlüssel in der Session existiert
    if 'history' not in session:
        session['history'] = []

    # Füge die neue Nachricht hinzu
    session['history'].append({"role": role, "content": content})

    # Ermittle, ob eine System-Nachricht vorhanden ist (und sie sollte die erste sein)
    system_message = None
    if session['history'] and session['history'][0]['role'] == 'system':
        system_message = session['history'][0]
        # Entferne die System-Nachricht temporär für die Längenbegrenzung des restlichen Dialogs
        dialog_history = session['history'][1:] 
    else:
        dialog_history = session['history']
    
    # Begrenze die Dialoghistorie (ohne System-Nachricht) auf MAX_HISTORY_LENGTH Einträge
    if len(dialog_history) > MAX_HISTORY_LENGTH:
        logger.info(f"Historie für Benutzer {session.get('user_id', 'unbekannt')} ist zu lang "
                    f"({len(dialog_history)} Nachrichten, Limit: {MAX_HISTORY_LENGTH}). "
                    f"Kürze sie, um die neuesten Interaktionen zu behalten.")
        # Behalte die letzten MAX_HISTORY_LENGTH Nachrichten der Dialoghistorie
        dialog_history = dialog_history[-MAX_HISTORY_LENGTH:]

    # Setze die gesamte Historie neu zusammen: System-Nachricht (falls vorhanden) + gekürzte Dialoghistorie
    if system_message:
        session['history'] = [system_message] + dialog_history
    else:
        session['history'] = dialog_history

    logger.debug(f"Aktuelle Historie-Länge nach Hinzufügen und Kürzen: {len(session['history'])}")
