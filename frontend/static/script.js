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
      elements.recordBtn && (elements.recordBtn.innerHTML = '🎙️ Enregistrer');
      elements.recordBtn && elements.recordBtn.classList.remove('recording', 'paused');
      elements.recordBtn && (elements.recordBtn.disabled = false);

      elements.stopBtn && elements.stopBtn.classList.add('hidden');
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
        elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
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
        audioHasBeenPlayed = true;
        
        showResponseText();
        showProgressStatus(4, '✅ Texte affiché sans audio.');
    };

// KORRIGIERTE playLlmAudio Funktion mit log
async function playLlmAudio(audioUrl) {
    console.log('=== PLAY LLM AUDIO DEBUG ===');
    console.log('Received audioUrl:', audioUrl);
    console.log('audioUrl type:', typeof audioUrl);
    console.log('audioUrl length:', audioUrl ? audioUrl.length : 'N/A');
    console.log('Audio element exists:', !!elements.llmAudioPlayback);
    console.log('Audio element src before:', elements.llmAudioPlayback ? elements.llmAudioPlayback.src : 'N/A');
    
    if (!audioUrl || audioUrl.trim() === '') {
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
        console.log('Setting audio src and loading:', audioUrl);
        audioElement.src = audioUrl;
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

    const scenario = elements.scenarioSelect?.value;
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

// Initial UI setup
  resetUI();
  console.log('🚀 FR-AI-Tutor Frontend initialized with Real-Time Speech Recognition');
});