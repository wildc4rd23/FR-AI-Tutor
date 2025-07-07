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
    audioPlayback: document.getElementById('audioPlayback'),
    userAudio: document.getElementById('userAudio'),
    //userAudioSection: document.getElementById('userAudioSection'),

    startSection: document.getElementById('startSection'),
    conversationSection: document.getElementById('conversationSection'),
    scenarioSelect: document.getElementById('scenario'),
    recordingStatus: document.getElementById('recordingStatus'),
    audioStatus: document.getElementById('audioStatus')
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
  let isRealTimeMode = true;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = '';
  let isRecognitionRestarting = false;
  let userId = Date.now().toString();
  let currentScenario = 'libre';
  let autoSendAfterRecording = false; // Konfig automatisches Senden der UserAufnahme
  let isRecording = false; // Status-Tracker
  let isPaused = false; // Neuer Status für Pause
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
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }

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
        showStatus(elements.recordingStatus, errorMessage, 'error');
      }
      
      if (shouldRestart && !isRecognitionRestarting && isRecording && !isPaused) {
            setTimeout(() => {
              if (!isRecognitionRestarting && isRecording && !isPaused) {
                startRecognition();
              }
            }, 1000);
          }
        };

        recognition.onend = () => {
          console.log('Speech recognition ended');
          recognitionActive = false;
          if (!isRecognitionRestarting && isRecording && !isPaused) {
            setTimeout(() => {
              if (!isRecognitionRestarting && !recognitionActive && isRecording && !isPaused) {
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
        }, 200); // HIER GEÄNDERT
        
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
      if (!elements.recordBtn) return;
      
      elements.recordBtn.innerHTML = '🎙️ Enregistrer';
      elements.recordBtn.classList.remove('recording', 'paused');
      elements.recordBtn.disabled = false;
      
      if (elements.stopBtn) {
        elements.stopBtn.classList.add('hidden');
      }
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
            showStatus(elements.recordingStatus, '🚫 Accès microphone refusé. Activez-le dans les paramètres du navigateur.', 'error');
            return false;
          }
        } catch (permError) {
          console.warn('Permission query failed:', permError);
        }
      }

      if (location.protocol !== 'https:' && !location.hostname.includes('localhost') && location.hostname !== '127.0.0.1') {
        showStatus(elements.recordingStatus, '🔒 HTTPS requis pour l\'accès microphone.', 'error');
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
        
        showStatus(elements.recordingStatus, errorMsg, 'error');
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
    showProgressStatus(4, '✅ Texte masqué. Cliquez pour afficher.');
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
      elements.userAudio.classList.add('hidden');
    }
    
    //elements.userAudioSection?.classList.add('hidden');
    elements.showResponseBtn?.classList.add('hidden');
    
    updateRecordButton();
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = '';
    audioChunks = []; // Reset audio chunks
    conversationHistory = []; // NEU: Konversationshistorie zurücksetzen

    hideStatus(elements.recordingStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);
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

    if (elements.stopBtn) {
      if (isRecording) {
        elements.stopBtn.classList.remove('hidden');
      } else {
        elements.stopBtn.classList.add('hidden');
      }
    }
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
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
        .catch(() => resolve(false));
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

  async function sendMessageToBackend(message) {
    console.log('=== MESSAGE SENDING DEBUG ===');
    console.log('Ursprünglicher Parameter:', message);
    console.log('Aktueller userText Inhalt:', elements.userText?.textContent);
    console.log('Aktueller finalTranscript:', finalTranscript);
    console.log('userText isPlaceholder:', elements.userText?.dataset.isPlaceholder);
 
    if (!message.trim()) {
      showStatus(elements.recordingStatus, 'Veuillez entrer un message.', 'warning');
      return;
    }
    console.log('TATSÄCHLICH GESENDETER TEXT:', message.trim());
    console.log('=== END DEBUG ===');
    
    showProgressStatus(1, '🚀 Message en cours d\'envoi...');
    elements.sendBtn.disabled = true;
    elements.recordBtn.disabled = true;

    try {

     // NEU: Füge Benutzernachricht zur Historie hinzu
      conversationHistory.push({ role: 'user', content: message });

console.log('=== SENDING TO BACKEND ===');
console.log('📤 User message:', message);
console.log('🧠 Aktuelle conversationHistory:');
console.table(conversationHistory);  // Gut lesbar als Tabelle
console.log('📌 User ID:', userId);
console.log('🎯 Scenario:', currentScenario);


      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: message,
          userId: userId, 
          scenario: currentScenario,
          history: conversationHistory // NEU: Sende die Historie an das Backend
        }),
      });

      if (!response.ok) {
        const errorText = await extractErrorMessage(response);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Backend response:', data);
      currentResponse = data.response;
      
      // Füge LLM-Antwort zur Historie hinzu
      conversationHistory.push({ role: 'assistant', content: data.response });
        showResponseText();

      if (data.audio_url) {
        elements.audioPlayback.src = data.audio_url;
        elements.audioPlayback.classList.remove('hidden');
        audioHasBeenPlayed = false;
        updateShowResponseButton();
        showProgressStatus(4, '🔊 Texte et audio prêts - 100% terminé!');  
      } else {
        // Kein Audio vorhanden - Retry-Mechanismus
        console.error('Keine Audio-URL vom Backend erhalten - starte Retry in 2 Sek');
        showProgressStatus(3, '⚠️ Audio manquant - Nouvelle tentative');
        
        // Automatischer Retry nach 2 Sekunden
        setTimeout(async () => {
            try {
                console.log('Starte Audio-Retry-Anfrage...');
                const retryResponse = await fetch('/api/respond', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        message: message,
                        userId: userId, 
                        scenario: currentScenario,
                        history: conversationHistory, // NEU: Historie auch bei Retry senden
                        retry_audio: true
                    }),
                });


                if (!retryRes.ok) {
                    const retryErrorText = await extractErrorMessage(retryRes);
                    throw new Error(`Retry fehlgeschlagen: ${retryErrorText}`);
                }
                const retryData = await retryRes.json();
                console.log('🔁 Audio-Retry-Response:', retryData);

                if (retryData.audio_url) {
                    console.log('Audio-Retry erfolgreich:', retryData.audio_url);
                    elements.audioPlayback.src = retryData.audio_url;
                    elements.audioPlayback.classList.remove('hidden');
                    audioHasBeenPlayed = false;
                    updateShowResponseButton();
                    showProgressStatus(4, '🔊 Texte et audio prêts - 100% terminé!');
                } else {
                    throw new Error('Retry fehlgeschlagen');
                }
            } catch (retryError) {
                console.error('Audio-Retry fehlgeschlagen:', retryError.message);
                showAudioRetryOptions();
            }
        }, 2000);
      }

      showStatus(elements.recordingStatus, '✅ Réponse reçue', 'success');

    } catch (error) {
      console.error('Error sending message to backend:', error);
      showStatus(elements.recordingStatus, `❌ Erreur: ${error.message}`, 'error');
      elements.responseText.textContent = 'Erreur de communication du serveur';
      isTextCurrentlyVisible = true;
      updateShowResponseButton();
    } finally {
      elements.sendBtn.disabled = false;
      elements.recordBtn.disabled = false;
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
    formData.append('user_id', userId);
    
    console.log(`Uploading audio blob: ${audioBlob.size} bytes, type: ${mimeType}, filename: ${fileName}`);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
        if (elements.responseText) {
            elements.responseText.innerHTML = `
                <div style="text-align: center; margin-top: 15px;">
                    <div style="margin-bottom: 15px; color: #e74c3c;">⚠️ Audio manquant </div>
                    <button onclick="retryAudio()" style="margin-right: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        🔄 Réessayer
                    </button>
                    <button onclick="continueWithoutAudio()" style="padding: 8px 16px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        ➡️ Continuer sans audio
                    </button>
                </div>
            `;
        }
    }

    function retryAudio() {
        console.log('Manueller Audio-Retry gestartet');
        showProgressStatus(3, '🔄 Nouvel essai...');
        // Nutzt die bestehende sendMessageToBackend Funktion
        sendMessageToBackend(elements.userText.textContent || finalTranscript);
    }

    function continueWithoutAudio() {
        console.log('Benutzer wählt: ohne Audio fortfahren');
        showResponseText(); // Nutzt bestehende Funktion
        showProgressStatus(4, '✅ Texte prêt - 100% terminé!');
    } 

  // === Event Listeners ===
  elements.startBtn?.addEventListener('click', async () => {
        console.log('Start Conversation button clicked.');

    const scenario = elements.scenarioSelect?.value;

    if (!scenario) {
      showStatus(elements.recordingStatus, "⚠️ Veuillez choisir un thème.", 'error');
      setTimeout(() => hideStatus(elements.recordingStatus), 3000);
      console.log('Scenario not selected. Aborting start.');
      return;
    }

    console.log('Scenario selected:', scenario);

    elements.startSection?.classList.add('hidden');
    elements.conversationSection?.classList.remove('hidden');
    currentUserId = userId;
    
    const currentScenarioDisplay = document.getElementById('currentScenarioDisplay');
    if (currentScenarioDisplay) {
      currentScenarioDisplay.innerText = scenario === "libre" ? "Votre sujet libre" : scenario;
    }

    if (scenario !== "libre") {
      showProgressStatus(1, '🤔 L\'assistant prépare la conversation...');
      console.log('Preparing conversation for scenario:', scenario);
      
    // const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${scenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression. Commence par me poser une question ou présenter une situation pour démarrer notre conversation.`;
    // HIER GEÄNDERT: intro Variable wird durch LLM-Aufruf ersetzt
      try {
            
        const introPrompt = `L'étudiant veut pratiquer le thème '${scenario}'. Commence notre conversation avec une question ou situation engageante pour ce thème.`;
        // Initialen Prompt zur Historie hinzufügen (als "user" an das LLM)
        console.log('Initial intro prompt for LLM:', introPrompt);
        conversationHistory = []; // Historie für neues Gespräch
        conversationHistory.push({ role: 'user', content: introPrompt });

console.log('=== INTRO PROMPT SENDING ===');
console.log('📤 Intro Prompt:', introPrompt);
console.log('🧠 Aktuelle conversationHistory (Intro):');
console.table(conversationHistory);

        const resIntro = await fetch('/api/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: introPrompt, // Sende den Prompt an das Backend
            userId: userId,
            scenario: scenario,
            history: conversationHistory // NEU: Historie senden
          })
        });

        if (!resIntro.ok) {
          const errorText = await resIntro.text();
          console.error('HTTP error during intro fetch:', resIntro.status, errorText);
          throw new Error(`HTTP error! status: ${resIntro.status} - ${errorText}`);
        }

        const introData = await resIntro.json();
        console.log('Intro LLM response data:', introData);
        currentResponse = introData.response; // Die LLM-Antwort ist jetzt das Intro

        // NEU: LLM-Antwort zur Historie hinzufügen
        conversationHistory.push({ role: 'assistant', content: introData.response });
        
        showProgressStatus(2, '📝 Conversation préparée, génération de l\'audio...');
        
        if (introData.audio_url) {
          console.log('Intro audio URL received:', introData.audio_url);
          showProgressStatus(3, '🎵 Audio généré, préparation de la lecture...');
          elements.audioPlayback.src = introData.audio_url;
          elements.audioPlayback.classList.remove('hidden');
           elements.audioPlayback.addEventListener('canplaythrough', function handler() {
            showProgressStatus(4, '🔊 Audio prêt! Cliquez pour écouter.'); 
            elements.audioPlayback.removeEventListener('canplaythrough', handler); // Event Listener entfernen
           }, { once: true });

          elements.audioPlayback.addEventListener('ended', function handler() {
            audioHasBeenPlayed = true;
            showProgressStatus(4, '✅ Lecture terminée! Vous pouvez maintenant voir le texte.');
            updateShowResponseButton();
            elements.audioPlayback.removeEventListener('ended', handler); // Event Listener entfernen
          }, { once: true });

        } else {
          console.warn('No audio URL received for intro.');
          audioHasBeenPlayed = true;
          showResponseText();
          showStatus(elements.recordingStatus, '⚠️ Aucun audio d\'introduction reçu.', 'warning');
        }
      } catch (err) {
        console.error('Error starting conversation (catch block):', err);
        if (elements.responseText) {
          elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ Erreur: ${err.message}</div>`;
        }
        showStatus(elements.recordingStatus, `❌ Erreur lors du démarrage: ${err.message}`, 'error');
      }
    } else {
      if (elements.responseText) {
        elements.responseText.innerHTML = "🎯 Sujet libre sélectionné. Cliquez sur 'Reconnaissance' pour commencer!";
      }
      console.log('Free topic selected. Waiting for user input.');
    }
  });

  elements.newConvBtn?.addEventListener('click', () => {
    resetUI();
  });

elements.recordBtn?.addEventListener('click', () => {
  if (isRecording && !isPaused) {
    pauseRealTimeSpeech();
  } else if (isRecording && isPaused) {
    resumeRealTimeSpeech();
  } else {
    startRealTimeSpeech();
  }
});

elements.audioPlayback?.addEventListener('play', () => {
  console.log('Audio playback started');
  audioHasBeenPlayed = true;
  updateShowResponseButton();
});
elements.audioPlayback?.addEventListener('ended', () => {
  console.log('Audio playback ended');
  audioHasBeenPlayed = true;
  updateShowResponseButton();
});

  elements.stopBtn?.addEventListener('click', () => {
    stopRealTimeSpeech();
  });

  elements.sendBtn?.addEventListener('click', () => {
    let messageToSend = '';
    console.log('=== SEND BUTTON CLICKED ===');
    console.log('finalTranscript:', finalTranscript);
    console.log('userText content:', elements.userText?.textContent);
    console.log('userText isPlaceholder:', elements.userText?.dataset.isPlaceholder);
    
    // Prüfe ob userText geändert wurde (Priorität über finalTranscript)
    if (elements.userText?.textContent?.trim() && 
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
      showStatus(elements.recordingStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
      setTimeout(() => hideStatus(elements.recordingStatus), 3000);
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
    
    console.log('=== KEYBOARD SHORTCUT USED ===');
    let messageToSend = '';

    // Gleiche Logik wie beim Send Button
    if (elements.userText?.textContent?.trim() && 
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
  
  // Space bar to pause/resume recording (when not in input field)
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

// Initial UI setup
  resetUI();
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});