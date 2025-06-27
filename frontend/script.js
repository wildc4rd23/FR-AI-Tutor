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
  let currentResponse = null; // Store response for later display
  let audioHasBeenPlayed = false; // Track if audio was played

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
    }
  }

  function resetUI() {
    elements.startSection?.classList.remove('hidden');
    elements.conversationSection?.classList.add('hidden');
    
    if (elements.userText) {
      elements.userText.innerHTML = 'Tapez votre message ici ou utilisez l\'enregistrement...';
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
    
    hideStatus(elements.globalStatus);
    hideStatus(elements.audioStatus);
    hideStatus(elements.recordingStatus);
  }

  // Audio Recording Functions
  async function startRecording() {
    try {
      audioChunks = [];
      showStatus(elements.recordingStatus, '🎙️ Demande d\'accès au microphone...', 'loading');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });
      
      // Prüfe MediaRecorder Support
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        console.warn('audio/webm not supported, using default');
      }
      
      const options = {};
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
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
        
        showStatus(elements.recordingStatus, '✅ Enregistrement terminé! Vous pouvez maintenant utiliser la reconnaissance vocale.', 'success');
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        showStatus(elements.recordingStatus, '⚠️ Erreur lors de l\'enregistrement', 'error');
      };

      mediaRecorder.start(100);
      
      elements.recordBtn.disabled = true;
      elements.recordBtn.innerHTML = '🔴 Enregistrement...';
      elements.recordBtn.classList.add('recording');
      elements.stopBtn?.classList.remove('hidden');
      
      showStatus(elements.recordingStatus, '🎙️ Enregistrement en cours... Parlez maintenant!', 'success');
      
    } catch (err) {
      console.error('Recording error:', err);
      showStatus(elements.recordingStatus, '⚠️ Erreur microphone: ' + err.message, 'error');
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

  // STT Function
  async function processSTT() {
    if (!recordedAudioBlob) {
      showStatus(elements.recordingStatus, '⚠️ Aucun enregistrement disponible', 'error');
      return;
    }

    showStatus(elements.recordingStatus, '🔄 Transcription en cours...', 'loading');

    try {
      const formData = new FormData();
      formData.append('audio', recordedAudioBlob, 'recording.wav');

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

      // Text in editierbares Feld einfügen
      if (elements.userText && data.text) {
        elements.userText.innerHTML = data.text;
      }
      
      currentUserId = data.user_id;
      
      showStatus(elements.recordingStatus, '✅ Transcription terminée! Vous pouvez maintenant modifier le texte.', 'success');
      setTimeout(() => hideStatus(elements.recordingStatus), 3000);
      
    } catch (err) {
      console.error('STT error:', err);
      showStatus(elements.recordingStatus, '⚠️ Erreur de transcription: ' + err.message, 'error');
    }
  }

  // Send Message Function with Progress Workflow
  async function sendMessage() {
    const text = elements.userText?.innerText.trim();
    
    if (!text || text === 'Tapez votre message ici ou utilisez l\'enregistrement...') {
      showStatus(elements.globalStatus, '⚠️ Veuillez entrer un message', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
      return;
    }

    // Reset state
    audioHasBeenPlayed = false;
    currentResponse = null;
    elements.playAudioBtn?.classList.add('hidden');
    elements.showResponseBtn?.classList.add('hidden');

    // Step 1: Show processing started
    showProgressStatus(1, '🤔 L\'assistant réfléchit...');

    try {
      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          user_id: currentUserId || 'user_' + Date.now()
        })
      });

      if (!response.ok) {
        throw new Error(`Response failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Step 2: LLM response received
      currentResponse = data.response;
      showProgressStatus(2, '📝 Réponse reçue, génération de l\'audio...');

      // Step 3: Check if audio is available
      if (data.audio_url) {
        showProgressStatus(3, '🎵 Audio généré, préparation de la lecture...');
        
        // Set up audio
        if (elements.audioPlayback) {
          elements.audioPlayback.src = data.audio_url;
          elements.audioPlayback.classList.remove('hidden');
          
          // Wait for audio to be loadable
          elements.audioPlayback.addEventListener('canplay', function() {
            // Step 4: Audio ready to play
            showProgressStatus(4, '🔊 Audio prêt! Cliquez sur "Écouter" pour commencer.');
            elements.playAudioBtn?.classList.remove('hidden');
          }, { once: true });

          // Track when audio finishes playing
          elements.audioPlayback.addEventListener('ended', function() {
            audioHasBeenPlayed = true;
            elements.showResponseBtn?.classList.remove('hidden');
            showProgressStatus(4, '✅ Lecture terminée! Vous pouvez maintenant voir le texte.');
          }, { once: true });

          // Handle audio load errors
          elements.audioPlayback.addEventListener('error', function() {
            console.warn('Audio load failed, showing text immediately');
            elements.showResponseBtn?.classList.remove('hidden');
            if (elements.responseText) {
              elements.responseText.innerHTML = currentResponse;
            }
            showStatus(elements.audioStatus, '⚠️ Problème audio - texte affiché directement', 'error');
          }, { once: true });
        }
      } else {
        // No audio available, show text immediately
        console.warn('No audio URL received, showing text immediately');
         if (elements.responseText) {
            elements.responseText.innerHTML = currentResponse;
            elements.responseText.dataset.showingText = 'true';  // ✅ Text ist bereits sichtbar
          }
          elements.showResponseBtn?.classList.add('hidden');      // ✅ Button NICHT anzeigen
          audioHasBeenPlayed = true;                              // ✅ Flag setzen

          if (data.tts_error) {
            showStatus(elements.audioStatus, '⚠️ Audio non disponible: ' + data.tts_error, 'error');
          }
        }
      
      // Reset user input
      if (elements.userText) {
        elements.userText.innerHTML = 'Tapez votre message ici ou utilisez l\'enregistrement...';
      }
      
      // Reset audio recording
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

  // Event Listeners
  elements.recordBtn?.addEventListener('click', startRecording);
  elements.stopBtn?.addEventListener('click', stopRecording);
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
          body: JSON.stringify({ text: intro, user_id: 'intro_' + Date.now() })
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
            elements.showResponseBtn?.classList.remove('hidden');
            showProgressStatus(4, '✅ Lecture terminée! Vous pouvez maintenant voir le texte.');
          }, { once: true });
        } else {
          if (elements.responseText) {
            elements.responseText.innerHTML = currentResponse;
            elements.responseText.dataset.showingText = 'true';  // ✅ Sichtbar markieren
          }
          elements.showResponseBtn?.classList.add('hidden');      // ✅ Nicht anzeigen
          audioHasBeenPlayed = true;                              // ✅ Sofort anzeigen erlaubt
        }
        
      } catch (err) {
        console.error('Error starting conversation:', err);
        if (elements.responseText) {
          elements.responseText.innerHTML = `<div class="status-message status-error">⚠️ Erreur: ${err.message}</div>`;
        }
      }
    } else {
      if (elements.responseText) {
        elements.responseText.innerHTML = "🎯 Sujet libre sélectionné. Tapez votre message ou enregistrez-vous!";
      }
    }
  });

  elements.newConvBtn?.addEventListener('click', resetUI);

  // Updated Show Response Button - only shows text after audio has been played
  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse && audioHasBeenPlayed) {
      const isTextVisible = elements.responseText?.dataset.showingText === 'true';
      
      if (isTextVisible) {
        // Hide text, show progress status again
        showProgressStatus(4, '✅ Texte masqué. Cliquez pour réafficher.');
        elements.showResponseBtn.innerHTML = '👁️ Afficher le texte';
        elements.responseText.dataset.showingText = 'false';
      } else {
        // Show text
        if (elements.responseText) {
          elements.responseText.innerHTML = currentResponse;
          elements.responseText.dataset.showingText = 'true';
        }
        elements.showResponseBtn.innerHTML = '👁️ Masquer le texte';
      }
    } else if (!audioHasBeenPlayed) {
      showStatus(elements.globalStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
      setTimeout(() => hideStatus(elements.globalStatus), 3000);
    }
  });

  // Play Audio Button
  elements.playAudioBtn?.addEventListener('click', () => {
    if (elements.audioPlayback?.src) {
      elements.audioPlayback.play().catch(err => {
        console.error('Audio play failed:', err);
        showStatus(elements.audioStatus, '⚠️ Impossible de lire l\'audio', 'error');
      });
    }
  });

  // Initialize
  resetUI();
  console.log('FR-AI-Tutor Frontend initialized with progress workflow');
});