// Optimiertes script.js mit verbesserter Audioaufnahme
document.addEventListener('DOMContentLoaded', function() {
  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    sendBtn: document.getElementById('sendMessage'),
    startBtn: document.getElementById('startConversation'),
    newConvBtn: document.getElementById('newConversation'),
    showResponseBtn: document.getElementById('showResponseBtn'),
    userText: document.getElementById('userText'),
    responseText: document.getElementById('responseText'),
    llmAudioPlayback: document.getElementById('audioPlayback'), // Umbenannt zur Klarheit
    userAudio: document.getElementById('userAudio'),
    startSection: document.getElementById('startSection'),
    conversationSection: document.getElementById('conversationSection'),
    scenarioSelect: document.getElementById('scenario'),
    recordingStatus: document.getElementById('recordingStatus')
  };

  // KORREKTUR: Überprüfen, ob Elemente existieren, bevor classList verwendet wird
  // Initialer Zustand der UI-Elemente mit robusteren bedingten Operationen
  elements.stopBtn && elements.stopBtn.classList.add('hidden');
  elements.sendMessage && elements.sendMessage.classList.add('hidden');
  elements.userAudio && elements.userAudio.classList.add('hidden');
  elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden'); // LLM-Antwort Audio
  elements.responseText && elements.responseText.classList.add('hidden'); // LLM-Antwort Text
  elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden'); // Button zum Anzeigen/Verbergen des Textes


  let mediaRecorder;
  let audioChunks = [];
  let recognition;
  let recordedAudioBlob = null;
  let currentAudioStream = null;
  let currentUserId = null;
  let currentResponse = null; // Speichert die gesamte Antwort vom Backend
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = true;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = '';
  let isRecognitionRestarting = false;
  let currentScenario = 'libre';
  let autoSendAfterRecording = false; // Konfig automatisches Senden der UserAufnahme
  let isRecording = false; // Status-Tracker
  let isPaused = false; // Neuer Status für Pause
  let isLlmAudioPlaying = false; // Um Audio-Wiedergabestatus zu verfolgen
  // NEU: Konversationshistorie
  let conversationHistory = []; // Speichert Nachrichten als {role: 'user'/'assistant', content: 'text'}

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    // Mobile-spezifische Optimierungen
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Applying mobile-specific speech recognition settings');
      // Für mobile Geräte weniger aggressive continuous recognition
      recognition.continuous = false; // Weniger Probleme auf Mobile
      // Andere mobile Optimierungen könnten hier hinzugefügt werden
    }

    recognition.onresult = (event) => {
      console.log('Speech recognition result received');
      let interimTranscript = '';
      let newFinalTranscript = '';
      
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          newFinalTranscript += transcript + ' ';
          console.log('Final transcript added:', transcript);
        } else {
          interimTranscript += transcript;
        }
      }

      if (newFinalTranscript.trim()) {
        finalTranscript += newFinalTranscript;
        console.log('Updated final transcript:', finalTranscript);
      }

      const displayText = (finalTranscript + interimTranscript).trim();
      if (elements.userText && displayText) {
          elements.userText.textContent = displayText;
      }
      elements.userText && elements.userText.classList.remove('placeholder');
      elements.userText && elements.userText.setAttribute('data-is-placeholder', 'false');

      const statusText = interimTranscript ? 
        `🎤 Écoute... "${interimTranscript}"` : 
        (newFinalTranscript ? `🎤 Transcrit: "${newFinalTranscript.trim()}"` : '🎤 En écoute...');
      showStatus(elements.recordingStatus, statusText, 'success');
    };

    // ERWEITERTE Error-Handler für Mobile
    recognition.onerror = (event) => {
      console.error('Speech recognition error (mobile-optimized):', event.error);
      
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      let shouldRestart = false;
      let showInstructions = false;
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé';
          recognitionActive = false;
          showInstructions = true;
          break;
        case 'no-speech':
          console.log('No speech detected, will restart...');
          shouldRestart = !isMobile; // Auf Mobile weniger aggressive Restarts
          errorMessage = null;
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau';
          shouldRestart = true;
          break;
        case 'service-not-allowed':
          errorMessage = '🚫 Service de reconnaissance vocale bloqué';
          recognitionActive = false;
          showInstructions = true;
          break;
        case 'aborted':
          return;
        default:
          shouldRestart = !isMobile; // Auf Mobile vorsichtiger
          break;
      }
      
      recognitionActive = false;
      
      if (errorMessage) {
        showStatus(elements.recordingStatus, errorMessage, 'error');
      }
      
      if (showInstructions) {
        setTimeout(() => showManualPermissionInstructions(), 1000);
      }
      
      if (shouldRestart && !isRecognitionRestarting && isRecording && !isPaused) {
        setTimeout(() => {
          if (!isRecognitionRestarting && isRecording && !isPaused) {
            startRecognition();
          }
        }, isMobile ? 2000 : 1000); // Längere Wartezeit auf Mobile
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      recognitionActive = false;
      // KORREKTUR: Sicherstellen, dass nur neu gestartet wird, wenn nicht manuell gestoppt oder pausiert
      if (!isRecognitionRestarting && isRecording && !isPaused) {
        setTimeout(() => {
          if (!isRecognitionRestarting && !recognitionActive && isRecording && !isPaused) {
            startRecognition(); // Rekursiver Aufruf
          }
        }, 500);
      }
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      recognitionActive = true;
      isRecognitionRestarting = false;
    };

    function startRecognition() {
      if (isRecognitionRestarting || isPaused) {
        console.log('Recognition restart already in progress or paused');
        return;
      }

      if (recognitionActive) {
        console.log('Recognition already active, stopping first');
        isRecognitionRestarting = true;
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
        
        setTimeout(() => {
          if (isRealTimeMode && isRecording && !isPaused) {
            startRecognition();
          }
        }, 1000);
        return;
      }

      try {
        console.log('Starting speech recognition, current final transcript:', finalTranscript);
        isRecognitionRestarting = false;
        recognition.start();
        
        setTimeout(() => {
          console.log('Recognition active after start:', recognitionActive);
        }, 200);
        
      } catch (e) {
        console.error('Could not start recognition:', e);
        recognitionActive = false;
        isRecognitionRestarting = false;
        showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
        
        if (isRealTimeMode && isRecording && !isPaused) {
          setTimeout(() => {
            if (isRealTimeMode && !recognitionActive && isRecording && !isPaused) {
              startRecognition();
            }
          }, 3000);
        }
      }
    }


  } else {
    console.warn('SpeechRecognition API nicht verfügbar.');
    showStatus(elements.recordingStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur.', 'warning');
  }

    function stopRecognition() {
      if (recognitionActive) {
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
      }
      recognitionActive = false;
    }

    function resetRecordButton() {
      elements.recordBtn && (elements.recordBtn.innerHTML = '🎙️ Enregistrer');
      elements.recordBtn && elements.recordBtn.classList.remove('recording', 'paused');
      elements.recordBtn && (elements.recordBtn.disabled = false);

      elements.stopBtn && elements.stopBtn.classList.add('hidden');
    }

  // === VERBESSERTE Mikrofonzugriff-Diagnose mit mobile check===
async function checkMicrophonePermissions() {
  try {
    console.log('Checking microphone permissions (mobile-optimized)...');
    
    // 1. HTTPS-Check zuerst
    if (location.protocol !== 'https:' && 
        !location.hostname.includes('localhost') && 
        location.hostname !== '127.0.0.1') {
      showStatus(elements.recordingStatus, '🔒 HTTPS requis pour l\'accès microphone.', 'error');
      return false;
    }

    // 2. User-Agent basierte Mobile-Erkennung
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log('Mobile device detected:', isMobile);

    // 3. MediaDevices API Verfügbarkeit prüfen
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStatus(elements.recordingStatus, '🚫 MediaDevices API nicht verfügbar', 'error');
      return false;
    }

    // 4. SpeechRecognition API Verfügbarkeit prüfen (besonders wichtig für Mobile)
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      showStatus(elements.recordingStatus, '🚫 Spracherkennung in diesem Browser nicht verfügbar', 'error');
      return false;
    }

    // 5. Permission State prüfen (wenn verfügbar)
    let permissionState = null;
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({name: 'microphone'});
        permissionState = permission.state;
        console.log('Current permission state:', permissionState);
        
        if (permissionState === 'denied') {
          showManualPermissionInstructions();
          return false;
        }
      }
    } catch (permError) {
      console.warn('Permission query failed (normal on some browsers):', permError);
    }

    // 6. MOBILE-SPEZIFISCH: User Interaction Check
    if (isMobile && !document.hasStoredGesture && !document.userActivation?.hasBeenActive) {
      console.warn('Mobile: No user gesture detected, permission request may fail');
      showStatus(elements.recordingStatus, '📱 Tippen Sie um Mikrofonzugriff zu aktivieren', 'warning');
      
      // Event Listener für User Interaction
      return new Promise((resolve) => {
        const interactionHandler = async () => {
          document.removeEventListener('touchstart', interactionHandler);
          document.removeEventListener('click', interactionHandler);
          console.log('User interaction detected, retrying permission...');
          resolve(await performActualPermissionTest());
        };
        
        document.addEventListener('touchstart', interactionHandler, { once: true });
        document.addEventListener('click', interactionHandler, { once: true });
        
        // Fallback timeout
        setTimeout(() => {
          document.removeEventListener('touchstart', interactionHandler);
          document.removeEventListener('click', interactionHandler);
          resolve(performActualPermissionTest());
        }, 5000);
      });
    }

    // 7. Direkte Permission-Test durchführen
    return await performActualPermissionTest();

  } catch (error) {
    console.error('Permission check failed:', error);
    showStatus(elements.recordingStatus, '⚠️ Fehler bei Berechtigungsprüfung: ' + error.message, 'error');
    return false;
  }
}

// Hilfsfunktion für den eigentlichen Permission-Test
async function performActualPermissionTest() {
  try {
    console.log('Performing actual microphone permission test...');
    showStatus(elements.recordingStatus, '🎙️ Prüfe Mikrofonzugriff...', 'loading');

    // Mobile-optimierte Audio-Constraints
    const constraints = { 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Mobile-spezifische Optimierungen
        sampleRate: { ideal: 44100, min: 8000 },
        channelCount: { ideal: 1 },
        volume: { ideal: 1.0 }
      }
    };

    const testStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Stream-Test
    const audioTracks = testStream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('Keine Audio-Spuren verfügbar');
    }

    // Track-Informationen für Debug
    const track = audioTracks[0];
    const settings = track.getSettings();
    console.log('Audio track settings:', settings);
    console.log('Audio track capabilities:', track.getCapabilities());

    // Stream ordnungsgemäß beenden
    testStream.getTracks().forEach(track => track.stop());
    
    console.log('✅ Microphone access test successful');
    showStatus(elements.recordingStatus, '✅ Mikrofonzugriff erfolgreich', 'success');
    
    // Erfolgreiche Berechtigung für 2 Sekunden anzeigen
    setTimeout(() => {
      if (elements.recordingStatus && !elements.recordingStatus.classList.contains('hidden')) {
        hideStatus(elements.recordingStatus);
      }
    }, 2000);
    
    return true;

  } catch (mediaError) {
    console.error('Microphone access test failed:', mediaError);
    
    let errorMsg = '🎙️ Mikrofonzugriff fehlgeschlagen';
    
    switch(mediaError.name) {
      case 'NotAllowedError':
        errorMsg = '🚫 Mikrofonberechtigung verweigert';
        showManualPermissionInstructions();
        break;
      case 'NotFoundError':
        errorMsg = '🔍 Kein Mikrofon gefunden';
        break;
      case 'NotReadableError':
        errorMsg = '⚠️ Mikrofon wird von anderer App verwendet';
        break;
      case 'OverconstrainedError':
        errorMsg = '🔧 Mikrofon-Einstellungen nicht unterstützt';
        break;
      case 'SecurityError':
        errorMsg = '🔐 Sicherheitsfehler - HTTPS erforderlich?';
        break;
      default:
        errorMsg += ': ' + mediaError.message;
        break;
    }
    
    showStatus(elements.recordingStatus, errorMsg, 'error');
    return false;
  }
}

// Neue Funktion: Manuelle Berechtigungs-Anweisungen für Mobile
function showManualPermissionInstructions() {
  // Container erstellen
  const instructionsContainer = document.createElement('div');
  instructionsContainer.style.cssText = 'padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 10px 0;';
  
  // Titel
  const title = document.createElement('h4');
  title.style.cssText = 'color: #e74c3c; margin: 0 0 10px;';
  title.textContent = '⚠️ Mikrofonberechtigung erforderlich';
  
  // Beschreibung
  const description = document.createElement('p');
  description.style.cssText = 'margin: 5px 0;';
  description.textContent = 'Für Chrome Android:';
  
  // Liste erstellen
  const list = document.createElement('ol');
  list.style.cssText = 'margin: 5px 0; padding-left: 20px; font-size: 14px;';
  
  const steps = [
    '🔒 Tippen Sie auf das Schloss Symbol in der Adressleiste',
    '🎙️ Aktivieren Sie "Mikrofon"', 
    '🔄 Laden Sie die Seite neu'
  ];
  
  steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    list.appendChild(li);
  });
  
  // Alternative Text
  const alternativeText = document.createElement('p');
  alternativeText.style.cssText = 'margin: 5px 0; font-size: 14px;';
  alternativeText.textContent = 'Oder: Einstellungen → Site-Einstellungen → Mikrofon → Diese Site zulassen';
  
  // Button mit Event Listener statt onclick
  const reloadButton = document.createElement('button');
  reloadButton.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;';
  reloadButton.textContent = '🔄 Seite neu laden';
  
  // CSP-KONFORME Event-Listener statt onclick="location.reload()"
  reloadButton.addEventListener('click', function() {
    location.reload();
  });
  
  // Alles zusammenfügen
  instructionsContainer.appendChild(title);
  instructionsContainer.appendChild(description); 
  instructionsContainer.appendChild(list);
  instructionsContainer.appendChild(alternativeText);
  instructionsContainer.appendChild(reloadButton);
  
  // In responseText einfügen
  if (elements.responseText) {
    elements.responseText.innerHTML = '';
    elements.responseText.appendChild(instructionsContainer);
    elements.responseText.classList.remove('hidden');
  }
}

  // Utility Functions
  function showStatus(element, message, type = 'loading') {
    if (!element) {
        console.error(`showStatus: Element is null or undefined for message: "${message}"`);
        return;
    }
    element.className = `status-message status-${type}`;
    element.innerHTML = message;
    element.classList.remove('hidden');
    console.log(`Status [${type}]: ${message}`);
  }

  function hideStatus(element) {
    if (!element) {
        console.warn('hideStatus: Element is null or undefined.');
        return;
    }
    element.classList.add('hidden');
  }

  // KORREKTUR: showProgressStatus Funktion jeder Schritt visuell dargestellt
  function showProgressStatus(step, message) {
    const progressBarHTML = `
      <div style="margin-bottom: 15px;">
        <div style="background: #e2e8f0; border-radius: 10px; height: 20px; overflow: hidden;">
          <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${step * 25}%; transition: width 0.5s ease;"></div>
        </div>
        <div style="text-align: center; margin-top: 8px; font-weight: 500;">${message}</div>
      </div>
    `;
    
    elements.responseText && (elements.responseText.innerHTML = progressBarHTML);
    elements.responseText && elements.responseText.classList.remove('hidden');
    isTextCurrentlyVisible = false; // Progress bar is not the final text
    
    //elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
  }

function showResponseText() {
  // Text wird immer angezeigt, wenn diese Funktion aufgerufen wird.
  // Die Logik, ob Audio abgespielt wurde, wird VOR dem Aufruf dieser Funktion gehandhabt.
    if (currentResponse && elements.responseText) {
        elements.responseText.innerHTML = currentResponse;
        elements.responseText.classList.remove('hidden');
        isTextCurrentlyVisible = true;
        updateShowResponseButton(); // Aktualisiere den Button-Zustand
        console.log('✅ LLM Text angezeigt');
    }
}

// Sichere Funktion zum Setzen der Antwort ohne sofortige Anzeige
function setResponseSafely(responseText) {
    currentResponse = responseText;
    console.log('📝 Antwort gesetzt, warte auf Audio-Wiedergabe');
    
    // Zeige nur Audio-Bereitschaft an, NICHT den Text
    if (elements.responseText) {
        elements.responseText.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #3498db;">
                🎵 Audio prêt - Cliquez pour écouter
            </div>
        `;
        elements.responseText.classList.remove('hidden'); // Zeige diesen Hinweis an
        isTextCurrentlyVisible = false;
    }
    updateShowResponseButton(); // Aktualisiere den Button-Zustand
}

  function hideResponseText() {
    elements.responseText && elements.responseText.classList.add('hidden');
    isTextCurrentlyVisible = false;
    updateShowResponseButton(); // Aktualisiere den Button-Zustand
  }

// Verbesserte updateShowResponseButton()
function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    if (currentResponse) {
        if (isLlmAudioPlaying) { // If audio is currently playing, hide the button
            elements.showResponseBtn.classList.add('hidden');
        } else { // Audio is not playing
            elements.showResponseBtn.classList.remove('hidden'); // Show the button
            elements.showResponseBtn.style.opacity = '1';
            elements.showResponseBtn.style.cursor = 'pointer';

            if (isTextCurrentlyVisible) {
                elements.showResponseBtn.innerHTML = '🙈 Masquer la réponse';
            } else if (audioHasBeenPlayed) { // Audio played (or no audio), text not visible
                elements.showResponseBtn.innerHTML = '👁️ Afficher la réponse';
            } else { // Should not happen if currentResponse exists and audio hasn't played or failed
                elements.showResponseBtn.innerHTML = '🔊 Écoutez d\'abord l\'audio';
                elements.showResponseBtn.style.opacity = '0.6';
                elements.showResponseBtn.style.cursor = 'not-allowed';
            }
        }
    } else {
        elements.showResponseBtn.classList.add('hidden'); // Hide the button if no response
    }
}

  function resetUI() {
    console.log('Resetting UI...');
    
    // Stop recording completely
    isRecording = false;
    isPaused = false;
    
    if (recognition) {
      isRecognitionRestarting = true;
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    recognitionActive = false;
    isRecognitionRestarting = false;
    
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
    }

    // Stop MediaRecorder properly
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.warn('Could not stop MediaRecorder:', e);
      }
    }
    
    cleanupAudioStream();
  
    elements.startSection && elements.startSection.classList.remove('hidden');
    elements.conversationSection && elements.conversationSection.classList.add('hidden');
    
    elements.userText && (elements.userText.textContent = placeholderText);
    elements.userText && elements.userText.classList.add('placeholder');
    elements.userText && elements.userText.setAttribute('data-is-placeholder', 'true');
    
    elements.responseText && (elements.responseText.innerHTML = '');
    elements.responseText && elements.responseText.classList.add('hidden');
    
    // KORREKTUR: Vollständiger Audio-Reset ohne Fehler
    if (elements.llmAudioPlayback) {
        // Audio stoppen falls es läuft
        if (!elements.llmAudioPlayback.paused) {
            elements.llmAudioPlayback.pause();
        }
        
        // ALLE Event-Listener entfernen
        elements.llmAudioPlayback.oncanplaythrough = null;
        elements.llmAudioPlayback.onerror = null;
        elements.llmAudioPlayback.onended = null;
        elements.llmAudioPlayback.onloadstart = null;
        elements.llmAudioPlayback.onplay = null;
        elements.llmAudioPlayback.onpause = null;
        elements.llmAudioPlayback.onloadeddata = null;
        elements.llmAudioPlayback.onloadedmetadata = null;
        
        // src zurücksetzen (löst keine Events aus da Listener entfernt sind)
        elements.llmAudioPlayback.src = '';
        elements.llmAudioPlayback.removeAttribute('src');
        
        // Element neu laden (sauberer Reset)
        elements.llmAudioPlayback.load();
        
        // Verstecken
        elements.llmAudioPlayback.classList.add('hidden');
        
        console.log('🔄 Audio element completely reset');

        elements.userAudio && (elements.userAudio.src = '');
        elements.userAudio && elements.userAudio.classList.add('hidden');
        
        elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
        
        updateRecordButton(); // Aktualisiere den Aufnahme-Button
        
        currentUserId = null; // Setze User ID zurück
        recordedAudioBlob = null;
        currentResponse = null; // Setze aktuelle Antwort zurück
        audioHasBeenPlayed = false;
        isTextCurrentlyVisible = false;
        finalTranscript = '';
        audioChunks = []; // Reset audio chunks
        conversationHistory = []; // Konversationshistorie zurücksetzen
        updateChatHistoryUI(); 
        hideStatus(elements.recordingStatus);
      }
    }
    
    // Pause/Resume Funktionalität für Aufnahme
    function pauseRealTimeSpeech() {
    console.log('Pausing real-time speech...');
    
    isPaused = true;
    isRecognitionRestarting = true;
    
    // Stop speech recognition
    if (recognition && recognitionActive) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    recognitionActive = false;
    // Pause MediaRecorder (keep it running but stop collecting meaningful data)
    if (mediaRecorder && mediaRecorder.state === "recording") {
      // MediaRecorder kann nicht pausiert werden, aber wir können die Erkennung stoppen
      console.log('Recording paused (speech recognition stopped)');
    }
    updateRecordButton();
    showStatus(elements.recordingStatus, '⏸️ Enregistrement en pause', 'loading');
    }

    function resumeRealTimeSpeech() {
        console.log('Resuming real-time speech...');
        
        isPaused = false;
        isRecognitionRestarting = false;
        
        // Resume speech recognition
        if (isRecording && recognition) {
          startRecognition();
        }
        
        updateRecordButton();
        showStatus(elements.recordingStatus, '🎤 Enregistrement repris', 'success');
    }
    function updateRecordButton() {

      if (!elements.recordBtn) return;

      if (isRecording && !isPaused) {
        elements.recordBtn.innerHTML = '⏸️ Pause';
        elements.recordBtn.classList.add('recording');
        elements.recordBtn.classList.remove('paused');

      } else if (isRecording && isPaused) {
        elements.recordBtn.innerHTML = '▶️ Reprendre';
        elements.recordBtn.classList.remove('recording');
        elements.recordBtn.classList.add('paused');

      } else {
        elements.recordBtn.innerHTML = '🎙️ Enregistrer';
        elements.recordBtn.classList.remove('recording', 'paused');
      }

      elements.recordBtn.disabled = false;

      elements.stopBtn && elements.stopBtn.classList.toggle('hidden', !isRecording); // toggle
    }

  // === VERBESSERTE Audioaufnahme-Funktion mit Pause/Resume===
    async function startRealTimeSpeech() {
      console.log('Starting real-time speech with recording...');
      
      try {
        const permissionsOk = await checkMicrophonePermissions();
        if (!permissionsOk || !recognition) {
          showStatus(elements.recordingStatus, '⚠️ Microphone ou reconnaissance vocale non disponibles', 'error');
          return;
        }

        // Set recording state
        isRecording = true;
        isPaused = false;
        
        // Reset transcript and audio
        finalTranscript = '';
        recordedAudioBlob = null;
        audioChunks = [];
        
        // Clear user text
        if (elements.userText) {
          elements.userText.textContent = '';
          elements.userText.classList.remove('placeholder');
          elements.userText.dataset.isPlaceholder = 'false';
        }
        
        // Get audio stream with optimized constraints
        const constraints = { 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1
          }
        };
        
        currentAudioStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Audio stream obtained successfully');
        
        // Test audio stream
        const audioTracks = currentAudioStream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio tracks available');
        }
        
        console.log('Audio track settings:', audioTracks[0].getSettings());
        
        // Setup MediaRecorder with better options
        let options = { audioBitsPerSecond: 128000 };
        
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else {
          console.warn('No supported audio format found, using default');
          options = {};
        }
        
        console.log('Creating MediaRecorder with options:', options);
        mediaRecorder = new MediaRecorder(currentAudioStream, options);

        // Setup event handlers BEFORE starting
        mediaRecorder.ondataavailable = event => {
          console.log('MediaRecorder data available:', event.data.size, 'bytes');
          if (event.data.size > 0) {
            audioChunks.push(event.data);
            console.log('Total audio chunks:', audioChunks.length);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log('MediaRecorder stopped, processing audio...');
          console.log('Total chunks collected:', audioChunks.length);
          
          if (audioChunks.length > 0) {
            const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            console.log('Total audio size:', totalSize, 'bytes');
            
            if (totalSize > 0) {
              const mimeType = mediaRecorder.mimeType || 'audio/webm';
              recordedAudioBlob = new Blob(audioChunks, {type: mimeType});
              console.log('Created audio blob:', recordedAudioBlob.size, 'bytes, type:', recordedAudioBlob.type);
              
              // Prüfe auf tatsächlichen Audioinhalt
              showStatus(elements.recordingStatus, '🔍 Analyse de l\'audio...', 'loading');
              const hasContent = await hasAudioContent(recordedAudioBlob);
              
              if (hasContent) {
                showStatus(elements.recordingStatus, '💾 Sauvegarde audio...', 'loading');
                const uploadResult = await uploadRecordedAudio(recordedAudioBlob, mimeType);
                
                if (uploadResult && uploadResult.audio_path) {
                  showStatus(elements.recordingStatus, '✅ Audio enregistré', 'success');
                  
                  if (elements.userAudio) {
                    elements.userAudio.src = uploadResult.audio_path;
                    elements.userAudio.load();
                    elements.userAudio.classList.remove('hidden');
                    console.log('User audio player configured:', elements.userAudio.src);
                  } else {
                    console.error('userAudio Element nicht gefunden!');
                  }
                } else {
                  showStatus(elements.recordingStatus, '⚠️ Erreur lors de l\'enregistrement de l\'audio', 'error');
                }
              } else {
                console.log('No significant audio content detected, skipping upload');
                showStatus(elements.recordingStatus, '⚠️ Aucun contenu audio détecté', 'warning');
                recordedAudioBlob = null;
              }
            } else {
              console.error('Audio chunks have zero total size!');
              showStatus(elements.recordingStatus, '⚠️ Aucun audio enregistré', 'error');
            }
          } else {
            console.error('No audio chunks recorded!');
            showStatus(elements.recordingStatus, '⚠️ Aucun audio enregistré', 'error');
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error('MediaRecorder error:', event.error);
          showStatus(elements.recordingStatus, '⚠️ Erreur d\'enregistrement: ' + event.error, 'error');
        };

        mediaRecorder.onstart = () => {
          console.log('MediaRecorder started successfully');
          showStatus(elements.recordingStatus, '🎤 Enregistrement actif', 'success');
        };
        
        // Start recording with smaller timeslices for better data collection
        console.log('Starting MediaRecorder...');
        mediaRecorder.start(250);
        
        // Start speech recognition
        isRecognitionRestarting = false;
        startRecognition();
        
        // Update UI
        updateRecordButton();
        
        showStatus(elements.recordingStatus, '🎤 Enregistrement + détection actifs', 'success');
        
      } catch (err) {
        console.error('Real-time speech error:', err);
        showStatus(elements.recordingStatus, '⚠️ Erreur: ' + err.message, 'error');
        isRecording = false;
        resetRecordButton();
        cleanupAudioStream();
      }
    }

    function hasAudioContent(audioBlob) {
      return new Promise((resolve) => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContextClass();
        const fileReader = new FileReader();
        
        fileReader.onload = function(e) {
          audioContext.decodeAudioData(e.target.result)
            .then(buffer => {
              // Prüfe auf tatsächlichen Audioinhalt
              let hasSound = false;
              const threshold = 0.01; // Mindestlautstärke
              
              for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                for (let i = 0; i < channelData.length; i++) {
                  if (Math.abs(channelData[i]) > threshold) {
                    hasSound = true;
                    break;
                  }
                }
                if (hasSound) break;
              }
              
              resolve(hasSound);
            })
            .catch(() => resolve(false)); // Bei Fehler beim Dekodieren, annehmen, dass kein Inhalt
        };
        
        fileReader.readAsArrayBuffer(audioBlob);
      });
    }
    
    function stopRealTimeSpeech() {
      console.log('Stopping real-time speech...');
      
      // Set recording state
      isRecording = false;
      isRecognitionRestarting = true;
      
      // Stop speech recognition
      if (recognition && recognitionActive) {
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
      }
      recognitionActive = false;
    
      // Stop MediaRecorder
      if (mediaRecorder && mediaRecorder.state === "recording") {
        console.log('Stopping MediaRecorder...');
        try {
          mediaRecorder.stop();
          console.log('MediaRecorder stop called, state:', mediaRecorder.state);
        } catch (e) {
          console.error('Error stopping MediaRecorder:', e);
        }
      }
    
      // Clean up audio stream
      cleanupAudioStream();
      resetRecordButton();
    
      // Update user text with final transcript
      if (elements.userText) {
        const finalContent = finalTranscript.trim();
        elements.userText.textContent = finalContent;
        console.log('Final User Text set:', finalContent);

        if (finalContent) {
          elements.userText.classList.remove('placeholder');
          elements.userText.dataset.isPlaceholder = 'false';
        } else {
          elements.userText.textContent = placeholderText;
          elements.userText.classList.add('placeholder');
          elements.userText.dataset.isPlaceholder = 'true';
        }
      }

      // Send transcribed text to backend - NUR wenn konfiguriert
      if (finalTranscript.trim()) {
        if (autoSendAfterRecording) {
          console.log('Auto-Send aktiviert - gesendeter Text:', finalTranscript.trim());
          sendMessageToBackend(finalTranscript.trim());
        } else {
          showStatus(elements.recordingStatus, '✅ Transcription prête, Envoyer', 'success');
        }
      } else {
        showStatus(elements.recordingStatus, '⚠️ Aucune parole détectée', 'warning');
      }

  }

  function cleanupAudioStream() {
    if (currentAudioStream) {
      console.log('Cleaning up audio stream...');
      currentAudioStream.getTracks().forEach(track => {
        track.stop();
        console.log('Audio track stopped');
      });
      currentAudioStream = null;
    }
  }

  // === Backend Communication ===

  // === Hilfsfunktion
  async function extractErrorMessage(response) {
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        return parsed.error || parsed.response || text;
      } catch (e) {
        return "Erreur inconnue du serveur.";
      }
    }

// Korrigierte sendMessageToBackend() 
async function sendMessageToBackend(message) {
    console.log('📤 Sending message:', message);
    
    if (!message.trim()) {
        showStatus(elements.recordingStatus, 'Veuillez entrer un message.', 'warning');
        return;
    }
    
    showProgressStatus(1, '🚀 Message en cours d\'envoi...');
    elements.sendBtn && (elements.sendBtn.disabled = true);
    elements.recordBtn && (elements.recordBtn.disabled = true);
    elements.stopBtn && (elements.stopBtn.disabled = true);

    // Hide previous response text and audio player
    elements.responseText && elements.responseText.classList.add('hidden');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden'); // Use llmAudioPlayback
    elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');

    try {
        const response = await fetch('/api/respond', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: message,
                userId: currentUserId,
                scenario: currentScenario
            }),
        });

        if (!response.ok) {
            const errorText = await extractErrorMessage(response);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('=== CHAT RESPONSE DEBUG ===');
        console.log('Full response:', JSON.stringify(data, null, 2));
        console.log('Response keys:', Object.keys(data));
        console.log('audio_url value:', data.audio_url);
        console.log('audio_url type:', typeof data.audio_url);
        console.log('audio_url truthy:', !!data.audio_url);

        // Test audio URL if present
        if (data.audio_url) {
            console.log('Testing audio URL accessibility...');
            await testAudioUrl(data.audio_url);
        }
        console.log('=== END DEBUG ===');

        // Lokale Historie nur zur Anzeige
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );
        updateChatHistoryUI(); 
        setResponseSafely(data.response); // Setzt currentResponse und zeigt Hinweis an

        if (data.audio_url) {
            await playLlmAudio(data.audio_url); // Call playLlmAudio
        } else {
            console.warn('⚠️ No audio URL received for chat response');
            elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');

            // KORREKTUR: Text nicht automatisch anzeigen, nur currentResponse setzen und Button aktivieren
            currentResponse = data.response;
            audioHasBeenPlayed = true; // Mark as "played" for button logic
            isTextCurrentlyVisible = false; // Text ist NICHT sichtbar
            elements.responseText && elements.responseText.classList.add('hidden'); // Sicherstellen, dass Textbereich versteckt ist
            updateShowResponseButton(); // Aktualisiere den Button-Zustand (sollte "Afficher" anzeigen)
            showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable 860'); // Angepasste Meldung
        }
    } catch (error) {
      console.error('❌ Error sending message:', error);
      showStatus(elements.recordingStatus, 'Fehler beim Senden des Chats.', 'error');
      currentResponse = 'Désolé, une erreur est survenue et je ne peux pas répondre pour le moment.';
      elements.responseText && (elements.responseText.innerHTML = `
          <div style="text-align: center; padding: 20px; color: #e74c3c;">
              ❌ Erreur de communication: ${error.message}
          </div>
      `);
      elements.responseText && elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = true;
      elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
      elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
      audioHasBeenPlayed = false;
    } finally {
      elements.sendBtn && (elements.sendBtn.disabled = false);
      elements.recordBtn && (elements.recordBtn.disabled = false);
      elements.stopBtn && (elements.stopBtn.disabled = false);
      hideStatus(elements.recordingStatus);
    }
}

  // === Audio Upload Function ===
  async function uploadRecordedAudio(audioBlob, mimeType) {
    if (!audioBlob || audioBlob.size === 0) {
      console.warn('No audio blob to upload or blob is empty.');
      return null;
    }

    const formData = new FormData();
    const fileExtension = mimeType.split('/')[1].split(';')[0];
    const fileName = `recording.${fileExtension}`;
    
    formData.append('audio', audioBlob, fileName);
    formData.append('user_id', currentUserId);
    console.log(`Uploading audio blob: ${audioBlob.size} bytes, type: ${mimeType}, filename: ${fileName}`);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await extractErrorMessage(response);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Audio uploaded successfully:', data);
      return data;

    } catch (error) {
      console.error('Error uploading audio:', error);
      return null;
    }
  }



  // === für Audio von TTS ===

  function showAudioRetryOptions() {
    // Container erstellen
    const retryContainer = document.createElement('div');
    retryContainer.style.cssText = 'text-align: center; margin-top: 15px;';
    
    // Fehlermeldung
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'margin-bottom: 15px; color: #e74c3c;';
    errorDiv.textContent = '⚠️ Audio manquant';
    
    // Retry Button
    const retryButton = document.createElement('button');
    retryButton.style.cssText = 'margin-right: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;';
    retryButton.textContent = '🔄 Réessayer l\'audio';
    
    // Continue Button  
    const continueButton = document.createElement('button');
    continueButton.style.cssText = 'padding: 8px 16px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer;';
    continueButton.textContent = '📝 Voir texte sans audio';
    
    // CSP-KONFORME Event Listeners statt onclick
    retryButton.addEventListener('click', function() {
      console.log('Manueller Audio-Retry gestartet');
      showProgressStatus(3, '🔄 Nouvel essai...');
      const lastUserMessage = conversationHistory.findLast(msg => msg.role === 'user');
      if (lastUserMessage) {
        sendMessageToBackend(lastUserMessage.content);
      } else {
        console.error('Keine letzte Benutzernachricht für Retry gefunden.');
        showStatus(elements.recordingStatus, 'Erreur: Impossible de réessayer l\'audio sans message précédent.', 'error');
      }
    });
    
    continueButton.addEventListener('click', function() {
      console.log('Benutzer wählt: ohne Audio fortfahren');
      audioHasBeenPlayed = true;
      showResponseText();
      showProgressStatus(4, '✅ Texte affiché sans audio.');
    });
    
    // Zusammenfügen
    retryContainer.appendChild(errorDiv);
    retryContainer.appendChild(retryButton);
    retryContainer.appendChild(continueButton);
    
    if (elements.responseText) {
      elements.responseText.innerHTML = '';
      elements.responseText.appendChild(retryContainer);
      elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = true;
      elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
    }
  }


// KORRIGIERTE playLlmAudio Funktion mit log
async function playLlmAudio(audio_url) {
    console.log('=== PLAY LLM AUDIO DEBUG ===');
    console.log('Received audio_url:', audio_url);
    console.log('audio_url type:', typeof audio_url);
    console.log('audio_url length:', audio_url ? audio_url.length : 'N/A');
    console.log('Audio element exists:', !!elements.llmAudioPlayback);
    console.log('Audio element src before:', elements.llmAudioPlayback ? elements.llmAudioPlayback.src : 'N/A');
    
    if (!audio_url || audio_url.trim() === '') {
        console.error('❌ Invalid audio URL provided to playLlmAudio');
        audioHasBeenPlayed = false;
        isLlmAudioPlaying = false;
        updateShowResponseButton();
        return Promise.resolve();
    }
    
    if (!elements.llmAudioPlayback) {
        console.error('❌ Audio playback element not found');
        audioHasBeenPlayed = false;
        isLlmAudioPlaying = false;
        updateShowResponseButton();
        return Promise.resolve();
    }
    
    return new Promise((resolve) => {
        const audioElement = elements.llmAudioPlayback;
        let resolved = false;
        
        // KORREKTUR: Komplett alle Event-Listener entfernen vor Neuzuweisung
        audioElement.oncanplaythrough = null;
        audioElement.onerror = null;
        audioElement.onended = null;
        audioElement.onloadstart = null;
        audioElement.onplay = null;
        audioElement.onpause = null;
        audioElement.onloadeddata = null;
        audioElement.onloadedmetadata = null;
        
        // Hilfsfunktion für saubere Auflösung
        function resolveOnce() {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }
        
        // Event Handler: Audio kann abgespielt werden
        audioElement.oncanplaythrough = () => {
            console.log('✅ Audio can play through, attempting to play');
            
            audioElement.play()
                .then(() => {
                    console.log('✅ Audio playback started successfully');
                    isLlmAudioPlaying = true;
                    updateShowResponseButton();
                    showProgressStatus(4, '🎵 Écoute en cours...');
                })
                .catch(playError => {
                    console.error('❌ Play prevented by browser:', playError.name, playError.message);
                    audioHasBeenPlayed = false; // Benutzer kann manuell abspielen
                    isLlmAudioPlaying = false;
                    showProgressStatus(4, '⚠️ Cliquez sur le bouton play pour écouter l\'audio');
                    
                    // Audio-Player sichtbar lassen für manuelles Abspielen
                    audioElement.classList.remove('hidden');
                    elements.responseText && elements.responseText.classList.add('hidden');
                    isTextCurrentlyVisible = false;
                    updateShowResponseButton();
                    
                    resolveOnce();
                });
        };

        // Event Handler: Audio beendet
        audioElement.onended = () => {
            console.log('✅ LLM Audio ended successfully');
            audioHasBeenPlayed = true;
            isLlmAudioPlaying = false;
            showProgressStatus(4, '✅ Audio terminé - Texte disponible!');
            updateShowResponseButton();
            resolveOnce();
        };
        
        // Event Handler: Play-Event (für automatisches und manuelles Abspielen)
        audioElement.onplay = () => {
            console.log('🎵 Audio play event triggered');
            isLlmAudioPlaying = true;
            updateShowResponseButton();
            showProgressStatus(4, '🎵 Écoute en cours...');
        };
        
        // Event Handler: Pause-Event
        audioElement.onpause = () => {
            console.log('⏸️ Audio paused');
            isLlmAudioPlaying = false;
            updateShowResponseButton();
        };

        // Event Handler: Fehler beim Laden/Abspielen
        audioElement.onerror = (e) => {
            console.error('❌ Error loading/playing LLM audio');
            console.error('Audio element state:', {
                error: audioElement.error,
                networkState: audioElement.networkState,
                readyState: audioElement.readyState,
                src: audioElement.src
            });
            
            // Detaillierte Fehleranalyse
            if (audioElement.error) {
                const errorMessages = {
                    1: 'MEDIA_ERR_ABORTED - Audio wurde abgebrochen',
                    2: 'MEDIA_ERR_NETWORK - Netzwerkfehler beim Laden',
                    3: 'MEDIA_ERR_DECODE - Fehler beim Dekodieren der Audio-Datei',
                    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Audio-Format nicht unterstützt'
                };
                console.error('Error details:', errorMessages[audioElement.error.code] || 'Unbekannter Fehler');
            }
            
            audioHasBeenPlayed = false;
            isLlmAudioPlaying = false;
            showProgressStatus(4, '⚠️ Erreur audio - Texte disponible maintenant');
            
            // Bei Fehler: Text sofort verfügbar machen
            audioHasBeenPlayed = true; // Setze auf true damit Text angezeigt werden kann
            updateShowResponseButton();
            
            resolveOnce();
        };
        
        // Audio-Element konfigurieren
        audioElement.preload = 'auto';
        audioElement.volume = 1.0;
        
        // UI vorbereiten
        elements.responseText && elements.responseText.classList.add('hidden');
        isTextCurrentlyVisible = false;
        audioElement.classList.remove('hidden');
        
        // Audio laden
        console.log('Setting audio src and loading:', audio_url);
        audioElement.src = audio_url;
        audioElement.load();
        
        console.log('Audio setup complete, waiting for events...');
        
        // Sicherheits-Timeout (15 Sekunden)
        setTimeout(() => {
            if (!resolved) {
                console.warn('⚠️ Audio loading timeout (15s) - making text available');
                audioHasBeenPlayed = true; // Text verfügbar machen
                isLlmAudioPlaying = false;
                showProgressStatus(4, '⚠️ Timeout - Texte maintenant disponible');
                updateShowResponseButton();
                resolveOnce();
            }
        }, 15000);
    });
}

// ZUSÄTZLICHE DEBUG-FUNKTION um Audio-Dateien zu testen:

async function testAudioUrl(url) {
    console.log('=== TESTING AUDIO URL ===');
    console.log('URL:', url);
    
    try {
        const response = await fetch(url, { method: 'HEAD' });
        console.log('HTTP Status:', response.status);
        console.log('Content-Type:', response.headers.get('content-type'));
        console.log('Content-Length:', response.headers.get('content-length'));
        
        if (response.ok) {
            console.log('✅ Audio file is accessible');
            
            // Test mit neuem Audio-Element
            const testAudio = new Audio();
            testAudio.oncanplaythrough = () => console.log('✅ Test audio can play through');
            testAudio.onerror = (e) => console.error('❌ Test audio error:', e);
            testAudio.src = url;
            testAudio.load();
            
        } else {
            console.error('❌ Audio file not accessible:', response.status);
        }
    } catch (error) {
        console.error('❌ Error testing audio URL:', error);
    }
    console.log('=== END AUDIO URL TEST ===');
}

  // === Event Listeners ===
// === OPTIMIERTE KONVERSATIONS-STARTER ===
elements.startBtn && elements.startBtn.addEventListener('click', async () => {
    console.log('🚀 Starting conversation...');

    const scenario = elements.scenarioSelect && elements.scenarioSelect.value;
    // forceReset basierend auf Szenario-Wechsel ODER wenn currentUserId noch nicht gesetzt ist
    const forceReset = currentUserId === null || scenario !== currentScenario;
    currentScenario = scenario; // Aktualisiere das aktuelle Szenario
    
    if (!scenario) {
        showStatus(elements.recordingStatus, "⚠️ Veuillez choisir un thème.", 'error');
        return;
    }

    elements.startSection && elements.startSection.classList.add('hidden');
    elements.conversationSection && elements.conversationSection.classList.remove('hidden');
    
    // currentUserId wird in startConversation gesetzt, aber hier für den Fetch-Call benötigt
    // Wenn currentUserId noch null ist, wird er im Backend generiert und zurückgegeben.
    // Falls er bereits existiert, wird er wiederverwendet.

    if (!currentUserId) {
        currentUserId = Date.now().toString();
        console.log('Temporäre User ID für Start generiert:', currentUserId);
    }
    
    // UI-Elemente für neue Antwort zurücksetzen
    elements.responseText && (elements.responseText.innerHTML = '');
    elements.responseText && elements.responseText.classList.add('hidden');
    elements.llmAudioPlayback && (elements.llmAudioPlayback.src = '');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
    elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;


    const currentScenarioDisplay = document.getElementById('currentScenarioDisplay');
    if (currentScenarioDisplay) {
        const scenarioNames = {
            "libre": "Conversation libre",
            "restaurant": "Au restaurant",
            "faire_les_courses": "Faire les courses",
            "visite_chez_le_médecin": "Visite chez le médecin",
            "loisirs": "Loisirs et hobbies", 
            "travail": "Monde du travail",
            "voyage": "Voyage en France"
        };
        currentScenarioDisplay.innerText = scenarioNames[scenario] || scenario;
    }

    if (scenario !== "libre") {
        showProgressStatus(1, '🤔 Préparation de la conversation...');
        
        try {
            const response = await fetch('/api/start_conversation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    scenario: scenario,
                    userId: currentUserId,
                    force_reset: forceReset
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error}`);
            }

            const data = await response.json();
console.log('🎯 Conversation started successfully:', data);

currentUserId = data.userId;
conversationHistory = [{ role: 'assistant', content: data.response }];
updateChatHistoryUI();
setResponseSafely(data.response);
showProgressStatus(2, '📝 Conversation préparée...');

            if (data.audio_url) { 
                console.log('Audio URL erhalten:', data.audio_url);
                await playLlmAudio(data.audio_url);
            } else {
                console.warn('⚠️ No audio URL received for initial response.');
                elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');

                // KORREKTUR: Text nicht automatisch anzeigen, nur currentResponse setzen und Button aktivieren
                currentResponse = data.response;
                audioHasBeenPlayed = true; // Mark as "played" for button logic
                isTextCurrentlyVisible = false; // Text ist NICHT sichtbar
                elements.responseText && elements.responseText.classList.add('hidden'); // Sicherstellen, dass Textbereich versteckt ist
                updateShowResponseButton(); // Aktualisiere den Button-Zustand (sollte "Afficher" anzeigen)
                showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable via bouton.'); // Angepasste Meldung
            }
        } catch (err) {
            console.error('❌ Error starting conversation:', err);
            showStatus(elements.recordingStatus, `❌ Erreur: ${err.message}`, 'error');
            // Bei Fehler zurück zum Startbildschirm
            elements.startSection && elements.startSection.classList.remove('hidden');
            elements.conversationSection && elements.conversationSection.classList.add('hidden');
        } finally {
            hideStatus(elements.recordingStatus); // Status-Anzeige nach Abschluss des Startvorgangs ausblenden
        }
    } else {
        currentResponse = "🎯 Conversation libre - parlez de ce qui vous intéresse!";
        audioHasBeenPlayed = true;
        showResponseText(); // In diesem speziellen Fall (libre, kein Audio) wird der Text direkt angezeigt
        hideStatus(elements.recordingStatus);
    }
});


  elements.newConvBtn && elements.newConvBtn.addEventListener('click', () => {
    resetUI();
  });

elements.recordBtn && elements.recordBtn.addEventListener('click', () => {
  if (isRecording && !isPaused) {
    pauseRealTimeSpeech();
  } else if (isRecording && isPaused) {
    resumeRealTimeSpeech();
  } else {
    startRealTimeSpeech();
  }
});

// Verbesserte Audio Event Listener
/* !!!!!!!! playLlmAudio() behandelt bereits alle Events !!!!!!!!!!

elements.llmAudioPlayback && elements.llmAudioPlayback.addEventListener('play', () => {
    console.log('🎵 LLM Audio playback started (global listener)');
    // Nur setzen wenn nicht bereits durch playLlmAudio gesetzt
    if (!isLlmAudioPlaying) {
        isLlmAudioPlaying = true;
        updateShowResponseButton();
        showProgressStatus(4, '🎵 Écoute en cours...');
    }
});

elements.llmAudioPlayback && elements.llmAudioPlayback.addEventListener('ended', () => {
    console.log('✅ LLM Audio playback ended (global listener)');
    // Nur setzen wenn nicht bereits durch playLlmAudio behandelt
    if (isLlmAudioPlaying) {
        audioHasBeenPlayed = true;
        isLlmAudioPlaying = false;
        showProgressStatus(4, '✅ Audio terminé - Texte disponible!');
        updateShowResponseButton();
    }
});

elements.llmAudioPlayback && elements.llmAudioPlayback.addEventListener('error', (e) => {
    // Gleiche Logik wie in playLlmAudio
    if (!elements.llmAudioPlayback.src || 
        elements.llmAudioPlayback.src === '' || 
        elements.llmAudioPlayback.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        console.log("LLM Audio error ignored (no source set - global listener)");
        return;
    }
    
    console.error('❌ LLM Audio playback error (global listener):', e);
    if (isLlmAudioPlaying) {
        audioHasBeenPlayed = false;
        isLlmAudioPlaying = false;
        showProgressStatus(4, '⚠️ Erreur de lecture audio. Texte disponible.');
        updateShowResponseButton();
    }
});
*/

  elements.stopBtn && elements.stopBtn.addEventListener('click', () => {
    stopRealTimeSpeech();
  });

  elements.sendBtn && elements.sendBtn.addEventListener('click', () => {
    let messageToSend = '';
    console.log('=== SEND BUTTON CLICKED ===');
    console.log('finalTranscript:', finalTranscript);
    console.log('userText content:', elements.userText && elements.userText.textContent);
    console.log('userText isPlaceholder:', elements.userText && elements.userText.dataset.isPlaceholder);
    // Prüfe ob userText geändert wurde (Priorität über finalTranscript)
    if (elements.userText && elements.userText.textContent && 
          elements.userText.textContent.trim() && 
          elements.userText.dataset.isPlaceholder !== 'true' && 
          elements.userText.textContent !== placeholderText) {
        messageToSend = elements.userText.textContent.trim();
        console.log('Verwendung: Bearbeiteter userText');
    } else if (finalTranscript.trim()) {
        messageToSend = finalTranscript.trim();
        console.log('Verwendung: Original finalTranscript');
    }
      
    if (messageToSend) {
        console.log('Endgültig gesendeter Text:', messageToSend);
        sendMessageToBackend(messageToSend);
    } else {
        console.log('Kein gültiger Text zum Senden gefunden');
        showStatus(elements.recordingStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
    }
  });


  elements.showResponseBtn && elements.showResponseBtn.addEventListener('click', () => {
    if (currentResponse) { // nur wenn Antwort vorhanden
        if (isTextCurrentlyVisible) {
            hideResponseText();
            elements.showResponseBtn && (elements.showResponseBtn.textContent = 'Afficher le texte');
        } else { //wenn text noch nicht sichtbar oder kein Audio 
            if (audioHasBeenPlayed || !elements.llmAudioPlayback || !elements.llmAudioPlayback.src) { // Use llmAudioPlayback
                showResponseText();
                elements.showResponseBtn && (elements.showResponseBtn.textContent = 'Masquer le texte');
            } else {
                showStatus(elements.recordingStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
                setTimeout(() => hideStatus(elements.recordingStatus), 3000);
            }
        }
    } else {
        console.warn('showResponseBtn geklickt, aber keine currentResponse.');
    }
  });

  elements.scenarioSelect && elements.scenarioSelect.addEventListener('change', (event) => {
        currentScenario = event.target.value;
        console.log('Scenario changed to:', currentScenario);
  });

// === VERBESSERTES DEBUGGING ===
function debugConversationState() {
    console.log('=== CONVERSATION STATE DEBUG ===');
    console.log('🆔 User ID:', currentUserId);
    console.log('🎭 Current Scenario:', currentScenario);
    console.log('📝 Current Response:', currentResponse ? 'Set' : 'Not set');
    console.log('🎵 Audio played:', audioHasBeenPlayed);
    console.log('👁️ Text visible:', isTextCurrentlyVisible);
    console.log('🗣️ Recording:', isRecording);
    console.log('⏸️ Paused:', isPaused);
    console.log('🎵 LLM Audio Playing:', isLlmAudioPlaying); // Added this
    console.log('📜 Local History Length:', conversationHistory.length);
    console.log('=================================');
}

// Debug-Funktion alle 30 Sekunden (nur in Development)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(debugConversationState, 30000);
}

  // Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+Enter to send message
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    
    console.log('=== KEYBOARD SHORTCUT USED ===');
    let messageToSend = '';

    //logik wie beim send Button
    if (elements.userText && elements.userText.textContent && 
        elements.userText.textContent.trim() && 
        elements.userText.dataset.isPlaceholder !== 'true' && 
        elements.userText.textContent !== placeholderText) {
      messageToSend = elements.userText.textContent.trim();
      console.log('Verwendung: Bearbeiteter userText via Keyboard');
    } else if (finalTranscript.trim()) {
      messageToSend = finalTranscript.trim();
      console.log('Verwendung: Original finalTranscript via Keyboard');
    }

    if (messageToSend) {
      console.log('Endgültig gesendeter Text via Keyboard:', messageToSend);
      sendMessageToBackend(messageToSend);
    } else {
      console.log('Kein gültiger Text zum Senden gefunden via Keyboard');
      showStatus(elements.recordingStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
    }
  }
  
  // space Taste für Pause/resume
  if (e.code === 'Space' && e.target === document.body && elements.conversationSection && !elements.conversationSection.classList.contains('hidden')) {
    e.preventDefault();
    if (isRecording && !isPaused) {
      pauseRealTimeSpeech();
    } else if (isRecording && isPaused) {
      resumeRealTimeSpeech();
    } else {
      startRealTimeSpeech();
    }
  }

});

// Chat Historie UI Update Funktion
function updateChatHistoryUI() {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    // Leere den Container
    chatMessages.innerHTML = '';
    
    // Nutze die bestehende conversationHistory
    conversationHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${msg.role}`;
        
        // Kürze lange Nachrichten für die Anzeige
        const preview = msg.content.length > 80 ? 
            msg.content.substring(0, 80) + '...' : 
            msg.content;
            
        messageDiv.innerHTML = `
            <strong>${msg.role === 'user' ? '👤 Vous' : '👨‍🏫 Assistant'}:</strong> 
            ${preview}
        `;
        
        chatMessages.appendChild(messageDiv);
    });
    
    // Auto-scroll zum Ende
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

// Initial UI setup
  resetUI();
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');

  // Chat History Functionality
  const chatToggle = document.getElementById('chatToggle');
  const chatHistory = document.getElementById('chatHistory');
  const chatMessages = document.getElementById('chatMessages');
  
  // Toggle chat history
  chatToggle.addEventListener('click', () => {
    chatHistory.classList.toggle('show');
    chatToggle.textContent = chatHistory.classList.contains('show') ? '📜 Masquer' : '📜 Historique';
  });
  
  // Function to add message to chat history
  window.addToChatHistory = function(role, message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.innerHTML = `<strong>${role === 'user' ? '👤 Vous' : '👨‍🏫 Assistant'}:</strong> ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
    chatMessages.appendChild(messageDiv);
    
    // Auto-scroll to bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Limit to 20 messages
    while (chatMessages.children.length > 20) {
      chatMessages.removeChild(chatMessages.firstChild);
    }
  };
  
  // Function to clear chat history
  window.clearChatHistory = function() {
    chatMessages.innerHTML = '';
  };

});

// === ZUSÄTZLICHE Mobile Touch-Event Behandlung ===
// Touch-Event Support für bessere Mobile Experience
document.addEventListener('touchstart', function() {
  // User-Aktivierung für Mobile-Browser registrieren
  document.hasStoredGesture = true;
}, { passive: true });

// Verhindere iOS Safari Zoom bei Doppel-Touch auf Buttons
elements.recordBtn && elements.recordBtn.addEventListener('touchend', function(e) {
  e.preventDefault();
});

elements.sendBtn && elements.sendBtn.addEventListener('touchend', function(e) {
  e.preventDefault();
});

elements.stopBtn && elements.stopBtn.addEventListener('touchend', function(e) {
  e.preventDefault();
});