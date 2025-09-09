// KORRIGIERTES und VEREINHEITLICHTES script.js für Mobile Audio
document.addEventListener('DOMContentLoaded', function() {
  
  // === EINHEITLICHE ELEMENT-DEFINITIONEN ===
  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    sendBtn: document.getElementById('sendMessage'), // KORREKTUR: richtige ID verwenden
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
    // Chat-Elemente hinzufügen
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

  // === MOBILE-OPTIMIERTE TOUCH-EVENTS (IM SCOPE) ===
  function setupMobileTouchEvents() {
    // User-Aktivierung für Mobile-Browser registrieren
    document.addEventListener('touchstart', function() {
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
        showStatus(elements.recordingStatus, '📱 Tippen Sie um Mikrofonzugriff zu aktivieren', 'warning');
        
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

  function showManualPermissionInstructions() {
    const instructions = `
      <div style="padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 10px 0;">
        <h4 style="color: #e74c3c; margin: 0 0 10px;">📱 Mikrofonberechtigung erforderlich</h4>
        <p style="margin: 5px 0;">Für Chrome Android:</p>
        <ol style="margin: 5px 0; padding-left: 20px; font-size: 14px;">
          <li>Tippen Sie auf das 🔒 Symbol in der Adressleiste</li>
          <li>Aktivieren Sie "Mikrofon"</li>
          <li>Laden Sie die Seite neu</li>
        </ol>
        <p style="margin: 5px 0; font-size: 14px;">Oder: Einstellungen → Site-Einstellungen → Mikrofon → Diese Site zulassen</p>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px;">
          🔄 Seite neu laden
        </button>
      </div>
    `;
    
    if (elements.responseText) {
      elements.responseText.innerHTML = instructions;
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
      showStatus(elements.recordingStatus, '✅ Transcription prête, Envoyer', 'success');
    } else {
      showStatus(elements.recordingStatus, '⚠️ Aucune parole détectée', 'warning');
    }
  }

  function updateRecordButton() {
    if (!elements.recordBtn) return;

    if (isRecording && !isPaused) {
      elements.recordBtn.innerHTML = '⏸️ Pause';
      elements.recordBtn.classList.add('recording');
    } else if (isRecording && isPaused) {
      elements.recordBtn.innerHTML = '▶️ Reprendre';
      elements.recordBtn.classList.add('paused');
    } else {
      elements.recordBtn.innerHTML = '🎙️ Enregistrer';
      elements.recordBtn.classList.remove('recording', 'paused');
    }

    elements.stopBtn && elements.stopBtn.classList.toggle('hidden', !isRecording);
  }

  function resetRecordButton() {
    elements.recordBtn && (elements.recordBtn.innerHTML = '🎙️ Enregistrer');
    elements.recordBtn && elements.recordBtn.classList.remove('recording', 'paused');
    elements.stopBtn && elements.stopBtn.classList.add('hidden');
  }

  function cleanupAudioStream() {
    if (currentAudioStream) {
      currentAudioStream.getTracks().forEach(track => track.stop());
      currentAudioStream = null;
    }
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

  // === BACKEND COMMUNICATION (Simplified for space) ===
  async function sendMessageToBackend(message) {
    if (!message.trim()) {
      showStatus(elements.recordingStatus, 'Veuillez entrer un message.', 'warning');
      return;
    }
    
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      );
      updateChatHistoryUI();
      
      // Handle response display logic here
      console.log('Response received:', data);
      
    } catch (error) {
      console.error('Error sending message:', error);
      showStatus(elements.recordingStatus, 'Erreur de communication', 'error');
    }
  }

  // === EVENT LISTENERS ===
  function setupEventListeners() {
    // Record button
    elements.recordBtn && elements.recordBtn.addEventListener('click', () => {
      if (isRecording && !isPaused) {
        // Pause logic here
        isPaused = true;
        updateRecordButton();
      } else if (isRecording && isPaused) {
        // Resume logic here
        isPaused = false;
        updateRecordButton();
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

    // Chat toggle
    elements.chatToggle && elements.chatToggle.addEventListener('click', () => {
      elements.chatHistory && elements.chatHistory.classList.toggle('show');
      if (elements.chatToggle) {
        elements.chatToggle.textContent = elements.chatHistory.classList.contains('show') ? 
          '📜 Masquer' : '📜 Historique';
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        elements.sendBtn && elements.sendBtn.click();
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