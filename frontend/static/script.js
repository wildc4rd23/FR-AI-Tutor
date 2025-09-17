// CSP-KOMPATIBLES script.js ohne inline onclick Events
document.addEventListener('DOMContentLoaded', function() {
  
  // === EINHEITLICHE ELEMENT-DEFINITIONEN ===
  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    sendBtn: document.getElementById('sendMessage'),
    startBtn: document.getElementById('startConversation'),
    newConvBtn: document.getElementById('newConversation'),
    showResponseBtn: document.getElementById('showResponseBtn'),
    userText: document.getElementById('userText'),
    responseText: document.getElementById('responseText'),
    llmAudioPlayback: document.getElementById('audioPlayback'),
    userAudio: document.getElementById('userAudio'),
    startSection: document.getElementById('startSection'),
    conversationSection: document.getElementById('conversationSection'),
    scenarioSelect: document.getElementById('scenario'),
    recordingStatus: document.getElementById('recordingStatus'),
    chatToggle: document.getElementById('chatToggle'),
    chatHistory: document.getElementById('chatHistory'),
    chatMessages: document.getElementById('chatMessages')
  };

  // === GLOBALE VARIABLEN ===
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

  // === UI INITIALISIERUNG ===
  function initializeUI() {
    elements.stopBtn && elements.stopBtn.classList.add('hidden');
    elements.sendBtn && elements.sendBtn.classList.add('hidden');
    elements.userAudio && elements.userAudio.classList.add('hidden');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
    elements.responseText && elements.responseText.classList.add('hidden');
    elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
  }

  // === MOBILE-OPTIMIERTE TOUCH-EVENTS ===
  function setupMobileTouchEvents() {
    // User-Aktivierung für Mobile-Browser registrieren
    document.addEventListener('touchstart', function() {
      document.hasStoredGesture = true;
    }, { passive: true });

    ['recordBtn', 'sendBtn', 'stopBtn'].forEach(btnName => {
      elements[btnName] && elements[btnName].addEventListener('touchend', function(e) {
        e.preventDefault();
      });
    });
  }

  // === MOBILE-OPTIMIERTE BERECHTIGUNGSPRÜFUNG ===
  async function checkMicrophonePermissions() {
    try {
      console.log('Checking microphone permissions (mobile-optimized)...');
      
      // 1. HTTPS-Check
      if (location.protocol !== 'https:' && 
          !location.hostname.includes('localhost') && 
          location.hostname !== '127.0.0.1') {
        showStatus(elements.recordingStatus, '🔒 HTTPS requis pour l\'accès microphone.', 'error');
        return false;
      }

      // 2. Mobile-Erkennung
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      console.log('Mobile device detected:', isMobile);

      // 3. MediaDevices API Check
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showStatus(elements.recordingStatus, '🚫 MediaDevices API nicht verfügbar', 'error');
        return false;
      }

      // 4. SpeechRecognition API Check
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        showStatus(elements.recordingStatus, '🚫 Spracherkennung in diesem Browser nicht verfügbar', 'error');
        return false;
      }

      // 5. Permission State Check
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
        showStatus(elements.recordingStatus, '🎙️ Tippen Sie um Mikrofonzugriff zu aktivieren', 'warning');
        
        return new Promise((resolve) => {
          const interactionHandler = async () => {
            document.removeEventListener('touchstart', interactionHandler);
            document.removeEventListener('click', interactionHandler);
            console.log('User interaction detected, retrying permission...');
            resolve(await performActualPermissionTest());
          };
          
          document.addEventListener('touchstart', interactionHandler, { once: true });
          document.addEventListener('click', interactionHandler, { once: true });
          
          setTimeout(() => {
            document.removeEventListener('touchstart', interactionHandler);
            document.removeEventListener('click', interactionHandler);
            resolve(performActualPermissionTest());
          }, 5000);
        });
      }

      return await performActualPermissionTest();

    } catch (error) {
      console.error('Permission check failed:', error);
      showStatus(elements.recordingStatus, '⚠️ Fehler bei Berechtigungsprüfung: ' + error.message, 'error');
      return false;
    }
  }

  async function performActualPermissionTest() {
    try {
      console.log('Performing actual microphone permission test...');
      showStatus(elements.recordingStatus, '🎙️ Prüfe Mikrofonzugriff...', 'loading');

      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100, min: 8000 },
          channelCount: { ideal: 1 },
          volume: { ideal: 1.0 }
        }
      };

      const testStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      const audioTracks = testStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('Keine Audio-Spuren verfügbar');
      }

      const track = audioTracks[0];
      console.log('Audio track settings:', track.getSettings());
      console.log('Audio track capabilities:', track.getCapabilities());

      testStream.getTracks().forEach(track => track.stop());
      
      console.log('✅ Microphone access test successful');
      showStatus(elements.recordingStatus, '✅ Mikrofonzugriff erfolgreich', 'success');
      
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

  // CSP-KOMPATIBLE Version ohne inline onclick
  function showManualPermissionInstructions() {
    const instructionsContainer = document.createElement('div');
    instructionsContainer.style.cssText = 'padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 10px 0;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'color: #e74c3c; margin: 0 0 10px;';
    title.textContent = '🎙️ Mikrofonberechtigung erforderlich';
    
    const description = document.createElement('p');
    description.style.cssText = 'margin: 5px 0;';
    description.textContent = 'Für Chrome Android:';
    
    const list = document.createElement('ol');
    list.style.cssText = 'margin: 5px 0; padding-left: 20px; font-size: 14px;';
    
    const steps = [
      '🔒 Tippen Sie auf das Schloss Symbol in der Adressleiste',
      '🎙️ Aktivieren Sie "Mikrofon"',
      '🔄 Seite neu laden'
    ];
    
    steps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      list.appendChild(li);
    });
    
    const alternativeText = document.createElement('p');
    alternativeText.style.cssText = 'margin: 5px 0; font-size: 14px;';
    alternativeText.textContent = 'Oder: Einstellungen → Site-Einstellungen → Mikrofon → Diese Site zulassen';
    
    const reloadButton = document.createElement('button');
    reloadButton.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;';
    reloadButton.textContent = 'Seite neu laden';
    
    // CSP-KOMPATIBLE Event-Listener statt onclick
    reloadButton.addEventListener('click', () => {
      location.reload();
    });
    
    instructionsContainer.appendChild(title);
    instructionsContainer.appendChild(description);
    instructionsContainer.appendChild(list);
    instructionsContainer.appendChild(alternativeText);
    instructionsContainer.appendChild(reloadButton);
    
    if (elements.responseText) {
      elements.responseText.innerHTML = '';
      elements.responseText.appendChild(instructionsContainer);
      elements.responseText.classList.remove('hidden');
    }
  }

  // === MOBILE-OPTIMIERTE SPRACHERKENNUNG ===
  function initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API nicht verfügbar.');
      showStatus(elements.recordingStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur.', 'warning');
      return null;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    // Mobile-spezifische Optimierungen
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      console.log('Applying mobile-specific speech recognition settings');
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

    return recognition;
  }

  // === UTILITY FUNCTIONS ===
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
    isTextCurrentlyVisible = false;
  }

  function showResponseText() {
    if (currentResponse && elements.responseText) {
      elements.responseText.innerHTML = currentResponse;
      elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = true;
      updateShowResponseButton();
      console.log('LLM Text angezeigt');
    }
  }

  function setResponseSafely(responseText) {
    currentResponse = responseText;
    console.log('Antwort gesetzt, warte auf Audio-Wiedergabe');
    
    if (elements.responseText) {
      elements.responseText.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #3498db;">
          Audio prêt - Cliquez pour écouter
        </div>
      `;
      elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = false;
    }
    updateShowResponseButton();
  }

  function hideResponseText() {
    elements.responseText && elements.responseText.classList.add('hidden');
    isTextCurrentlyVisible = false;
    updateShowResponseButton();
  }

  function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    if (currentResponse) {
      if (isLlmAudioPlaying) {
        elements.showResponseBtn.classList.add('hidden');
      } else {
        elements.showResponseBtn.classList.remove('hidden');
        elements.showResponseBtn.style.opacity = '1';
        elements.showResponseBtn.style.cursor = 'pointer';

        if (isTextCurrentlyVisible) {
          elements.showResponseBtn.innerHTML = 'Masquer la réponse';
        } else if (audioHasBeenPlayed) {
          elements.showResponseBtn.innerHTML = 'Afficher la réponse';
        } else {
          elements.showResponseBtn.innerHTML = 'Écoutez d\'abord l\'audio';
          elements.showResponseBtn.style.opacity = '0.6';
          elements.showResponseBtn.style.cursor = 'not-allowed';
        }
      }
    } else {
      elements.showResponseBtn.classList.add('hidden');
    }
  }

  // === AUDIO RECORDING FUNCTIONS ===
  async function startRealTimeSpeech() {
    console.log('Starting real-time speech with recording...');
    
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk || !recognition) {
        showStatus(elements.recordingStatus, '⚠️ Microphone ou reconnaissance vocale non disponibles', 'error');
        return;
      }

      isRecording = true;
      isPaused = false;
      
      finalTranscript = '';
      recordedAudioBlob = null;
      audioChunks = [];
      
      if (elements.userText) {
        elements.userText.textContent = '';
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }
      
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
      
      const audioTracks = currentAudioStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }
      
      console.log('Audio track settings:', audioTracks[0].getSettings());
      
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
      
      mediaRecorder = new MediaRecorder(currentAudioStream, options);

      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('MediaRecorder stopped, processing audio...');
        
        if (audioChunks.length > 0) {
          const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
          
          if (totalSize > 0) {
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            recordedAudioBlob = new Blob(audioChunks, {type: mimeType});
            console.log('Created audio blob:', recordedAudioBlob.size, 'bytes');
            
            if (elements.userAudio) {
              elements.userAudio.src = URL.createObjectURL(recordedAudioBlob);
              elements.userAudio.classList.remove('hidden');
            }
          }
        }
      };

      mediaRecorder.start(250);
      startRecognition();
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

  function pauseRealTimeSpeech() {
    console.log('Pausing real-time speech...');
    
    isPaused = true;
    isRecognitionRestarting = true;
    
    if (recognition && recognitionActive) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    recognitionActive = false;
    updateRecordButton();
    showStatus(elements.recordingStatus, 'Enregistrement en pause', 'loading');
  }

  function resumeRealTimeSpeech() {
    console.log('Resuming real-time speech...');
    
    isPaused = false;
    isRecognitionRestarting = false;
    
    if (isRecording && recognition) {
      startRecognition();
    }
    
    updateRecordButton();
    showStatus(elements.recordingStatus, 'Enregistrement repris', 'success');
  }

  function startRecognition() {
    if (isRecognitionRestarting || isPaused || !recognition) {
      return;
    }

    if (recognitionActive) {
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
      isRecognitionRestarting = false;
      recognition.start();
    } catch (e) {
      console.error('Could not start recognition:', e);
      recognitionActive = false;
      isRecognitionRestarting = false;
      showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
    }
  }

  function stopRealTimeSpeech() {
    console.log('Stopping real-time speech...');
    
    isRecording = false;
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
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.error('Error stopping MediaRecorder:', e);
      }
    }

    cleanupAudioStream();
    resetRecordButton();

    if (elements.userText) {
      const finalContent = finalTranscript.trim();
      elements.userText.textContent = finalContent;

      if (finalContent) {
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      } else {
        elements.userText.textContent = placeholderText;
        elements.userText.classList.add('placeholder');
        elements.userText.dataset.isPlaceholder = 'true';
      }
    }

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
    elements.stopBtn && elements.stopBtn.classList.toggle('hidden', !isRecording);
  }

  function resetRecordButton() {
    elements.recordBtn && (elements.recordBtn.innerHTML = '🎙️ Enregistrer');
    elements.recordBtn && elements.recordBtn.classList.remove('recording', 'paused');
    elements.recordBtn && (elements.recordBtn.disabled = false);
    elements.stopBtn && elements.stopBtn.classList.add('hidden');
  }

  function cleanupAudioStream() {
    if (currentAudioStream) {
      currentAudioStream.getTracks().forEach(track => track.stop());
      currentAudioStream = null;
    }
  }

  function resetUI() {
    console.log('Resetting UI...');
    
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
    
    if (elements.llmAudioPlayback) {
      if (!elements.llmAudioPlayback.paused) {
        elements.llmAudioPlayback.pause();
      }
      
      elements.llmAudioPlayback.oncanplaythrough = null;
      elements.llmAudioPlayback.onerror = null;
      elements.llmAudioPlayback.onended = null;
      elements.llmAudioPlayback.onloadstart = null;
      elements.llmAudioPlayback.onplay = null;
      elements.llmAudioPlayback.onpause = null;
      elements.llmAudioPlayback.onloadeddata = null;
      elements.llmAudioPlayback.onloadedmetadata = null;
      
      elements.llmAudioPlayback.src = '';
      elements.llmAudioPlayback.removeAttribute('src');
      elements.llmAudioPlayback.load();
      elements.llmAudioPlayback.classList.add('hidden');
      
      console.log('Audio element completely reset');
    }

    elements.userAudio && (elements.userAudio.src = '');
    elements.userAudio && elements.userAudio.classList.add('hidden');
    elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
    
    updateRecordButton();
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = '';
    audioChunks = [];
    conversationHistory = [];
    updateChatHistoryUI();
    hideStatus(elements.recordingStatus);
  }

  // === CHAT HISTORY FUNCTIONS ===
  function updateChatHistoryUI() {
    if (!elements.chatMessages) return;
    
    elements.chatMessages.innerHTML = '';
    
    conversationHistory.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${msg.role}`;
      
      const preview = msg.content.length > 80 ? 
        msg.content.substring(0, 80) + '...' : 
        msg.content;
        
      messageDiv.innerHTML = `
        <strong>${msg.role === 'user' ? '👤 Vous' : '👨‍🏫 Assistant'}:</strong> 
        ${preview}
      `;
      
      elements.chatMessages.appendChild(messageDiv);
    });
    
    if (elements.chatHistory) {
      elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    }
  }

  // === BACKEND COMMUNICATION ===
  async function extractErrorMessage(response) {
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      return parsed.error || parsed.response || text;
    } catch (e) {
      return "Erreur inconnue du serveur.";
    }
  }

  async function sendMessageToBackend(message) {
    console.log('Sending message:', message);
    
    if (!message.trim()) {
      showStatus(elements.recordingStatus, 'Veuillez entrer un message.', 'warning');
      return;
    }
    
    showProgressStatus(1, 'Message en cours d\'envoi...');
    elements.sendBtn && (elements.sendBtn.disabled = true);
    elements.recordBtn && (elements.recordBtn.disabled = true);
    elements.stopBtn && (elements.stopBtn.disabled = true);

    elements.responseText && elements.responseText.classList.add('hidden');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
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
      console.log('Response received:', data);

      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      );
      updateChatHistoryUI();
      setResponseSafely(data.response);

      if (data.audio_url) {
        await playLlmAudio(data.audio_url);
      } else {
        console.warn('No audio URL received for chat response');
        elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
        currentResponse = data.response;
        audioHasBeenPlayed = true;
        isTextCurrentlyVisible = false;
        elements.responseText && elements.responseText.classList.add('hidden');
        updateShowResponseButton();
        showProgressStatus(4, 'Audio non disponible. Texte affichable');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showStatus(elements.recordingStatus, 'Fehler beim Senden des Chats.', 'error');
      currentResponse = 'Désolé, une erreur est survenue et je ne peux pas répondre pour le moment.';
      elements.responseText && (elements.responseText.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #e74c3c;">
          Erreur de communication: ${error.message}
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

  // CSP-KOMPATIBLE Audio-Retry-Funktionen
  function showAudioRetryOptions() {
    const retryContainer = document.createElement('div');
    retryContainer.style.cssText = 'text-align: center; margin-top: 15px;';
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'margin-bottom: 15px; color: #e74c3c;';
    errorDiv.textContent = 'Audio manquant';
    
    const retryButton = document.createElement('button');
    retryButton.style.cssText = 'margin-right: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;';
    retryButton.textContent = 'Réessayer l\'audio';
    retryButton.addEventListener('click', retryAudio);
    
    const continueButton = document.createElement('button');
    continueButton.style.cssText = 'padding: 8px 16px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer;';
    continueButton.textContent = 'Voir texte sans audio';
    continueButton.addEventListener('click', continueWithoutAudio);
    
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

  function retryAudio() {
    console.log('Manueller Audio-Retry gestartet');
    showProgressStatus(3, 'Nouvel essai...');
    const lastUserMessage = conversationHistory.findLast(msg => msg.role === 'user');
    if (lastUserMessage) {
      sendMessageToBackend(lastUserMessage.content);
    } else {
      console.error('Keine letzte Benutzernachricht für Retry gefunden.');
      showStatus(elements.recordingStatus, 'Erreur: Impossible de réessayer l\'audio sans message précédent.', 'error');
    }
  }

  function continueWithoutAudio() {
    console.log('Benutzer wählt: ohne Audio fortfahren');
    audioHasBeenPlayed = true;
    showResponseText();
    showProgressStatus(4, 'Texte affiché sans audio.');
  }

  async function playLlmAudio(audio_url) {
    console.log('Playing LLM audio:', audio_url);
    
    if (!audio_url || audio_url.trim() === '') {
      console.error('Invalid audio URL provided to playLlmAudio');
      audioHasBeenPlayed = false;
      isLlmAudioPlaying = false;
      updateShowResponseButton();
      return Promise.resolve();
    }
    
    if (!elements.llmAudioPlayback) {
      console.error('Audio playback element not found');
      audioHasBeenPlayed = false;
      isLlmAudioPlaying = false;
      updateShowResponseButton();
      return Promise.resolve();
    }
    
    return new Promise((resolve) => {
      const audioElement = elements.llmAudioPlayback;
      let resolved = false;
      
      // Clear all event listeners
      audioElement.oncanplaythrough = null;
      audioElement.onerror = null;
      audioElement.onended = null;
      audioElement.onloadstart = null;
      audioElement.onplay = null;
      audioElement.onpause = null;
      audioElement.onloadeddata = null;
      audioElement.onloadedmetadata = null;
      
      function resolveOnce() {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }
      
      audioElement.oncanplaythrough = () => {
        console.log('Audio can play through, attempting to play');
        
        audioElement.play()
          .then(() => {
            console.log('Audio playback started successfully');
            isLlmAudioPlaying = true;
            updateShowResponseButton();
            showProgressStatus(4, 'Écoute en cours...');
          })
          .catch(playError => {
            console.error('Play prevented by browser:', playError.name, playError.message);
            audioHasBeenPlayed = false;
            isLlmAudioPlaying = false;
            showProgressStatus(4, 'Cliquez sur le bouton play pour écouter l\'audio');
            
            audioElement.classList.remove('hidden');
            elements.responseText && elements.responseText.classList.add('hidden');
            isTextCurrentlyVisible = false;
            updateShowResponseButton();
            
            resolveOnce();
          });
      };

      audioElement.onended = () => {
        console.log('LLM Audio ended successfully');
        audioHasBeenPlayed = true;
        isLlmAudioPlaying = false;
        showProgressStatus(4, 'Audio terminé - Texte disponible!');
        updateShowResponseButton();
        resolveOnce();
      };
      
      audioElement.onplay = () => {
        console.log('Audio play event triggered');
        isLlmAudioPlaying = true;
        updateShowResponseButton();
        showProgressStatus(4, 'Écoute en cours...');
      };
      
      audioElement.onpause = () => {
        console.log('Audio paused');
        isLlmAudioPlaying = false;
        updateShowResponseButton();
      };

      audioElement.onerror = (e) => {
        console.error('Error loading/playing LLM audio');
        
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
        showProgressStatus(4, 'Erreur audio - Texte disponible maintenant');
        
        audioHasBeenPlayed = true;
        updateShowResponseButton();
        
        resolveOnce();
      };
      
      audioElement.preload = 'auto';
      audioElement.volume = 1.0;
      
      elements.responseText && elements.responseText.classList.add('hidden');
      isTextCurrentlyVisible = false;
      audioElement.classList.remove('hidden');
      
      console.log('Setting audio src and loading:', audio_url);
      audioElement.src = audio_url;
      audioElement.load();
      
      setTimeout(() => {
        if (!resolved) {
          console.warn('Audio loading timeout (15s) - making text available');
          audioHasBeenPlayed = true;
          isLlmAudioPlaying = false;
          showProgressStatus(4, 'Timeout - Texte maintenant disponible');
          updateShowResponseButton();
          resolveOnce();
        }
      }, 15000);
    });
  }

  // === EVENT LISTENERS ===
  function setupEventListeners() {
    // Record button
    elements.recordBtn && elements.recordBtn.addEventListener('click', () => {
      if (isRecording && !isPaused) {
        pauseRealTimeSpeech();
      } else if (isRecording && isPaused) {
        resumeRealTimeSpeech();
      } else {
        startRealTimeSpeech();
      }
    });

    // Stop button
    elements.stopBtn && elements.stopBtn.addEventListener('click', () => {
      stopRealTimeSpeech();
    });

    // Send button
    elements.sendBtn && elements.sendBtn.addEventListener('click', () => {
      let messageToSend = '';
      
      if (elements.userText && 
          elements.userText.textContent && 
          elements.userText.textContent.trim() && 
          elements.userText.dataset.isPlaceholder !== 'true' && 
          elements.userText.textContent !== placeholderText) {
        messageToSend = elements.userText.textContent.trim();
      } else if (finalTranscript.trim()) {
        messageToSend = finalTranscript.trim();
      }
      
      if (messageToSend) {
        sendMessageToBackend(messageToSend);
      } else {
        showStatus(elements.recordingStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
      }
    });

    // Show response button
    elements.showResponseBtn && elements.showResponseBtn.addEventListener('click', () => {
      if (currentResponse) {
        if (isTextCurrentlyVisible) {
          hideResponseText();
        } else {
          if (audioHasBeenPlayed || !elements.llmAudioPlayback || !elements.llmAudioPlayback.src) {
            showResponseText();
          } else {
            showStatus(elements.recordingStatus, 'Veuillez d\'abord écouter l\'audio', 'error');
            setTimeout(() => hideStatus(elements.recordingStatus), 3000);
          }
        }
      }
    });

    // New conversation button
    elements.newConvBtn && elements.newConvBtn.addEventListener('click', () => {
      resetUI();
    });

    // Start conversation button
    elements.startBtn && elements.startBtn.addEventListener('click', async () => {
      console.log('Starting conversation...');

      const scenario = elements.scenarioSelect && elements.scenarioSelect.value;
      const forceReset = currentUserId === null || scenario !== currentScenario;
      currentScenario = scenario;
      
      if (!scenario) {
        showStatus(elements.recordingStatus, "Veuillez choisir un thème.", 'error');
        return;
      }

      elements.startSection && elements.startSection.classList.add('hidden');
      elements.conversationSection && elements.conversationSection.classList.remove('hidden');
      
      if (!currentUserId) {
        currentUserId = Date.now().toString();
        console.log('Temporäre User ID für Start generiert:', currentUserId);
      }
      
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
        showProgressStatus(1, 'Préparation de la conversation...');
        
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
          console.log('Conversation started successfully:', data);

          currentUserId = data.userId;
          conversationHistory = [{ role: 'assistant', content: data.response }];
          updateChatHistoryUI();
          setResponseSafely(data.response);
          showProgressStatus(2, 'Conversation préparée...');

          if (data.audio_url) { 
            console.log('Audio URL erhalten:', data.audio_url);
            await playLlmAudio(data.audio_url);
          } else {
            console.warn('No audio URL received for initial response.');
            elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
            currentResponse = data.response;
            audioHasBeenPlayed = true;
            isTextCurrentlyVisible = false;
            elements.responseText && elements.responseText.classList.add('hidden');
            updateShowResponseButton();
            showProgressStatus(4, 'Audio non disponible. Texte affichable via bouton.');
          }
        } catch (err) {
          console.error('Error starting conversation:', err);
          showStatus(elements.recordingStatus, `Erreur: ${err.message}`, 'error');
          elements.startSection && elements.startSection.classList.remove('hidden');
          elements.conversationSection && elements.conversationSection.classList.add('hidden');
        } finally {
          hideStatus(elements.recordingStatus);
        }
      } else {
        currentResponse = "Conversation libre - parlez de ce qui vous intéresse!";
        audioHasBeenPlayed = true;
        showResponseText();
        hideStatus(elements.recordingStatus);
      }
    });

    // Chat toggle
    elements.chatToggle && elements.chatToggle.addEventListener('click', () => {
      elements.chatHistory && elements.chatHistory.classList.toggle('show');
      if (elements.chatToggle) {
        elements.chatToggle.textContent = elements.chatHistory.classList.contains('show') ? 
          '📜 Masquer' : '📜 Historique';
      }
    });

    // Scenario select
    elements.scenarioSelect && elements.scenarioSelect.addEventListener('change', (event) => {
      currentScenario = event.target.value;
      console.log('Scenario changed to:', currentScenario);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        elements.sendBtn && elements.sendBtn.click();
      }
      
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
  }

  // === INITIALISIERUNG ===
  function initialize() {
    console.log('🚀 FR-AI-Tutor Frontend initializing...');
    
    initializeUI();
    setupMobileTouchEvents();
    
    recognition = initializeSpeechRecognition();
    
    setupEventListeners();
    
    // Set initial user text
    if (elements.userText) {
      elements.userText.textContent = placeholderText;
      elements.userText.classList.add('placeholder');
      elements.userText.setAttribute('data-is-placeholder', 'true');
    }
    
    console.log('✅ FR-AI-Tutor Frontend initialized with Mobile Audio Support');
  }

  // Start initialization
  initialize();
  
});