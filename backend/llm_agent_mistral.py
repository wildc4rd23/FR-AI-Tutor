# backend/llm_agent_mistral.py - Optimierte Version
import os
import requests
import logging
import json

logger = logging.getLogger(__name__)

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

def get_scenario_starter(scenario):
    """
    Definiert szenario-spezifische Starter-Prompts (für Fallback).
    """
    starters = {
        "restaurant": """Bonjour et bienvenue dans notre restaurant ! Je vois que vous regardez la carte. 
        Puis-je vous expliquer nos spécialités du jour ? Nous avons un excellent coq au vin aujourd'hui. 
        Avez-vous déjà goûté la cuisine française traditionnelle ?""",

        "faire_les_courses": """Bonjour, comment puis-je vous aider? Vous cherchez quelque chose de spécifique?
        Nous avons une offre spéciale aujourd'hui sur les fruits et légumes.""",

        "visite_chez_le_médecin": """Bonjour ! Asseyez-vous, s'il vous plaît. Comment vous sentez-vous aujourd'hui ? 
        Pouvez-vous me décrire vos symptômes ?""",
        
        "loisirs": """Salut ! J'adore découvrir ce que les gens font pendant leur temps libre. 
        Moi, le weekend dernier, j'ai fait une randonnée dans les Alpes - c'était magnifique ! 
        Et vous, qu'est-ce que vous aimez faire quand vous avez du temps libre ?""",
        
        "travail": """Bonjour ! Je suis ravi de vous rencontrer. Parlons un peu de votre parcours professionnel. 
        Quel est votre domaine d'expertise ? Qu'est-ce qui vous motive le plus dans votre travail ?""",

        "voyage": """Bonjour ! Si vous pouviez voyager n'importe où en France, quelle région choisiriez-vous ? 
        Moi, je recommande toujours la Provence au printemps - les lavandes sont magnifiques !""",

        "libre": """Bonjour ! Je suis là pour pratiquer le français avec vous. 
        Quel sujet vous intéresse le plus aujourd'hui ?"""
    }
    
    selected_starter = starters.get(scenario, starters["libre"])
    logger.info(f"Szenario-Starter '{scenario}' ausgewählt")
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

def get_initial_llm_response_for_scenario(scenario):
    """
    Ruft die erste LLM-Antwort für ein neues Szenario ab.
    Diese Funktion generiert eine natürliche erste Antwort basierend auf dem Szenario.
    """
    logger.info(f"Generiere erste LLM-Antwort für Szenario: {scenario}")
    
    # Spezifische Prompts für die erste Antwort je Szenario
    initial_prompts = {
        "restaurant": "Salue-moi en tant que serveur dans un restaurant français et demande mes souhaits.",
        "faire_les_courses": "Salue-moi en tant que vendeur au supermarché et demande ce que tu peux faire pour m'aider.",
        "visite_chez_le_médecin": "Salue-moi en tant que médecin et demande comment je me sens.",
        "loisirs": "Commence une conversation sur les loisirs et les hobbies. Parle brièvement de ton propre hobby et demande les miens.",
        "travail": "Commence une conversation sur le travail et la profession. Présente-toi et demande ma profession.",
        "voyage": "Commence une conversation sur les voyages en France. Recommande une région et demande mes projets de voyage.",
        "libre": "Commence une conversation amicale en français et demande de quoi nous voulons parler."
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

def query_llm_for_scenario(prompt, scenario="libre", history=None, max_tokens=160):
    """
    Szenario-spezifische LLM-Abfrage mit optimierten Parametern
    """
    scenario_configs = {
        "restaurant": {"max_tokens": 120, "temperature": 0.6},
        "faire_les_courses": {"max_tokens": 120, "temperature": 0.6},
        "visite_chez_le_médecin": {"max_tokens": 120, "temperature": 0.6},
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

# Alias für Rückwärtskompatibilität
def get_intro_for_scenario(scenario):
    """Alias für get_scenario_starter (für Rückwärtskompatibilität)"""
    return get_scenario_starter(scenario)