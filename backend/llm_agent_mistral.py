# backend/llm_agent_mistral.py - Optimierte Version
import os
import requests
import logging
import json

logger = logging.getLogger(__name__)

# NEU: Vereinfachte Funktion für die erste LLM-Antwort
def get_initial_llm_response_for_scenario(scenario):
    """
    Ruft die erste LLM-Antwort für ein neues Szenario ab.
    Diese Funktion generiert eine natürliche erste Antwort basierend auf dem Szenario.
    """
    logger.info(f"Generiere erste LLM-Antwort für Szenario: {scenario}")
    
    # Spezifische Prompts für die erste Antwort je Szenario
    initial_prompts = {
        "restaurant": "Begrüße mich als Kellner in einem französischen Restaurant und frage nach meinen Wünschen.",
        "faire_les_courses": "Begrüße mich als Verkäufer im Supermarkt und frage, womit du mir helfen kannst.",
        "visite_chez_le_médecin": "Begrüße mich als Arzt und frage nach meinem Befinden.",
        "loisirs": "Beginne ein Gespräch über Freizeit und Hobbys. Erzähle kurz von deinem eigenen Hobby und frage nach meinen.",
        "travail": "Beginne ein Gespräch über Arbeit und Beruf. Stelle dich vor und frage nach meinem Beruf.",
        "voyage": "Beginne ein Gespräch über Reisen in Frankreich. Empfehle eine Region und frage nach meinen Reiseplänen.",
        "libre": "Beginne ein freundliches Gespräch auf Französisch und frage, über was wir sprechen möchten."
    }
    
    initial_prompt = initial_prompts.get(scenario, initial_prompts["libre"])
    
    try:
        # Generiere die erste Antwort mit dem LLM
        response = query_llm_mistral(
            prompt=initial_prompt,
            history=None,  # Keine Historie für die erste Antwort
            scenario=scenario,
            max_tokens=120,
            temperature=0.7
        )
        
        logger.info(f"✅ Erste LLM-Antwort für {scenario} generiert: {len(response)} Zeichen")
        return response
        
    except Exception as e:
        logger.error(f"❌ Fehler bei der ersten LLM-Antwort für {scenario}: {str(e)}")
        # Fallback auf statischen Starter
        return get_scenario_starter(scenario)

# Vereinfachte System-Prompt Funktion (ohne first_turn_instruction_example)
def get_scenario_system_prompt(scenario):
    """
    Szenario-spezifische System-Prompts für bessere Gesprächsqualität.
    """
    base_prompt = """Tu es un professeur de français expérimenté qui aide des étudiants de niveau B1/B2. 
    
    RÈGLES IMPORTANTES:
    - Réponds TOUJOURS en français
    - Garde tes réponses concises mais informatives (2-4 phrases maximum)
    - NE réponds PAS par des phrases trop courtes ou des mots uniques
    - Corrige gentiment les erreurs sans être condescendant
    - Pose TOUJOURS une question ouverte pour relancer la conversation
    - Utilise un vocabulaire approprié au niveau B1/B2
    - Sois encourageant, patient et bienveillant
    - Agis comme un véritable partenaire de discussion
    """
    
    scenario_prompts = {
        "restaurant": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - RESTAURANT:
        - Tu joues le rôle d'un serveur français dans un restaurant traditionnel
        - L'étudiant est un client qui veut commander
        - Guide-le à travers l'expérience complète : accueil, menu, commande, paiement
        - Introduis du vocabulaire culinaire français authentique
        - Crée des situations réalistes (plats du jour, recommandations, allergies)
        - Utilise des expressions typiques des serveurs français
        - Propose des spécialités régionales françaises
        """,

        "faire_les_courses": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - AU SUPERMARCHÉ:
        - Tu joues le rôle d'un vendeur dans un supermarché français
        - Aide l'étudiant à trouver des produits
        - Introduis le vocabulaire des aliments et produits du quotidien
        - Crée des situations réalistes (prix, quantités, promotions)
        - Utilise des expressions typiques des commerces français
        """,

        "visite_chez_le_médecin": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - VISITE CHEZ LE MÉDECIN:
        - Tu joues le rôle d'un docteur français bienveillant
        - L'étudiant est un patient qui décrit ses symptômes
        - Introduis le vocabulaire médical de base
        - Crée des situations réalistes (symptômes, examens, conseils)
        - Utilise des expressions typiques des consultations médicales
        """,
        
        "loisirs": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - LOISIRS:
        - Explore ses passions et découvre de nouveaux hobbies ensemble
        - Partage des anecdotes sur les loisirs populaires en France
        - Introduis des activités culturelles françaises (pétanque, randonnée, festivals)
        - Discute des différences culturelles dans les loisirs
        - Encourage à partager ses expériences personnelles
        - Propose des activités qu'il pourrait essayer en France
        """,
        
        "travail": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - TRAVAIL:
        - Joue le rôle d'un collègue français ou d'un recruteur bienveillant
        - Discute des différences dans la culture du travail française
        - Introduis le vocabulaire professionnel français
        - Aborde les sujets : entretiens, réunions, congés, relations collègues
        - Explique les spécificités du système français (35h, RTT, etc.)
        - Aide à préparer des situations professionnelles réelles
        """,
        
        "voyage": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - VOYAGE:
        - Tu es un guide touristique français passionné
        - Fais découvrir les régions françaises avec enthousiasme
        - Partage des conseils pratiques et des secrets locaux
        - Introduis la géographie, l'histoire et les traditions françaises
        - Aide à planifier un voyage réaliste en France
        - Raconte des anecdotes sur les destinations françaises
        """,
        
        "libre": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - CONVERSATION LIBRE:
        - Adapte-toi au sujet choisi par l'étudiant
        - Enrichis la conversation avec des éléments culturels français
        - Introduis naturellement du vocabulaire avancé
        - Encourage l'expression d'opinions personnelles
        - Crée des connexions avec l'actualité française
        """
    }
    
    selected_prompt = scenario_prompts.get(scenario, scenario_prompts["libre"])
    logger.info(f"Szenario-spezifischer Prompt '{scenario}' ausgewählt")
    return selected_prompt

# Vereinfachte LLM-Abfrage ohne first_turn_instruction_example
def query_llm_mistral(prompt, history=None, max_tokens=150, temperature=0.7, scenario="libre"):
    """
    Fragt Mistral LLM ab mit Längenbegrenzung und Konversationshistorie.
    """
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise Exception("MISTRAL_API_KEY Umgebungsvariable fehlt")

    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # System-Prompt für Szenario erstellen
    system_prompt = get_scenario_system_prompt(scenario)
    messages = [{"role": "system", "content": system_prompt}]

    # Historie hinzufügen
    if history:
        messages.extend(history)
    
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "mistral-small-latest",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
        "random_seed": 42,
        "stop": [".", "!", "?", "\n\n"]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        
        # Nachbearbeitung für TTS
        content = post_process_response(content, max_chars=200)
        
        logger.info(f"✅ Mistral response: {len(content)} characters")
        return content
        
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Mistral API error: {str(e)}")
        raise Exception(f"Mistral API Fehler: {str(e)}")
    except KeyError as e:
        logger.error(f"❌ Unexpected response format: {result}")
        raise Exception("Unerwartetes Antwortformat von Mistral API")

def get_scenario_starter(scenario):
    """
    Definiert szenario-spezifische Starter-Prompts, die nun als Beispiele/Anweisungen dienen.
    """
    starters = {
        "restaurant": """Bonjour et bienvenue dans notre restaurant ! Je vois que vous regardez la carte. 
        Puis-je vous expliquer nos spécialités du jour ? Nous avons un excellent coq au vin aujourd'hui. 
        Avez-vous déjà goûté la cuisine française traditionnelle ?""",

        "faire_les_courses": """Bonjour, comment puis-je vous aider? Vous cherchez quelque chose de spécifique?
        Nous vous proposons une offre spéciale aujourd'hui.""",

         "visite_chez_le_médecin": """Bonjour! Comment va votre jambe aujourd'hui? Avez-vous mal au genou? 
         Avez-vous besoin d'une ordonnance pour des médicaments?""",
        
        "loisirs": """Salut ! J'adore découvrir ce que les gens font pendant leur temps libre. 
        Moi, le weekend dernier, j'ai fait une randonnée dans les Alpes - c'était magnifique ! 
        Et vous, qu'est-ce que vous aimez faire quand vous avez du temps libre ?""",
        
        "travail": """Bonjour ! Je suis ravi de vous rencontrer. Parlons un peu de votre parcours professionnel. 
        Quel est votre domaine d'expertise ? Qu'est-ce qui vous motive le plus dans votre travail ?""",

        "voyage": """Bienvenue ! Si vous pouviez voyager n'importe où en France, quelle région choisiriez-vous et pourquoi ?""",

        "libre": """Bonjour ! Je suis là pour pratiquer le français avec vous. Quel sujet aimeriez-vous aborder aujourd'hui ?"""
    }
    
    selected_starter = starters.get(scenario, starters["libre"])
    logger.info(f"Szenario-Starter '{scenario}' ausgewählt (Anfang): {selected_starter[:100]}...") # Loggen des Starters
    return selected_starter

def post_process_response(text, max_chars=200):

    """
    Verbesserte Nachbearbeitung für TTS-Optimierung

    """
    text = " ".join(text.split())

    if len(text) > max_chars:
        sentences = text.split('. ')
        result = ""

        for sentence in sentences:
            if len(result + sentence + '. ') <= max_chars:
                result += sentence + '. '
            else:
                break

        if not result.strip():
            result = text[:max_chars-3] + "..."  
        text = result.strip()
    
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    
    return text

# unklar ob verwendet
def query_llm_for_scenario(prompt, scenario="libre", history=None, max_tokens=160):
    """
    Szenario-spezifische LLM-Abfrage mit optimierten Parametern
    """
    scenario_configs = {
        "restaurant": {"max_tokens": 120, "temperature": 0.6},
        "loisirs": {"max_tokens": 160, "temperature": 0.8},
        "travail": {"max_tokens": 140, "temperature": 0.5},
        "voyage": {"max_tokens": 150, "temperature": 0.7},
        "libre": {"max_tokens": 150, "temperature": 0.7}
    }
    
    config = scenario_configs.get(scenario, scenario_configs["libre"])
    logger.info(f"LLM-Konfiguration für Szenario '{scenario}': {config}")



    return query_llm_mistral(

        prompt, 
        history=history, 
        max_tokens=config["max_tokens"], 
        temperature=config["temperature"],
        scenario=scenario 

    )


# Diese Funktion wird im neuen Setup nicht mehr direkt als Intro verwendet, 
# sondern dient jetzt nur noch als Quelle für den Starter-Beispieltext.

def get_intro_for_scenario(scenario):

    return get_scenario_starter(scenario)