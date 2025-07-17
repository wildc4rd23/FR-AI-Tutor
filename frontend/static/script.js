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
  let currentResponse = null; // Speichert die gesamte Antwort vom Backend
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = true;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = '';
  let isRecognitionRestarting = false;
  let userId = Date.now().toString(); // Initialisierung der userId
  let currentScenario = 'libre';
  let autoSendAfterRecording = false; // Konfig automatisches Senden der UserAufnahme
  let isRecording = false; // Status-Tracker
  let isPaused = false; // Neuer Status für Pause
  let isPlaybackInProgress = false; // Um Audio-Wiedergabestatus zu verfolgen
  // NEU: Konversationshistorie
  let conversationHistory = []; // Speichert Nachrichten als {role: 'user'/'assistant', content: 'text'}

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // Initialer Zustand der UI-Elemente
  elements.stopBtn.classList.add('hidden');
  elements.sendMessage.classList.add('hidden');
  elements.userAudio.classList.add('hidden');
  elements.audioPlayback.classList.add('hidden'); // LLM-Antwort Audio
  elements.responseText.classList.add('hidden'); // LLM-Antwort Text
  elements.showResponseBtn.classList.add('hidden'); // Button zum Anzeigen/Verbergen des Textes

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
          errorMessage = null; // No error message for no-speech, just restart
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau';
          shouldRestart = true;
          break;
        case 'aborted':
          return; // Do not show error or restart if aborted manually
        default:
          shouldRestart = true;
          break;
      }
      
      recognitionActive = false;
      
      if (errorMessage) {
        showStatus(elements.recordingStatus, errorMessage, 'error');
      }
      
      // KORREKTUR: Sicherstellen, dass nur neu gestartet wird, wenn nicht manuell gestoppt oder pausiert
      if (shouldRestart && !isRecognitionRestarting && isRecording && !isPaused) {
            setTimeout(() => {
              if (!isRecognitionRestarting && isRecording && !isPaused) {
                startRecognition(); // Rekursiver Aufruf
              }
            }, 1000);
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

  // showProgressStatus Funktion jeder Schritt visuell dargestellt
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
      elements.responseText.classList.remove('hidden'); // Ensure progress bar is visible
      isTextCurrentlyVisible = false; // Progress bar is not the final text
    }
    // Hide the showResponseBtn when showing progress
    elements.showResponseBtn.classList.add('hidden');
  }

// Erweiterte showResponseText() mit Audio-Validierung
function showResponseText() {
    if (currentResponse && elements.responseText) {
        // KORREKTUR: Text wird immer angezeigt, wenn diese Funktion aufgerufen wird.
        // Die Logik, ob Audio abgespielt wurde, wird VOR dem Aufruf dieser Funktion gehandhabt.
        elements.responseText.innerHTML = currentResponse;
        elements.responseText.classList.remove('hidden');
        isTextCurrentlyVisible = true;
        updateShowResponseButton(); // Aktualisiere den Button-Zustand
        console.log('✅ Text angezeigt nach Audio-Wiedergabe');
        // Hide audio playback controls when text is shown
        //elements.audioPlayback.classList.add('hidden');   //trotzdem zeigen!
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
    // KORREKTUR: showProgressStatus ist hier nicht direkt passend, da es um das Verbergen des Textes geht
    // Stattdessen den Textbereich leeren oder ausblenden
    elements.responseText.innerHTML = '';
    elements.responseText.classList.add('hidden');
    isTextCurrentlyVisible = false;
    updateShowResponseButton(); // Aktualisiere den Button-Zustand
  }

// Verbesserte updateShowResponseButton()
function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    // KORREKTUR: Logik für den Button
    if (currentResponse) { // Nur wenn eine Antwort vorhanden ist
        elements.showResponseBtn.classList.remove('hidden'); // Zeige den Button
        elements.showResponseBtn.style.opacity = '1';
        elements.showResponseBtn.style.cursor = 'pointer';

        if (isTextCurrentlyVisible) {
            elements.showResponseBtn.innerHTML = '🙈 Masquer la réponse';
        } else if (audioHasBeenPlayed) { // Audio abgespielt, Text aber nicht sichtbar
            elements.showResponseBtn.innerHTML = '👁️ Afficher la réponse';
        } else { // Audio nicht abgespielt, Text nicht sichtbar
            elements.showResponseBtn.innerHTML = '🔊 Écoutez d\'abord l\'audio';
            elements.showResponseBtn.style.opacity = '0.6'; // Dimmen
            elements.showResponseBtn.style.cursor = 'not-allowed'; // Zeiger ändern
        }
    } else {
        elements.showResponseBtn.classList.add('hidden'); // Verstecke den Button, wenn keine Antwort
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
    // KORREKTUR: responseText beim Reset leeren und ausblenden
    if (elements.responseText) {
      elements.responseText.innerHTML = '';
      elements.responseText.classList.add('hidden');
    }
    
    if (elements.audioPlayback) {
      elements.audioPlayback.src = '';
      elements.audioPlayback.classList.add('hidden');
    }
    
    if (elements.userAudio) {
      elements.userAudio.src = '';
      elements.userAudio.classList.add('hidden');
    }
    
    elements.showResponseBtn?.classList.add('hidden'); // Button verstecken
    
    updateRecordButton(); // Aktualisiere den Aufnahme-Button
    
    currentUserId = null; // Setze User ID zurück
    recordedAudioBlob = null;
    currentResponse = null; // Setze aktuelle Antwort zurück
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = '';
    audioChunks = []; // Reset audio chunks
    conversationHistory = []; // Konversationshistorie zurücksetzen

    hideStatus(elements.recordingStatus);
    hideStatus(elements.audioStatus);
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
    elements.sendBtn.disabled = true;
    elements.recordBtn.disabled = true;
    elements.stopBtn.disabled = true; // KORREKTUR: Stop-Button auch deaktivieren

    // Hide previous response text and audio player
    elements.responseText.classList.add('hidden');
    elements.audioPlayback.classList.add('hidden');
    elements.showResponseBtn.classList.add('hidden'); // Hide text button for new response

    try {
        const response = await fetch('/api/respond', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                message: message,
                userId: userId, 
                scenario: currentScenario
            }),
        });

        if (!response.ok) {
            const errorText = await extractErrorMessage(response);
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Backend response received:', data); // KORREKTUR: data loggen
        console.log('Empfangene audio_url (Chat):', data.audio_url); // Hinzugefügtes Log

        // Lokale Historie nur zur Anzeige
        conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
        );
        
        // KRITISCH: Verwende setResponseSafely() statt showResponseText()
        setResponseSafely(data.response); // Setzt currentResponse und zeigt Hinweis an

        if (data.audio_url) { // KORREKTUR: 'audio_url' statt 'audio_url'
            elements.audioPlayback.src = data.audio_url;
            elements.audioPlayback.load();
            elements.audioPlayback.classList.remove('hidden');
            audioHasBeenPlayed = false; // Wichtig: Audio noch nicht abgespielt
            updateShowResponseButton(); // Aktualisiere den Button-Zustand

            elements.audioPlayback.oncanplaythrough = async () => {
                showProgressStatus(3, 'Audio prêt à jouer.');
                try {
                    await elements.audioPlayback.play();
                    audioHasBeenPlayed = true;
                    console.log('✅ Audio abgespielt nach Chat-Nachricht');
                    showResponseText(); // Show text ONLY AFTER successful audio playback
                    elements.showResponseBtn.textContent = 'Masquer le texte';
                    showProgressStatus(4, '✅ Prêt ! Écoutez la réponse et commencez à parler.'); // Letzter Fortschrittsstatus
                } catch (e) {
                    console.error('❌ Fehler beim Abspielen des Audios nach Chat-Nachricht:', e);
                    showStatus(elements.audioStatus, 'Erreur de lecture audio. Texte disponible.', 'error');
                    audioHasBeenPlayed = false;
                    elements.showResponseBtn.classList.remove('hidden');
                    elements.showResponseBtn.textContent = 'Afficher le texte';
                    elements.responseText.classList.add('hidden');
                    elements.audioPlayback.classList.add('hidden');
                    showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
                }
            };
            elements.audioPlayback.onerror = (e) => {
                console.error('❌ Fehler beim Laden/Wiedergeben des Audios nach Chat-Nachricht:', e);
                showStatus(elements.audioStatus, 'Erreur audio. Texte disponible.', 'error');
                audioHasBeenPlayed = false;
                elements.showResponseBtn.classList.remove('hidden');
                elements.showResponseBtn.textContent = 'Afficher le texte';
                elements.responseText.classList.add('hidden');
                elements.audioPlayback.classList.add('hidden');
                showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
            };
        } else {
            console.warn('⚠️ No audio URL received for chat response');
            showStatus(elements.audioStatus, 'Aucun audio disponible. Texte disponible.', 'warning');
            audioHasBeenPlayed = false; // Audio wurde nicht abgespielt
            elements.showResponseBtn.classList.remove('hidden'); // Button zum Anzeigen des Textes
            elements.showResponseBtn.textContent = 'Afficher le texte';
            elements.responseText.classList.add('hidden'); // Text bleibt versteckt
            elements.audioPlayback.classList.add('hidden'); // Audio-Player verstecken
            showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
        }

        showStatus(elements.recordingStatus, '✅ Réponse reçue', 'success');

    } catch (error) {
        console.error('❌ Error sending message:', error);
        showStatus(elements.recordingStatus, `❌ Erreur: ${error.message}`, 'error');
        
        // FEHLER-HANDLING: Auch hier keine direkte Text-Anzeige
        currentResponse = `Erreur de communication: ${error.message}`; // Setze Fehlertext als currentResponse
        if (elements.responseText) {
            elements.responseText.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #e74c3c;">
                    ❌ Erreur de communication: ${error.message}
                </div>
            `;
            elements.responseText.classList.remove('hidden'); // Zeige Fehlermeldung an
        }
        isTextCurrentlyVisible = true; // Fehlermeldung ist sofort sichtbar
        elements.showResponseBtn.classList.add('hidden'); // Button verstecken bei Fehler
        elements.audioPlayback.classList.add('hidden'); // Audio-Player verstecken
        audioHasBeenPlayed = false; // Kein Audio abgespielt
    } finally {
        elements.sendBtn.disabled = false;
        elements.recordBtn.disabled = false;
        elements.stopBtn.disabled = false;
        hideStatus(elements.recordingStatus); // Status ausblenden
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
    formData.append('user_id', userId); // KORREKTUR: user_id für FormData beibehalten
    
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

// 7. Erweiterte showAudioRetryOptions()
function showAudioRetryOptions() {
    if (elements.responseText) {
        elements.responseText.innerHTML = `
            <div style="text-align: center; margin-top: 15px;">
                <div style="margin-bottom: 15px; color: #e74c3c;">⚠️ Audio manquant</div>
                <button onclick="retryAudio()" style="margin-right: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    🔄 Réessayer l'audio
                </button>
                <button onclick="continueWithoutAudio()" style="padding: 8px 16px; background: #95a5a6; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    📝 Voir texte sans audio
                </button>
            </div>
        `;
        elements.responseText.classList.remove('hidden'); // Zeige diese Optionen an
        isTextCurrentlyVisible = true; // Optionen sind sichtbar
        elements.showResponseBtn.classList.add('hidden'); // Button verstecken, da Optionen angezeigt werden
    }
}

    // KORREKTUR: retryAudio und continueWithoutAudio müssen global verfügbar sein oder über Event-Delegation aufgerufen werden
    // Für Einfachheit, machen wir sie hier global, in einer größeren App würde man Event-Delegation nutzen.
    window.retryAudio = function() {
        console.log('Manueller Audio-Retry gestartet');
        showProgressStatus(3, '🔄 Nouvel essai...');
        // Nutzt die bestehende sendMessageToBackend Funktion mit dem letzten gesendeten User-Prompt
        // Annahme: der letzte User-Prompt ist in conversationHistory verfügbar
        const lastUserMessage = conversationHistory.findLast(msg => msg.role === 'user');
        if (lastUserMessage) {
            sendMessageToBackend(lastUserMessage.content);
        } else {
            console.error('Keine letzte Benutzernachricht für Retry gefunden.');
            showStatus(elements.recordingStatus, 'Erreur: Impossible de réessayer l\'audio sans message précédent.', 'error');
        }
    };

// Korrigierte continueWithoutAudio() 
    window.continueWithoutAudio = function() {
        console.log('Benutzer wählt: ohne Audio fortfahren');
        
        // KRITISCH: Setze audioHasBeenPlayed auf true, da Benutzer explizit ohne Audio fortfahren möchte
        audioHasBeenPlayed = true;
        
        // Jetzt kann der Text sicher angezeigt werden
        showResponseText(); // Zeigt den Text an
        showStatus(elements.audioStatus, 'Texte affiché sans audio.', 'info'); // Status aktualisieren
        showProgressStatus(4, '✅ Texte prêt - 100% terminé!');
    };


  // === Event Listeners ===
// === OPTIMIERTE KONVERSATIONS-STARTER ===
elements.startBtn?.addEventListener('click', async () => {
    console.log('🚀 Starting conversation...');

    const scenario = elements.scenarioSelect?.value;
    // KORREKTUR: forceReset basierend auf Szenario-Wechsel ODER wenn currentUserId noch nicht gesetzt ist
    const forceReset = currentUserId === null || scenario !== currentScenario;
    currentScenario = scenario; // Aktualisiere das aktuelle Szenario
    
    if (!scenario) {
        showStatus(elements.recordingStatus, "⚠️ Veuillez choisir un thème.", 'error');
        return;
    }

    elements.startSection?.classList.add('hidden');
    elements.conversationSection?.classList.remove('hidden');
    
    // KORREKTUR: currentUserId wird in startConversation gesetzt, aber hier für den Fetch-Call benötigt
    // Wenn currentUserId noch null ist, wird er im Backend generiert und zurückgegeben.
    // Falls er bereits existiert, wird er wiederverwendet.
    if (!currentUserId) {
        currentUserId = 'user_' + Date.now(); // Temporäre ID für den ersten Request
        console.log('Temporäre User ID für Start generiert:', currentUserId);
    }
    
    // UI-Elemente für neue Antwort zurücksetzen
    elements.responseText.innerHTML = '';
    elements.responseText.classList.add('hidden');
    elements.audioPlayback.src = '';
    elements.audioPlayback.classList.add('hidden');
    elements.showResponseBtn.classList.add('hidden');
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;


    const currentScenarioDisplay = document.getElementById('currentScenarioDisplay');
    if (currentScenarioDisplay) {
        const scenarioNames = {
            "libre": "Conversation libre",
            "restaurant": "Au restaurant",
            "faire_les_courses": "Faire les courses", // Hinzugefügt
            "visite_chez_le_médecin": "Visite chez le médecin", // Hinzugefügt
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
                    userId: currentUserId, // KORREKTUR: Verwende currentUserId
                    force_reset: forceReset
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error}`);
            }

            const data = await response.json();
            console.log('🎯 Conversation started successfully:', data);
            
            currentUserId = data.userId; // KORREKTUR: Aktualisiere currentUserId mit der vom Backend erhaltenen ID
            conversationHistory = [{ role: 'assistant', content: data.response }];
            
            showProgressStatus(2, '📝 Conversation préparée...');
            
            if (data.audio_url) { // KORREKTUR: 'audio_url'
                setResponseSafely(data.response); // Setzt currentResponse und zeigt Hinweis an
                
                elements.audioPlayback.src = data.audio_url;
                elements.audioPlayback.load();
                elements.audioPlayback.classList.remove('hidden');
                audioHasBeenPlayed = false; // Wichtig: Audio noch nicht abgespielt
                updateShowResponseButton(); // Aktualisiere den Button-Zustand
                showProgressStatus(3, 'Chargement de l\'audio...');
                
                // Event Listener für Audio-Ende
                elements.audioPlayback.oncanplaythrough = async () => {
                    showProgressStatus(4, 'Audio prêt à jouer.');
                    try {
                        await elements.audioPlayback.play();
                        audioHasBeenPlayed = true;
                        console.log('✅ Audio abgespielt für Konversationsstart');
                        showResponseText(); // Show text ONLY AFTER successful audio playback
                        elements.showResponseBtn.textContent = 'Masquer le texte';
                        showProgressStatus(4, '✅ Prêt ! Écoutez la réponse et commencez à parler.');
                    } catch (e) {
                        console.error('❌ Fehler beim Abspielen des initialen Audios:', e);
                        showStatus(elements.audioStatus, 'Erreur de lecture audio. Texte disponible.', 'error');
                        audioHasBeenPlayed = false;
                        elements.showResponseBtn.classList.remove('hidden');
                        elements.showResponseBtn.textContent = 'Afficher le texte';
                        elements.responseText.classList.add('hidden');
                        elements.audioPlayback.classList.add('hidden');
                        showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
                    }
                };
                elements.audioPlayback.onerror = (e) => {
                    console.error('❌ Fehler beim Laden/Wiedergeben des initialen Audios:', e);
                    showStatus(elements.audioStatus, 'Erreur audio. Texte disponible.', 'error');
                    audioHasBeenPlayed = false;
                    elements.showResponseBtn.classList.remove('hidden');
                    elements.showResponseBtn.textContent = 'Afficher le texte';
                    elements.responseText.classList.add('hidden');
                    elements.audioPlayback.classList.add('hidden');
                    showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
                };

            } else {
                // FALLBACK: Kein Audio verfügbar
                console.warn('⚠️ No audio available for conversation start');
                currentResponse = data.response; // Setze die Antwort
                audioHasBeenPlayed = false; // Kein Audio abgespielt
                elements.showResponseBtn.classList.remove('hidden'); // Button zum Anzeigen des Textes
                elements.showResponseBtn.textContent = 'Afficher le texte';
                elements.responseText.classList.add('hidden'); // Text bleibt versteckt
                elements.audioPlayback.classList.add('hidden'); // Audio-Player verstecken
                showStatus(elements.audioStatus, 'Aucun audio disponible. Texte disponible.', 'warning');
                showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable manuellement.');
            }
            
        } catch (err) {
            console.error('❌ Error starting conversation:', err);
            showStatus(elements.recordingStatus, `❌ Erreur: ${err.message}`, 'error');
            // Bei Fehler zurück zum Startbildschirm
            elements.startSection.classList.remove('hidden');
            elements.conversationSection.classList.add('hidden');
        } finally {
            // Status-Anzeige nach Abschluss des Startvorgangs ausblenden
            hideStatus(elements.recordingStatus);
        }
    } else {
        // Freie Konversation (kein Backend-Aufruf für initialen Text)
        currentResponse = "🎯 Conversation libre - parlez de ce qui vous intéresse!";
        audioHasBeenPlayed = true; // Freie Konversation = sofortige Text-Anzeige erlaubt
        showResponseText(); // Text sofort anzeigen
        hideStatus(elements.recordingStatus); // Status ausblenden
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

// Verbesserte Audio Event Listener
elements.audioPlayback?.addEventListener('play', () => {
    console.log('🎵 Audio playback started');
    showProgressStatus(4, '🎵 Écoute en cours...');
});

elements.audioPlayback?.addEventListener('ended', () => {
    console.log('✅ Audio playback ended');
    audioHasBeenPlayed = true; // Bestätige, dass Audio abgespielt wurde
    showProgressStatus(4, '✅ Audio terminé - Texte disponible!');
    updateShowResponseButton(); // Aktualisiere den Button-Zustand, um Text anzuzeigen/verbergen
    
    // Jetzt kann der Text sicher angezeigt werden, wenn gewünscht
    if (currentResponse && !isTextCurrentlyVisible) {
        console.log('💡 Audio beendet - Text kann nun angezeigt werden');
    }
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
    // KORREKTUR: Logik für den Button-Klick
    if (currentResponse) { // Nur wenn eine Antwort vorhanden ist
        if (isTextCurrentlyVisible) {
            hideResponseText();
            elements.showResponseBtn.textContent = 'Afficher le texte';
        } else {
            // Wenn Text noch nicht sichtbar und Audio abgespielt wurde ODER kein Audio da war
            if (audioHasBeenPlayed || !elements.audioPlayback.src) { // KORREKTUR: Überprüfe audioPlayback.src
                showResponseText();
                elements.showResponseBtn.textContent = 'Masquer le texte';
            } else {
                showStatus(elements.recordingStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
                setTimeout(() => hideStatus(elements.recordingStatus), 3000);
            }
        }
    } else {
        // Sollte nicht passieren, wenn der Button sichtbar ist, aber zur Sicherheit
        console.warn('showResponseBtn geklickt, aber keine currentResponse.');
    }
  });

    elements.scenarioSelect?.addEventListener('change', (event) => {
        currentScenario = event.target.value;
        console.log('Scenario changed to:', currentScenario);
    });

// === VERBESSERTES DEBUGGING ===
function debugConversationState() {
    console.log('=== CONVERSATION STATE DEBUG ===');
    console.log('🆔 User ID:', userId);
    console.log('🎭 Current Scenario:', currentScenario);
    console.log('📝 Current Response:', currentResponse ? 'Set' : 'Not set');
    console.log('🎵 Audio played:', audioHasBeenPlayed);
    console.log('👁️ Text visible:', isTextCurrentlyVisible);
    console.log('🗣️ Recording:', isRecording);
    console.log('⏸️ Paused:', isPaused);
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