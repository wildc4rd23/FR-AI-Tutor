// Optimiertes script.js mit verbesserter Real-Time Transkription
document.addEventListener('DOMContentLoaded', function() {
  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    sendBtn: document.getElementById('sendMessage'),
    startBtn: document.getElementById('startConversation'),
    newConvBtn: document.getElementById('newConversation'),
    showResponseBtn: document.getElementById('showResponseBtn'),
    playAudioBtn: document.getElementById('playAudioBtn'),

    userText: document.getElementById('userText'),
    responseText: document.getElementById('responseText'),
    audioPlayback: document.getElementById('audioPlayback'),
    userAudio: document.getElementById('userAudio'),
    userAudioSection: document.getElementById('userAudioSection'),

    startSection: document.getElementById('startSection'),
    conversationSection: document.getElementById('conversationSection'),
    scenarioSelect: document.getElementById('scenario'),
    globalStatus: document.getElementById('globalStatus'),
    audioStatus: document.getElementById('audioStatus'),
    recordingStatus: document.getElementById('recordingStatus')
  };

  let mediaRecorder;
  let audioChunks = [];
  let recognition;
  let recordedAudioBlob = null;
  let currentAudioStream = null;
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = true; // immer RT 
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = ''; //speichert den kumulativen finalen Transkript
  let isRecognitionRestarting = false;
  let userId = Date.now().toString(); // Generate unique user ID
  let currentScenario = 'libre'; // Default scenario

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung mit stabilerer Real-Time Implementation ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true; //wichtig für kontinuierliche Erkennung
    recognition.maxAlternatives = 1;

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
      // Zeigt den aktuellen Stand des Transkripts an (final + interim)
      const displayText = (finalTranscript + interimTranscript).trim();
      if (elements.userText && displayText) {
        elements.userText.textContent = displayText;
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }

      // Status Update
      const statusText = interimTranscript ? 
        `🎤 Écoute... "${interimTranscript}"` : 
        (newFinalTranscript ? `🎤 Transcrit: "${newFinalTranscript.trim()}"` : '🎤 En écoute...');
      showStatus(elements.recordingStatus, statusText, 'success');
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      let shouldRestart = false;
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé';
          recognitionActive = false;
          break;
        case 'no-speech':
          console.log('No speech detected, will restart...');
          shouldRestart = true;
          errorMessage = null;
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau';
          shouldRestart = true;
          break;
        case 'aborted':
          return;
        default:
          shouldRestart = true;
          break;
      }
      
      recognitionActive = false;
      
      if (errorMessage) {
        showStatus(elements.globalStatus, errorMessage, 'error');
      }
      
      if (shouldRestart && !isRecognitionRestarting) {
        setTimeout(() => {
          if (!isRecognitionRestarting) {
            startRecognition();
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      recognitionActive = false;
      
      if (!isRecognitionRestarting) {
        setTimeout(() => {
          if (!isRecognitionRestarting && !recognitionActive) {
            startRecognition();
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
      if (isRecognitionRestarting) {
        console.log('Recognition restart already in progress');
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
          if (isRealTimeMode) {
            startRecognition();
          }
        }, 1000); // Längere Wartezeit
        return;
      }

      try {
        console.log('Starting speech recognition, current final transcript:', finalTranscript);
        isRecognitionRestarting = false;
        recognition.start();
        
        // Debug: Log recognition state
        setTimeout(() => {
          console.log('Recognition active after start:', recognitionActive);
        }, 100);
        
      } catch (e) {
        console.error('Could not start recognition:', e);
        recognitionActive = false;
        isRecognitionRestarting = false;
        showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
        
        if (isRealTimeMode) {
          setTimeout(() => {
            if (isRealTimeMode && !recognitionActive) {
              startRecognition();
            }
          }, 3000); // Längere Wartezeit bei Fehlern
        }
      }
    }

  } else {
    console.warn('SpeechRecognition API nicht verfügbar.');
    // elements.useSTTBtn ist nicht mehr in der elements-Liste, daher auskommentiert
    // if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
    showStatus(elements.globalStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur.', 'warning');
  }

  // === VERBESSERTE Mikrofonzugriff-Diagnose ===
  async function checkMicrophonePermissions() {
    try {
      console.log('Checking microphone permissions...');
      
      if ('permissions' in navigator) {
        try {
          const permission = await navigator.permissions.query({name: 'microphone'});
          console.log('Microphone permission state:', permission.state);
          
          if (permission.state === 'denied') {
            showStatus(elements.globalStatus, '🚫 Accès microphone refusé. Activez-le dans les paramètres du navigateur.', 'error');
            return false;
          }
        } catch (permError) {
          console.warn('Permission query failed:', permError);
        }
      }

      if (location.protocol !== 'https:' && !location.hostname.includes('localhost') && location.hostname !== '127.0.0.1') {
        showStatus(elements.globalStatus, '🔒 HTTPS requis pour l\'accès microphone.', 'error');
        return false;
      }

      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        testStream.getTracks().forEach(track => track.stop());
        console.log('Microphone access test successful');
        return true;
      } catch (mediaError) {
        console.error('Microphone access test failed:', mediaError);
        let errorMsg = '🎙️ Impossible d\'accéder au microphone';
        
        if (mediaError.name === 'NotAllowedError') {
          errorMsg += ': Permission refusée';
        } else if (mediaError.name === 'NotFoundError') {
          errorMsg += ': Aucun microphone trouvé';
        } else {
          errorMsg += ': ' + mediaError.message;
        }
        
        showStatus(elements.globalStatus, errorMsg, 'error');
        return false;
      }

    } catch (error) {
      console.error('Permission check failed:', error);
      return false;
    }
  }

  // Utility Functions
  function showStatus(element, message, type = 'loading') {
    if (!element) return;
    element.className = `status-message status-${type}`;
    element.innerHTML = message;
    element.classList.remove('hidden');
    console.log(`Status [${type}]:`, message);
  }

  function hideStatus(element) {
    if (!element) return;
    element.classList.add('hidden');
  }

  function resetRecordButton() {
    if (elements.recordBtn) {
      elements.recordBtn.disabled = false;
      elements.recordBtn.innerHTML = '🎙️ Reconnaissance vocale';
      elements.recordBtn.classList.remove('recording');
    }
    if (elements.stopBtn) {
      elements.stopBtn.classList.add('hidden');
    }
  }

  function showProgressStatus(step, message) {
    const progressBarHTML = `
      <div style="margin-bottom: 15px;">
        <div style="background: #e2e8f0; border-radius: 10px; height: 20px; overflow: hidden;">
          <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${step * 25}%; transition: width 0.5s ease;"></div>
        </div>
        <div style="text-align: center; margin-top: 8px; font-weight: 500;">${message}</div>
      </div>
    `;
    
    if (elements.responseText) {
      elements.responseText.innerHTML = progressBarHTML;
      isTextCurrentlyVisible = false;
    }
  }

  function showResponseText() {
    if (currentResponse && elements.responseText) {
      elements.responseText.innerHTML = currentResponse;
      isTextCurrentlyVisible = true;
      updateShowResponseButton();
    }
  }

  function hideResponseText() {
    showProgressStatus(4, '✅ Texte masqué. Cliquez pour réafficher.');
    isTextCurrentlyVisible = false;
    updateShowResponseButton();
  }

  function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    if (audioHasBeenPlayed && currentResponse) {
      elements.showResponseBtn.classList.remove('hidden');
      if (isTextCurrentlyVisible) {
        elements.showResponseBtn.innerHTML = '🙈 Masquer la réponse';
      } else {
        elements.showResponseBtn.innerHTML = '👁️ Afficher la réponse';
      }
    } else {
      elements.showResponseBtn.classList.add('hidden');
    }
  }

function resetUI() {
  console.log('Resetting UI...');
  
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

    elements.startSection?.classList.remove('hidden');
    elements.conversationSection?.classList.add('hidden');
    
    if (elements.userText) {
      elements.userText.textContent = placeholderText;
      elements.userText.classList.add('placeholder');
      elements.userText.dataset.isPlaceholder = 'true';
    }
    if (elements.responseText) {
      elements.responseText.textContent = '...';
    }
    
    if (elements.audioPlayback) {
      elements.audioPlayback.src = '';
      elements.audioPlayback.classList.add('hidden');
    }
    
    if (elements.userAudio) {
      elements.userAudio.src = '';
    }
    
    elements.userAudioSection?.classList.add('hidden');
    elements.playAudioBtn?.classList.add('hidden');
    elements.showResponseBtn?.classList.add('hidden');
    
    resetRecordButton();
    // elements.useSTTBtn?.classList.add('hidden'); // useSTTBtn ist nicht mehr in elements
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = ''; //setzt kumulativen Transcript zurück
    
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);
  }

    async function startRealTimeSpeech() {
      console.log('Starting real-time speech with recording...');
      
      try {
        const permissionsOk = await checkMicrophonePermissions();
        if (!permissionsOk || !recognition) {
          showStatus(elements.globalStatus, '⚠️ Microphone ou reconnaissance vocale non disponible', 'error');
          return;
        }

        // Reset transcript vor Start
        finalTranscript = '';
        recordedAudioBlob = null;
        
        // Clear user text
        if (elements.userText) {
          elements.userText.textContent = '';
          elements.userText.classList.remove('placeholder');
          elements.userText.dataset.isPlaceholder = 'false';
        }
        
        // Start audio recording
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
        
        let options = {};
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options.mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          options.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options.mimeType = 'audio/mp4';
        } else {
          console.warn('No supported audio format found');
        }
        console.log('Using MediaRecorder with:', options)
        
        mediaRecorder = new MediaRecorder(currentAudioStream, options);

        // Event-Handler VOR start() setzen
        mediaRecorder.ondataavailable = event => {
          console.log('Data available:', event.data.size, 'bytes');
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          console.log('MediaRecorder stopped, total chunks:', audioChunks.length);
          if (audioChunks.length > 0) {

            // WICHTIG: Erhalte den MIME-Typ vom MediaRecorder, nicht statisch "audio/webm"
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            recordedAudioBlob = new Blob(audioChunks, {type: mimeType});

            console.log('Created blob:', recordedAudioBlob.size, 'bytes');
            // Audio an das Backend senden zum Speichern über die /api/transcribe Route
            showStatus(elements.recordingStatus, '💾 Sauvegarde de l\'audio...', 'loading');
            const uploadResult = await uploadRecordedAudio(recordedAudioBlob, mimeType);
            if (uploadResult && uploadResult.audio_path) {
                showStatus(elements.recordingStatus, '✅ Audio sauvegardé', 'success');
                // Sicherstellen, dass Elemente gültig sind, bevor versucht wird, sie zu manipulieren
                if (elements.userAudio && elements.userAudioSection) {
                    elements.userAudio.src = uploadResult.audio_path;
                    elements.userAudioSection.classList.remove('hidden'); // Macht den Audio-Player sichtbar
                    console.log('User audio player set and section shown. Src:', elements.userAudio.src);
                } else {
                    console.error('userAudio oder userAudioSection Element nicht gefunden!');
                }

            } else {
                showStatus(elements.recordingStatus, '⚠️ Échec de la sauvegarde audio', 'error');
            }

            console.log('Audio recording completed and uploaded, blob size:', recordedAudioBlob.size);

            } else {

            console.error('No audio chunks recorded!');
            showStatus(elements.recordingStatus, '⚠️ Aucun audio enregistré', 'error');

            }
        };
        
        // Warten bis MediaRecorder ready ist
        setTimeout(() => {
          if (mediaRecorder && mediaRecorder.state === 'inactive') {
            mediaRecorder.start(1000); // Längere Intervalle für bessere Chunks
            console.log('MediaRecorder started with state:', mediaRecorder.state);
          }
        }, 100);
        
        // Start speech recognition
        isRecognitionRestarting = false;
        startRecognition();
        
        // Update UI
        if (elements.recordBtn) {
          elements.recordBtn.innerHTML = '🔴 Arrêter l\'enregistrement';
          elements.recordBtn.classList.add('recording');
        }
        
        if (elements.stopBtn) {
          elements.stopBtn.classList.remove('hidden');
          elements.stopBtn.innerHTML = '⏹️ Arrêter';
        }
        
        showStatus(elements.recordingStatus, '🎤 Enregistrement + reconnaissance actifs', 'success');
        
      } catch (err) {
        console.error('Real-time speech error:', err);
        showStatus(elements.recordingStatus, '⚠️ Erreur: ' + err.message, 'error');
        resetRecordButton();
        cleanupAudioStream();
      }
    }

    function stopRealTimeSpeech() {
      console.log('Stopping real-time speech...');
      
      isRecognitionRestarting = true;
      
      if (recognition && recognitionActive) {
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
      }
      recognitionActive = false;
      
      if (mediaRecorder && mediaRecorder.state === "recording") {
        console.log('Stopping MediaRecorder...');
        mediaRecorder.stop();
        
        // Warten bis MediaRecorder wirklich gestoppt ist
        setTimeout(() => {
          console.log('MediaRecorder final state:', mediaRecorder.state);
          // audioChunks erst nach dem Stop zurücksetzen
          setTimeout(() => {
            audioChunks = [];
          }, 500);
        }, 100);
      }
      
      cleanupAudioStream();
      resetRecordButton();
    // Wenn die Aufnahme gestoppt wurde, stelle sicher, dass der finale Text im userText-Feld ist

    if (elements.userText) {
        const finalContent = finalTranscript.trim();
        elements.userText.textContent = finalContent;
        console.log('Final User Text set:', elements.userText.textContent); // Bestätigen des Inhalts

        if (finalContent) {
            elements.userText.classList.remove('placeholder');
            elements.userText.dataset.isPlaceholder = 'false';
        } else {
            elements.userText.textContent = placeholderText; // Nur Platzhalter setzen, wenn wirklich leer
            elements.userText.classList.add('placeholder');
            elements.userText.dataset.isPlaceholder = 'true';
        }
    } else {
        console.error('userText Element nicht gefunden!');
    }

// Sende den transkribierten Text an das Backend

if (finalTranscript.trim()) {
    sendMessageToBackend(finalTranscript.trim());
} else {
    showStatus(elements.recordingStatus, 'Aucune parole détectée.', 'warning'); // Geändert zu recordingStatus
}
showStatus(elements.recordingStatus, '✅ Enregistrement terminé', 'success');
}

  function cleanupAudioStream() {
    if (currentAudioStream) {
      currentAudioStream.getTracks().forEach(track => track.stop());
      currentAudioStream = null;
    }
  }



// === Backend Communication ===

async function sendMessageToBackend(message) {

    if (!message.trim()) {
        showStatus(elements.globalStatus, 'Veuillez entrer un message.', 'warning');
        return;
    }
    showProgressStatus(1, '🚀 Envoi du message...');

    elements.sendBtn.disabled = true;
    elements.recordBtn.disabled = true;

    try {
        const response = await fetch('/api/respond', {
            method: 'POST',
            headers: {'Content-Type': 'application/json',},
            body: JSON.stringify({
            message: message,
            userId: userId, 
            scenario: currentScenario
            }),

        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Backend response:', data);
        currentResponse = data.response; // Angepasst an 'response' aus app.py
        showResponseText(); // Show the text first
    
        if (data.audio_url) { // Angepasst an 'audio_url' aus app.py

            elements.audioPlayback.src = data.audio_url;
            elements.audioPlayback.classList.remove('hidden');
            elements.playAudioBtn.classList.remove('hidden');
            audioHasBeenPlayed = false; // Reset for new response
            updateShowResponseButton();
            showProgressStatus(3, '🔊 Audio prêt.');

        } else {

            showStatus(elements.audioStatus, '⚠️ Aucun audio de réponse reçu.', 'warning');
            elements.playAudioBtn.classList.add('hidden');
            showProgressStatus(4, '✅ Réponse textuelle prête.');
        }

        showStatus(elements.globalStatus, '✅ Réponse reçue', 'success');

    } catch (error) {

        console.error('Error sending message to backend:', error);
        showStatus(elements.globalStatus, `❌ Erreur: ${error.message}`, 'error');
        elements.responseText.textContent = 'Une erreur est survenue lors de la communication avec le serveur.';
        isTextCurrentlyVisible = true;
        updateShowResponseButton();

    } finally {

        elements.sendBtn.disabled = false;
        elements.recordBtn.disabled = false;
    }

}

    // === Audio Upload Function (Updated) ===

    async function uploadRecordedAudio(audioBlob, mimeType) {
        if (!audioBlob) {
            console.warn('No audio blob to upload.');
        return null;
        }

        const formData = new FormData();
        // Verwenden Sie den korrekten Dateinamen mit der ermittelten Erweiterung
        // Der Backend-Teil os.path.splitext(original_filename)[1] erwartet eine Erweiterung

        const fileExtension = mimeType.split('/')[1].split(';')[0]; // z.B. 'webm' aus 'audio/webm;codecs=opus'
        formData.append('audio', audioBlob, `recording.${fileExtension}`); // 'audio' ist der Key, den das Backend erwartet
        formData.append('user_id', userId);
        console.log(`Uploading audio blob of type ${mimeType} with size ${audioBlob.size} bytes as recording.${fileExtension} to /api/transcribe`);

        try {

            const response = await fetch('/api/transcribe', { // Wieder auf /api/transcribe gerichtet
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Audio uploaded successfully:', data);
            return data; // Enthält audio_path

        } catch (error) {

            console.error('Error uploading audio:', error);
            return null;

        }

    }

  // === Event Listeners ===

  elements.startBtn?.addEventListener('click', async () => {
    const scenario = elements.scenarioSelect?.value;
    if (!scenario) {
      showStatus(elements.globalStatus, "⚠️ Veuillez choisir un thème.", 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    elements.startSection?.classList.add('hidden');
    elements.conversationSection?.classList.remove('hidden');
    currentUserId = userId; // Set current user ID
    // Setzt den Anzeigetext für das aktuelle Szenario
    const currentScenarioDisplay = document.getElementById('currentScenarioDisplay');
    if (currentScenarioDisplay) {
      currentScenarioDisplay.innerText = scenario === "libre" ? "Votre sujet libre" : scenario;
    }

    if (scenario !== "libre") {
      showProgressStatus(1, '🤔 L\'assistant prépare la conversation...');
      
      const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${scenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression. Commence par me poser une question ou présenter une situation pour démarrer notre conversation.`;

      try {
        const res = await fetch('/api/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: intro, // Hier 'message' verwenden, wie es der Backend-Endpunkt erwartet
            userId: userId, // Hier 'userId' verwenden
            scenario: scenario
          })
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        currentResponse = data.response;
        
        showProgressStatus(2, '📝 Conversation préparée, génération de l\'audio...');
        
        if (data.audio_url) {
          showProgressStatus(3, '🎵 Audio généré, préparation de la lecture...');
          elements.audioPlayback.src = data.audio_url;
          elements.audioPlayback.classList.remove('hidden');
          elements.audioPlayback.addEventListener('canplay', function() {
            showProgressStatus(4, '🔊 Audio prêt! Cliquez sur "Écouter" pour commencer.');
            elements.playAudioBtn?.classList.remove('hidden');
          }, { once: true });

          elements.audioPlayback.addEventListener('ended', function() {
            audioHasBeenPlayed = true;
            showProgressStatus(4, '✅ Lecture terminée! Vous pouvez maintenant voir le texte.');
            updateShowResponseButton();
          }, { once: true });
        } else {
          audioHasBeenPlayed = true;
          showResponseText();
        }
        
      } catch (err) {
        console.error('Error starting conversation:', err);
        if (elements.responseText) {
          elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ Erreur: ${err.message}</div>`;
        }
      }
    } else {
      if (elements.responseText) {
        elements.responseText.innerHTML = "🎯 Sujet libre sélectionné. Cliquez sur 'Reconnaissance vocale' pour commencer!";
      }
    }
  });

  elements.newConvBtn?.addEventListener('click', () => {resetUI();});
// Anpassen des Record-Buttons, um Start/Stop der Echtzeit-Spracherkennung zu steuern

elements.recordBtn?.addEventListener('click', () => {

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRealTimeSpeech();
    } else {
        startRealTimeSpeech();
    }

});

elements.stopBtn?.addEventListener('click', () => {

    stopRealTimeSpeech();

});

elements.sendBtn?.addEventListener('click', () => {

    // Wenn der Benutzer auf "Senden" klickt, senden wir den aktuellen finalTranscript an das Backend

    if (finalTranscript.trim()) {

        sendMessageToBackend(finalTranscript.trim());

    } else if (elements.userText.textContent.trim() && elements.userText.dataset.isPlaceholder !== 'true') {

        // Fallback: Wenn kein finalTranscript, aber Text im Feld ist (z.B. manuell eingegeben)

        sendMessageToBackend(elements.userText.textContent.trim());

    } else {

    showStatus(elements.globalStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');

    }

});

elements.playAudioBtn?.addEventListener('click', () => {

    if (elements.audioPlayback && elements.audioPlayback.src) {

        elements.audioPlayback.play().catch(err => {
            console.error('Audio play failed:', err);
            showStatus(elements.audioStatus, '⚠️ Impossible de lire l\'audio', 'error');
        });

        audioHasBeenPlayed = true;
        updateShowResponseButton();

    }

});
  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse && audioHasBeenPlayed) {
      if (isTextCurrentlyVisible) {
        hideResponseText();
      } else {
        showResponseText();
      }
    } 
    else if (currentResponse && !audioHasBeenPlayed) {
        elements.showResponseBtn?.classList.add('hidden');
    }
    else if (!audioHasBeenPlayed) {
      showStatus(elements.globalStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

    elements.scenarioSelect?.addEventListener('change', (event) => {
        currentScenario = event.target.value;
        console.log('Scenario changed to:', currentScenario);
    });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      
        if (finalTranscript.trim()) {
            sendMessageToBackend(finalTranscript.trim());
        } else if (elements.userText.textContent.trim() && elements.userText.dataset.isPlaceholder !== 'true') {
            sendMessageToBackend(elements.userText.textContent.trim());
        } else {
            showStatus(elements.globalStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
        }
    }
    
    // Space bar to toggle real-time speech (when not in input field)
    // Deaktiviert, da startRealTimeSpeech() jetzt beim Start der Konversation aufgerufen wird
    // und der Record-Button die Funktionalität übernimmt.

    /*
    if (e.code === 'Space' && e.target === document.body && elements.conversationSection && !elements.conversationSection.classList.contains('hidden')) {
      e.preventDefault();
      if (mediaRecorder && mediaRecorder.state === 'recording') {

        stopRealTimeSpeech();
      } else {
        startRealTimeSpeech();

      }

    }        */
});

 
  
// Initial UI setup
  resetUI();
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});