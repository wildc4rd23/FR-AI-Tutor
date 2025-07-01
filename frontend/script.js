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
    playAudioBtn: document.getElementById('playAudioBtn'), // This button will now be more of a replay button
    
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
  let currentResponse = null; // Store response for later display
  let audioHasBeenPlayed = false; // Track if audio was played

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

  // GEÄNDERT: Neue Funktion zur Anzeige des Fortschritts mit visuellem Indikator
  function showProgressStatus(step, message) {
    const totalSteps = 4; // Example: 0-Init, 1-Recording, 2-Sending, 3-STT, 4-Ready
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

    // Optional: Visueller Hinweis im Status
    let statusIcon = '';
    if (step === 0) statusIcon = '⚙️'; // Initialisierung
    else if (step === 1) statusIcon = '🎤'; // Aufnahme
    else if (step === 2) statusIcon = '📤'; // Senden
    else if (step === 3) statusIcon = '💬'; // Transkription
    else if (step === 4) statusIcon = '✅'; // Bereit / Fertig

    showStatus(elements.globalStatus, `${statusIcon} ${message}`, 'info');
    
    if (step >= totalSteps) { // Fortschrittsleiste nach Abschluss oder Fehler ausblenden
        setTimeout(() => {
            if (progressBar) progressBar.style.width = '0%';
            hideStatus(elements.globalStatus); // Versteckt auch den GlobalStatus
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
    elements.recordBtn.classList.remove('hidden');
    elements.stopBtn.classList.add('hidden');
    elements.useSTTBtn.classList.add('hidden');
    elements.showResponseBtn.classList.add('hidden');
    elements.playAudioBtn.classList.add('hidden');
    elements.startSection.classList.add('hidden');
    elements.conversationSection.classList.remove('hidden');
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    currentUserId = currentUserId || generateUserId(); // Behalte ID, wenn bereits vorhanden

    // GEÄNDERT: Platzhaltertext für userText setzen
    const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";
    elements.userText.innerText = placeholderText;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';

    showProgressStatus(4, 'Bereit für die Konversation');
  }

  // GEÄNDERT: Event Listener für userText (contenteditable placeholder)
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
    resetUI();
  });

  elements.recordBtn?.addEventListener('click', async () => {
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    showProgressStatus(1, '🔴 Aufnahme läuft...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      recordedAudioBlob = null; // Clear previous recording

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(recordedAudioBlob);
        elements.userAudio.src = audioUrl;
        elements.userAudioSection.classList.remove('hidden'); // Show the audio player

        // Stop stream tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        showProgressStatus(4, 'Aufnahme beendet. Bereit.');
      };

      mediaRecorder.start();
      elements.recordBtn.classList.add('hidden');
      elements.stopBtn.classList.remove('hidden');
      elements.useSTTBtn.classList.add('hidden'); // Hide STT button during recording
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
      elements.stopBtn.classList.add('hidden');
      elements.recordBtn.classList.remove('hidden');
      elements.useSTTBtn.classList.remove('hidden'); // Show STT button after recording stops
    }
  });

  elements.useSTTBtn?.addEventListener('click', async () => {
    if (recordedAudioBlob) {
      hideStatus(elements.globalStatus);
      showProgressStatus(3, '⏳ Transkription läuft...');
      try {
        const formData = new FormData();
        formData.append('audio', recordedAudioBlob, 'recording.wav');

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (response.ok) {
          elements.userText.innerText = data.transcript;
          // GEÄNDERT: Placeholder-Status entfernen, da jetzt echter Text vorhanden ist
          elements.userText.classList.remove('placeholder');
          elements.userText.dataset.isPlaceholder = 'false';

          showStatus(elements.globalStatus, '✅ Transkription erfolgreich!', 'success');
        } else {
          showStatus(elements.globalStatus, `⚠️ Transkriptionsfehler: ${data.error}`, 'error');
        }
      } catch (error) {
        console.error('STT-Fehler:', error);
        showStatus(elements.globalStatus, '❌ STT-Verbindungsfehler.', 'error');
      } finally {
        setTimeout(() => hideStatus(elements.globalStatus), 3000);
        showProgressStatus(4, 'Bereit für die Konversation');
      }
    } else {
      showStatus(elements.globalStatus, '⚠️ Keine Audioaufnahme zum Transkribieren.', 'warning');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

  elements.sendBtn?.addEventListener('click', async () => {
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    showProgressStatus(0, '⏳ Sende Nachricht...');

    // GEÄNDERT: Den aktuellen Text aus dem bearbeitbaren Div holen
    let userText = elements.userText.innerText.trim();
    // GEÄNDERT: Wenn der Text der Platzhalter ist, behandeln wir ihn als leer
    if (elements.userText.dataset.isPlaceholder === 'true') {
        userText = '';
    }

    // GEÄNDERT: Wenn kein Text vorhanden ist, aber eine Audioaufnahme existiert,
    // versuchen wir zuerst, die Audioaufnahme zu transkribieren.
    if (!userText && recordedAudioBlob) {
      showProgressStatus(3, '⏳ Keine Textnachricht gefunden. Transkription des Audios läuft automatisch...');
      try {
        const formData = new FormData();
        formData.append('audio', recordedAudioBlob, 'recording.wav');

        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (response.ok && data.transcript) {
          elements.userText.innerText = data.transcript; // userText mit Transkription füllen
          userText = data.transcript; // Update userText für den aktuellen Sendevorgang
          // GEÄNDERT: Placeholder-Status entfernen, da jetzt echter Text vorhanden ist
          elements.userText.classList.remove('placeholder');
          elements.userText.dataset.isPlaceholder = 'false';

          showStatus(elements.globalStatus, '✅ Audio transkribiert. Nachricht wird gesendet.', 'success');
        } else {
          showStatus(elements.globalStatus, `⚠️ Transkriptionsfehler: ${data.error || 'Unbekannt'}. Nachricht kann nicht gesendet werden.`, 'error');
          setTimeout(() => hideStatus(elements.globalStatus), 3000);
          showProgressStatus(4, 'Bereit für die Konversation');
          return; // Stoppen, wenn Transkription fehlschlägt oder leer ist
        }
      } catch (error) {
        console.error('STT-Fehler beim automatischen Senden:', error);
        showStatus(elements.globalStatus, '❌ STT-Verbindungsfehler beim automatischen Senden.', 'error');
        setTimeout(() => hideStatus(elements.globalStatus), 3000);
        showProgressStatus(4, 'Bereit für die Konversation');
        return; // Stoppen, wenn Verbindungsfehler auftritt
      }
    }

    // Nach potenzieller Transkription erneut prüfen, ob userText leer ist
    if (!userText) {
      showStatus(elements.globalStatus, '⚠️ Bitte geben Sie Text ein oder nehmen Sie Audio auf, das transkribiert werden kann.', 'warning');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      showProgressStatus(4, 'Bereit für die Konversation');
      return;
    }

    // GEÄNDERT: Fortschrittsanzeige auf "Nachricht senden" setzen, nachdem Text feststeht
    showProgressStatus(2, '📤 Nachricht senden...');

    try {
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
        audioHasBeenPlayed = false; // Reset for new audio

        elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Cliquez sur "Afficher le texte" pour voir la réponse.</div>'; // Placeholder
        elements.responseText.dataset.showingText = 'false';
        elements.showResponseBtn.innerHTML = '👁️ Afficher le texte';

        if (data.tts_error) {
          showStatus(elements.audioStatus, `TTS-Fehler: ${data.tts_error}. Audio möglicherweise nicht verfügbar.`, 'error');
          setTimeout(() => hideStatus(elements.audioStatus), 5000);
        } else {
          showStatus(elements.audioStatus, '✅ Antwort erhalten. Audio wird geladen...', 'success');
          // Start playing audio automatically
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
      // Cleanup for next message
      // elements.userText.innerText = ''; // Clear input after sending
      // GEÄNDERT: userText nur leeren, wenn er nicht von STT gefüllt wurde und nicht der Platzhalter ist
      if (elements.userText.dataset.isPlaceholder !== 'true' && recordedAudioBlob === null) {
          elements.userText.innerText = '';
      }
      recordedAudioBlob = null;
      elements.userAudio.src = '';
      elements.userAudioSection.classList.add('hidden');
      elements.useSTTBtn.classList.add('hidden');
      setTimeout(() => hideStatus(elements.globalStatus), 5000); // Hide global status after a while
    }
  });

  elements.newConvBtn?.addEventListener('click', resetUI);

  // Updated Show Response Button - only shows text after audio has been played
  elements.showResponseBtn?.addEventListener('click', () => {
    // GEÄNDERT: Nur prüfen, ob currentResponse existiert. Die Audio-Wiedergabe-Regel
    // kann in der UI-Logik lockerer sein, aber der Button sollte immer eine Funktion haben.
    if (currentResponse) {
      const isTextVisible = elements.responseText?.dataset.showingText === 'true';
      
      if (isTextVisible) {
        // Hide text, show progress status again
        showProgressStatus(4, '✅ Texte masqué. Cliquez pour réafficher.');
        elements.showResponseBtn.innerHTML = '👁️ Afficher le texte';
        // GEÄNDERT: Zeige den Platzhaltertext für die Antwort an, wenn der Text ausgeblendet ist
        elements.responseText.innerHTML = '<div style="text-align: center; margin-top: 8px; font-weight: 500;">Cliquez sur "Afficher le texte" um die Antwort zu sehen.</div>';
        elements.responseText.dataset.showingText = 'false';
      } else {
        // Show text
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

  // Play Audio Button (now primarily for replay)
  elements.playAudioBtn?.addEventListener('click', () => {
    if (elements.audioPlayback?.src) {
      elements.audioPlayback.play().catch(err => {
        console.error('Audio play failed:', err);
        showStatus(elements.audioStatus, '⚠️ Impossible de lire l\'audio', 'error');
      });
    }
  });

  // Event Listener für Audio Playback Ended
  elements.audioPlayback?.addEventListener('ended', () => {
    audioHasBeenPlayed = true;
    showStatus(elements.audioStatus, 'Audio-Wiedergabe beendet.', 'info');
    setTimeout(() => hideStatus(elements.audioStatus), 2000);
  });


  // Initialize
  resetUI();
  console.log('FR-AI-Tutor Frontend initialized...');
});