# backend/utils.py
import os
import uuid
import shutil # Hinzugefügt für robustere Verzeichnisbereinigung
import time   # Hinzugefügt für Zeitstempel in Verzeichnisnamen
import logging # Hinzugefügt für Logging

logger = logging.getLogger(__name__) # Logger initialisieren

def get_user_temp_dir(user_id=None, base_dir=None):
    """
    Erstellt ein temporäres Verzeichnis für einen Benutzer innerhalb des angegebenen Basisverzeichnisses.

    Args:
        user_id (str, optional): Die ID des Benutzers. Wenn None, wird eine neue UUID generiert.
        base_dir (str, optional): Das Basisverzeichnis, in dem die temporären Ordner erstellt werden sollen.
                                  Dies sollte das von Flask's app.py festgelegte TEMP_AUDIO_DIR_ROOT sein.
                                  Wenn None, wird ein Fallback-Pfad verwendet.

    Returns:
        tuple: (full_temp_path: str, user_id: str) - Der vollständige Pfad zum Benutzer-Temp-Verzeichnis und die Benutzer-ID.
    """
    if base_dir is None:
        # Fallback, wenn base_dir nicht übergeben wird. Dies sollte idealerweise nicht passieren,
        # da app.py TEMP_AUDIO_DIR_ROOT übergeben sollte.
        # Annahme: utils.py ist in backend/, Projekt-Root ist zwei Ebenen darüber.
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        base_dir = os.path.join(project_root, 'temp_audio')
        logger.warning(f"get_user_temp_dir wurde ohne base_dir aufgerufen. Verwende Fallback: {base_dir}")
    
    os.makedirs(base_dir, exist_ok=True) # Stelle sicher, dass das Basisverzeichnis existiert

    if user_id is None:
        user_id = str(uuid.uuid4())

    # Ein Zeitstempel-Präfix, um eine eindeutige Sitzung für den Benutzer zu erstellen.
    # Dies hilft, Konflikte zu vermeiden und die Bereinigung zu erleichtern.
    timestamp_prefix = f"session_{int(time.time() * 1000)}" 
    
    # Der temporäre Ordner für den spezifischen Benutzer innerhalb dieser Sitzung
    user_temp_dir_name = f"user_{user_id}"
    
    # Der vollständige absolute Pfad zum temporären Ordner des Benutzers
    full_temp_path = os.path.join(base_dir, timestamp_prefix, user_temp_dir_name)

    os.makedirs(full_temp_path, exist_ok=True)
    logger.info(f"Temporäres Verzeichnis erstellt: {full_temp_path}")
    return full_temp_path, user_id

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
    """Fügt Nachricht zur Historie hinzu und begrenzt die Länge"""
    session['history'].append({'role': role, 'content': content})
    
    # Behalte nur die letzten MAX_HISTORY_LENGTH Nachrichten
    if len(session['history']) > MAX_HISTORY_LENGTH:
        session['history'] = session['history'][-MAX_HISTORY_LENGTH:]