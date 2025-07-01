// Optimiertes script.js mit verbesserter Mikrofonunterstützung und Real-Time Transkription
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
  let isRealTimeMode = false; // NEU: Real-Time Modus

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung mit Real-Time Support ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true; // GEÄNDERT: Für Real-Time
    recognition.continuous = true; // GEÄNDERT: Kontinuierliche Erkennung
    recognition.maxAlternatives = 3; // HINZUGEFÜGT: Mehrere Alternativen

    let finalTranscript = '';
    let interimTranscript = '';

    recognition.onresult = (event) => {
      interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Real-Time Update des UI
      const displayText = finalTranscript + interimTranscript;
      if (displayText.trim()) {
        elements.userText.innerText = displayText;
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
        
        // Status-Update für Real-Time
        if (isRealTimeMode) {
          showStatus(elements.recordingStatus, '🎤 Écoute... ' + (interimTranscript ? '(en cours)' : ''), 'success');
        }
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      
      switch(event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé. Vérifiez les permissions.';
          break;
        case 'no-speech':
          errorMessage = '🔇 Aucune parole détectée. Parlez plus fort.';
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau. Vérifiez votre connexion.';
          break;
        case 'audio-capture':
          errorMessage = '🎙️ Impossible d\'accéder au microphone.';
          break;
      }
      
      showStatus(elements.globalStatus, errorMessage, 'error');
      
      // Restart recognition if network error in real-time mode
      if (event.error === 'network' && isRealTimeMode) {
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.warn('Could not restart recognition:', e);
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      hideStatus(elements.recordingStatus);
      if (isRealTimeMode) {
        // Auto-restart in real-time mode
        try {
          setTimeout(() => recognition.start(), 100);
        } catch (e) {
          console.warn('Could not restart recognition:', e);
          isRealTimeMode = false;
        }
      }
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
    };
  } else {
    console.warn('SpeechRecognition API nicht verfügbar.');
    if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
    showStatus(elements.globalStatus, '⚠️ Spracherkennung nicht unterstützt. Bitte Text manuell eingeben.', 'warning');
  }

  // === VERBESSERTE Mikrofonzugriff-Diagnose ===
  async function checkMicrophonePermissions() {
    try {
      // Prüfe Permissions API Support
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({name: 'microphone'});
        console.log('Microphone permission:', permission.state);
        
        if (permission.state === 'denied') {
          showStatus(elements.globalStatus, '🚫 Microphone access denied. Please enable in browser settings.', 'error');
          return false;
        }
      }

      // Prüfe HTTPS
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        showStatus(elements.globalStatus, '🔒 HTTPS required for microphone access.', 'error');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Permission check failed:', error);
      return true; // Fallback: try anyway
    }
  }

  // Utility Functions
  function showStatus(element, message, type = 'loading') {
    if (!element) return;
    element.className = `status-message status-${type}`;
    element.innerHTML = message;
    element.classList.remove('hidden');
  }

  function hideStatus(element) {
    if (!element) return;
    element.classList.add('hidden');
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
    // Stop any ongoing recognition
    if (recognition && isRealTimeMode) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    isRealTimeMode = false;

    elements.startSection.classList.remove('hidden');
    elements.conversationSection.classList.add('hidden');
     if (elements.userText) {
      elements.userText.innerHTML = placeholderText;
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
    
    // Reset buttons
    if (elements.recordBtn) {
      elements.recordBtn.disabled = false;
      elements.recordBtn.innerHTML = '🎙️ Enregistrer';
      elements.recordBtn.classList.remove('recording');
    }
    elements.stopBtn?.classList.add('hidden');
    elements.useSTTBtn?.classList.add('hidden');
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);
  }

  // === VERBESSERTE Aufnahmefunktionen ===
  async function startRecording() {
    try {
      // Prüfe Berechtigungen zuerst
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) {
        return;
      }

      audioChunks = [];
      showStatus(elements.recordingStatus, '🎙️ Demande d\'accès au microphone...', 'loading');
      
      // VERBESSERTE MediaConstraints
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 },
          // Français-optimierte Einstellungen
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Prüfe MediaRecorder Support mit besseren Optionen
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
        options.audioBitsPerSecond = 48000; // Bessere Qualität für Französisch
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
        
        // Audio-Preview erstellen
        const audioURL = URL.createObjectURL(recordedAudioBlob);
        if (elements.userAudio) {
          elements.userAudio.src = audioURL;
          elements.userAudioSection?.classList.remove('hidden');
        }
        
        // STT Button anzeigen
        elements.useSTTBtn?.classList.remove('hidden');
        
        showStatus(elements.recordingStatus, '✅ Enregistrement terminé! Utilisez la reconnaissance vocale.', 'success');
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        showStatus(elements.recordingStatus, '⚠️ Erreur lors de l\'enregistrement', 'error');
      };

      // Start mit kleineren Chunks für bessere Performance
      mediaRecorder.start(250);
      
      elements.recordBtn.disabled = true;
      elements.recordBtn.innerHTML = '🔴 Enregistrement...';
      elements.recordBtn.classList.add('recording');
      elements.stopBtn?.classList.remove('hidden');
      
      showStatus(elements.recordingStatus, '🎙️ Enregistrement en cours... Parlez maintenant!', 'success');
      
    } catch (err) {
      console.error('Recording error:', err);
      let errorMessage = '⚠️ Erreur microphone: ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Accès refusé. Autorisez le microphone dans les paramètres du navigateur.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'Aucun microphone trouvé.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Microphone utilisé par une autre application.';
      } else {
        errorMessage += err.message;
      }
      
      showStatus(elements.recordingStatus, errorMessage, 'error');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      elements.recordBtn.disabled = false;
      elements.recordBtn.innerHTML = '🎙️ Enregistrer';
      elements.recordBtn.classList.remove('recording');
      elements.stopBtn?.classList.add('hidden');
    }
  }

  // === NEUe Real-Time Transkriptionsfunktion ===
  async function startRealTimeSpeech() {
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) return;

      if (!recognition) {
        showStatus(elements.globalStatus, '⚠️ Reconnaissance vocale non supportée', 'error');
        return;
      }

      isRealTimeMode = true;
      
      // Clear previous text
      elements.userText.innerText = '';
      elements.userText.classList.remove('placeholder');
      elements.userText.dataset.isPlaceholder = 'false';
      
      showStatus(elements.recordingStatus, '🎤 Reconnaissance vocale en temps réel activée. Parlez!', 'success');
      
      // Start continuous recognition
      recognition.start();
      
      // Update UI
      elements.recordBtn.innerHTML = '🔴 Écoute en cours...';
      elements.recordBtn.disabled = true;
      elements.recordBtn.classList.add('recording');
      
      // Add stop button for real-time mode
      if (elements.stopBtn) {
        elements.stopBtn.classList.remove('hidden');
        elements.stopBtn.innerHTML = '⏹️ Arrêter l\'écoute';
      }
      
    } catch (err) {
      console.error('Real-time speech error:', err);
      showStatus(elements.recordingStatus, '⚠️ Erreur reconnaissance vocale: ' + err.message, 'error');
      isRealTimeMode = false;
    }
  }

  function stopRealTimeSpeech() {
    if (recognition && isRealTimeMode) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    isRealTimeMode = false;
    elements.recordBtn.disabled = false;
    elements.recordBtn.innerHTML = '🎙️ Enregistrer';
    elements.recordBtn.classList.remove('recording');
    elements.stopBtn?.classList.add('hidden');
    
    showStatus(elements.recordingStatus, '✅ Reconnaissance vocale arrêtée', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 2000);
  }

  // VERBESSERTE STT-Funktion (Legacy-Support)
  async function processSTT() {
    if (!recordedAudioBlob) {
      showStatus(elements.recordingStatus, '⚠️ Aucun enregistrement disponible', 'error');
      return;
    }

    showStatus(elements.recordingStatus, '🔄 Envoi de l\'audio au serveur...', 'loading');

    try {
      const formData = new FormData();
      formData.append('audio', recordedAudioBlob, 'recording.webm');
      
      if (currentUserId) {
        formData.append('user_id', currentUserId);
      }

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      showStatus(elements.recordingStatus, '✅ Audio envoyé! Démarrage de la reconnaissance vocale...', 'success');
      
      if (data.user_id) {
        currentUserId = data.user_id;
      }
      
      // Start browser-based speech recognition with the recorded audio context
      if (recognition) {
        recognition.start();
      }
      
      setTimeout(() => hideStatus(elements.recordingStatus), 3000);
      
    } catch (err) {
      console.error('STT error:', err);
      showStatus(elements.recordingStatus, '⚠️ Erreur de transcription: ' + err.message, 'error');
    }
  }

  // Send Message Function (unchanged)
  async function sendMessage() {
    const text = elements.userText?.innerText.trim();
    
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
        elements.userText.innerHTML = placeholderText;
        elements.userText.classList.add('placeholder');
        elements.userText.dataset.isPlaceholder = 'true';
      }
      
      recordedAudioBlob = null;
      elements.userAudioSection?.classList.add('hidden');
      elements.useSTTBtn?.classList.add('hidden');
      
    } catch (err) {
      console.error('Send error:', err);
      if (elements.responseText) {
        elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ ${err.message}</div>`;
      }
    }
  }

  // === Event Listeners ===
  
  // GEÄNDERT: Record button starts real-time mode by default
  elements.recordBtn?.addEventListener('click', () => {
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    } else {
      // Option for users: hold Shift for traditional recording
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

  elements.useSTTBtn?.addEventListener('click', processSTT);
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
        elements.responseText.innerHTML = "🎯 Sujet libre sélectionné. Tapez votre message ou utilisez la reconnaissance vocale en temps réel!";
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

  // HINZUGEFÜGT: Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter or Cmd+Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
    
    // Space bar to toggle real-time speech (when not typing)
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      if (isRealTimeMode) {
        stopRealTimeSpeech();
      } else {
        startRealTimeSpeech();
      }
    }
  });

  // HINZUGEFÜGT: Editable text handling
  if (elements.userText) {
    elements.userText.addEventListener('focus', function() {
      if (this.dataset.isPlaceholder === 'true') {
        this.innerText = '';
        this.classList.remove('placeholder');
        this.dataset.isPlaceholder = 'false';
      }
    });

    elements.userText.addEventListener('blur', function() {
      if (!this.innerText.trim()) {
        this.innerHTML = placeholderText;
        this.classList.add('placeholder');
        this.dataset.isPlaceholder = 'true';
      }
    });

    elements.userText.addEventListener('paste', function(e) {
      e.preventDefault();
      const text = (e.originalEvent || e).clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      this.classList.remove('placeholder');
      this.dataset.isPlaceholder = 'false';
    });
  }

  // Initialize
  resetUI();
  
  // Check microphone support on load
  checkMicrophonePermissions().then(result => {
    if (result) {
      console.log('Microphone permissions OK');
    }
  });
  
  console.log('FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});