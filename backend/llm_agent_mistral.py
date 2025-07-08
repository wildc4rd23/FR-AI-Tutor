# backend/llm_agent_mistral.py - Optimierte Version
import os
import requests
import logging
import json

logger = logging.getLogger(__name__)

def get_scenario_system_prompt(scenario):
    """
    Erweiterte szenario-spezifische System-Prompts für bessere Gesprächsqualität
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
    
    return scenario_prompts.get(scenario, scenario_prompts["libre"])

def get_scenario_starter(scenario):
    """
    Szenario-spezifische Starter-Prompts für natürlichere Gespräche
    """
    starters = {
        "restaurant": """Bonjour et bienvenue dans notre restaurant ! Je vois que vous regardez la carte. 
        Puis-je vous expliquer nos spécialités du jour ? Nous avons un excellent coq au vin aujourd'hui. 
        Avez-vous déjà goûté la cuisine française traditionnelle ?""",
        
        "loisirs": """Salut ! J'adore découvrir ce que les gens font pendant leur temps libre. 
        Moi, le weekend dernier, j'ai fait une randonnée dans les Alpes - c'était magnifique ! 
        Et vous, qu'est-ce que vous aimez faire quand vous avez du temps libre ?""",
        
        "travail": """Bonjour ! Je suis ravi de vous rencontrer. J'ai vu votre profil et votre parcours m'intéresse beaucoup. 
        Parlez-moi un peu de votre expérience professionnelle. 
        Qu'est-ce qui vous motive le plus dans votre travail ?""",
        
        "voyage": """Bonjour et bienvenue ! Je suis guide touristique depuis 10 ans et j'adore faire découvrir la France. 
        Dites-moi, c'est votre première fois en France ou vous connaissez déjà quelques régions ? 
        Qu'est-ce qui vous attire le plus : la gastronomie, l'histoire, ou les paysages ?""",
        
        "libre": """Bonjour ! Je suis ravi de discuter avec vous aujourd'hui. 
        J'aime les conversations spontanées - on apprend toujours quelque chose d'intéressant ! 
        De quoi avez-vous envie de parler ? Ou voulez-vous que je vous pose une question pour commencer ?"""
    }
    
    return starters.get(scenario, starters["libre"])

def query_llm_mistral(prompt, history=None, max_tokens=150, temperature=0.7, scenario="libre"):
    """
    Optimierte LLM-Abfrage mit szenario-spezifischen Prompts
    """
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise Exception("MISTRAL_API_KEY Umgebungsvariable fehlt")
    
    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Szenario-spezifischen System-Prompt verwenden
    system_prompt = get_scenario_system_prompt(scenario)
    messages = [{"role": "system", "content": system_prompt}]
    
    # Historie hinzufügen (ohne Duplikate)
    if history:
        # Filtere System-Prompts aus der Historie
        filtered_history = [msg for msg in history if msg.get("role") != "system"]
        messages.extend(filtered_history)
    
    # Aktuellen Prompt hinzufügen
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "mistral-small",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
        "stop": [".", "!", "?", "\n\n"]
    }
    
    # Debugging: Nur erste und letzte Nachricht loggen
    debug_messages = {
        "system": messages[0]["content"][:100] + "...",
        "last_user": messages[-1]["content"],
        "history_length": len(messages) - 2,  # Ohne System und aktuellen Prompt
        "scenario": scenario
    }
    logger.info("🧠 LLM Mistral Request Summary: %s", json.dumps(debug_messages, indent=2, ensure_ascii=False))

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

def get_intro_for_scenario(scenario):
    """
    Direkte Rückgabe des Starter-Texts ohne LLM-Aufruf
    """
    return get_scenario_starter(scenario)

def post_process_response(text, max_chars=200):
    """
    Verbesserte Nachbearbeitung für TTS-Optimierung
    """
    # Bereinigung
    text = " ".join(text.split())
    
    # Längenoptimierung
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
    
    # Satzende sicherstellen
    if text and not text.endswith(('.', '!', '?')):
        text += '.'
    
    return text

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
    return query_llm_mistral(prompt, history=history, scenario=scenario, **config)