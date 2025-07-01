// script.js
document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
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

  // Globale Variablen
  let mediaRecorder;
  let audioChunks = [];
  let currentUserId = null;
  let recordedAudioBlob = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;

  // GEÄNDERT: Initialisiere SpeechRecognition API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false; // Set to true for continuous recognition
    recognition.interimResults = false; // Set to true for interim results
    recognition.lang = 'fr-FR'; // Set language for recognition (e.g., French)

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      elements.userText.innerText = transcript;
      elements.userText.classList.remove('placeholder');
      elements.userText.dataset.isPlaceholder = 'false';
      showStatus(elements.globalStatus, '✅ Transkription erfolgreich!', 'success');
    };

    recognition.onerror = (event) => {
      console.error('Speech Recognition Error:', event.error);
      showStatus(elements.globalStatus, `⚠️ Spracherkennungsfehler: ${event.error}`, 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    };

    recognition.onend = () => {
      showProgressStatus(4, 'Spracherkennung beendet.');
    };
  } else {
    console.warn('Web Speech API (SpeechRecognition) wird von diesem Browser nicht unterstützt.');
    elements.useSTTBtn.classList.add('hidden'); // Verstecke den STT-Button, wenn die API nicht verfügbar ist
    showStatus(elements.globalStatus, '⚠️ Spracherkennung nicht unterstützt. Bitte geben Sie Text ein.', 'warning');
  }


  // Utility Functions
  function showStatus(element, message, type) {
    if (element) {
      element.innerText = message;
      element.className = `status-message ${type}`;
      element.classList.remove('hidden');
    }
  }

  function hideStatus(element) {
    if (element) {
      element.classList.add('hidden');
    }
  }

  function showProgressStatus(step, message) {
    const totalSteps = 4;
    let progressBar = document.getElementById('progressBar');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.id = 'progressBar';
      progressBar.style.width = '0%';
      progressBar.style.height = '4px';
      progressBar.style.backgroundColor = '#4CAF50';
      progressBar.style.position = 'absolute';
      progressBar.style.bottom = '0';
      progressBar.style.left = '0';
      progressBar.style.transition = 'width 0.3s ease-in-out';
      document.body.appendChild(progressBar);
    }
    
    const progressWidth = (step / totalSteps) * 100;
    progressBar.style.width = `${progressWidth}%`;

    let statusIcon = '';
    if (step === 0) statusIcon = '⚙️';
    else if (step === 1) statusIcon = '🎤';
    else if (step === 2) statusIcon = '📤';
    else if (step === 3) statusIcon = '💬';
    else if (step === 4) statusIcon = '✅';

    showStatus(elements.globalStatus, `${statusIcon} ${message}`, 'info');
    
    if (step >= totalSteps) {
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '0%';
            hideStatus(elements.globalStatus);
        }, 1500);
    }
  }

  function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
  }

  function resetUI() {
    elements.responseText.innerText = '';
    elements.audioPlayback.src = '';
    elements.audioPlayback.classList.add('hidden');
    elements.userAudio.src = '';
    elements.userAudioSection.classList.add('hidden');
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;

    elements.startSection.classList.remove('hidden');
    elements.conversationSection.classList.add('hidden');

    elements.recordBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    // GEÄNDERT: Zeige STT-Button nur, wenn SpeechRecognition verfügbar ist
    if (SpeechRecognition) { 
        elements.useSTTBtn.classList.add('hidden'); // Versteckt ihn initial
    } else {
        elements.useSTTBtn.classList.add('hidden'); // Immer versteckt, wenn nicht unterstützt
    }
    elements.showResponseBtn.classList.add('hidden');
    elements.playAudioBtn.classList.add('hidden');
    
    const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";
    elements.userText.innerText = placeholderText;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';
    
    currentUserId = currentUserId || generateUserId(); 

    showProgressStatus(0, 'Wählen Sie ein Thema oder starten Sie die Konversation.');
  }

  elements.userText?.addEventListener('focus', function() {
    if (this.dataset.isPlaceholder === 'true') {
      this.innerText = '';
      this.classList.remove('placeholder');
      this.dataset.isPlaceholder = 'false';
    }
  });

  elements.userText?.addEventListener('blur', function() {
    if (this.innerText.trim() === '') {
      const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";
      this.innerText = placeholderText;
      this.classList.add('placeholder');
      this.dataset.isPlaceholder = 'true';
    }
  });


  // Event Listeners
  elements.startBtn?.addEventListener('click', () => {
    elements.startSection.classList.add('hidden');
    elements.conversationSection.classList.remove('hidden');
    
    const selectedScenario = elements.scenarioSelect?.value || 'Conversation générale';
    document.getElementById('currentScenarioDisplay').innerText = selectedScenario;

    elements.responseText.innerText = '';
    elements.audioPlayback.src = '';
    elements.audioPlayback.classList.add('hidden');
    elements.userAudio.src = '';
    elements.userAudioSection.classList.add('hidden');
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    elements.recordBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    if (SpeechRecognition) { // Nur anzeigen, wenn API verfügbar
        elements.useSTTBtn.classList.add('hidden'); 
    }
    elements.showResponseBtn.classList.add('hidden');
    elements.playAudioBtn.classList.add('hidden');
    
    const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";
    elements.userText.innerText = placeholderText;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';

    showProgressStatus(4, 'Bereit für die Konversation');
    console.log('Conversation started with scenario:', selectedScenario);
  });

  elements.recordBtn?.addEventListener('click', async () => {
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    showProgressStatus(1, '🔴 Aufnahme läuft...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      recordedAudioBlob = null;

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' }); // GEÄNDERT: Typ auf MP3 setzen
        const audioUrl = URL.createObjectURL(recordedAudioBlob);
        elements.userAudio.src = audioUrl;
        elements.userAudioSection.classList.remove('hidden');

        stream.getTracks().forEach(track => track.stop());
        showProgressStatus(4, 'Aufnahme beendet. Bereit.');
        if (SpeechRecognition) { // Zeige STT-Button nur, wenn API verfügbar
            elements.useSTTBtn.classList.remove('hidden'); 
        }
      };

      mediaRecorder.start();
      // GEÄNDERT: Starte auch die Spracherkennung, wenn verfügbar
      if (recognition) {
        recognition.start();
        showStatus(elements.recordingStatus, 'Spracherkennung aktiv...', 'info');
      }

      elements.recordBtn.classList.add('hidden');
      elements.stopBtn.classList.remove('hidden');
      elements.useSTTBtn.classList.add('hidden'); // Verstecke STT-Button während der Aufnahme
    } catch (err) {
      console.error('Error accessing microphone:', err);
      showStatus(elements.globalStatus, '❌ Mikrofonzugriff verweigert oder Fehler.', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      showProgressStatus(4, 'Bereit für die Konversation');
    }
  });

  elements.stopBtn?.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      // GEÄNDERT: Stoppe auch die Spracherkennung, wenn aktiv
      if (recognition && recognition.recognizing) {
        recognition.stop();
        hideStatus(elements.recordingStatus);
      }
      elements.stopBtn.classList.add('hidden');
      elements.recordBtn.classList.remove('hidden');
      if (SpeechRecognition) { // Zeige STT-Button nur, wenn API verfügbar
        elements.useSTTBtn.classList.remove('hidden'); 
      }
    }
  });

  // GEÄNDERT: useSTTBtn verwendet jetzt die Web Speech API (SpeechRecognition)
  elements.useSTTBtn?.addEventListener('click', async () => {
    if (recognition && recordedAudioBlob) { // Prüfe, ob recognition und Audio verfügbar sind
      hideStatus(elements.globalStatus);
      showProgressStatus(3, '⏳ Transkription läuft (Browser STT)...');
      // Die Transkription wird automatisch über recognition.onresult aktualisiert
      // Hier muss kein fetch an /api/transcribe mehr erfolgen, da der Browser transkribiert.
      // Die Audio-Datei wird später beim Senden der Nachricht hochgeladen.
      showStatus(elements.globalStatus, '✅ Transkription erfolgreich!', 'success');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      showProgressStatus(4, 'Bereit für die Konversation');
    } else if (!SpeechRecognition) {
        showStatus(elements.globalStatus, '⚠️ Spracherkennung wird von diesem Browser nicht unterstützt.', 'warning');
        setTimeout(() => hideStatus(elements.globalStatus), 3000);
    } else {
        showStatus(elements.globalStatus, '⚠️ Keine Audioaufnahme zum Transkribieren.', 'warning');
        setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

  elements.sendBtn?.addEventListener('click', async () => {
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    showProgressStatus(0, '⏳ Sende Nachricht...');

    let userText = elements.userText.innerText.trim();
    if (elements.userText.dataset.isPlaceholder === 'true') {
        userText = '';
    }

    // GEÄNDERT: Wenn kein Text vorhanden ist, aber eine Audioaufnahme existiert,
    // und SpeechRecognition verfügbar ist, versuchen wir, die Audioaufnahme zu transkribieren.
    // Dies ist ein Fallback, falls der Benutzer nicht explizit auf "Use STT" geklickt hat.
    if (!userText && recordedAudioBlob && SpeechRecognition) {
      showProgressStatus(3, '⏳ Keine Textnachricht gefunden. Automatische Transkription des Audios läuft...');
      if (recognition) {
        recognition.start(); // Startet die Erkennung für das aufgenommene Audio
        // Warten auf das Ergebnis der Spracherkennung (asynchron)
        await new Promise(resolve => {
            recognition.onresult = (event) => {
                userText = event.results[0][0].transcript;
                elements.userText.innerText = userText;
                elements.userText.classList.remove('placeholder');
                elements.userText.dataset.isPlaceholder = 'false';
                showStatus(elements.globalStatus, '✅ Audio transkribiert.', 'success');
                resolve();
            };
            recognition.onerror = (event) => {
                console.error('Auto STT Error:', event.error);
                showStatus(elements.globalStatus, `⚠️ Auto-Transkriptionsfehler: ${event.error}. Nachricht kann nicht gesendet werden.`, 'error');
                resolve(); // Trotz Fehler auflösen, um den Prozess nicht zu blockieren
            };
        });
      }
    }

    if (!userText) {
      showStatus(elements.globalStatus, '⚠️ Bitte geben Sie Text ein oder nehmen Sie Audio auf, das transkribiert werden kann.', 'warning');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      showProgressStatus(4, 'Bereit für die Konversation');
      return;
    }

    showProgressStatus(2, '📤 Nachricht senden...');

    try {
      // GEÄNDERT: Sende die Audioaufnahme separat an /api/transcribe zum Speichern
      if (recordedAudioBlob) {
        const formData = new FormData();
        formData.append('audio', recordedAudioBlob, 'recording.mp3'); // Dateiname ist jetzt recording.mp3
        await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        }).then(response => {
            if (!response.ok) {
                console.error('Fehler beim Speichern der Aufnahme:', response.statusText);
            }
        }).catch(error => {
            console.error('Netzwerkfehler beim Speichern der Aufnahme:', error);
        });
      }

      // Sende die Textnachricht an /api/respond
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          userId: currentUserId,
          scenario: elements.scenarioSelect?.value || ''
        }),
      });

      const data = await response.json();
      if (response.ok) {
        currentResponse = data.response;
        elements.audioPlayback.src = data.audio_url;
        elements.audioPlayback.classList.remove('hidden');
        elements.showResponseBtn.classList.remove('hidden');
        elements.playAudioBtn.classList.remove('hidden');
        audioHasBeenPlayed = false;

        elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Cliquez sur "Afficher le texte" pour voir la réponse.</div>';
        elements.responseText.dataset.showingText = 'false';
        elements.showResponseBtn.innerHTML = '👁️ Afficher le texte';

        if (data.tts_error) {
          showStatus(elements.audioStatus, `TTS-Fehler: ${data.tts_error}. Audio möglicherweise nicht verfügbar.`, 'error');
          setTimeout(() => hideStatus(elements.audioStatus), 5000);
        } else {
          showStatus(elements.audioStatus, '✅ Antwort erhalten. Audio wird geladen...', 'success');
          elements.audioPlayback.play().then(() => {
            audioHasBeenPlayed = true;
            showStatus(elements.audioStatus, '🎵 Audio wird abgespielt.', 'info');
          }).catch(err => {
            console.error('Automatische Audiowiedergabe fehlgeschlagen:', err);
            showStatus(elements.audioStatus, '⚠️ Automatische Wiedergabe fehlgeschlagen. Bitte manuell abspielen.', 'warning');
          });
        }
        showProgressStatus(4, 'Antwort empfangen');
      } else {
        const errorMsg = data.error || 'Unbekannter Fehler';
        showStatus(elements.globalStatus, `❌ Fehler vom Server: ${errorMsg}`, 'error');
        elements.responseText.innerText = data.response || "Es gab ein Problem bei der Verarbeitung Ihrer Anfrage.";
        showProgressStatus(4, 'Fehler bei der Anfrage');
      }
    } catch (error) {
      console.error('Fetch-Fehler:', error);
      showStatus(elements.globalStatus, '❌ Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung.', 'error');
      elements.responseText.innerText = "Ein Netzwerkfehler ist aufgetreten.";
      showProgressStatus(4, 'Netzwerkfehler');
    } finally {
      if (elements.userText.dataset.isPlaceholder !== 'true' && recordedAudioBlob === null) {
          elements.userText.innerText = '';
      }
      recordedAudioBlob = null;
      elements.userAudio.src = '';
      elements.userAudioSection.classList.add('hidden');
      elements.useSTTBtn.classList.add('hidden');
      setTimeout(() => hideStatus(elements.globalStatus), 5000);
    }
  });

  elements.newConvBtn?.addEventListener('click', resetUI);

  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse) {
      const isTextVisible = elements.responseText?.dataset.showingText === 'true';
      
      if (isTextVisible) {
        showProgressStatus(4, '✅ Texte masqué. Cliquez pour réafficher.');
        elements.showResponseBtn.innerHTML = '👁️ Afficher le texte';
        elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Cliquez sur "Afficher le texte" um die Antwort zu sehen.</div>';
        elements.responseText.dataset.showingText = 'false';
      } else {
        if (elements.responseText) {
          elements.responseText.innerHTML = currentResponse;
          elements.responseText.dataset.showingText = 'true';
        }
        elements.showResponseBtn.innerHTML = '👁️ Masquer le texte';
      }
    } else {
        showStatus(elements.globalStatus, '⚠️ Aucune réponse à afficher pour le moment.', 'error');
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

  elements.audioPlayback?.addEventListener('ended', () => {
    audioHasBeenPlayed = true;
    showStatus(elements.audioStatus, 'Audio-Wiedergabe beendet.', 'info');
    setTimeout(() => hideStatus(elements.audioStatus), 2000);
  });


  // Initialize
  resetUI(); 
  console.log('FR-AI-Tutor Frontend initialized...');
});