# backend/llm_agent_mistral.py - Optimierte Version
import os
import requests
import logging
import json

logger = logging.getLogger(__name__)

# Modifizierte get_scenario_system_prompt, um optional eine Anweisung für die erste Antwort zu akzeptieren

def get_scenario_system_prompt(scenario, first_turn_instruction_example=None):

    """
    Erweiterte szenario-spezifische System-Prompts für bessere Gesprächsqualität.
    Kann optional eine Anweisung für die erste Antwort enthalten.
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
    logger.info(f"Base System Prompt geladen (Anfang): {base_prompt[:100]}...") # Loggen des Base Prompts

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
        - Tu joues le rôle d'un vendeur
        """,

         "visite_chez_le_médecin": base_prompt + """
        
        CONTEXTE SPÉCIFIQUE - VISITE CHEZ LE MÉDECIN        
        - Tu joues le rôle d'un docteur
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

    if first_turn_instruction_example:

        selected_prompt += f"\n\nVOTRE PREMIÈRE RÉPONSE DOIT RESSEMBLER À UN EXEMPLE COMME : « {first_turn_instruction_example} ». Votre réponse doit sembler naturelle et comme un début direct de conversation."
        logger.info(f"Szenario-spezifischer Prompt mit Erst-Antwort-Anweisung (Anfang): {selected_prompt[:150]}...")

    else:

        logger.info(f"Szenario-spezifischer Prompt '{scenario}' ausgewählt (Anfang): {selected_prompt[:100]}...") # Loggen des Szenario Prompts

    return selected_prompt

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

# Modifizierte query_llm_mistral, um das neue first_turn_instruction_example-Argument zu akzeptieren und weiterzugeben

def query_llm_mistral(prompt, history=None, max_tokens=150, temperature=0.7, scenario="libre", first_turn_instruction_example=None):

    """
    Fragt Mistral LLM ab mit Längenbegrenzung und Konversationshistorie.
    Kann optional eine Anweisung für die erste Antwort übergeben, die den System-Prompt ergänzt.
    """

    api_key = os.environ.get("MISTRAL_API_KEY")

    if not api_key:

        raise Exception("MISTRAL_API_KEY Umgebungsvariable fehlt")

    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {

        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Erweiterten System-Prompt für Französisch-Tutor erstellen mit Beispiel je szenario
    system_prompt = get_scenario_system_prompt(scenario, first_turn_instruction_example=first_turn_instruction_example)

    logger.info(f"Finaler System Prompt für LLM (Anfang): {system_prompt[:100]}...") # Loggen des finalen System Prompts
    messages = [{"role": "system", "content": system_prompt}]

    # Sicherstellen, dass die Historie nicht den System-Prompt enthält, da dieser separat hinzugefügt wird
    if history:
        messages.extend(history)
    
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": "mistral-small-latest",
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.9,
        "random_seed": 42, # Für reproduzierbare Ergebnisse, optional
        "stop": [".", "!", "?", "\n\n"]
    }
    
    #neu logging zentral in app.py:
    # Loggen der gesamten Konversation für Debugging/Überwachung
    #logger.info("🗣️ Komplette LLM-Konversation gesendet: %s", json.dumps(messages, indent=2, ensure_ascii=False))

    # Debugging: Nur erste und letzte Nachricht loggen (vom Benutzer bereitgestellt)
    #debug_messages = {
    #    "system": messages[0]["content"][:100] + "...",
    #    "last_user": messages[-1]["content"],
    #   "history_length": len(messages) - 2,  # Ohne System und aktuellen Prompt
    #    "scenario": scenario
    #}
    #logger.info("🧠 LLM Mistral Request Summary: %s", json.dumps(debug_messages, indent=2, ensure_ascii=False))

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"].strip()
        
        # Nachbearbeitung für TTS (bestehende Funktion post_process_response wird genutzt)
        content = post_process_response(content, max_chars=200)
        
        logger.info(f"✅ Mistral response: {len(content)} characters")
        return content
        
    except requests.exceptions.RequestException as e:
        logger.error(f"❌ Mistral API error: {str(e)}")
        raise Exception(f"Mistral API Fehler: {str(e)}")
    except KeyError as e:
        logger.error(f"❌ Unexpected response format: {result}")
        raise Exception("Unerwartetes Antwortformat von Mistral API")

# NEU: Funktion zum Abrufen der ersten LLM-Antwort für ein Szenario

def get_initial_llm_response_for_scenario(scenario):

    """
    Ruft die erste LLM-Antwort für ein neues Szenario ab,
    indem der Starter-Text als Anweisung in den System-Prompt integriert wird.
    """

    initial_prompt_for_llm = "Bonjour ! Commençons notre conversation." 
    starter_example = get_scenario_starter(scenario) 

    first_llm_response = query_llm_mistral(

        prompt=initial_prompt_for_llm,
        history=None, 
        scenario=scenario,
        first_turn_instruction_example=starter_example 
    )

    return first_llm_response

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