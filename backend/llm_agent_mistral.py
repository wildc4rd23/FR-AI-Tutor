# backend/llm_agent_mistral.py

import os
import requests
import logging
import json

logger = logging.getLogger(__name__)

# LLM URL
MISTRAL_BASE_URL = "https://api.mistral.ai/v1/chat/completions"

def get_scenario_system_prompt(scenario):
    """
    Szenario-spezifische System-Prompts für bessere Gesprächsqualität.
    Diese Funktion ist jetzt die EINZIGE Quelle für alle LLM-Anweisungen
    und beinhaltet auch die Start-Beispiele.
    """
    base_prompt = """Tu es un professeur de français expérimenté qui aide des étudiants de niveau B1/B2. 
    
    RÈGLES IMPORTANTES POUR TES RÉPONSES:
    - Réponds TOUJOURS en français
    - Garde tes réponses concises mais informatives (2-4 phrases maximum)
    - NE réponds PAS par des phrases trop courtes ou des mots uniques (sauf si c'est une question très simple)
    - Corrige gentiment les erreurs de l'étudiant sans être condescendant
    - Pose TOUJOURS une question ouverte pour relancer la conversation
    - Utilise un vocabulaire approprié au niveau B1/B2
    - Sois encourageant, patient et bienveillant
    - Agis comme un véritable partenaire de discussion.
    """
    
    scenario_details = {
        "restaurant": {
            "context": """
            CONTEXTE SPÉCIFIQUE - RESTAURANT:
            - Tu joues le rôle d'un serveur français dans un restaurant traditionnel.
            - L'étudiant est un client qui veut commander.
            - Guide-le à travers l'expérience complète : accueil, menu, commande, paiement.
            - Introduis du vocabulaire culinaire français authentique.
            - Crée des situations réalistes (plats du jour, recommandations, allergies).
            - Utilise des expressions typiques des serveurs français.
            - Propose des spécialités régionales françaises.
            """,
            "starter_example": "Bonjour ! Bienvenue chez 'Le Délice Français'. Avez-vous une réservation ? Ou vous préférez une table pour combien de personnes ?"
        },
        "faire_les_courses": {
            "context": """
            CONTEXTE SPÉCIFIQUE - FAIRE LES COURSES:
            - Tu joues le rôle d'un employé de supermarché ou d'un vendeur sur un marché français.
            - L'étudiant est un client qui fait ses courses.
            - Aide-le à trouver des produits, réponds à ses questions sur les articles, gère la caisse.
            - Introduis du vocabulaire lié aux courses, aux produits alimentaires et non-alimentaires.
            - Crée des situations réalistes (demander le prix, choisir des fruits, payer).
            - Utilise des expressions courantes pour conseiller ou aider.
            """,
            "starter_example": "Bonjour ! Bienvenue au supermarché 'Au Bon Panier'. Puis-je vous aider à trouver quelque chose en particulier ? Ou vous cherchez des produits frais ?"
        },
        "visite_chez_le_médecin": {
            "context": """
            CONTEXTE SPÉCIFIQUE - VISITE CHEZ LE MÉDECIN:
            - Tu joues le rôle d'un médecin généraliste français.
            - L'étudiant est un patient qui vient en consultation pour un problème de santé.
            - Pose des questions sur les symptômes, propose un diagnostic, explique un traitement ou un examen.
            - Introduis du vocabulaire médical de base, des parties du corps, des maladies courantes.
            - Crée des situations réalistes (décrire la douleur, prendre rendez-vous, comprendre une ordonnance).
            - Utilise un ton professionnel et empathique.
            """,
            "starter_example": "Bonjour, entrez je vous en prie. Comment allez-vous aujourd'hui ? Qu'est-ce qui vous amène à consulter ?"
        },
        "loisirs": {
            "context": """
            CONTEXTE SPÉCIFIQUE - LOISIRS:
            - Tu es un ami ou une connaissance de l'étudiant, qui discute de ses activités de loisirs.
            - L'étudiant parle de ses hobbies, ses passions, ce qu'il aime faire pendant son temps libre.
            - Pose des questions ouvertes sur les intérêts de l'étudiant, partage tes propres expériences.
            - Introduis du vocabulaire lié aux activités culturelles, sportives, artistiques, voyages, etc.
            - Crée une discussion fluide et naturelle sur des sujets personnels et divertissants.
            - Sois curieux et encourage l'étudiant à s'exprimer sur ses préférences.
            """,
            "starter_example": "Salut ! Qu'est-ce que tu aimes faire pendant ton temps libre ? Tu as des hobbies ?"
        },
        "travail": {
            "context": """
            CONTEXTE SPÉCIFIQUE - TRAVAIL:
            - Tu es un collègue ou un recruteur qui discute avec l'étudiant de son travail ou de sa carrière.
            - L'étudiant parle de son emploi actuel, de ses expériences passées ou de ses aspirations professionnelles.
            - Pose des questions sur ses missions, ses responsabilités, ses compétences, ses projets futurs.
            - Introduis du vocabulaire professionnel, des expressions liées au monde du travail et de l'entreprise.
            - Crée une discussion constructive sur le parcours professionnel de l'étudiant.
            - Sois encourageant et donne des conseils si approprié.
            """,
            "starter_example": "Bonjour ! C'est un plaisir de vous rencontrer. Parlez-moi un peu de votre travail. Qu'est-ce qui vous passionne dans votre domaine ?"
        },
        "voyage": {
            "context": """
            CONTEXTE SPÉCIFIQUE - VOYAGE:
            - Tu es un agent de voyage ou un ami qui discute des projets de voyage de l'étudiant.
            - L'étudiant souhaite parler de ses expériences de voyage passées, de ses destinations rêvées ou de la planification d'un futur voyage.
            - Pose des questions sur les lieux, les activités, les préparatifs, les impressions de voyage.
            - Introduis du vocabulaire lié au tourisme, aux transports, à l'hébergement, aux cultures étrangères.
            - Crée une conversation excitante et informative sur les différentes facettes du voyage.
            - Partage des anecdotes ou des recommandations si pertinent.
            """,
            "starter_example": "Bonjour ! Prêt pour l'aventure ? Où aimeriez-vous voyager pour commencer ? Ou vous préférez explorer la France ?"
        },
        "libre": {
            "context": """
            CONTEXTE SPÉCIFIQUE - CONVERSATION LIBRE:
            - Tu es un interlocuteur ouvert et amical pour une conversation générale.
            - L'étudiant peut choisir n'importe quel sujet pour pratiquer son français.
            - Suis le flux de la conversation et adapte-toi aux intérêts de l'étudiant.
            - Maintiens une discussion fluide et naturelle, en posant des questions variées.
            """,
            "starter_example": "Bonjour ! Je suis là pour pratiquer ton français. Quel sujet t'intéresse aujourd'hui ? Nous pouvons parler de tout ce que tu veux !"
        }
    }
    
    # Standard-Szenario, falls nicht gefunden
    current_scenario_detail = scenario_details.get(scenario, scenario_details["libre"])

    full_system_prompt = f"{base_prompt}\n\n" \
                         f"{current_scenario_detail['context']}\n\n" \
                         f"MESSAGE DE DÉPART POUR TOI (PROFESSEUR): Lorsque l'étudiant initiera la conversation, \n" \
                         f"réponds avec une phrase qui ressemble à ceci, adaptée au contexte:\n" \
                         f"'{current_scenario_detail['starter_example']}'\n" \
                         f"Attends que l'étudiant commence vraiment à parler pour t'engager."
    
    # Gib ein Dictionary zurück, das den System-Prompt und den Beispiel-Starter enthält
    return {
        "system_prompt_content": full_system_prompt,
        "starter_example_text": current_scenario_detail['starter_example']
    }

def get_initial_llm_response_for_scenario(scenario, user_id=None):
    """
    Generiert die erste LLM-Antwort für ein Szenario, um die Konversation zu starten.
    Nutzt den umfassenden System-Prompt, um die erste Antwort des LLM zu steuern.
    """
    logger.info(f"Starte initiale LLM-Antwort für Szenario: {scenario}")
    try:
    # Rufe get_scenario_system_prompt auf, um das Dictionary zu erhalten
    prompt_data = get_scenario_system_prompt(scenario)
    system_prompt = prompt_data["system_prompt_content"]
    starter_fallback_text = prompt_data["starter_example_text"] # Direkter Zugriff auf den Fallback-Text
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    # Versuche, die LLM-Antwort zu erhalten
    response_text = query_llm(messages, max_tokens=150, temperature=0.7)
    
    if not response_text.strip():
        logger.warning(f"LLM generierte leere Startantwort für {scenario}. Fallback auf statischen Starter.")
        return {'response': starter_fallback_text} # Nutze den vorbereiteten Fallback

    logger.info(f"✅ Erste LLM-Antwort für {scenario} generiert: {len(response_text)} Zeichen")
    return {'response': response_text}
        
    except Exception as e:
        logger.error(f"❌ Fehler bei der ersten LLM-Antwort für {scenario}: {str(e)}")
        # Im Fehlerfall wird direkt der korrekte Starter-Text als Fallback verwendet.
        # Ein zusätzlicher try/except ist hier nicht mehr nötig, da starter_fallback_text immer definiert ist.
        try:
            # Versuche, den Fallback-Text erneut abzurufen, falls der Fehler VOR der Definition aufgetreten wäre
            # (was hier nicht der Fall sein sollte, aber zur Robustheit)
            final_fallback_text = get_scenario_system_prompt(scenario)["starter_example_text"]
        except Exception:
            final_fallback_text = "Bonjour ! Je suis prêt à pratiquer le français avec toi." # Letzter Notfall-Fallback
            
        return {'response': final_fallback_text}

# Die Funktion query_llm bleibt wie im letzten Schritt mit den erweiterten Loggings.
# Sie ist die generische Funktion für die LLM-Interaktion.
def query_llm(messages, max_tokens=160, temperature=0.7):
    mistral_api_key = os.environ.get("MISTRAL_API_KEY")
    mistral_base_url = MISTRAL_BASE_URL
    
    if not mistral_api_key:
        logger.error("MISTRAL_API_KEY environment variable not set.")
        raise ValueError("Mistral API Key is not configured.")
    if not mistral_base_url:
        logger.error("MISTRAL_BASE_URL environment variable not set.")
        raise ValueError("Mistral Base URL is not configured.")

    logger.info(f"Mistral API Base URL: {mistral_base_url}")
    logger.info(f"Mistral API Key (masked): {mistral_api_key[:4]}...{mistral_api_key[-4:]}")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {mistral_api_key}"
    }

    payload = {
        "model": "mistral-tiny", # Oder Ihr gewähltes Modell
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "random_seed": 42
    }

    try:
        logger.info(f"Sending request to Mistral API with payload: {json.dumps(payload)}")
        response = requests.post(f"{mistral_base_url}/v1/chat/completions", headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        
        response_json = response.json()
        logger.info(f"Received raw response from Mistral API: {json.dumps(response_json)}")

        if 'choices' in response_json and len(response_json['choices']) > 0:
            llm_content = response_json['choices'][0]['message']['content'].strip()
            if not llm_content:
                logger.warning("Mistral API returned empty content.")
                return ""
            return llm_content
        else:
            logger.error(f"Unexpected response structure from Mistral API: {response_json}")
            raise ValueError("Unexpected response from LLM provider.")

    except requests.exceptions.Timeout:
        logger.error("Request to Mistral API timed out.")
        raise ConnectionError("Mistral API request timed out.")
    except requests.exceptions.RequestException as e:
        logger.error(f"Network or API error communicating with Mistral: {e}")
        raise ConnectionError(f"Failed to connect to Mistral API: {e}")
    except json.JSONDecodeError:
        logger.error(f"Failed to decode JSON response from Mistral API. Raw response: {response.text}")
        raise ValueError("Invalid JSON response from LLM provider.")
    except Exception as e:
        logger.critical(f"An unexpected error occurred in query_llm: {e}", exc_info=True)
        raise

# query_llm_for_scenario bleibt ebenfalls bestehen und nutzt query_llm intern.
# Stellen Sie sicher, dass diese Funktion den System-Prompt korrekt in die Messages-Liste einfügt.
def query_llm_for_scenario(prompt, scenario="libre", history=None, max_tokens=160):
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

    # Hier ist es entscheidend, dass der System-Prompt bei JEDER Abfrage mitgesendet wird.
    system_prompt = get_scenario_system_prompt(scenario)
    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for item in history:
            messages.append({"role": item['role'], "content": item['content']})
    
    messages.append({"role": "user", "content": prompt})
    
    return query_llm(messages, config["max_tokens"], config["temperature"])