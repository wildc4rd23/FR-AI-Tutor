// script.js
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
  let recognition;
  let recordedAudioBlob = null;
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // === Sprach­erkennung vorbereiten ===
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      elements.userText.innerText = transcript;
      elements.userText.classList.remove('placeholder');
      elements.userText.dataset.isPlaceholder = 'false';
      showStatus(elements.globalStatus, '✅ Transkription erfolgreich!', 'success');
    };

    recognition.onerror = (event) => {
      showStatus(elements.globalStatus, `⚠️ Fehler: ${event.error}`, 'error');
    };

    recognition.onend = () => {
      hideStatus(elements.recordingStatus);
    };
  } else {
    console.warn('SpeechRecognition API nicht verfügbar.');
    if (elements.useSTTBtn) elements.useSTTBtn.classList.add('hidden');
    showStatus(elements.globalStatus, '⚠️ Spracherkennung nicht unterstützt. Bitte Text manuell eingeben.', 'warning');
  }

  function showStatus(el, msg, type = 'info') {
    if (!el) return;
    el.innerText = msg;
    el.className = `status-message ${type}`;
    el.classList.remove('hidden');
  }

  function hideStatus(el) {
    if (el) el.classList.add('hidden');
  }

  function showProgressStatus(step, msg) {
    const steps = 4;
    let bar = document.getElementById('progressBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'progressBar';
      bar.style.cssText = 'position:fixed;bottom:0;left:0;height:4px;background:#4CAF50;width:0%;transition:width 0.3s;';
      document.body.appendChild(bar);
    }
    bar.style.width = `${(step / steps) * 100}%`;
    showStatus(elements.globalStatus, msg, 'info');
    if (step === steps) setTimeout(() => hideStatus(elements.globalStatus), 2000);
  }

  function resetUI() {
    elements.startSection.classList.remove('hidden');
    elements.conversationSection.classList.add('hidden');
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
    elements.useSTTBtn.classList.add('hidden');
    elements.showResponseBtn.classList.add('hidden');
    elements.playAudioBtn.classList.add('hidden');
    elements.userText.innerText = placeholderText;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';
    currentUserId = currentUserId || `user_${Date.now()}`;
    showProgressStatus(0, '📌 Wählen Sie ein Thema oder starten Sie direkt.');
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
      this.innerText = placeholderText;
      this.classList.add('placeholder');
      this.dataset.isPlaceholder = 'true';
    }
  });

  elements.startBtn?.addEventListener('click', async () => {
    const scenario = elements.scenarioSelect?.value || 'conversation libre';
    elements.startSection.classList.add('hidden');
    elements.conversationSection.classList.remove('hidden');
    elements.userText.innerText = placeholderText;
    elements.userText.classList.add('placeholder');
    elements.userText.dataset.isPlaceholder = 'true';
    showProgressStatus(1, '🧠 LLM wird vorbereitet...');

    if (scenario !== 'libre') {
      const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${scenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression.`;

      const response = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: intro, user_id: currentUserId })
      });

      const data = await response.json();
      currentResponse = data.response;

      if (data.audio_url) {
        elements.audioPlayback.src = data.audio_url;
        elements.audioPlayback.classList.remove('hidden');
        elements.playAudioBtn?.classList.remove('hidden');
        showProgressStatus(4, '✅ Audio bereit. Klicken Sie auf "Abspielen".');
      } else {
        elements.responseText.innerText = currentResponse;
        elements.showResponseBtn?.classList.remove('hidden');
        showStatus(elements.audioStatus, '⚠️ Keine Audioantwort erhalten.', 'warning');
      }
    } else {
      showStatus(elements.globalStatus, '🎤 Thema frei gewählt. Aufnahme oder Eingabe starten.', 'info');
    }
  });

  elements.recordBtn?.addEventListener('click', async () => {
    showProgressStatus(2, '🎙️ Aufnahme läuft...');
    audioChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(recordedAudioBlob);
      elements.userAudio.src = url;
      elements.userAudioSection.classList.remove('hidden');
      elements.useSTTBtn?.classList.remove('hidden');
    };
    mediaRecorder.start();
    if (recognition) recognition.start();
    elements.recordBtn.classList.add('hidden');
    elements.stopBtn.classList.remove('hidden');
  });

  elements.stopBtn?.addEventListener('click', () => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
      elements.stopBtn.classList.add('hidden');
      elements.recordBtn.classList.remove('hidden');
    }
    if (recognition) recognition.stop();
  });

  elements.useSTTBtn?.addEventListener('click', () => {
    if (recognition && recordedAudioBlob) {
      recognition.start();
      showStatus(elements.recordingStatus, '🎤 STT wird durchgeführt...', 'info');
    }
  });

  elements.sendBtn?.addEventListener('click', async () => {
    let text = elements.userText.innerText.trim();
    if (elements.userText.dataset.isPlaceholder === 'true') text = '';

    if (!text) {
      showStatus(elements.globalStatus, '⚠️ Bitte Text eingeben oder Audio aufnehmen.', 'warning');
      return;
    }

    showProgressStatus(3, '📨 Antwort wird angefordert...');

    const response = await fetch('/api/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, user_id: currentUserId })
    });

    const data = await response.json();
    currentResponse = data.response;

    if (data.audio_url) {
      elements.audioPlayback.src = data.audio_url;
      elements.audioPlayback.classList.remove('hidden');
      elements.playAudioBtn?.classList.remove('hidden');
    } else {
      elements.responseText.innerText = currentResponse;
      elements.showResponseBtn?.classList.remove('hidden');
    }

    showProgressStatus(4, '✅ Antwort bereit.');
  });

  elements.showResponseBtn?.addEventListener('click', () => {
    if (currentResponse) {
      elements.responseText.innerText = currentResponse;
      elements.responseText.dataset.showingText = 'true';
      elements.showResponseBtn.classList.add('hidden');
    }
  });

  elements.playAudioBtn?.addEventListener('click', () => {
    elements.audioPlayback?.play();
    elements.showResponseBtn?.classList.remove('hidden');
  });

  elements.newConvBtn?.addEventListener('click', resetUI);

  resetUI();
});
