// Optimiertes script.js mit verbesserter Real-Time Transkription
document.addEventListener('DOMContentLoaded', function() {
  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    useSTTBtn: document.getElementById('useSTT'),
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
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = false;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = ''; // Moved to global scope
  let isRecognitionRestarting = false;

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung mit stabilerer Real-Time Implementation ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true; // GEÄNDERT: Auf true für kontinuierliche Erkennung
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      console.log('Speech recognition result received, results count:', event.results.length);
      let interimTranscript = '';
      let newFinalTranscript = '';
      
      // Sammle alle finalen und interim Ergebnisse
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

      // Aktualisiere finalTranscript nur bei neuen finalen Ergebnissen
      if (newFinalTranscript.trim()) {
        finalTranscript += newFinalTranscript;
        console.log('Updated final transcript:', finalTranscript);
      }

      // Real-Time Update des UI
      const displayText = (finalTranscript + interimTranscript).trim();
      if (elements.userText) {
        elements.userText.textContent = displayText;
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
        
        // Cursor an das Ende setzen
        if (document.activeElement === elements.userText) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(elements.userText);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

      // Status-Update für Real-Time
      if (isRealTimeMode) {
        const statusText = interimTranscript ? 
          `🎤 Écoute... "${interimTranscript}"` : 
          (newFinalTranscript ? `🎤 Transcrit: "${newFinalTranscript.trim()}"` : '🎤 En écoute...');
        showStatus(elements.recordingStatus, statusText, 'success');
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      let shouldRestart = false;
      
      switch(event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé. Vérifiez les permissions.';
          isRealTimeMode = false;
          break;
        case 'no-speech':
          // In Real-Time Mode ist no-speech normal
          if (isRealTimeMode) {
            console.log('No speech detected, continuing...');
            shouldRestart = true;
            return; // Keinen Fehler anzeigen
          } else {
            errorMessage = '🔇 Aucune parole détectée.';
          }
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau. Vérifiez votre connexion.';
          shouldRestart = isRealTimeMode;
          break;
        case 'audio-capture':
          errorMessage = '🎙️ Impossible d\'accéder au microphone.';
          isRealTimeMode = false;
          break;
        case 'aborted':
          // Normal beim Stoppen
          console.log('Recognition aborted');
          return;
        case 'service-not-allowed':
          errorMessage = '🚫 Service de reconnaissance vocale non autorisé.';
          isRealTimeMode = false;
          break;
      }
      
      recognitionActive = false;
      
      if (!shouldRestart) {
        showStatus(elements.globalStatus, errorMessage, 'error');
        if (!isRealTimeMode) {
          resetRecordButton();
        }
      }
      
      // Auto-restart für bestimmte Fehler in real-time mode
      if (shouldRestart && isRealTimeMode && !isRecognitionRestarting) {
        console.log('Scheduling recognition restart after error:', event.error);
        setTimeout(() => {
          if (isRealTimeMode && !isRecognitionRestarting) {
            startRecognition();
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended, isRealTimeMode:', isRealTimeMode, 'isRecognitionRestarting:', isRecognitionRestarting);
      recognitionActive = false;
      
      if (isRealTimeMode && !isRecognitionRestarting) {
        // Auto-restart in real-time mode
        console.log('Auto-restarting recognition in real-time mode');
        setTimeout(() => {
          if (isRealTimeMode && !isRecognitionRestarting) {
            startRecognition();
          }
        }, 100); // Kürzere Pause für flüssigere Erkennung
      } else if (!isRealTimeMode) {
        hideStatus(elements.recordingStatus);
        resetRecordButton();
      }
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      recognitionActive = true;
      isRecognitionRestarting = false;
    };

    // Verbesserte Hilfsfunktion für sauberen Recognition-Start
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
        
        // Warte auf onend Event, dann starte neu
        setTimeout(() => {
          if (isRealTimeMode) {
            startRecognition();
          }
        }, 300);
        return;
      }

      try {
        console.log('Starting speech recognition');
        isRecognitionRestarting = false;
        recognition.start();
      } catch (e) {
        console.error('Could not start recognition:', e);
        recognitionActive = false;
        isRecognitionRestarting = false;
        showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
        
        // Fallback: Versuche es in 2 Sekunden nochmal
        if (isRealTimeMode) {
          setTimeout(() => {
            if (isRealTimeMode && !recognitionActive) {
              startRecognition();
            }
          }, 2000);
        }
      }
    }

  } else {
    console.warn('SpeechRecognition API nicht verfügbar.');
    if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
    showStatus(elements.globalStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur.', 'warning');
  }

  // === VERBESSERTE Mikrofonzugriff-Diagnose ===
  async function checkMicrophonePermissions() {
    try {
      console.log('Checking microphone permissions...');
      
      // Prüfe Permissions API Support
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

      // Prüfe HTTPS (außer localhost)
      if (location.protocol !== 'https:' && !location.hostname.includes('localhost') && location.hostname !== '127.0.0.1') {
        showStatus(elements.globalStatus, '🔒 HTTPS requis pour l\'accès microphone.', 'error');
        return false;
      }

      // Test actual microphone access
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

  // Reset Record Button
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

  // Progress Bar Function
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
    
    // Stop any ongoing recognition
    if (recognition && isRealTimeMode) {
      isRealTimeMode = false;
      isRecognitionRestarting = true;
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    recognitionActive = false;
    clearTimeout(recognitionTimeout);

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
    elements.useSTTBtn?.classList.add('hidden');
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = '';
    
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);
  }

  // === VERBESSERTE Real-Time Transkriptionsfunktion ===
  async function startRealTimeSpeech() {
    console.log('Starting real-time speech...');
    
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) {
        console.error('Microphone permissions not granted');
        return;
      }

      if (!recognition) {
        showStatus(elements.globalStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur', 'error');
        return;
      }

      // Reset transcript
      finalTranscript = '';
      isRealTimeMode = true;
      isRecognitionRestarting = false;
      
      // Clear previous text
      if (elements.userText) {
        elements.userText.textContent = '';
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }
      
      showStatus(elements.recordingStatus, '🎤 Reconnaissance vocale activée. Parlez maintenant!', 'success');
      
      // Start recognition
      startRecognition();
      
      // Update UI
      if (elements.recordBtn) {
        elements.recordBtn.innerHTML = '🔴 Écoute en cours...';
        elements.recordBtn.disabled = true;
        elements.recordBtn.classList.add('recording');
      }
      
      if (elements.stopBtn) {
        elements.stopBtn.classList.remove('hidden');
        elements.stopBtn.innerHTML = '⏹️ Arrêter';
      }
      
    } catch (err) {
      console.error('Real-time speech error:', err);
      showStatus(elements.recordingStatus, '⚠️ Erreur reconnaissance vocale: ' + err.message, 'error');
      isRealTimeMode = false;
      resetRecordButton();
    }
  }

  function stopRealTimeSpeech() {
    console.log('Stopping real-time speech...');
    
    isRealTimeMode = false;
    isRecognitionRestarting = true;
    
    if (recognition && recognitionActive) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    recognitionActive = false;
    clearTimeout(recognitionTimeout);
    
    resetRecordButton();
    
    showStatus(elements.recordingStatus, '✅ Reconnaissance vocale arrêtée', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 2000);
  }

  // === LEGACY Recording Functions (für Shift+Click) ===
  async function startRecording() {
    console.log('Starting traditional recording...');
    
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) return;

      audioChunks = [];
      showStatus(elements.recordingStatus, '🎙️ Demande d\'accès au microphone...', 'loading');
      
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }
      
      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        
        if (audioChunks.length === 0) {
          showStatus(elements.recordingStatus, '⚠️ Aucun audio enregistré', 'error');
          return;
        }
        
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        recordedAudioBlob = new Blob(audioChunks, { type: mimeType });
        
        const audioURL = URL.createObjectURL(recordedAudioBlob);
        if (elements.userAudio) {
          elements.userAudio.src = audioURL;
          elements.userAudioSection?.classList.remove('hidden');
        }
        
        elements.useSTTBtn?.classList.remove('hidden');
        showStatus(elements.recordingStatus, '✅ Enregistrement terminé!', 'success');
      };

      mediaRecorder.start(250);
      
      elements.recordBtn.disabled = true;
      elements.recordBtn.innerHTML = '🔴 Enregistrement...';
      elements.recordBtn.classList.add('recording');
      elements.stopBtn?.classList.remove('hidden');
      
      showStatus(elements.recordingStatus, '🎙️ Enregistrement en cours...', 'success');
      
    } catch (err) {
      console.error('Recording error:', err);
      showStatus(elements.recordingStatus, `⚠️ Erreur microphone: ${err.message}`, 'error');
      resetRecordButton();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      resetRecordButton();
    }
  }

  // Send Message Function
  async function sendMessage() {
    let text = '';
    
    // Hole Text aus dem Element
    if (elements.userText) {
      text = elements.userText.textContent?.trim() || '';
    }
    
    if (!text || text === placeholderText) {
      showStatus(elements.globalStatus, '⚠️ Veuillez entrer un message', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    // Stop real-time mode when sending
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    }

    // Reset state
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    currentResponse = null;
    elements.playAudioBtn?.classList.add('hidden');
    updateShowResponseButton();

    showProgressStatus(1, '🤔 L\'assistant réfléchit...');

    try {
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          user_id: currentUserId || 'user_' + Date.now(),
          scenario: elements.scenarioSelect?.value
        })
      });

      if (!response.ok) {
        throw new Error(`Response failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      currentResponse = data.response;
      showProgressStatus(2, '📝 Réponse reçue, génération de l\'audio...');

      if (data.audio_url) {
        showProgressStatus(3, '🎵 Audio généré, préparation de la lecture...');
        
        if (elements.audioPlayback) {
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

          elements.audioPlayback.addEventListener('error', function() {
            console.warn('Audio load failed, showing text immediately');
            audioHasBeenPlayed = true;
            showResponseText();
            showStatus(elements.audioStatus, '⚠️ Problème audio - texte affiché directement', 'error');
          }, { once: true });
        }
      } else {
        console.warn('No audio URL received, showing text immediately');
        audioHasBeenPlayed = true;
        showResponseText();

        if (data.tts_error) {
          showStatus(elements.audioStatus, '⚠️ Audio non disponible: ' + data.tts_error, 'error');
        }
      }
      
      // Reset user input
      if (elements.userText) {
        elements.userText.textContent = placeholderText;
        elements.userText.classList.add('placeholder');
        elements.userText.dataset.isPlaceholder = 'true';
      }
      
      recordedAudioBlob = null;
      elements.userAudioSection?.classList.add('hidden');
      elements.useSTTBtn?.classList.add('hidden');
      finalTranscript = ''; // Reset transcript
      
    } catch (err) {
      console.error('Send error:', err);
      if (elements.responseText) {
        elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ ${err.message}</div>`;
      }
    }
  }

  // === Event Listeners ===
  
  // Record button: Real-time by default, traditional recording with Shift
  elements.recordBtn?.addEventListener('click', (event) => {
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    } else {
      if (event.shiftKey) {
        startRecording();
      } else {
        startRealTimeSpeech();
      }
    }
  });

  elements.stopBtn?.addEventListener('click', () => {
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    } else {
      stopRecording();
    }
  });

  elements.sendBtn?.addEventListener('click', sendMessage);

  elements.startBtn?.addEventListener('click', async () => {
    const scenario = elements.scenarioSelect?.value;
    if (!scenario) {
      showStatus(elements.globalStatus, "⚠️ Veuillez choisir un thème.", 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    elements.startSection?.classList.add('hidden');
    elements.conversationSection?.classList.remove('hidden');
    
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
            text: intro, 
            user_id: 'intro_' + Date.now(),
            scenario: scenario
          })
        });

        const data = await res.json();
        currentResponse = data.response;
        
        showProgressStatus(2, '📝 Conversation préparée, génération de l\'audio...');
        
        if (data.audio_url && elements.audioPlayback) {
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

  elements.newConvBtn?.addEventListener('click', resetUI);

  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse && audioHasBeenPlayed) {
      if (isTextCurrentlyVisible) {
        hideResponseText();
      } else {
        showResponseText();
      }
    } else if (!audioHasBeenPlayed) {
      showStatus(elements.globalStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

  elements.playAudioBtn?.addEventListener('click', () => {
    if (elements.audioPlayback?.src) {
      elements.audioPlayback.play().catch(err => {
        console.error('Audio play failed:', err);
        showStatus(elements.audioStatus, '⚠️ Impossible de lire l\'audio', 'error');
      });
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
    
    // Space bar to toggle real-time speech (when not in input field)
    if (e.code === 'Space' && e.target === document.body && elements.conversationSection && !elements.conversationSection.classList.contains('hidden')) {
      e.preventDefault();
      if (isRealTimeMode) {
        stopRealTimeSpeech();
      } else {
        startRealTimeSpeech();
      }
    }
  });

  // Improved editable text handling
  if (elements.userText) {
    elements.userText.addEventListener('focus', function() {
      if (this.dataset.isPlaceholder === 'true') {
        this.textContent = '';
        this.classList.remove('placeholder');
        this.dataset.isPlaceholder = 'false';
      }
    });

    elements.userText.addEventListener('blur', function() {
      if (!this.textContent.trim()) {
        this.textContent = placeholderText;
        this.classList.add('placeholder');
        this.dataset.isPlaceholder = 'true';
      }
    });

    elements.userText.addEventListener('paste', function(e) {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      
      // Insert text at cursor position
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
      } else {
        this.textContent = text;
      }
      
      this.classList.remove('placeholder');
      this.dataset.isPlaceholder = 'false';
    });

    // Prevent line breaks in contenteditable
    elements.userText.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Initialize
  resetUI();
  
  // Check microphone support on load
  checkMicrophonePermissions().then(result => {
    if (result) {
      console.log('✅ Microphone permissions OK');
      showStatus(elements.globalStatus, '✅ Microphone prêt pour la reconnaissance vocale', 'success');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    } else {
      console.log('❌ Microphone permissions failed');
    }
  });
  
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});