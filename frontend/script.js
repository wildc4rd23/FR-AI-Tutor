    // Global variables
    const recordBtn = document.getElementById('record');
    const stopBtn = document.getElementById('stop');
    const startBtn = document.getElementById('startConversation');
    const newConvBtn = document.getElementById('newConversation');
    const showResponseBtn = document.getElementById('showResponseBtn');
    const playAudioBtn = document.getElementById('playAudioBtn');

    const recognizedText = document.getElementById('recognizedText');
    const responseText = document.getElementById('responseText');
    const audioPlayback = document.getElementById('audioPlayback');
    const userAudio = document.getElementById('userAudio');

    const startSection = document.getElementById('startSection');
    const conversationSection = document.getElementById('conversationSection');
    const scenarioSelect = document.getElementById('scenario');
    const globalStatus = document.getElementById('globalStatus');
    const audioStatus = document.getElementById('audioStatus');
    const recordingStatus = document.getElementById('recordingStatus');

    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');

    let mediaRecorder;
    let audioChunks = [];
    let currentUserId = null;

    // Utility functions
    function showStatus(element, message, type = 'loading') {
      element.className = `status-message status-${type}`;
      element.innerHTML = message;
      element.classList.remove('hidden');
    }

    function hideStatus(element) {
      element.classList.add('hidden');
    }

    function showGlobalStatus(message, type = 'loading') {
      showStatus(globalStatus, message, type);
    }

    function hideGlobalStatus() {
      hideStatus(globalStatus);
    }

    function activateStep(stepNumber) {
      step1.classList.toggle('active', stepNumber >= 1);
      step2.classList.toggle('active', stepNumber >= 2);
    }

    function resetUI() {
      startSection.classList.remove('hidden');
      conversationSection.classList.add('hidden');
      
      recognizedText.textContent = 'En attente d\'enregistrement...';
      responseText.textContent = '...';
      
      audioPlayback.src = '';
      audioPlayback.classList.add('hidden');
      userAudio.src = '';
      
      showResponseBtn.textContent = '👁️ Afficher la réponse';
      playAudioBtn.classList.add('hidden');
      
      currentUserId = null;
      
      // Reset button states
      recordBtn.disabled = false;
      recordBtn.innerHTML = '🎙️ Commencer l\'enregistrement';
      recordBtn.classList.remove('recording');
      stopBtn.classList.add('hidden');
      
      hideGlobalStatus();
      hideStatus(audioStatus);
      hideStatus(recordingStatus);
      
      activateStep(1);
    }

    function playAudioWithFallback(audioElement, audioUrl) {
      if (!audioUrl) {
        showStatus(audioStatus, '⚠️ Aucun audio disponible', 'error');
        return;
      }
      
      audioElement.src = audioUrl;
      audioElement.classList.remove('hidden');
      
      audioElement.onerror = function(e) {
        console.error('Audio playback error:', e);
        showStatus(audioStatus, '⚠️ Erreur lors de la lecture audio', 'error');
      };
      
      audioElement.oncanplaythrough = function() {
        hideStatus(audioStatus);
      };
      
      const playPromise = audioElement.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('Audio started playing');
        }).catch(error => {
          console.warn('Auto-play prevented:', error);
        });
      }
    }

    // Event Listeners
    startBtn.onclick = async () => {
      const scenario = scenarioSelect.value;

      if (!scenario) {
        showGlobalStatus("⚠️ Veuillez choisir un thème.", 'error');
        setTimeout(hideGlobalStatus, 3000);
        return;
      }

      startSection.classList.add('hidden');
      conversationSection.classList.remove('hidden');
      activateStep(1);

      if (scenario !== "libre") {
        responseText.innerHTML = '<div class="status-message status-loading">🤔 L\'assistant prépare la conversation...</div>';
        
        const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${scenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression. Commence par me poser une question ou présenter une situation pour démarrer notre conversation.`;

        try {
          const res = await fetch('/api/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: intro, user_id: 'intro_' + Date.now() })
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }

          const data = await res.json();

          if (data.error) {
            throw new Error(data.error);
          }

          responseText.innerHTML = data.response;
          
          if (data.tts_error) {
            console.warn('TTS Error:', data.tts_error);
            showStatus(audioStatus, '⚠️ Audio non disponible: problème technique', 'error');
          }
          
          if (data.audio_url) {
            audioPlayback.src = data.audio_url;
            audioPlayback.type = 'audio/mpeg';
            playAudioBtn.classList.remove('hidden');
          }
          
          activateStep(2);
          
        } catch (err) {
          console.error('Error starting conversation:', err);
          responseText.innerHTML = `<div class="status-message status-error">⚠️ Erreur: ${err.message}</div>`;
        }
      } else {
        responseText.innerHTML = "🎯 Sujet libre sélectionné. Commencez par vous enregistrer ci-dessous !";
        activateStep(2);
      }
    };

    showResponseBtn.onclick = () => {
      const isHidden = responseText.style.display === 'none' || !responseText.innerHTML.trim();
      
      if (responseText.innerHTML.includes('...') || isHidden) {
        responseText.style.display = 'block';
        showResponseBtn.textContent = '👁️ Masquer la réponse';
      } else {
        responseText.style.display = 'none';
        showResponseBtn.textContent = '👁️ Afficher la réponse';
        audioPlayback.pause();
        audioPlayback.currentTime = 0;
      }
    };

    playAudioBtn.onclick = () => {
      if (audioPlayback.src) {
        playAudioWithFallback(audioPlayback, audioPlayback.src);
      }
    };

    newConvBtn.onclick = () => {
      if (audioPlayback) {
        audioPlayback.pause();
        audioPlayback.currentTime = 0;
      }
      if (userAudio) {
        userAudio.pause();
        userAudio.currentTime = 0;
      }
      
      resetUI();
    };

    recordBtn.onclick = async () => {
      try {
        audioChunks = [];
        
        showStatus(recordingStatus, '🎙️ Demande d\'accès au microphone...', 'loading');
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          
          if (audioChunks.length === 0) {
            showStatus(recordingStatus, '⚠️ Aucun audio enregistré', 'error');
            return;
          }
          
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          const userAudioURL = URL.createObjectURL(audioBlob);
          userAudio.src = userAudioURL;

          recognizedText.innerHTML = '<div class="status-message status-loading">🔄 Transcription en cours...</div>';
          responseText.innerHTML = '<div class="status-message status-loading">🤔 L\'assistant réfléchit...</div>';

          try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.wav');

            const transcribeRes = await fetch('/api/transcribe', {
              method: 'POST',
              body: formData
            });

            if (!transcribeRes.ok) {
              throw new Error(`Transcription failed: ${transcribeRes.status}`);
            }

            const transcribeData = await transcribeRes.json();

            if (transcribeData.error) {
              throw new Error(transcribeData.error);
            }

            recognizedText.innerHTML = `"${transcribeData.text}"`;
            currentUserId = transcribeData.user_id;

            const respondRes = await fetch('/api/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: transcribeData.text,
                user_id: transcribeData.user_id
              })
            });

            if (!respondRes.ok) {
              throw new Error(`Response failed: ${respondRes.status}`);
            }

            const respondData = await respondRes.json();
            
            if (respondData.error) {
              throw new Error(respondData.error);
            }

            responseText.innerHTML = respondData.response;
            
            if (respondData.audio_url) {
              audioPlayback.src = respondData.audio_url;
              audioPlayback.type = 'audio/mpeg';
              playAudioBtn.classList.remove('hidden');
            }
            
            if (respondData.tts_error) {
              console.warn('TTS Error:', respondData.tts_error);
              showStatus(audioStatus, '⚠️ Audio non disponible', 'error');
            }
            
            hideStatus(recordingStatus);
            showStatus(recordingStatus, '✅ Enregistrement traité avec succès!', 'success');
            setTimeout(() => hideStatus(recordingStatus), 3000);
            
          } catch (err) {
            console.error('Processing error:', err);
            recognizedText.innerHTML = `<div class="status-message status-error">⚠️ Erreur lors du traitement</div>`;
            responseText.innerHTML = `<div class="status-message status-error">⚠️ ${err.message}</div>`;
            showStatus(recordingStatus, '⚠️ Erreur lors du traitement', 'error');
          }
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        recordBtn.innerHTML = '🔴 Enregistrement en cours...';
        recordBtn.classList.add('recording');
        stopBtn.classList.remove('hidden');
        
        showStatus(recordingStatus, '🎙️ Enregistrement en cours... Parlez maintenant!', 'success');
        
      } catch (err) {
        console.error('Recording error:', err);
        showStatus(recordingStatus, '⚠️ Erreur d\'accès au microphone. Veuillez autoriser l\'accès.', 'error');
      }
    };

    stopBtn.onclick = () => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        recordBtn.disabled = false;
        recordBtn.innerHTML = '🎙️ Commencer l\'enregistrement';
        recordBtn.classList.remove('recording');
        stopBtn.classList.add('hidden');
        
        showStatus(recordingStatus, '⏹️ Enregistrement arrêté. Traitement...', 'loading');
      }
    };

    // Initialize
    resetUI();