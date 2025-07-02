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
  let recordedAudioBlob = null;
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = false; // Steuert den Modus: true für Live-STT, false für traditionelle Aufnahme
  let recognitionActive = false; // Verhindert mehrfache Starts der Spracherkennung

  // GEÄNDERT: recognitionTimeout global deklarieren
  let recognitionTimeout; 

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === VERBESSERTE Spracherkennung mit Real-Time Support ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null; // Recognition-Instanz
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true; // Für Echtzeit-Updates
    recognition.continuous = false; // Auf false für stabilere Erkennung pro Phrase
    recognition.maxAlternatives = 1;

    let finalTranscript = ''; // Speichert den finalen, bestätigten Text

    recognition.onresult = (event) => {
      console.log('Speech recognition result received');
      let interimTranscript = '';
      let currentResult = '';
      
      // Iteriere über alle Ergebnisse, um den aktuellen Stand zu erhalten
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      currentResult = finalTranscript + interimTranscript;

      // Real-Time Update des UI
      if (elements.userText) {
        elements.userText.textContent = currentResult.trim();
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }

      // Status-Update für Real-Time
      if (isRealTimeMode) {
        const statusText = interimTranscript ? 
          `🎤 Écoute... "${interimTranscript}"` : 
          `🎤 Résultat: "${finalTranscript.trim()}"`;
        showStatus(elements.recordingStatus, statusText, 'success');
      }

      // Auto-restart für kontinuierliche Erkennung, wenn im Real-Time-Modus
      // Nur neu starten, wenn keine Ergebnisse mehr kommen (onend wird ausgelöst)
      // clearTimeout(recognitionTimeout); // Entfernt, da onend den Neustart handhabt
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      recognitionActive = false;
      
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      
      switch(event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé. Activez-le dans les paramètres du navigateur.';
          isRealTimeMode = false; // Stop real-time mode
          break;
        case 'no-speech':
          errorMessage = '🔇 Aucune parole erkannt.';
          // Im Real-Time-Modus versuchen wir bei 'no-speech' einen Neustart, zeigen aber keinen Fehler an
          if (isRealTimeMode) {
            console.log('No speech detected in real-time mode, attempting restart.');
            setTimeout(() => startRecognition(), 500); // Kurze Pause vor dem Neustart
            return; // Zeigt keinen Fehler im UI für 'no-speech' im Real-Time-Modus
          }
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau. Vérifiez votre connexion.';
          break;
        case 'audio-capture':
          errorMessage = '🎙️ Impossible d\'accéder au microphone.';
          isRealTimeMode = false;
          break;
        case 'aborted':
          // Normal, wenn die Erkennung manuell gestoppt wird
          if (!isRealTimeMode) return;
          break;
      }
      
      showStatus(elements.globalStatus, errorMessage, 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);

      // Auto-restart für bestimmte Fehler in real-time mode (z.B. Netzwerkprobleme)
      if (event.error === 'network' && isRealTimeMode) {
        setTimeout(() => {
          if (isRealTimeMode) startRecognition();
        }, 2000);
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      recognitionActive = false;
      
      if (isRealTimeMode) {
        // Auto-restart in real-time mode nach kurzer Pause, um kontinuierliche Erkennung zu simulieren
        setTimeout(() => {
          if (isRealTimeMode) {
            console.log('Restarting recognition in real-time mode');
            startRecognition();
          }
        }, 500);
      } else {
        hideStatus(elements.recordingStatus);
        resetRecordButton();
      }
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      recognitionActive = true;
      finalTranscript = ''; // Setze finalTranscript bei jedem Start zurück
    };

    // Hilfsfunktion für sauberen Recognition-Start
    function startRecognition() {
      if (recognitionActive) {
        console.log('Recognition already active, stopping first to restart');
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
        // Kurze Pause, um sicherzustellen, dass der vorherige Stopp verarbeitet wurde
        setTimeout(() => _actualStartRecognition(), 200);
      } else {
        _actualStartRecognition();
      }
    }

    function _actualStartRecognition() {
      try {
        console.log('Attempting to start speech recognition');
        recognition.start();
      } catch (e) {
        console.error('Could not start recognition:', e);
        recognitionActive = false;
        showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
      }
    }

  } else {
    console.warn('Web Speech API (SpeechRecognition) nicht verfügbar.');
    if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
    showStatus(elements.globalStatus, '⚠️ Reconnaissance vocale non supportée in diesem Browser.', 'warning');
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
          // Continue anyway
        }
      }

      // Prüfe HTTPS (außer localhost)
      if (location.protocol !== 'https:' && !location.hostname.includes('localhost') && location.hostname !== '127.0.0.1') {
        showStatus(elements.globalStatus, '🔒 HTTPS erforderlich für den Mikrofonzugriff.', 'error');
        return false;
      }

      // Test actual microphone access
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        testStream.getTracks().forEach(track => track.stop());
        console.log('Microphone access test successful');
        return true;
      } catch (mediaError) {
        console.error('Microphone access test failed:', mediaError);
        showStatus(elements.globalStatus, `🎙️ Impossible d'accéder au microphone: ${mediaError.message}`, 'error');
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

  // NEUE Funktion: Reset Record Button
  function resetRecordButton() {
    if (elements.recordBtn) {
      elements.recordBtn.disabled = false;
      elements.recordBtn.innerHTML = '🎙️ Reconnaissance vocale';
      elements.recordBtn.classList.remove('recording');
    }
    elements.stopBtn?.classList.add('hidden');
  }

  // Progress Bar Function (aktualisiert, um globalStatus zu verwenden)
  function showProgressStatus(step, message) {
    const totalSteps = 4; // Beispiel: 0-Init, 1-Recording, 2-Sending, 3-STT, 4-Ready
    let statusIcon = '';
    if (step === 0) statusIcon = '⚙️'; // Initialisierung
    else if (step === 1) statusIcon = '�'; // Aufnahme
    else if (step === 2) statusIcon = '📤'; // Senden
    else if (step === 3) statusIcon = '💬'; // Transkription
    else if (step === 4) statusIcon = '✅'; // Bereit / Fertig

    showStatus(elements.globalStatus, `${statusIcon} ${message}`, 'info');
    
    // Visuelle Fortschrittsleiste (optional, wenn Sie eine separate Leiste haben möchten)
    // Wenn Sie eine visuelle Leiste möchten, muss diese im HTML vorhanden sein
    // und hier über JS manipuliert werden, z.B. document.getElementById('myProgressBar').style.width = ...
    // Da hier keine dedizierte Leiste im HTML ist, verwenden wir nur den Textstatus.
    
    if (step >= totalSteps) { 
        setTimeout(() => {
            hideStatus(elements.globalStatus); // Versteckt den GlobalStatus nach Abschluss
        }, 1500);
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
    // GEÄNDERT: Aktualisiert den Status, ohne den Inhalt von responseText zu überschreiben
    showStatus(elements.globalStatus, '✅ Text ausgeblendet. Klicken Sie, um ihn wieder anzuzeigen.', 'info'); 
    elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Klicken Sie auf "Antwort anzeigen", um die Antwort zu sehen.</div>'; // Platzhalter
    isTextCurrentlyVisible = false;
    updateShowResponseButton();
  }

  function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    if (currentResponse) { // Zeige den Button, wenn eine Antwort vorhanden ist
      elements.showResponseBtn.classList.remove('hidden');
      if (isTextCurrentlyVisible) {
        elements.showResponseBtn.innerHTML = '🙈 Antwort ausblenden';
      } else {
        elements.showResponseBtn.innerHTML = '👁️ Antwort anzeigen';
      }
    } else {
      elements.showResponseBtn.classList.add('hidden');
    }
  }

  function resetUI() {
    console.log('Resetting UI...');
    
    // Stop any ongoing recognition
    if (recognition && (isRealTimeMode || recognitionActive)) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    isRealTimeMode = false;
    recognitionActive = false;
    // GEÄNDERT: clearTimeout(recognitionTimeout) nur aufrufen, wenn recognitionTimeout definiert ist
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
      elements.responseText.textContent = '...'; // Initialer Platzhalter für Antwort
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
    elements.showResponseBtn?.classList.add('hidden'); // Button initial verstecken
    
    // Reset buttons
    resetRecordButton();
    // GEÄNDERT: useSTTBtn sollte nur sichtbar sein, wenn Audio aufgenommen wurde und STT verfügbar ist
    elements.useSTTBtn?.classList.add('hidden'); 
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);

    showProgressStatus(0, 'Wählen Sie ein Thema oder starten Sie die Konversation.');
  }

  // === KORRIGIERTE Real-Time Transkriptionsfunktion ===
  async function startRealTimeSpeech() {
    console.log('Starting real-time speech...');
    
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) {
        console.error('Microphone permissions not granted');
        return;
      }

      if (!recognition) {
        showStatus(elements.globalStatus, '⚠️ Spracherkennung wird in diesem Browser nicht unterstützt', 'error');
        return;
      }

      // Stoppe vorherige Erkennung, falls aktiv
      if (recognitionActive) {
        console.log('Recognition already active, stopping first');
        try {
          recognition.stop();
        } catch (e) {
          console.warn('Could not stop recognition:', e);
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Kurze Pause
      }

      isRealTimeMode = true;
      finalTranscript = ''; // Setze finalTranscript für den neuen Start zurück
      
      // Clear previous text
      if (elements.userText) {
        elements.userText.textContent = '';
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
      }
      
      showStatus(elements.recordingStatus, '🎤 Spracherkennung aktiviert. Sprechen Sie jetzt!', 'success');
      
      // Starte Erkennung
      startRecognition(); // Ruft die Hilfsfunktion auf
      
      // UI aktualisieren
      if (elements.recordBtn) {
        elements.recordBtn.innerHTML = '🔴 Höre zu...';
        elements.recordBtn.disabled = true;
        elements.recordBtn.classList.add('recording');
      }
      
      // Stopp-Button anzeigen
      if (elements.stopBtn) {
        elements.stopBtn.classList.remove('hidden');
        elements.stopBtn.innerHTML = '⏹️ Stopp';
      }
      
    } catch (err) {
      console.error('Real-time speech error:', err);
      showStatus(elements.recordingStatus, '⚠️ Fehler bei der Spracherkennung: ' + err.message, 'error');
      isRealTimeMode = false;
      resetRecordButton();
    }
  }

  function stopRealTimeSpeech() {
    console.log('Stopping real-time speech...');
    
    if (recognition && (isRealTimeMode || recognitionActive)) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('Could not stop recognition:', e);
      }
    }
    
    isRealTimeMode = false;
    recognitionActive = false;
    // GEÄNDERT: clearTimeout(recognitionTimeout) nur aufrufen, wenn recognitionTimeout definiert ist
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
    }
    
    resetRecordButton();
    
    showStatus(elements.recordingStatus, '✅ Spracherkennung gestoppt', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 2000);
  }

  // === LEGACY Recording Functions (für Shift+Click) ===
  // Diese Funktion nimmt Audio auf, startet aber keine Live-Transkription.
  // Die Transkription muss danach manuell über den "Use STT" Button oder beim Senden erfolgen.
  async function startRecording() {
    console.log('Starting traditional recording...');
    
    try {
      const permissionsOk = await checkMicrophonePermissions();
      if (!permissionsOk) return;

      audioChunks = [];
      showStatus(elements.recordingStatus, '🎙️ Mikrofonzugriff anfordern...', 'loading');
      
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
      // GEÄNDERT: Bevorzuge webm für Aufnahme, da es breiter unterstützt wird
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) { // mp4 ist seltener für MediaRecorder
        options.mimeType = 'audio/mp4';
      } else {
        console.warn("Kein bevorzugtes Audioformat unterstützt, verwende Standard.");
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
          showStatus(elements.recordingStatus, '⚠️ Keine Audioaufnahme.', 'error');
          return;
        }
        
        // GEÄNDERT: Behalte den MIME-Typ der Aufnahme bei. Die Backend-Speicherung als .mp3 ist separat.
        const mimeType = mediaRecorder.mimeType || 'audio/webm'; 
        recordedAudioBlob = new Blob(audioChunks, { type: mimeType });
        
        const audioURL = URL.createObjectURL(recordedAudioBlob);
        if (elements.userAudio) {
          elements.userAudio.src = audioURL;
          elements.userAudioSection?.classList.remove('hidden');
        }
        
        // Zeige den STT-Button, wenn eine Aufnahme vorhanden und STT verfügbar ist
        if (SpeechRecognition) {
            elements.useSTTBtn?.classList.remove('hidden');
        }
        showStatus(elements.recordingStatus, '✅ Aufnahme beendet!', 'success');
      };

      mediaRecorder.start(250); // Daten alle 250ms sammeln
      
      elements.recordBtn.disabled = true;
      elements.recordBtn.innerHTML = '🔴 Aufnahme läuft...';
      elements.recordBtn.classList.add('recording');
      elements.stopBtn?.classList.remove('hidden');
      
      showStatus(elements.recordingStatus, '🎙️ Aufnahme läuft...', 'success');
      
    } catch (err) {
      console.error('Recording error:', err);
      showStatus(elements.recordingStatus, `⚠️ Mikrofonfehler: ${err.message}`, 'error');
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
    const text = elements.userText?.textContent?.trim();
    
    if (!text || text === placeholderText) {
      showStatus(elements.globalStatus, '⚠️ Bitte geben Sie eine Nachricht ein.', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    // Stoppe den Real-Time-Modus beim Senden
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    }

    // Zustand zurücksetzen
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    currentResponse = null;
    elements.playAudioBtn?.classList.add('hidden');
    updateShowResponseButton();

    showProgressStatus(1, '🤔 Der Assistent denkt nach...');

    try {
      // GEÄNDERT: Sende die Audioaufnahme separat an /api/transcribe zum Speichern
      // Dies geschieht IMMER, wenn recordedAudioBlob vorhanden ist.
      if (recordedAudioBlob) {
        const formData = new FormData();
        // GEÄNDERT: Dateiname ist jetzt recording.mp3
        formData.append('audio', recordedAudioBlob, 'recording.mp3'); 
        formData.append('user_id', currentUserId); // Sende user_id mit

        await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        }).then(response => {
            if (!response.ok) {
                console.error('Fehler beim Speichern der Aufnahme:', response.status, response.statusText);
            } else {
                console.log('Aufnahme erfolgreich an Backend gesendet und gespeichert.');
            }
        }).catch(error => {
            console.error('Netzwerkfehler beim Speichern der Aufnahme:', error);
        });
      }

      // Sende die Textnachricht an /api/respond
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, // Verwende 'message' statt 'text' für Konsistenz mit Backend
          userId: currentUserId, // Verwende 'userId' statt 'user_id' für Konsistenz mit Backend
          scenario: elements.scenarioSelect?.value
        })
      });

      if (!response.ok) {
        throw new Error(`Antwort fehlgeschlagen: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      currentResponse = data.response;
      showProgressStatus(2, '📝 Antwort erhalten, Audio wird generiert...');

      if (data.audio_url) {
        showProgressStatus(3, '🎵 Audio generiert, Wiedergabe wird vorbereitet...');
        
        if (elements.audioPlayback) {
          elements.audioPlayback.src = data.audio_url;
          elements.audioPlayback.classList.remove('hidden');
          
          elements.audioPlayback.addEventListener('canplay', function() {
            showProgressStatus(4, '🔊 Audio bereit! Klicken Sie auf "Abspielen", um zu starten.');
            elements.playAudioBtn?.classList.remove('hidden');
            // elements.audioPlayback.play(); // Optional: Autoplay hier versuchen
          }, { once: true });

          elements.audioPlayback.addEventListener('ended', function() {
            audioHasBeenPlayed = true;
            showProgressStatus(4, '✅ Wiedergabe beendet! Sie können jetzt den Text sehen.');
            updateShowResponseButton();
          }, { once: true });

          elements.audioPlayback.addEventListener('error', function() {
            console.warn('Audio konnte nicht geladen werden, zeige Text sofort an.');
            audioHasBeenPlayed = true;
            showResponseText();
            showStatus(elements.audioStatus, '⚠️ Audioproblem - Text direkt angezeigt', 'error');
          }, { once: true });
        }
      } else {
        console.warn('Keine Audio-URL erhalten, zeige Text sofort an.');
        audioHasBeenPlayed = true;
        showResponseText();

        if (data.tts_error) {
          showStatus(elements.audioStatus, '⚠️ Audio nicht verfügbar: ' + data.tts_error, 'error');
        }
      }
      
      // Benutzereingabe zurücksetzen
      if (elements.userText) {
        elements.userText.textContent = placeholderText;
        elements.userText.classList.add('placeholder');
        elements.userText.dataset.isPlaceholder = 'true';
      }
      
      recordedAudioBlob = null;
      elements.userAudioSection?.classList.add('hidden');
      elements.useSTTBtn?.classList.add('hidden'); // STT-Button nach dem Senden wieder verstecken
      
    } catch (err) {
      console.error('Sende-Fehler:', err);
      if (elements.responseText) {
        elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ ${err.message}</div>`;
      }
    } finally {
      // Finaler Status nach Abschluss des Sendevorgangs
      showProgressStatus(4, 'Antwort verarbeitet.');
      setTimeout(() => hideStatus(elements.globalStatus), 5000); // Globalen Status nach einer Weile ausblenden
    }
  }

  // === Event Listeners ===
  
  // Record button: Schaltet zwischen Real-Time-Spracherkennung und traditioneller Aufnahme um (mit Shift)
  elements.recordBtn?.addEventListener('click', (event) => {
    if (isRealTimeMode) {
      stopRealTimeSpeech();
    } else {
      if (event.shiftKey) {
        startRecording(); // Traditionelle Aufnahme
      } else {
        startRealTimeSpeech(); // Real-Time Spracherkennung
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
      showStatus(elements.globalStatus, "⚠️ Bitte wählen Sie ein Thema aus.", 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    elements.startSection?.classList.add('hidden');
    elements.conversationSection?.classList.remove('hidden');

    // Setzt den Anzeigetext für das aktuelle Szenario
    document.getElementById('currentScenarioDisplay').innerText = scenario === "libre" ? "Freies Thema" : scenario;

    // Setzt UI für neue Konversation zurück (ohne zum Startbildschirm zurückzukehren)
    elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Wählen Sie "Spracherkennung" oder geben Sie Text ein.</div>';
    elements.responseText.dataset.showingText = 'false'; // Initial ausgeblendet
    elements.audioPlayback.src = '';
    elements.audioPlayback.classList.add('hidden');
    elements.userAudio.src = '';
    elements.userAudioSection.classList.add('hidden');
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false; // Wichtig für den neuen Zustand
    
    resetRecordButton(); // Stellt den Aufnahme-Button zurück
    elements.useSTTBtn?.classList.add('hidden'); // STT-Button initial verstecken
    elements.showResponseBtn?.classList.add('hidden'); // Antwort-Button initial verstecken
    elements.playAudioBtn?.classList.add('hidden'); // Play-Audio-Button initial verstecken

    const userTextInputPlaceholder = "Geben Sie Ihre Nachricht hier ein oder nutzen Sie die Aufnahme...";
    elements.userText.textContent = userTextInputPlaceholder;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';

    if (scenario !== "libre") {
      showProgressStatus(1, '🤔 Der Assistent bereitet die Konversation vor...');
      
      const intro = `Ich lerne Französisch auf Niveau B1/B2. Ich möchte mich mit dir über das Thema « ${scenario} » unterhalten. Korrigiere mich bitte, wenn ich Fehler mache, und hilf mir, meine Grammatik und Ausdrucksweise zu verbessern. Beginne, indem du mir eine Frage stellst oder eine Situation präsentierst, um unser Gespräch zu starten.`;

      try {
        const res = await fetch('/api/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: intro, // Verwende 'message'
            userId: 'intro_' + Date.now(), // Verwende 'userId'
            scenario: scenario
          })
        });

        const data = await res.json();
        currentResponse = data.response;
        
        showProgressStatus(2, '📝 Konversation vorbereitet, Audio wird generiert...');
        
        if (data.audio_url && elements.audioPlayback) {
          showProgressStatus(3, '🎵 Audio generiert, Wiedergabe wird vorbereitet...');
          
          elements.audioPlayback.src = data.audio_url;
          elements.audioPlayback.classList.remove('hidden');
          
          elements.audioPlayback.addEventListener('canplay', function() {
            showProgressStatus(4, '🔊 Audio bereit! Klicken Sie auf "Abspielen", um zu starten.');
            elements.playAudioBtn?.classList.remove('hidden');
            // elements.audioPlayback.play(); // Optional: Autoplay hier versuchen
          }, { once: true });

          elements.audioPlayback.addEventListener('ended', function() {
            audioHasBeenPlayed = true;
            showProgressStatus(4, '✅ Wiedergabe beendet! Sie können jetzt den Text sehen.');
            updateShowResponseButton();
          }, { once: true });

          elements.audioPlayback.addEventListener('error', function() {
            console.warn('Audio konnte nicht geladen werden, zeige Text sofort an.');
            audioHasBeenPlayed = true;
            showResponseText();
            showStatus(elements.audioStatus, '⚠️ Audioproblem - Text direkt angezeigt', 'error');
          }, { once: true });
        } else {
          console.warn('Keine Audio-URL für Intro erhalten, zeige Text sofort an.');
          audioHasBeenPlayed = true;
          showResponseText();
          if (data.tts_error) {
            showStatus(elements.audioStatus, '⚠️ Audio nicht verfügbar: ' + data.tts_error, 'error');
          }
        }
        
      } catch (err) {
        console.error('Fehler beim Starten der Konversation:', err);
        if (elements.responseText) {
          elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ Fehler: ${err.message}</div>`;
        }
      }
    } else {
      if (elements.responseText) {
        elements.responseText.innerHTML = "🎯 Freies Thema ausgewählt. Klicken Sie auf 'Spracherkennung' oder geben Sie Ihren Text ein!";
      }
      showProgressStatus(4, 'Bereit für die Konversation (Freies Thema)');
    }
  });

  elements.newConvBtn?.addEventListener('click', resetUI);

  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse) { // Button sollte immer funktionieren, wenn eine Antwort da ist
      if (isTextCurrentlyVisible) {
        hideResponseText();
      } else {
        showResponseText();
      }
    } else {
      showStatus(elements.globalStatus, '⚠️ Keine Antwort zum Anzeigen vorhanden.', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

  elements.playAudioBtn?.addEventListener('click', () => {
    if (elements.audioPlayback?.src) {
      elements.audioPlayback.play().catch(err => {
        console.error('Audio play failed:', err);
        showStatus(elements.audioStatus, '⚠️ Wiedergabe des Audios nicht möglich', 'error');
      });
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter zum Senden der Nachricht
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
    
    // Leertaste zum Umschalten der Echtzeit-Spracherkennung (wenn nicht im Eingabefeld)
    if (e.code === 'Space' && e.target === document.body && elements.conversationSection && !elements.conversationSection.classList.contains('hidden')) {
      e.preventDefault();
      if (isRealTimeMode) {
        stopRealTimeSpeech();
      } else {
        startRealTimeSpeech();
      }
    }
  });

  // Verbesserte Behandlung von bearbeitbarem Textfeld
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
      
      // Text an der Cursorposition einfügen
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

    // Zeilenumbrüche in contenteditable verhindern
    elements.userText.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Initialisierung
  resetUI();
  
  // Mikrofonberechtigungen beim Laden prüfen
  checkMicrophonePermissions().then(result => {
    if (result) {
      console.log('✅ Mikrofonberechtigungen OK');
      showStatus(elements.globalStatus, '✅ Mikrofon bereit für die Spracherkennung', 'success');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    } else {
      console.log('❌ Mikrofonberechtigungen fehlgeschlagen');
    }
  });
  
  console.log('🚀 FR-AI-Tutor Frontend initialisiert mit Echtzeit-Spracherkennung');
});
�