# backend/utils.py
import os
import uuid

def get_user_temp_dir(user_id=None):
    """
    Erstellt ein temporäres Verzeichnis für einen Benutzer
    
    Args:
        user_id (str, optional): Existing user ID or None to generate new one
    
    Returns:
        tuple: (temp_path, user_id)
    """
    if user_id is None:
        user_id = str(uuid.uuid4())
    
    # Temporäre Verzeichnisse im aktuellen Arbeitsverzeichnis erstellen
    # Das ist wichtiger für Render, da das Arbeitsverzeichnis konsistent ist
    temp_path = os.path.join(os.getcwd(), f"temp_{user_id}")
    
    # Sicherstellen, dass das Verzeichnis existiert
    os.makedirs(temp_path, exist_ok=True)
    
    return temp_path, user_id

def cleanup_temp_dir(temp_path, exclude_file=None):
    """
    Bereinigt temporäre Dateien in einem Verzeichnis
    
    Args:
        temp_path (str): Pfad zum temporären Verzeichnis
        exclude_file (str, optional): Datei, die nicht gelöscht werden soll
    """
    try:
        if not os.path.exists(temp_path):
            return
        
        for file in os.listdir(temp_path):
            file_path = os.path.join(temp_path, file)
            
            # Nur Dateien löschen, keine Verzeichnisse
            if os.path.isfile(file_path):
                # Exclude-Datei nicht löschen
                if exclude_file and file_path == exclude_file:
                    continue
                
                # Nur bestimmte Dateitypen löschen (Sicherheit)
                if file.endswith(('.wav', '.tmp', '.temp')):
                    try:
                        os.remove(file_path)
                    except OSError:
                        pass  # Ignoriere Fehler beim Löschen
                        
    except Exception:
        pass  # Ignoriere alle Cleanup-Fehler