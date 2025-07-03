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
  let currentAudioStream = null;
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = false;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = '';
  let isRecognitionRestarting = false;
  let userId = 'user_' + Date.now(); // Generate unique user ID
  let currentScenario = 'libre'; // Default scenario

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung mit stabilerer Real-Time Implementation ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      console.log('Speech recognition result received, results count:', event.results.length);
      console.log('Current isRealTimeMode:', isRealTimeMode);
      console.log('Current finalTranscript before processing:', finalTranscript);
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
      if (elements.userText) {
        elements.userText.textContent = displayText;
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
        
        if (document.activeElement === elements.userText) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(elements.userText);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }

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
          if (isRealTimeMode) {
            console.log('No speech detected in real-time mode, will restart...');
            shouldRestart = true;
            errorMessage = null; // Keine Fehlermeldung anzeigen
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
        console.log('Auto-restarting recognition in real-time mode');
        setTimeout(() => {
          if (isRealTimeMode && !isRecognitionRestarting && !recognitionActive) {
            startRecognition();
          }
        }, 500); // Längere Pause zwischen Restarts
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
    if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
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

  async function startRealTimeSpeech() {
    console.log('Starting real-time speech with audio recording...');
    
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

      audioChunks = [];
      recordedAudioBlob = null;
      
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 },
          channelCount: { ideal: 1 }
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
      }
      
      mediaRecorder = new MediaRecorder(currentAudioStream, options);
      
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        if (audioChunks.length > 0) {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          recordedAudioBlob = new Blob(audioChunks, { type: mimeType });
          
          const audioURL = URL.createObjectURL(recordedAudioBlob);
          if (elements.userAudio) {
            elements.userAudio.src = audioURL;
            elements.userAudioSection?.classList.remove('hidden');
          }
          
          console.log('Audio recording completed, blob size:', recordedAudioBlob.size);
        }
      };
      
      mediaRecorder.start(250);
      console.log('Audio recording started');

      finalTranscript = '';
      isRealTimeMode = true;
      isRecognitionRestarting = false;
      
      if (elements.userText) {
        elements.userText.textContent = '';
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }
      
      showStatus(elements.recordingStatus, '🎤 Enregistrement + reconnaissance actifs. Parlez maintenant!', 'success');
      
      
      if (elements.recordBtn) {
        elements.recordBtn.innerHTML = '🔴 Enregistrement + reconnaissance...';
        elements.recordBtn.disabled = true;
        elements.recordBtn.classList.add('recording');
      }

      // Recognition erst nach UI-Update starten
      setTimeout(() => {
        startRecognition();
      }, 100);
      
      if (elements.stopBtn) {
        elements.stopBtn.classList.remove('hidden');
        elements.stopBtn.innerHTML = '⏹️ Arrêter';
      }
      
    } catch (err) {
      console.error('Real-time speech + recording error:', err);
      showStatus(elements.recordingStatus, '⚠️ Fehler bei Aufnahme/Erkennung: ' + err.message, 'error');
      isRealTimeMode = false;
      resetRecordButton();
      cleanupAudioStream();
    }
  }

  function stopRealTimeSpeech() {
    console.log('Stopping real-time speech + recording...');
    
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
    if (recognitionTimeout) {
      clearTimeout(recognitionTimeout);
    }
    
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      console.log('Audio recording stopped');
    }
    
    cleanupAudioStream();
    resetRecordButton();
    
    showStatus(elements.recordingStatus, '✅ Aufnahme + Erkennung gestoppt', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 2000);
  }

  function cleanupAudioStream() {
    if (currentAudioStream) {
      currentAudioStream.getTracks().forEach(track => track.stop());
      currentAudioStream = null;
    }
  }

  // Traditional recording functions (with Shift+Click)
  async function startRecording() {
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) return;

      audioChunks = [];
      recordedAudioBlob = null;
      
      const constraints = { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };
      
      currentAudioStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      let options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      }
      
      mediaRecorder = new MediaRecorder(currentAudioStream, options);
      
      mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
        mediaRecorder.onstop = () => {
          if (audioChunks.length > 0) {
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            recordedAudioBlob = new Blob(audioChunks, { type: mimeType });
            
            const audioURL = URL.createObjectURL(recordedAudioBlob);
            if (elements.userAudio) {
              elements.userAudio.src = audioURL;
              elements.userAudioSection?.classList.remove('hidden');
            }
            
            console.log('Audio recording completed, blob size:', recordedAudioBlob.size);
            
            // Wenn Real-Time-Modus, zeige die finale Transkription an
            if (isRealTimeMode && finalTranscript.trim()) {
              console.log('Final transcript in real-time mode:', finalTranscript);
            }
          }
        };
      
      mediaRecorder.start();
      
      if (elements.recordBtn) {
        elements.recordBtn.innerHTML = '🔴 Aufnahme läuft...';
        elements.recordBtn.disabled = true;
        elements.recordBtn.classList.add('recording');
      }
      
      if (elements.stopBtn) {
        elements.stopBtn.classList.remove('hidden');
        elements.stopBtn.innerHTML = '⏹️ Stoppen';
      }
      
      showStatus(elements.recordingStatus, '🎤 Aufnahme läuft...', 'success');
      
    } catch (err) {
      console.error('Recording error:', err);
      showStatus(elements.recordingStatus, '⚠️ Aufnahme-Fehler: ' + err.message, 'error');
      resetRecordButton();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
    
    cleanupAudioStream();
    resetRecordButton();
    
    showStatus(elements.recordingStatus, '✅ Aufnahme gestoppt', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 2000);
  }

  // === VERBESSERTE sendMessage Funktion ===
  async function sendMessage() {
    let text = '';
    
    if (elements.userText) {
      text = elements.userText.textContent?.trim() || '';
    }
    
    if (!text || text === placeholderText) {
      showStatus(elements.globalStatus, '⚠️ Veuillez entrer un message', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    if (isRealTimeMode) {
      stopRealTimeSpeech();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!recordedAudioBlob) {
      console.error('Kein aufgenommenes Audio verfügbar');
      showStatus(elements.globalStatus, '⚠️ Kein Audio aufgenommen', 'error');
      return;
    }

    console.log('Sending message with audio:', text);
    
    try {
      showStatus(elements.globalStatus, '💾 Audio wird gespeichert...', 'loading');
      
      const formData = new FormData();
      formData.append('audio', recordedAudioBlob, 'recording.webm');
      formData.append('user_id', userId);
      
      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!transcribeResponse.ok) {
        throw new Error(`Transcribe error! status: ${transcribeResponse.status}`);
      }
      
      const transcribeData = await transcribeResponse.json();
      console.log('Audio saved:', transcribeData);

      showStatus(elements.globalStatus, '💭 Nachricht wird verarbeitet...', 'loading');
      
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          userId: userId,
          scenario: currentScenario
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.response) {
        currentResponse = data.response;
        
        // Update UI elements
        setupEditableText();
        
        if (data.audio_url) {
          const audio = new Audio(data.audio_url);
          audio.play().catch(e => console.error('Error playing audio:', e));
        }
        
        try {
          await deleteRecordedAudio();
        } catch (deleteError) {
          console.warn('Could not delete audio file:', deleteError);
        }
        
        if (elements.userText) {
          elements.userText.textContent = placeholderText;
          elements.userText.classList.add('placeholder');
          elements.userText.dataset.isPlaceholder = 'true';
        }
        
        if (elements.userAudioSection) {
          elements.userAudioSection.classList.add('hidden');
        }
        
        recordedAudioBlob = null;
        
        showStatus(elements.globalStatus, '✅ Nachricht erfolgreich gesendet', 'success');
        setTimeout(() => hideStatus(elements.globalStatus), 2000);
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      showStatus(elements.globalStatus, '⚠️ Fehler beim Senden: ' + error.message, 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 5000);
    }
  }

  function setupEditableText() {
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

      elements.userText.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }
  }

  async function deleteRecordedAudio() {
    if (!userId) return;
    
    try {
      const response = await fetch('/api/delete-audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: userId
        })
      });
      
      if (response.ok) {
        console.log('Audio file deleted successfully');
      } else {
        console.warn('Could not delete audio file');
      }
    } catch (error) {
      console.error('Error deleting audio file:', error);
    }
  }

  // Use STT button functionality
  elements.useSTTBtn?.addEventListener('click', async () => {
    if (!recordedAudioBlob) {
      showStatus(elements.globalStatus, '⚠️ Aucun audio enregistré', 'error');
      return;
    }

    try {
      showStatus(elements.globalStatus, '🔄 Transcription en cours...', 'loading');
      
      const formData = new FormData();
      formData.append('audio', recordedAudioBlob, 'recording.webm');
      formData.append('user_id', userId);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.transcription && elements.userText) {
        elements.userText.textContent = data.transcription;
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
        showStatus(elements.globalStatus, '✅ Transcription terminée', 'success');
        setTimeout(() => hideStatus(elements.globalStatus), 2000);
      } else {
        throw new Error('Aucune transcription reçue');
      }
      
    } catch (error) {
      console.error('Transcription error:', error);
      showStatus(elements.globalStatus, '⚠️ Erreur de transcription: ' + error.message, 'error');
    }
  });

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

 
  
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});