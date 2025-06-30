# backend/utils.py
import os
import uuid
import shutil
import time
import logging # GEÄNDERT: Logging importieren

logger = logging.getLogger(__name__) # GEÄNDERT: Logger initialisieren

def get_user_temp_dir(user_id=None, base_dir=None): # GEÄNDERT: user_id und base_dir als Parameter
    """
    Erstellt ein temporäres Verzeichnis für den Benutzer innerhalb des angegebenen Basisverzeichnisses.

    Args:
        user_id (str, optional): Die ID des Benutzers. Wird eine neue UUID generiert, wenn None.
        base_dir (str): Das Basisverzeichnis, in dem die temporären Ordner erstellt werden sollen.
                        Dies sollte das von Flask's app.py festgelegte TEMP_AUDIO_DIR_ROOT sein.

    Returns:
        tuple: (full_temp_path: str, user_id: str)
    """
    if base_dir is None:
        # GEÄNDERT: Fallback, wenn base_dir nicht übergeben wird. Dies sollte idealerweise nicht passieren,
        # da app.py TEMP_AUDIO_DIR_ROOT übergeben sollte.
        # Annahme: utils.py ist in backend/, Projekt-Root ist eine Ebene darüber.
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        base_dir = os.path.join(project_root, 'temp_audio')
        logger.warning(f"get_user_temp_dir wurde ohne base_dir aufgerufen. Verwende Fallback: {base_dir}")
    
    os.makedirs(base_dir, exist_ok=True) # GEÄNDERT: Stelle sicher, dass das Basisverzeichnis existiert

    if user_id is None: # GEÄNDERT: Prüfe, ob user_id bereits existiert
        user_id = str(uuid.uuid4())

    # GEÄNDERT: Ein Zeitstempel-Präfix, um eine eindeutige Sitzung für den Benutzer zu erstellen
    timestamp_prefix = f"intro_{int(time.time() * 1000)}" 
    
    # GEÄNDERT: Der temporäre Ordner für den spezifischen Benutzer innerhalb dieser Sitzung
    user_temp_dir_name = f"temp_{user_id}"
    
    # GEÄNDERT: Der vollständige absolute Pfad zum temporären Ordner des Benutzers
    full_temp_path = os.path.join(base_dir, timestamp_prefix, user_temp_dir_name)

    os.makedirs(full_temp_path, exist_ok=True)
    logger.info(f"Temporäres Verzeichnis erstellt: {full_temp_path}") # GEÄNDERT: Logging
    return full_temp_path, user_id

def cleanup_temp_dir(dir_path, exclude_file=None): # GEÄNDERT: exclude_file als optionaler Parameter
    """
    Löscht alle Dateien und leeren Unterverzeichnisse in einem gegebenen Pfad,
    mit Ausnahme einer spezifischen Datei.

    Args:
        dir_path (str): Der Pfad des Verzeichnisses, das bereinigt werden soll.
        exclude_file (str, optional): Der absolute Pfad einer Datei, die nicht gelöscht werden soll.
    """
    if not os.path.exists(dir_path):
        logger.warning(f"Bereinigung: Verzeichnis existiert nicht: {dir_path}") # GEÄNDERT: Logging
        return

    logger.info(f"Starte Bereinigung von: {dir_path}") # GEÄNDERT: Logging

    # GEÄNDERT: Stelle sicher, dass exclude_file ein absoluter Pfad ist, um Vergleiche zu erleichtern
    abs_exclude_file = os.path.abspath(exclude_file) if exclude_file else None

    # Iteriere über alle Elemente im Verzeichnis
    for item in os.listdir(dir_path):
        item_path = os.path.join(dir_path, item)
        abs_item_path = os.path.abspath(item_path) # GEÄNDERT: Absoluten Pfad für Vergleich

        # Überspringe die auszuschließende Datei
        if abs_exclude_file and abs_item_path == abs_exclude_file:
            logger.info(f"Bereinigung: Datei ausgeschlossen: {item_path}") # GEÄNDERT: Logging
            continue

        if os.path.isfile(item_path):
            try:
                os.remove(item_path)
                logger.info(f"Bereinigung: Datei gelöscht: {item_path}") # GEÄNDERT: Logging
            except OSError as e:
                logger.error(f"Bereinigung: Fehler beim Löschen der Datei {item_path}: {e}") # GEÄNDERT: Logging
        elif os.path.isdir(item_path):
            try:
                # GEÄNDERT: Rekursiv das Unterverzeichnis bereinigen
                cleanup_temp_dir(item_path) # Ruft sich selbst auf
                # Versuche, das Unterverzeichnis zu löschen, wenn es leer ist
                if not os.listdir(item_path): # Prüfe erneut, falls durch Rekursion geleert
                    os.rmdir(item_path)
                    logger.info(f"Bereinigung: Leeres Unterverzeichnis gelöscht: {item_path}") # GEÄNDERT: Logging
            except OSError as e:
                logger.error(f"Bereinigung: Fehler beim Löschen des Verzeichnisses {item_path}: {e}") # GEÄNDERT: Logging
    
    # GEÄNDERT: Versuche, das ursprüngliche dir_path selbst zu löschen, wenn es jetzt leer ist
    try:
        if not os.listdir(dir_path): # Überprüfe, ob das Verzeichnis nach der Bereinigung leer ist
            os.rmdir(dir_path)
            logger.info(f"Bereinigung: Ursprüngliches Verzeichnis gelöscht (leer): {dir_path}") # GEÄNDERT: Logging
    except OSError as e:
        logger.error(f"Bereinigung: Fehler beim Löschen des Hauptverzeichnisses {dir_path}: {e}") # GEÄNDERT: Logging