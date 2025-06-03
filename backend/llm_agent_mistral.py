# backend/llm_agent_mistral.py Mistral.ai
import os
import requests

def query_llm_mistral(prompt):
    api_key = os.environ.get("MISTRAL_API_KEY")
    url = "https://api.mistral.ai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "mistral-small",  # oder "mistral-tiny"
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]
