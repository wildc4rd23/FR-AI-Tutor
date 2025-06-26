const recordBtn = document.getElementById('record');
const stopBtn = document.getElementById('stop');
const startBtn = document.getElementById('startConversation');
const newConvBtn = document.getElementById('newConversation');
const showResponseBtn = document.getElementById('showResponseBtn');

const recognizedText = document.getElementById('recognizedText');
const responseText = document.getElementById('responseText');
const audioPlayback = document.getElementById('audioPlayback');
const userAudio = document.getElementById('userAudio');
const responseContainer = document.getElementById('responseContainer');

const startSection = document.getElementById('startSection');
const conversationSection = document.getElementById('conversationSection');
const scenarioSelect = document.getElementById('scenario');

let mediaRecorder;
let audioChunks = [];
let currentUserId = null;

// Utility functions
function showLoading(element, message = "Chargement...") {
  element.innerHTML = `<div style="color: #666; font-style: italic;">${message}</div>`;
}

function showError(element, message) {
  element.innerHTML = `<div style="color: #d32f2f; font-weight: bold;">⚠️ ${message}</div>`;
}

function resetUI() {
  startSection.classList.remove('hidden');
  conversationSection.classList.add('hidden');
  responseContainer.classList.add('hidden');
  recognizedText.textContent = '...';
  responseText.textContent = '...';
  audioPlayback.src = '';
  userAudio.src = '';
  currentUserId = null;
  
  // Reset button states
  recordBtn.disabled = false;
  stopBtn.classList.add('hidden');
  showResponseBtn.textContent = 'Afficher la réponse';
}

// Enhanced audio playback with better error handling
function playAudioWithFallback(audioElement, audioUrl) {
  if (!audioUrl) {
    console.warn('Keine Audio-URL verfügbar');
    return;
  }
  
  audioElement.src = audioUrl;
  
  // Add error handling for audio playback
  audioElement.onerror = function(e) {
    console.error('Audio playback error:', e);
    showError(responseText, 'Erreur lors de la lecture audio. Le texte est disponible ci-dessus.');
  };
  
  audioElement.oncanplaythrough = function() {
    console.log('Audio ready to play');
  };
  
  // Auto-play with user gesture check
  const playPromise = audioElement.play();
  
  if (playPromise !== undefined) {
    playPromise.then(() => {
      console.log('Audio started playing');
    }).catch(error => {
      console.warn('Auto-play prevented:', error);
      // User interaction required for audio playback
    });
  }
}

startBtn.onclick = async () => {
  const scenario = scenarioSelect.value;

  if (!scenario) {
    alert("Veuillez choisir un thème.");
    return;
  }

  startSection.classList.add('hidden');
  conversationSection.classList.remove('hidden');

  if (scenario !== "libre") {
    // Show loading state
    showLoading(responseText, "L'assistant prépare la conversation...");
    
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

      responseText.innerHTML = `<div style="line-height: 1.6;">${data.response}</div>`;
      
      // Handle TTS error gracefully
      if (data.tts_error) {
        console.warn('TTS Error:', data.tts_error);
        responseText.innerHTML += `<div style="color: #ff9800; font-size: 0.9em; margin-top: 10px;">⚠️ Audio non disponible: ${data.tts_error}</div>`;
      }
      
      if (data.audio_url) {
        audioPlayback.src = data.audio_url;
        audioPlayback.type = 'audio/mpeg';
      }
      
    } catch (err) {
      console.error('Error starting conversation:', err);
      showError(responseText, `Erreur lors de la récupération de la réponse: ${err.message}`);
    }
  }
};

showResponseBtn.onclick = () => {
  const isHidden = responseContainer.classList.contains('hidden');
  
  if (isHidden) {
    responseContainer.classList.remove('hidden');
    showResponseBtn.textContent = 'Masquer la réponse';
    
    // Play audio if available
    if (audioPlayback.src) {
      playAudioWithFallback(audioPlayback, audioPlayback.src);
    }
  } else {
    responseContainer.classList.add('hidden');
    showResponseBtn.textContent = 'Afficher la réponse';
    audioPlayback.pause();
    audioPlayback.currentTime = 0;
  }
};

newConvBtn.onclick = () => {
  // Stop any playing audio
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
    
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks to release microphone
      stream.getTracks().forEach(track => track.stop());
      
      if (audioChunks.length === 0) {
        showError(recognizedText, 'Aucun audio enregistré');
        return;
      }
      
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      const userAudioURL = URL.createObjectURL(audioBlob);
      userAudio.src = userAudioURL;

      // Show loading states
      showLoading(recognizedText, "Transcription en cours...");
      showLoading(responseText, "L'assistant réfléchit...");

      try {
        // Transcription
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

        recognizedText.innerHTML = `<div style="background: #e8f5e8; padding: 10px; border-radius: 5px; border-left: 4px solid #4caf50;">"${transcribeData.text}"</div>`;
        currentUserId = transcribeData.user_id;

        // Get AI response
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

        responseText.innerHTML = `<div style="line-height: 1.6;">${respondData.response}</div>`;
        
        // Handle TTS
        if (respondData.audio_url) {
          audioPlayback.src = respondData.audio_url;
          audioPlayback.type = 'audio/mpeg';
        }
        
        if (respondData.tts_error) {
          console.warn('TTS Error:', respondData.tts_error);
          responseText.innerHTML += `<div style="color: #ff9800; font-size: 0.9em; margin-top: 10px;">⚠️ Audio non disponible</div>`;
        }
        
        // Hide response until user clicks to reveal
        responseContainer.classList.add('hidden');
        showResponseBtn.textContent = 'Afficher la réponse';
        
      } catch (err) {
        console.error('Processing error:', err);
        showError(recognizedText, 'Erreur lors du traitement de l\'audio');
        showError(responseText, `Une erreur est survenue: ${err.message}`);
      }
    };

    mediaRecorder.start();
    recordBtn.disabled = true;
    stopBtn.classList.remove('hidden');
    
    // Visual feedback for recording
    recordBtn.innerHTML = '🔴 Enregistrement...';
    
  } catch (err) {
    console.error('Recording error:', err);
    alert('Erreur d\'accès au microphone. Veuillez autoriser l\'accès et réessayer.');
  }
};

stopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordBtn.disabled = false;
    recordBtn.innerHTML = '🎙️ Commencer l\'enregistrement';
    stopBtn.classList.add('hidden');
  }
};

// Initialize
resetUI();