# backend/llm_agent_local.py Tinyllama
import os
from llama_cpp import Llama

# Pfad zum lokal gespeicherten gguf-Modell
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "llm", "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf")

# Initialisierung (nur einmal laden)
llm = Llama(model_path=MODEL_PATH, n_ctx=512, n_threads=4)

def query_llm_local(prompt):
    try:
        output = llm(prompt, max_tokens=200, stop=["\n"])
        return output["choices"][0]["text"].strip()
    except Exception as e:
        return f"[LLM Fehler: {e}]"
