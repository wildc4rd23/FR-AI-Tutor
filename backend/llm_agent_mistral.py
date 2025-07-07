# backend/llm_agent_mistral.py Mistral.ai
import os
import requests
import logging

logger = logging.getLogger(__name__)

def query_llm_mistral(prompt, history=None, max_tokens=150, temperature=0.7):
    """
    Fragt Mistral LLM ab mit Längenbegrenzung und Konversationshistorie.
    
    Args:
        prompt (str): Der aktuelle Eingabeprompt des Benutzers.
        history (list, optional): Eine Liste von Nachrichten im Format [{"role": "user", "content": "text"}, ...].
                                  Wird verwendet, um den Konversationskontext beizubehalten.
        max_tokens (int): Maximale Anzahl Tokens in der Antwort (Standard: 150)
        temperature (float): Kreativität der Antwort (0.0-1.0, Standard: 0.7)
    
    Returns:
        str: Die LLM-Antwort
    """

    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise Exception("MISTRAL_API_KEY Umgebungsvariable fehlt")
    
    url = "https://api.mistral.ai/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Erweiterten System-Prompt für Französisch-Tutor erstellen
    system_prompt = """Tu es un professeur de français expérimenté qui aide des étudiants de niveau B1/B2. 
    
    RÈGLES IMPORTANTES:
    - Réponds TOUJOURS en français
    - Garde tes réponses concises mais informatives (2-4 phrases maximum).
    - NE réponds PAS par des phrases trop courtes ou des mots uniques (par exemple, "Excellent.", "Oui.", "Non."). Tes réponses doivent toujours inviter à poursuivre la conversation.
    - Corrige gentiment et clairement les erreurs grammaticales ou de vocabulaire sans être condescendant.
    - Pose TOUJOURS une question ouverte ou une suggestion pour relancer la conversation et encourager l'étudiant à parler davantage.
    - Utilise un vocabulaire approprié au niveau B1/B2.
    - Sois encourageant, patient et bienveillant.
    - Agis comme un véritable partenaire de discussion, pas seulement un correcteur.
    
    Exemple de réponse idéale: "C'est une très bonne idée ! J'aime beaucoup l'idée de voyager. Quel type de cuisine vous attire le plus quand vous pensez à un nouveau pays ? Ou peut-être avez-vous déjà une destination en tête ?"
    """

    messages = [{"role": "system", "content": system_prompt}]
    
    # Füge die Konversationshistorie hinzu, falls vorhanden
    if history:
        # Sicherstellen, dass die Historie nicht den System-Prompt enthält, da dieser separat hinzugefügt wird
        # und dass sie im korrekten Format ist.
        # Das Frontend sendet {role: 'user'/'assistant', content: 'text'}
        messages.extend(history)
    
    # Füge den aktuellen Benutzerprompt hinzu
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "mistral-small",  # Kosteneffizient für Sprachlernen
        "messages": messages,
        "max_tokens": max_tokens,  # Begrenzt die Antwortlänge
        "temperature": temperature,  # Kontrolliert Kreativität
        "top_p": 0.9,  # Zusätzliche Kontrolle über Variabilität
        "stop": [".", "!", "?", "\n\n"]  # Stoppt bei natürlichen Satzenden
    }
    logger.debug("🧠 LLM Mistral Request:\n%s", json.dumps(payload, indent=2, ensure_ascii=False))

    try:
        logger.info(f"Sending request to Mistral with max_tokens={max_tokens} and history length {len(history) if history else 0}")
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        
        # Zusätzliche Nachbearbeitung für optimale TTS-Länge
        content = post_process_response(content, max_chars=200)
        
        logger.info(f"Mistral response: {len(content)} characters")
        return content
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Mistral API error: {str(e)}")
        raise Exception(f"Mistral API Fehler: {str(e)}")
    except KeyError as e:
        logger.error(f"Unexpected response format: {result}")
        raise Exception("Unerwartetes Antwortformat von Mistral API")

# get_intro_for_scenario wird nicht mehr benötigt, da das Frontend den initialen Prompt sendet
# def get_intro_for_scenario(scenario):
#     """
#     Generiert einen Intro-Text basierend auf dem bestehenden system_prompt
#     """
#     if scenario == "libre":
#         return "Bonjour ! Prêt pour une conversation libre en français ?"
    
#     # Nutze den bestehenden system_prompt und füge nur die Scenario-Anweisung hinzu
#     intro_request = f"L'étudiant veut pratiquer le thème '{scenario}'. Commence notre conversation avec une question ou situation engageante pour ce thème."
    
#     # Verwende die normale query_llm_mistral Funktion, die bereits den system_prompt enthält
#     return query_llm_mistral(intro_request, max_tokens=150, temperature=0.7)

def post_process_response(text, max_chars=200):
    """
    Nachbearbeitung der Antwort für optimale TTS-Nutzung
    
    Args:
        text (str): Ursprüngliche Antwort
        max_chars (int): Maximale Zeichenanzahl
    
    Returns:
        str: Optimierte Antwort
    """
    # Entferne überflüssige Leerzeichen
    text = " ".join(text.split())
    
    # Wenn Text zu lang ist, schneide bei Satzende ab
    if len(text) > max_chars:
        # Finde letzten Satz vor max_chars
        sentences = text.split('. ')
        result = ""
        
        for sentence in sentences:
            if len(result + sentence + '. ') <= max_chars:
                result += sentence + '. '
            else:
                break
        
        # Falls kein kompletter Satz passt, schneide hart ab
        if not result.strip():
            result = text[:max_chars-3] + "..."
        
        text = result.strip()
    
    # Stelle sicher, dass Satz mit Punkt endet
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    
    return text

# Hilfsfunktion für verschiedene Konversationstypen
def query_llm_for_scenario(prompt, scenario="general", history=None, max_tokens=160):
    """
    Spezialisierte LLM-Abfrage je nach Szenario mit Konversationshistorie.
    
    Args:
        prompt (str): Benutzereingabe
        scenario (str): Konversationsszenario
        history (list, optional): Die Konversationshistorie.
        max_tokens (int): Maximale Token-Anzahl
    
    Returns:
        str: Angepasste Antwort
    """
    scenario_configs = {
        "restaurant": {
            "max_tokens": 120,  # Kürzere Antworten für Restaurant-Dialog
            "temperature": 0.6
        },
        "loisirs": {
            "max_tokens": 160,  # Etwas längere Antworten für Hobbies
            "temperature": 0.8
        },
        "travail": {
            "max_tokens": 140,  # Professionelle, präzise Antworten
            "temperature": 0.5
        },
        "voyage": {
            "max_tokens": 150,  # Ausgewogene Länge für Reisethemen
            "temperature": 0.7
        },
        "general": {
            "max_tokens": 150,
            "temperature": 0.7
        }
    }
    
    config = scenario_configs.get(scenario, scenario_configs["general"])
    # NEU: Historie an query_llm_mistral übergeben
    return query_llm_mistral(prompt, history=history, **config)