# backend/utils.py
import os
import uuid

def get_user_temp_dir(base="static"):
    user_id = str(uuid.uuid4())
    temp_path = os.path.join(base, f"temp_{user_id}")
    os.makedirs(temp_path, exist_ok=True)
    return temp_path, user_id

def cleanup_temp_dir(temp_path, exclude_file):
    for file in os.listdir(temp_path):
        path = os.path.join(temp_path, file)
        if path != exclude_file and file.endswith(".wav"):
            os.remove(path)
