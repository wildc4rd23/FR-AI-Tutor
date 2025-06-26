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

          mediaRecorder.start(100); // Collect data every 100ms
          
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

      // Send Message Function
      async function sendMessage() {
        const text = elements.userText?.innerText.trim();
        
        if (!text || text === 'Tapez votre message ici ou utilisez l\'enregistrement...') {
          showStatus(elements.globalStatus, '⚠️ Veuillez entrer un message', 'error');
          setTimeout(() => hideStatus(elements.globalStatus), 3000);
          return;
        }

        if (elements.responseText) {
          elements.responseText.innerHTML = '<div class="status-message status-loading">🤔 L\'assistant réfléchit...</div>';
        }

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

          if (elements.responseText) {
            elements.responseText.innerHTML = data.response;
          }
          
          // Audio verarbeiten
          if (data.audio_url && elements.audioPlaybook) {
            elements.audioPlaybook.src = data.audio_url;
            elements.playAudioBtn?.classList.remove('hidden');
          }
          
          if (data.tts_error) {
            console.warn('TTS Error:', data.tts_error);
            showStatus(elements.audioStatus, '⚠️ Audio non disponible', 'error');
          }
          
          // Reset user input
          if (elements.userText) {
            elements.userText.innerHTML = 'Tapez votre message ici ou utilisez l\'enregistrement...';
          }
          
          // Reset audio
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
          if (elements.responseText) {
            elements.responseText.innerHTML = '<div class="status-message status-loading">🤔 L\'assistant prépare la conversation...</div>';
          }
          
          const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${scenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression. Commence par me poser une question ou présenter une situation pour démarrer notre conversation.`;

          try {
            const res = await fetch('/api/respond', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: intro, user_id: 'intro_' + Date.now() })
            });

            const data = await res.json();
            if (elements.responseText) {
              elements.responseText.innerHTML = data.response;
            }
            
            if (data.audio_url && elements.audioPlayback) {
              elements.audioPlayback.src = data.audio_url;
              elements.playAudioBtn?.classList.remove('hidden');
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

      elements.showResponseBtn?.addEventListener('click', () => {
        const isHidden = elements.responseText?.style.display === 'none';
        if (elements.responseText) {
          elements.responseText.style.display = isHidden ? 'block' : 'none';
          elements.showResponseBtn.textContent = isHidden ? '👁️ Masquer' : '👁️ Afficher';
        }
      });

      elements.playAudioBtn?.addEventListener('click', () => {
        if (elements.audioPlayback?.src) {
          elements.audioPlayback.play();
        }
      });

      // Initialize
      resetUI();
      console.log('FR-AI-Tutor Frontend initialized');
    });