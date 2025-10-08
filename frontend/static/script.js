// Mobile Debug Logger
class MobileDebugger {
  constructor() {
    this.logs = [];
    this.maxLogs = 15;
    this.createDebugPanel();
  }
  
  createDebugPanel() {
    // Debug Panel erstellen
    this.panel = document.createElement('div');
    this.panel.id = 'mobileDebugPanel';
    this.panel.style.cssText = `
      position: fixed;
      bottom: 60px;
      left: 10px;
      right: 10px;
      max-height: 250px;
      background: rgba(0,0,0,0.95);
      color: #00ff00;
      font-family: monospace;
      font-size: 11px;
      padding: 10px;
      border-radius: 8px;
      overflow-y: auto;
      z-index: 9999;
      display: none;
      border: 1px solid #333;
    `;
    
    // Toggle Button
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.textContent = '🐛';
    this.toggleBtn.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      width: 45px;
      height: 45px;
      background: #ff4444;
      color: white;
      border: none;
      border-radius: 25px;
      font-size: 18px;
      z-index: 10000;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    // Clear Button
    this.clearBtn = document.createElement('button');
    this.clearBtn.textContent = '🗑️';
    this.clearBtn.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 65px;
      width: 45px;
      height: 45px;
      background: #666;
      color: white;
      border: none;
      border-radius: 25px;
      font-size: 16px;
      z-index: 10000;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    
    this.toggleBtn.addEventListener('click', () => {
      this.panel.style.display = this.panel.style.display === 'none' ? 'block' : 'none';
    });
    
    this.clearBtn.addEventListener('click', () => {
      this.clear();
    });
    
    document.body.appendChild(this.panel);
    document.body.appendChild(this.toggleBtn);
    document.body.appendChild(this.clearBtn);
  }
  
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    
    this.updatePanel();
    console.log(logEntry); // Auch normale Console
  }
  
  error(message) { this.log(message, 'ERROR'); }
  warn(message) { this.log(message, 'WARN'); }
  
  updatePanel() {
    this.panel.innerHTML = this.logs.map(log => {
      let color = '#00ff00';
      if (log.includes('ERROR')) color = '#ff4444';
      if (log.includes('WARN')) color = '#ffaa00';
      return `<div style="color: ${color}; margin-bottom: 3px; line-height: 1.2;">${log}</div>`;
    }).join('');
    
    this.panel.scrollTop = 0;
  }
  
  clear() {
    this.logs = [];
    this.updatePanel();
  }
}

// Custom Audio Player Klassen
// 👁️✖🔄▶️☰ ⛌🔴〇↺△▽◁▷ used icons
class CustomAudioPlayer {
  constructor(audioElement, containerId, progressId, handleId, timeId, volumeContainerId, volumeBarId, volumeHandleId, playButtonId) {
    this.audio = audioElement;
    this.container = document.getElementById(containerId);
    this.progressContainer = document.getElementById(progressId);
    this.progressBar = this.progressContainer?.querySelector('.progress-bar');
    this.progressHandle = document.getElementById(handleId);
    this.timeDisplay = document.getElementById(timeId);
    this.volumeContainer = document.getElementById(volumeContainerId);
    this.volumeBar = document.getElementById(volumeBarId);
    this.volumeHandle = document.getElementById(volumeHandleId);
    this.playButton = document.getElementById(playButtonId);
    
    this.isDragging = false;
    this.isVolumeDragging = false;
    
    this.init();
  }
  
  init() {
    if (!this.audio || !this.container) return;
    
    // Audio Events
    this.audio.addEventListener('loadedmetadata', () => this.updateDisplay());
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());
    this.audio.addEventListener('volumechange', () => this.updateVolume());
    
    // Progress Bar Events
    if (this.progressContainer) {
      this.progressContainer.addEventListener('mousedown', (e) => this.startProgressDrag(e));
      this.progressContainer.addEventListener('click', (e) => this.seekTo(e));
    }
    
    if (this.progressHandle) {
      this.progressHandle.addEventListener('mousedown', (e) => this.startProgressDrag(e));
    }
    
    // Volume Events  
    if (this.volumeContainer) {
      this.volumeContainer.addEventListener('mousedown', (e) => this.startVolumeDrag(e));
      this.volumeContainer.addEventListener('click', (e) => this.setVolume(e));
    }
    
    if (this.volumeHandle) {
      this.volumeHandle.addEventListener('mousedown', (e) => this.startVolumeDrag(e));
    }
    
    // Global mouse events
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseUp());
    
    // Touch Events für Mobile
    if (this.progressContainer) {
      this.progressContainer.addEventListener('touchstart', (e) => this.startProgressDrag(e), { passive: false });
    }
    if (this.volumeContainer) {
      this.volumeContainer.addEventListener('touchstart', (e) => this.startVolumeDrag(e), { passive: false });
    }
    document.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    document.addEventListener('touchend', () => this.onMouseUp());
    
    // Play Button
    if (this.playButton) {
      this.playButton.addEventListener('click', () => this.togglePlayPause());
    }
    
    // Initial volume
    this.audio.volume = 1.0;
    this.updateVolume();
  }
  
  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
    }
  }
  
  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }
  
  loadAudio(src) {
    if (this.audio && src) {
      this.audio.src = src;
      this.audio.load();
    }
  }
  
  play() {
    if (this.audio) {
      return this.audio.play();
    }
  }
  
  pause() {
    if (this.audio) {
      this.audio.pause();
    }
  }
  
  togglePlayPause() {
    if (this.audio) {
      if (this.audio.paused) {
        this.play();
      } else {
        this.pause();
      }
    }
  }
  
  startProgressDrag(e) {
    e.preventDefault();
    this.isDragging = true;
    this.seekTo(e);
  }
  
  startVolumeDrag(e) {
    e.preventDefault();
    this.isVolumeDragging = true;
    this.setVolume(e);
  }
  
  onMouseMove(e) {
    if (this.isDragging) {
      this.seekTo(e);
    }
    if (this.isVolumeDragging) {
      this.setVolume(e);
    }
  }
  
  onTouchMove(e) {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      if (this.isDragging) {
        this.seekTo(touch);
      }
      if (this.isVolumeDragging) {
        this.setVolume(touch);
      }
    }
  }
  
  onMouseUp() {
    this.isDragging = false;
    this.isVolumeDragging = false;
  }
  
  seekTo(e) {
    if (!this.progressContainer || !this.audio) return;
    
    const rect = this.progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    
    if (this.audio.duration && !isNaN(this.audio.duration) && isFinite(this.audio.duration)) {
      this.audio.currentTime = clampedPos * this.audio.duration;
    }
  }
  
  setVolume(e) {
    if (!this.volumeContainer || !this.audio) return;
    
    const rect = this.volumeContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(1, pos));
    
    this.audio.volume = clampedPos;
  }
  
  updateProgress() {
    if (!this.audio || !this.progressBar || !this.progressHandle) return;
    
    const progress = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    this.progressBar.style.width = `${progress}%`;
    this.progressHandle.style.left = `calc(${progress}% - 7px)`;
    
    this.updateTimeDisplay();
  }
  
  updateVolume() {
    if (!this.audio || !this.volumeBar || !this.volumeHandle) return;
    
    const volumePercent = this.audio.volume * 100;
    this.volumeBar.style.width = `${volumePercent}%`;
    this.volumeHandle.style.right = `calc(${100 - volumePercent}% - 5px)`;
  }
  
  updateTimeDisplay() {
    if (!this.timeDisplay || !this.audio) return;
    
    const current = this.formatTime(this.audio.currentTime || 0);
    const duration = this.formatTime(this.audio.duration || 0);
    this.timeDisplay.textContent = `${current}/${duration}`;
  }
  
  updateDisplay() {
    this.updateProgress();
    this.updateVolume();
    this.updateTimeDisplay();
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  onPlay() {
    if (this.playButton) {
      this.playButton.innerHTML = '⏸️';
      this.playButton.style.color = '#f59e0b';
    }
  }
  
  onPause() {
    if (this.playButton) {
      this.playButton.innerHTML = '▷';
      this.playButton.style.color = '#10b981';
    }
  }
  
  onEnded() {
    if (this.playButton) {
      this.playButton.innerHTML = '▷';
      this.playButton.style.color = '#10b981';
    }
  }
}

// Hauptscript mit Mobile Optimierungen
document.addEventListener('DOMContentLoaded', function() {
  // Mobile Debugger initialisieren
  const mobileDebug = new MobileDebugger();
  mobileDebug.log('Script loading started');

  const elements = {
    recordBtn: document.getElementById('record'),
    stopBtn: document.getElementById('stop'),
    sendBtn: document.getElementById('sendMessage'),
    startBtn: document.getElementById('startConversation'),
    newConvBtn: document.getElementById('newConversation'),
    showResponseBtn: document.getElementById('showResponseBtn'),
    userText: document.getElementById('userText'),
    responseText: document.getElementById('responseText'),
    llmAudioPlayback: document.getElementById('audioPlayback'),
    userAudio: document.getElementById('userAudio'),
    startSection: document.getElementById('startSection'),
    conversationSection: document.getElementById('conversationSection'),
    scenarioSelect: document.getElementById('scenario'),
    recordingStatus: document.getElementById('recordingStatus'),
    playAssistantAudio: document.getElementById('playAssistantAudio'),
    playUserAudio: document.getElementById('playUserAudio')
  };

  // Initialize Custom Audio Players
  let assistantPlayer, userPlayer;

  if (elements.llmAudioPlayback) {
    assistantPlayer = new CustomAudioPlayer(
      elements.llmAudioPlayback,
      'assistantAudioContainer',
      'assistantProgress',
      'assistantProgressHandle',
      'assistantTime',
      'assistantVolumeContainer', 
      'assistantVolumeBar',
      'assistantVolumeHandle',
      'playAssistantAudio'
    );
  }

  if (elements.userAudio) {
    userPlayer = new CustomAudioPlayer(
      elements.userAudio,
      'userAudioContainer', 
      'userProgress',
      'userProgressHandle',
      'userTime',
      'userVolumeContainer',
      'userVolumeBar', 
      'userVolumeHandle',
      'playUserAudio'
    );
  }

  // Initial UI state
  elements.stopBtn && elements.stopBtn.classList.add('hidden');
  elements.sendBtn && elements.sendBtn.classList.add('hidden');
  elements.recordBtn && elements.recordBtn.classList.add('hidden');
  elements.userAudio && elements.userAudio.classList.add('hidden');
  elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
  elements.responseText && elements.responseText.classList.add('hidden');
  elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');

  let mediaRecorder;
  let audioChunks = [];
  let recognition;
  let recordedAudioBlob = null;
  let currentAudioStream = null;
  let currentUserId = null;
  let currentResponse = null;
  let audioHasBeenPlayed = false;
  let isTextCurrentlyVisible = false;
  let isRealTimeMode = true;
  let recognitionActive = false;
  let recognitionTimeout;
  let finalTranscript = '';
  let isRecognitionRestarting = false;
  let currentScenario = 'libre';
  let autoSendAfterRecording = false;
  let isRecording = false;
  let isPaused = false;
  let isLlmAudioPlaying = false;
  let microphonePermissionGranted = false;
  let conversationHistory = [];

  const placeholderText = "Tapez votre message ici ou utilisez l'enregistrement...";

  // Mobile Detection
  const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  
  mobileDebug.log(`Platform detected: ${isAndroid ? 'Android' : isMobile ? 'iOS/Mobile' : 'Desktop'}`);

  // Speech Recognition Setup
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = !isMobile; // Mobile: less aggressive
    recognition.maxAlternatives = 1;

    mobileDebug.log(`Speech Recognition available: ${recognition.continuous ? 'continuous' : 'single'}`);

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let newFinalTranscript = '';
      
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        
        if (result.isFinal) {
          newFinalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (newFinalTranscript.trim()) {
        finalTranscript += newFinalTranscript;
        mobileDebug.log(`Speech recognized: "${newFinalTranscript.trim()}"`);
      }

      const displayText = (finalTranscript + interimTranscript).trim();
      if (elements.userText && displayText) {
        elements.userText.textContent = displayText;
        elements.userText.classList.remove('placeholder');
        elements.userText.setAttribute('data-is-placeholder', 'false');
      }

      const statusText = interimTranscript ? 
        `🎤 Écoute... "${interimTranscript}"` : 
        (newFinalTranscript ? `🎤 Transcrit: "${newFinalTranscript.trim()}"` : '🎤 En écoute...');
      showStatus(elements.recordingStatus, statusText, 'success');
    };

    recognition.onerror = (event) => {
      mobileDebug.error(`Speech recognition error: ${event.error}`);
      
      let errorMessage = '⚠️ Erreur de reconnaissance vocale';
      let shouldRestart = false;
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = '🚫 Accès au microphone refusé';
          recognitionActive = false;
          break;
        case 'no-speech':
          shouldRestart = !isMobile;
          errorMessage = null;
          break;
        case 'network':
          errorMessage = '🌐 Erreur réseau';
          shouldRestart = true;
          break;
        case 'service-not-allowed':
          errorMessage = '🚫 Service de reconnaissance vocale bloqué';
          recognitionActive = false;
          break;
        case 'aborted':
          return;
        default:
          shouldRestart = !isMobile;
          break;
      }
      
      recognitionActive = false;
      
      if (errorMessage) {
        showStatus(elements.recordingStatus, errorMessage, 'error');
      }
      
      if (shouldRestart && !isRecognitionRestarting && isRecording && !isPaused) {
        setTimeout(() => {
          if (!isRecognitionRestarting && isRecording && !isPaused) {
            startRecognition();
          }
        }, isMobile ? 2000 : 1000);
      }
    };

    recognition.onend = () => {
      recognitionActive = false;
      if (!isRecognitionRestarting && isRecording && !isPaused) {
        setTimeout(() => {
          if (!isRecognitionRestarting && !recognitionActive && isRecording && !isPaused) {
            startRecognition();
          }
        }, 500);
      }
    };

    recognition.onstart = () => {
      recognitionActive = true;
      isRecognitionRestarting = false;
    };

    function startRecognition() {
      if (isRecognitionRestarting || isPaused) {
        return;
      }

      if (recognitionActive) {
        isRecognitionRestarting = true;
        try {
          recognition.stop();
        } catch (e) {
          mobileDebug.warn(`Could not stop recognition: ${e.message}`);
        }
        
        setTimeout(() => {
          if (isRealTimeMode && isRecording && !isPaused) {
            startRecognition();
          }
        }, 1000);
        return;
      }

      try {
        isRecognitionRestarting = false;
        recognition.start();
      } catch (e) {
        mobileDebug.error(`Could not start recognition: ${e.message}`);
        recognitionActive = false;
        isRecognitionRestarting = false;
        showStatus(elements.recordingStatus, '⚠️ Impossible de démarrer la reconnaissance vocale', 'error');
      }
    }
  } else {
    mobileDebug.warn('SpeechRecognition API not available');
    showStatus(elements.recordingStatus, '⚠️ Reconnaissance vocale non supportée dans ce navigateur.', 'warning');
  }

  function stopRecognition() {
    if (recognitionActive && recognition) {
      try {
        recognition.stop();
      } catch (e) {
        mobileDebug.warn(`Could not stop recognition: ${e.message}`);
      }
    }
    recognitionActive = false;
  }

// Microphone Permission Check
async function checkMicrophonePermissions() {
  try {
    mobileDebug.log('=== CHECKING MICROPHONE PERMISSIONS ===');
    
    // Auf Mobile: Wenn bereits gecached, skip
    if (isMobile && microphonePermissionGranted) {
      mobileDebug.log('Using cached permission');
      return true;
    }
    
    // HTTPS Check
    if (location.protocol !== 'https:' && 
        !location.hostname.includes('localhost') && 
        location.hostname !== '127.0.0.1') {
      mobileDebug.error('HTTPS required');
      showStatus(elements.recordingStatus, '🔒 HTTPS requis', 'error');
      return false;
    }

    // MediaDevices Check
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mobileDebug.error('MediaDevices API not available');
      showStatus(elements.recordingStatus, '🚫 MediaDevices non disponible', 'error');
      return false;
    }

    // Permission State prüfen
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({name: 'microphone'});
      mobileDebug.log(`Current permission state: ${permission.state}`);
      
      if (permission.state === 'denied') {
        mobileDebug.error('Permission explicitly DENIED');
        showManualPermissionInstructions();
        return false;
      }
      
      if (permission.state === 'granted') {
        mobileDebug.log('Permission already GRANTED');
        microphonePermissionGranted = true;
        return true;
      }
    }
    
    // State ist 'prompt' - performActualPermissionTest aufrufen
    mobileDebug.log('Permission state is PROMPT - calling performActualPermissionTest');
    return await performActualPermissionTest();

  } catch (error) {
    mobileDebug.error(`Permission check failed: ${error.message}`);
    return false;
  }
}

async function performActualPermissionTest() {
  try {
    mobileDebug.log('=== PERFORMING ACTUAL PERMISSION TEST ===');
    
    // KRITISCH für Mobile: User Activation Check
    if (isMobile) {
      const hasActivation = navigator.userActivation?.isActive || 
                           navigator.userActivation?.hasBeenActive ||
                           document.hasStoredGesture;
      
      mobileDebug.log(`User activation isActive: ${navigator.userActivation?.isActive}`);
      mobileDebug.log(`User activation hasBeenActive: ${navigator.userActivation?.hasBeenActive}`);
      
      if (!hasActivation) {
        mobileDebug.error('NO USER ACTIVATION DETECTED!');
        throw new Error('User activation required for microphone access');
      }
    }
    
    // Feature Policy Check (wichtig für Chrome Android)
    if ('featurePolicy' in document) {
      const allowed = document.featurePolicy?.allowsFeature('microphone');
      mobileDebug.log(`Feature Policy allows microphone: ${allowed}`);
      
      if (allowed === false) {
        mobileDebug.error('MICROPHONE BLOCKED BY FEATURE POLICY!');
        throw new Error('Microphone blocked by Feature Policy');
      }
    }
    
    showStatus(elements.recordingStatus, '🎤 Demande d\'autorisation...', 'loading');

    const constraints = { audio: true };
    
    mobileDebug.log(`Using constraints: ${JSON.stringify(constraints)}`);
    mobileDebug.log(`MediaDevices available: ${!!navigator.mediaDevices}`);
    mobileDebug.log(`getUserMedia type: ${typeof navigator.mediaDevices.getUserMedia}`);
    
    const testStream = await navigator.mediaDevices.getUserMedia(constraints);
    
    mobileDebug.log(`SUCCESS! Got stream with ${testStream.getTracks().length} tracks`);
    
    const audioTracks = testStream.getAudioTracks();
    
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks in stream');
    }

    const track = audioTracks[0];
    mobileDebug.log(`Track kind: ${track.kind}, enabled: ${track.enabled}, state: ${track.readyState}`);

    testStream.getTracks().forEach(track => {
      mobileDebug.log(`Stopping track ${track.id}`);
      track.stop();
    });
    
    microphonePermissionGranted = true;
    
    showStatus(elements.recordingStatus, '✅ Microphone autorisé', 'success');
    setTimeout(() => hideStatus(elements.recordingStatus), 1000);
    
    return true;

  } catch (mediaError) {
    mobileDebug.error('=== PERMISSION TEST FAILED ===');
    mobileDebug.error(`Error name: ${mediaError.name}`);
    mobileDebug.error(`Error message: ${mediaError.message}`);
    
    // WICHTIG: Prüfe ob es ein ECHTER Permission-Fehler ist
    if (mediaError.name === 'NotAllowedError') {
      mobileDebug.error('NotAllowedError - checking permission state...');
      
      try {
        const perm = await navigator.permissions.query({name: 'microphone'});
        mobileDebug.error(`Permission state AFTER error: ${perm.state}`);
        
        if (perm.state === 'prompt') {
          mobileDebug.error('STATE IS STILL PROMPT - Browser blocked dialog!');
          mobileDebug.error('Possible: Page opened in background or domain not trusted');
        }
      } catch (e) {
        mobileDebug.error(`Could not query permission: ${e.message}`);
      }
    }
    
    showManualPermissionInstructions();
    return false;
  }
}

  // Manual Permission Instructions
  function showManualPermissionInstructions() {
    const instructionsContainer = document.createElement('div');
    instructionsContainer.style.cssText = 'padding: 15px; background: #f8f9fa; border-radius: 8px; margin: 10px 0;';
    
    const title = document.createElement('h4');
    title.style.cssText = 'color: #e74c3c; margin: 0 0 10px;';
    title.textContent = '⚠️ Mikrofonberechtigung erforderlich';
    
    const description = document.createElement('p');
    description.style.cssText = 'margin: 5px 0;';
    description.textContent = 'Für Chrome Android:';
    
    const list = document.createElement('ol');
    list.style.cssText = 'margin: 5px 0; padding-left: 20px; font-size: 14px;';
    
    const steps = [
      '🔒 Tippen Sie auf das Schloss Symbol in der Adressleiste',
      '🎙️ Aktivieren Sie "Mikrofon"', 
      '🔄 Laden Sie die Seite neu'
    ];
    
    steps.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      list.appendChild(li);
    });
    
    const reloadButton = document.createElement('button');
    reloadButton.style.cssText = 'margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;';
    reloadButton.textContent = '🔄 Seite neu laden';
    
    reloadButton.addEventListener('click', function() {
      location.reload();
    });
    
    instructionsContainer.appendChild(title);
    instructionsContainer.appendChild(description); 
    instructionsContainer.appendChild(list);
    instructionsContainer.appendChild(reloadButton);
    
    if (elements.responseText) {
      elements.responseText.innerHTML = '';
      elements.responseText.appendChild(instructionsContainer);
      elements.responseText.classList.remove('hidden');
    }
  }

  // Utility Functions
  function showStatus(element, message, type = 'loading') {
    if (!element) {
      mobileDebug.error(`showStatus: Element is null for message: "${message}"`);
      return;
    }
    element.className = `status-message status-${type}`;
    element.innerHTML = message;
    element.classList.remove('hidden');
  }

  function hideStatus(element) {
    if (!element) {
      mobileDebug.warn('hideStatus: Element is null');
      return;
    }
    element.classList.add('hidden');
  }

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
    isTextCurrentlyVisible = false;
  }

  function showResponseText() {
    if (currentResponse && elements.responseText) {
      elements.responseText.innerHTML = currentResponse;
      elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = true;
      updateShowResponseButton();
      mobileDebug.log('✅ LLM Text angezeigt');
    }
  }

  function setResponseSafely(responseText) {
    currentResponse = responseText;
    mobileDebug.log('📝 Antwort gesetzt, warte auf Audio-Wiedergabe');
    
    if (elements.responseText) {
      elements.responseText.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #3498db;">
          🎵 Audio prêt - Cliquez pour écouter
        </div>
      `;
      elements.responseText.classList.remove('hidden');
      isTextCurrentlyVisible = false;
    }
    updateShowResponseButton();
  }

  function hideResponseText() {
    elements.responseText && elements.responseText.classList.add('hidden');
    isTextCurrentlyVisible = false;
    updateShowResponseButton();
  }

  function updateShowResponseButton() {
    if (!elements.showResponseBtn) return;
    
    if (currentResponse) {
      if (isLlmAudioPlaying) {
        elements.showResponseBtn.classList.add('hidden');
      } else {
        elements.showResponseBtn.classList.remove('hidden');
        elements.showResponseBtn.style.opacity = '1';
        elements.showResponseBtn.style.cursor = 'pointer';

        if (isTextCurrentlyVisible) {
          elements.showResponseBtn.innerHTML = '⛌';
        } else if (audioHasBeenPlayed) {
          elements.showResponseBtn.innerHTML = '☰';
        } else {
          elements.showResponseBtn.innerHTML = '☰';
          elements.showResponseBtn.style.opacity = '0.6';
          elements.showResponseBtn.style.cursor = 'not-allowed';
        }
      }
    } else {
      elements.showResponseBtn.classList.add('hidden');
    }
    
    // History Button Update
    updateChatHistoryUI();
  }

  // Recording Functions - Mobile Optimized
  async function startRealTimeSpeech() {
    mobileDebug.log('Starting real-time speech with recording...');
    
    try {
      mobileDebug.log(`Platform: ${isAndroid ? 'Android' : isMobile ? 'iOS/Mobile' : 'Desktop'}`);
      
      const permissionsOk = await checkMicrophonePermissions();
      mobileDebug.log(`Permissions OK: ${permissionsOk}`);
      
      if (!permissionsOk) {
        mobileDebug.error('Microphone permissions denied');
        showStatus(elements.recordingStatus, '⚠️ Microphone non disponible', 'error');
        return;
      }

      // Set recording state
      isRecording = true;
      isPaused = false;
      mobileDebug.log('Recording state set to active');
      
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
      
      // Mobile-optimized constraints
      const constraints = isAndroid ? {
        audio: true // Simplest form for Android
      } : { 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        }
      };
      
      mobileDebug.log(`Using constraints: ${JSON.stringify(constraints)}`);
      
      try {
        currentAudioStream = await navigator.mediaDevices.getUserMedia(constraints);
        mobileDebug.log('✅ Audio stream obtained');
        
        const audioTracks = currentAudioStream.getAudioTracks();
        mobileDebug.log(`Audio tracks: ${audioTracks.length}`);
        
        if (audioTracks.length === 0) {
          throw new Error('No audio tracks available');
        }
        
      } catch (streamError) {
        mobileDebug.error(`Stream error: ${streamError.message}`);
        throw streamError;
      }
      
      // MediaRecorder setup - Android optimized
      try {
        const options = isAndroid ? {} : { audioBitsPerSecond: 128000 };
        
        if (!isAndroid) {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
          }
        }
        
        mobileDebug.log(`MediaRecorder options: ${JSON.stringify(options)}`);
        
        mediaRecorder = new MediaRecorder(currentAudioStream, options);
        mobileDebug.log('MediaRecorder created');

        // Event handlers
        mediaRecorder.ondataavailable = event => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
            mobileDebug.log(`Audio chunk: ${event.data.size} bytes`);
          }
        };

        mediaRecorder.onstop = async () => {
          mobileDebug.log(`MediaRecorder stopped, ${audioChunks.length} chunks collected`);
          
          if (audioChunks.length > 0) {
            const totalSize = audioChunks.reduce((sum, chunk) => sum + chunk.size, 0);
            mobileDebug.log(`Total audio size: ${totalSize} bytes`);
            
            if (totalSize > 0) {
              const mimeType = mediaRecorder.mimeType || 'audio/webm';
              recordedAudioBlob = new Blob(audioChunks, {type: mimeType});
              
              showStatus(elements.recordingStatus, '💾 Sauvegarde audio...', 'loading');
              const uploadResult = await uploadRecordedAudio(recordedAudioBlob, mimeType);
              
              if (uploadResult && uploadResult.audio_path) {
                showStatus(elements.recordingStatus, '✅ Audio enregistré', 'success');
                mobileDebug.log('✅ Audio uploaded successfully');
                
                // Show user audio with custom player
                if (userPlayer) {
                  userPlayer.loadAudio(uploadResult.audio_path);
                  userPlayer.show();
                  
                  if (elements.playUserAudio) {
                    elements.playUserAudio.classList.remove('hidden');
                  }
                }
              } else {
                mobileDebug.error('Audio upload failed');
                showStatus(elements.recordingStatus, '⚠️ Erreur lors de l\'enregistrement de l\'audio', 'error');
              }
            }
          } else {
            mobileDebug.error('No audio chunks recorded!');
            showStatus(elements.recordingStatus, '⚠️ Aucun audio enregistré', 'error');
          }
        };

        mediaRecorder.onerror = (event) => {
          mobileDebug.error(`MediaRecorder error: ${event.error}`);
          showStatus(elements.recordingStatus, '⚠️ Erreur d\'enregistrement: ' + event.error, 'error');
        };

        mediaRecorder.onstart = () => {
          mobileDebug.log('MediaRecorder started successfully');
          showStatus(elements.recordingStatus, '🎤 Enregistrement actif', 'success');
        };
        
        mediaRecorder.start(isAndroid ? 1000 : 250); // Larger timeslices for Android
        mobileDebug.log('MediaRecorder started');
        
      } catch (recorderError) {
        mobileDebug.error(`MediaRecorder error: ${recorderError.message}`);
        throw recorderError;
      }
      
      // Speech recognition - only if available
      if (recognition) {
        try {
          isRecognitionRestarting = false;
          startRecognition();
          mobileDebug.log('Speech recognition started');
        } catch (speechError) {
          mobileDebug.warn(`Speech recognition error: ${speechError.message}`);
        }
      } else {
        mobileDebug.warn('No speech recognition available - recording only');
      }
      
      updateRecordButton();
      showStatus(elements.recordingStatus, '🎤 Enregistrement + détection actifs', 'success');
      mobileDebug.log('✅ Recording setup complete');
      
    } catch (err) {
      mobileDebug.error(`Recording setup failed: ${err.message}`);
      showStatus(elements.recordingStatus, '⚠️ Erreur: ' + err.message, 'error');
      isRecording = false;
      resetRecordButton();
      cleanupAudioStream();
    }
  }

  function stopRealTimeSpeech() {
    mobileDebug.log('Stopping real-time speech...');
    
    isRecording = false;
    isRecognitionRestarting = true;
    
    stopRecognition();
    
    if (mediaRecorder && mediaRecorder.state === "recording") {
      try {
        mediaRecorder.stop();
        mobileDebug.log('MediaRecorder stopped');
      } catch (e) {
        mobileDebug.error(`Error stopping MediaRecorder: ${e.message}`);
      }
    }
    
    cleanupAudioStream();
    resetRecordButton();
    
    // Update user text with final transcript
    if (elements.userText) {
      const finalContent = finalTranscript.trim();
      elements.userText.textContent = finalContent;

      if (finalContent) {
        elements.userText.classList.remove('placeholder');
        elements.userText.dataset.isPlaceholder = 'false';
        elements.sendBtn.classList.remove('hidden');
        mobileDebug.log(`Final transcript: "${finalContent}"`);
      } else {
        elements.userText.textContent = placeholderText;
        elements.userText.classList.add('placeholder');
        elements.userText.dataset.isPlaceholder = 'true';
      }
    }

    if (finalTranscript.trim()) {
      if (autoSendAfterRecording) {
        mobileDebug.log('Auto-sending transcript');
        sendMessageToBackend(finalTranscript.trim());
      } else {
        showStatus(elements.recordingStatus, '✅ Transcription prête, Envoyer', 'success');
      }
    } else {
      showStatus(elements.recordingStatus, '⚠️ Aucune parole détectée', 'warning');
    }
  }

  function pauseRealTimeSpeech() {
    mobileDebug.log('Pausing real-time speech...');
    
    isPaused = true;
    isRecognitionRestarting = true;
    
    stopRecognition();
    updateRecordButton();
    showStatus(elements.recordingStatus, '⏸️ Enregistrement en pause', 'loading');
  }

  function resumeRealTimeSpeech() {
    mobileDebug.log('Resuming real-time speech...');
    
    isPaused = false;
    isRecognitionRestarting = false;
    
    if (isRecording && recognition) {
      startRecognition();
    }
    
    updateRecordButton();
    showStatus(elements.recordingStatus, '▶ Enregistrement repris', 'success');
  }

  function updateRecordButton() {
    if (!elements.recordBtn) return;

    if (isRecording && !isPaused) {
      elements.recordBtn.innerHTML = '🔴';
      elements.recordBtn.classList.add('recording');
      elements.recordBtn.classList.remove('paused');
    } else if (isRecording && isPaused) {
      elements.recordBtn.innerHTML = '〇';
      elements.recordBtn.classList.remove('recording');
      elements.recordBtn.classList.add('paused');
    } else {
      elements.recordBtn.innerHTML = '〇';
      elements.recordBtn.classList.remove('recording', 'paused');
    }

    elements.recordBtn.disabled = false;
    elements.stopBtn && elements.stopBtn.classList.toggle('hidden', !isRecording);
  }

  function resetRecordButton() {
    elements.recordBtn && (elements.recordBtn.innerHTML = '〇');
    elements.recordBtn && elements.recordBtn.classList.remove('recording', 'paused');
    elements.recordBtn && (elements.recordBtn.disabled = false);
    elements.stopBtn && elements.stopBtn.classList.add('hidden');
  }

  function cleanupAudioStream() {
    if (currentAudioStream) {
      mobileDebug.log('Cleaning up audio stream...');
      currentAudioStream.getTracks().forEach(track => track.stop());
      currentAudioStream = null;
    }
  }

  // Backend Communication
  async function extractErrorMessage(response) {
    try {
      const text = await response.text();
      const parsed = JSON.parse(text);
      return parsed.error || parsed.response || text;
    } catch (e) {
      return "Erreur inconnue du serveur.";
    }
  }

  async function sendMessageToBackend(message) {
    mobileDebug.log(`📤 Sending message: "${message.substring(0, 50)}..."`);
    
    // AUTO-STOP: Recording stoppen falls aktiv
    if (isRecording) {
      mobileDebug.log('Auto-stopping recording before sending message');
      stopRealTimeSpeech();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!message.trim()) {
      showStatus(elements.recordingStatus, 'Veuillez entrer un message.', 'warning');
      setTimeout(() => hideStatus(elements.recordingStatus), 3000);
      return;
    }
    
    showProgressStatus(1, '🚀 Message en cours d\'envoi...');
    elements.sendBtn && (elements.sendBtn.disabled = true);
    elements.recordBtn && (elements.recordBtn.disabled = true);
    elements.stopBtn && (elements.stopBtn.disabled = true);

    // Hide previous response text and audio player
    elements.responseText && elements.responseText.classList.add('hidden');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
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
      mobileDebug.log(`Response received: audio=${!!data.audio_url}`);

      if (data.audio_url) {
        await playLlmAudio(data.audio_url);
      } else {
        mobileDebug.warn('No audio URL received for chat response');
        currentResponse = data.response;
        audioHasBeenPlayed = true;
        isTextCurrentlyVisible = false;
        elements.responseText && elements.responseText.classList.add('hidden');
        updateShowResponseButton();
        showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable');
      }
      
      // Update conversation history
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      );
      updateChatHistoryUI(); 
      setResponseSafely(data.response);

    } catch (error) {
      mobileDebug.error(`Error sending message: ${error.message}`);
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
      audioHasBeenPlayed = false;
    } finally {
      elements.sendBtn && (elements.sendBtn.disabled = false);
      elements.recordBtn && (elements.recordBtn.disabled = false);
      elements.stopBtn && (elements.stopBtn.disabled = false);
      hideStatus(elements.recordingStatus);
    }
  }

  async function uploadRecordedAudio(audioBlob, mimeType) {
    if (!audioBlob || audioBlob.size === 0) {
      mobileDebug.warn('No audio blob to upload or blob is empty');
      return null;
    }

    const formData = new FormData();
    const fileExtension = mimeType.split('/')[1].split(';')[0];
    const fileName = `recording.${fileExtension}`;
    
    formData.append('audio', audioBlob, fileName);
    formData.append('user_id', currentUserId);
    mobileDebug.log(`Uploading audio: ${audioBlob.size} bytes, type: ${mimeType}`);

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
      mobileDebug.log('Audio uploaded successfully');
      return data;

    } catch (error) {
      mobileDebug.error(`Error uploading audio: ${error.message}`);
      return null;
    }
  }

  // Audio Playback Functions
// COMPLETE MISSING SECTION FOR script.js
// This starts after the incomplete playLlmAudio function and continues to the end

// First, complete the playLlmAudio function properly:
async function playLlmAudio(audio_url) {
    mobileDebug.log(`Loading LLM audio: ${audio_url.substring(0, 50)}...`);
    
    if (!audio_url || audio_url.trim() === '') {
        mobileDebug.error('Invalid audio URL provided');
        audioHasBeenPlayed = false;
        isLlmAudioPlaying = false;
        updateShowResponseButton();
        return Promise.resolve();
    }
    
    if (!assistantPlayer || !elements.llmAudioPlayback) {
        mobileDebug.error('Audio player not available');
        audioHasBeenPlayed = false;
        isLlmAudioPlaying = false;
        updateShowResponseButton();
        return Promise.resolve();
    }

    assistantPlayer.loadAudio(audio_url);
    assistantPlayer.show();
    
    if (elements.playAssistantAudio) {
        elements.playAssistantAudio.classList.remove('hidden');
    }

    return new Promise((resolve) => {
        const audioElement = elements.llmAudioPlayback;
        let resolved = false;
        
        // Clear all event listeners
        audioElement.oncanplaythrough = null;
        audioElement.onerror = null;
        audioElement.onended = null;
        audioElement.onloadstart = null;
        audioElement.onplay = null;
        audioElement.onpause = null;
        audioElement.onloadeddata = null;
        audioElement.onloadedmetadata = null;
        
        function resolveOnce() {
            if (!resolved) {
                resolved = true;
                resolve();
            }
        }
        
        audioElement.oncanplaythrough = () => {
            mobileDebug.log('✅ Audio can play through, attempting to play');
            
            audioElement.play()
                .then(() => {
                    mobileDebug.log('✅ Audio playback started successfully');
                    isLlmAudioPlaying = true;
                    updateShowResponseButton();
                    showProgressStatus(4, '🎵 Écoute en cours...');
                })
                .catch(playError => {
                    mobileDebug.warn(`Play prevented by browser: ${playError.message}`);
                    audioHasBeenPlayed = false;
                    isLlmAudioPlaying = false;
                    showProgressStatus(4, '⚠️ Cliquez sur le bouton play pour écouter l\'audio');
                    
                    audioElement.classList.remove('hidden');
                    elements.responseText && elements.responseText.classList.add('hidden');
                    isTextCurrentlyVisible = false;
                    updateShowResponseButton();
                    
                    resolveOnce();
                });
        };

        audioElement.onended = () => {
            mobileDebug.log('✅ LLM Audio ended successfully');
            audioHasBeenPlayed = true;
            isLlmAudioPlaying = false;
            showProgressStatus(4, '✅ Audio terminé - Texte disponible!');
            updateShowResponseButton();
            elements.recordBtn && elements.recordBtn.classList.remove('hidden');
            resolveOnce();
        };
        
        audioElement.onplay = () => {
            mobileDebug.log('🎵 Audio play event triggered');
            isLlmAudioPlaying = true;
            updateShowResponseButton();
            showProgressStatus(4, '🎵 Écoute en cours...');
        };
        
        audioElement.onpause = () => {
            mobileDebug.log('⏸️ Audio paused');
            isLlmAudioPlaying = false;
            updateShowResponseButton();
        };

        audioElement.onerror = (e) => {
            mobileDebug.error('❌ Error loading/playing LLM audio');
            
            audioHasBeenPlayed = false;
            isLlmAudioPlaying = false;
            showProgressStatus(4, '⚠️ Erreur audio - Texte disponible maintenant');
            
            audioHasBeenPlayed = true;
            updateShowResponseButton();
            
            resolveOnce();
        };
        
        audioElement.preload = 'auto';
        audioElement.volume = 1.0;
        
        elements.responseText && elements.responseText.classList.add('hidden');
        isTextCurrentlyVisible = false;
        audioElement.classList.remove('hidden');
        
        audioElement.src = audio_url;
        audioElement.load();
        
        mobileDebug.log('Audio setup complete, waiting for events...');
    });
}

// Chat History Management
function updateChatHistoryUI() {
    const chatMessages = document.getElementById('chatMessages');
    const chatToggle = document.getElementById('chatToggle');
    
    if (!chatMessages || !chatToggle) return;
    
    chatMessages.innerHTML = '';
    
    conversationHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${msg.role}`;
        
        const preview = msg.content.length > 100 ? 
            msg.content.substring(0, 100) + '...' : 
            msg.content;
            
        messageDiv.innerHTML = `
            <strong>${msg.role === 'user' ? '👤 Vous' : '👨‍🏫 Assistant'}:</strong> 
            ${preview}
        `;
        
        chatMessages.appendChild(messageDiv);
    });
    
    // History Button nur anzeigen wenn History vorhanden UND Audio nicht spielt
    if (conversationHistory.length > 0 && !isLlmAudioPlaying) {
        chatToggle.classList.remove('hidden');
    } else {
        chatToggle.classList.add('hidden');
    }
    
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

function resetUI() {
    mobileDebug.log('Resetting UI...');
    
    isRecording = false;
    isPaused = false;
    
    if (recognition) {
        isRecognitionRestarting = true;
        try {
            recognition.stop();
        } catch (e) {
            mobileDebug.warn(`Could not stop recognition: ${e.message}`);
        }
    }
    
    recognitionActive = false;
    isRecognitionRestarting = false;
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (e) {
            mobileDebug.warn(`Could not stop MediaRecorder: ${e.message}`);
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
    
    if (assistantPlayer) {
        assistantPlayer.hide();
        elements.playAssistantAudio && elements.playAssistantAudio.classList.add('hidden');
    }
    if (userPlayer) {
        userPlayer.hide();
        elements.playUserAudio && elements.playUserAudio.classList.add('hidden');
    }
    
    if (elements.llmAudioPlayback) {
        if (!elements.llmAudioPlayback.paused) {
            elements.llmAudioPlayback.pause();
        }
        
        elements.llmAudioPlayback.oncanplaythrough = null;
        elements.llmAudioPlayback.onerror = null;
        elements.llmAudioPlayback.onended = null;
        elements.llmAudioPlayback.onloadstart = null;
        elements.llmAudioPlayback.onplay = null;
        elements.llmAudioPlayback.onpause = null;
        elements.llmAudioPlayback.onloadeddata = null;
        elements.llmAudioPlayback.onloadedmetadata = null;
        
        elements.llmAudioPlayback.src = '';
        elements.llmAudioPlayback.removeAttribute('src');
        elements.llmAudioPlayback.load();
        elements.llmAudioPlayback.classList.add('hidden');
        
        elements.userAudio && (elements.userAudio.src = '');
        elements.userAudio && elements.userAudio.classList.add('hidden');
    }
    
    elements.showResponseBtn && elements.showResponseBtn.classList.add('hidden');
    
    resetRecordButton();
    
    currentUserId = null;
    recordedAudioBlob = null;
    currentResponse = null;
    audioHasBeenPlayed = false;
    isTextCurrentlyVisible = false;
    finalTranscript = '';
    audioChunks = [];
    conversationHistory = [];
    updateChatHistoryUI();
    hideStatus(elements.recordingStatus);
}

// Event Listeners
elements.startBtn && elements.startBtn.addEventListener('click', async () => {
    mobileDebug.log('🚀 Starting conversation...');

    const scenario = elements.scenarioSelect && elements.scenarioSelect.value;
    const forceReset = currentUserId === null || scenario !== currentScenario;
    currentScenario = scenario;
    
    if (!scenario) {
        showStatus(elements.recordingStatus, "⚠️ Veuillez choisir un thème.", 'error');
        setTimeout(() => hideStatus(elements.recordingStatus), 3000);
        return;
    }

    elements.startSection && elements.startSection.classList.add('hidden');
    elements.conversationSection && elements.conversationSection.classList.remove('hidden');
    
    if (!currentUserId) {
        currentUserId = Date.now().toString();
        mobileDebug.log(`Generated user ID: ${currentUserId}`);
    }
    
    // Reset UI elements
    elements.responseText && (elements.responseText.innerHTML = '');
    elements.responseText && elements.responseText.classList.add('hidden');
    elements.llmAudioPlayback && (elements.llmAudioPlayback.src = '');
    elements.llmAudioPlayback && elements.llmAudioPlayback.classList.add('hidden');
    assistantPlayer && assistantPlayer.hide();
    userPlayer && userPlayer.hide();
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
        showProgressStatus(1, '⏳ Préparation de la conversation...');
        
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
            mobileDebug.log('🗪 Conversation started successfully');

            currentUserId = data.userId;
            conversationHistory = [{ role: 'assistant', content: data.response }];
            updateChatHistoryUI();
            setResponseSafely(data.response);
            showProgressStatus(2, '🗹 Conversation préparée...');

            if (data.audio_url) { 
                mobileDebug.log('Audio URL received');
                await playLlmAudio(data.audio_url);
            } else {
                mobileDebug.warn('⚠️ No audio URL received for initial response');
                currentResponse = data.response;
                audioHasBeenPlayed = true;
                isTextCurrentlyVisible = false;
                elements.responseText && elements.responseText.classList.add('hidden');
                updateShowResponseButton();
                showProgressStatus(4, '⚠️ Audio non disponible. Texte affichable via bouton.');
            }
        } catch (err) {
            mobileDebug.error(`Error starting conversation: ${err.message}`);
            showStatus(elements.recordingStatus, `❌ Erreur: ${err.message}`, 'error');
            elements.startSection && elements.startSection.classList.remove('hidden');
            elements.conversationSection && elements.conversationSection.classList.add('hidden');
        } finally {
            hideStatus(elements.recordingStatus);
        }
    } else {
        currentResponse = "🗣 Conversation libre - parlez de ce qui vous intéresse!";
        audioHasBeenPlayed = true;
        elements.recordBtn && elements.recordBtn.classList.remove('hidden');
        showResponseText();
        hideStatus(elements.recordingStatus);
    }
});

elements.newConvBtn && elements.newConvBtn.addEventListener('click', () => {
    resetUI();
});

// Record Button Event Listener - Mobile Debug
elements.recordBtn && elements.recordBtn.addEventListener('click', (e) => {
    mobileDebug.log('=== RECORD BUTTON CLICKED ===');
    mobileDebug.log(`Event type: ${e.type}, isTrusted: ${e.isTrusted}`);
    mobileDebug.log(`Recording: ${isRecording}, Paused: ${isPaused}`);
    mobileDebug.log(`Platform: ${isAndroid ? 'Android' : isMobile ? 'Mobile' : 'Desktop'}`);
    
    if (isRecording && !isPaused) {
        mobileDebug.log('-> Calling pauseRealTimeSpeech()');
        pauseRealTimeSpeech();
    } else if (isRecording && isPaused) {
        mobileDebug.log('-> Calling resumeRealTimeSpeech()');
        resumeRealTimeSpeech();
    } else {
        mobileDebug.log('-> Calling startRealTimeSpeech()');
        startRealTimeSpeech();
    }
});

elements.stopBtn && elements.stopBtn.addEventListener('click', () => {
    stopRealTimeSpeech();
});

elements.sendBtn && elements.sendBtn.addEventListener('click', () => {
    let messageToSend = '';
    mobileDebug.log('=== SEND BUTTON CLICKED ===');
    
    if (elements.userText && elements.userText.textContent && 
        elements.userText.textContent.trim() && 
        elements.userText.dataset.isPlaceholder !== 'true' && 
        elements.userText.textContent !== placeholderText) {
        messageToSend = elements.userText.textContent.trim();
        mobileDebug.log('Using edited userText');
    } else if (finalTranscript.trim()) {
        messageToSend = finalTranscript.trim();
        mobileDebug.log('Using finalTranscript');
    }
      
    if (messageToSend) {
        mobileDebug.log(`Sending message: "${messageToSend.substring(0, 50)}..."`);
        sendMessageToBackend(messageToSend);
    } else {
        mobileDebug.warn('No valid text to send');
        showStatus(elements.recordingStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
        setTimeout(() => hideStatus(elements.recordingStatus), 3000);
    }
});

elements.showResponseBtn && elements.showResponseBtn.addEventListener('click', () => {
    if (currentResponse) {
        if (isTextCurrentlyVisible) {
            hideResponseText();
            elements.showResponseBtn && (elements.showResponseBtn.textContent = '☰');
        } else {
            if (audioHasBeenPlayed || !elements.llmAudioPlayback || !elements.llmAudioPlayback.src) {
                showResponseText();
                elements.showResponseBtn && (elements.showResponseBtn.textContent = '⛌');
            } else {
                showStatus(elements.recordingStatus, '⚠️ Veuillez d\'abord écouter l\'audio', 'error');
                setTimeout(() => hideStatus(elements.recordingStatus), 3000);
            }
        }
    } else {
        mobileDebug.warn('showResponseBtn clicked but no currentResponse');
    }
});

elements.scenarioSelect && elements.scenarioSelect.addEventListener('change', (event) => {
    currentScenario = event.target.value;
    mobileDebug.log(`Scenario changed to: ${currentScenario}`);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        
        let messageToSend = '';
        if (elements.userText && elements.userText.textContent && 
            elements.userText.textContent.trim() && 
            elements.userText.dataset.isPlaceholder !== 'true' && 
            elements.userText.textContent !== placeholderText) {
            messageToSend = elements.userText.textContent.trim();
        } else if (finalTranscript.trim()) {
            messageToSend = finalTranscript.trim();
        }

        if (messageToSend) {
            mobileDebug.log('Keyboard shortcut: sending message');
            sendMessageToBackend(messageToSend);
        } else {
            showStatus(elements.recordingStatus, 'Veuillez d\'abord enregistrer ou taper un message.', 'warning');
            setTimeout(() => hideStatus(elements.recordingStatus), 3000);
        }
    }
    
    if (e.code === 'Space' && e.target === document.body && 
        elements.conversationSection && !elements.conversationSection.classList.contains('hidden')) {
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

// Chat History Toggle
const chatToggle = document.getElementById('chatToggle');
const chatHistory = document.getElementById('chatHistory');

if (chatToggle && chatHistory) {
    chatToggle.addEventListener('click', () => {
        chatHistory.classList.toggle('show');
        chatToggle.textContent = chatHistory.classList.contains('show') ? '▲ Historique' : '▼ Historique';
    });
}

// Touch Events für Mobile - OHNE preventDefault auf Buttons
document.addEventListener('touchstart', function() {
    document.hasStoredGesture = true;
}, { passive: true });

if (isMobile) {
    mobileDebug.log('Mobile: Permission will be requested on first recording');
    
    setTimeout(() => {
        const debugPanel = document.getElementById('mobileDebugPanel');
        if (debugPanel) {
            debugPanel.style.display = 'block';
        }
    }, 1000);
}

// Global utility functions
window.addToChatHistory = function(role, message) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.innerHTML = `<strong>${role === 'user' ? '👤 Vous' : '👨‍🏫 Assistant'}:</strong> ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
    chatMessages.appendChild(messageDiv);
    
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
    
    while (chatMessages.children.length > 20) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
};

window.clearChatHistory = function() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
};



// Initial UI setup
resetUI();
mobileDebug.log('🚀 FR-AI-Tutor Frontend initialized with Mobile Debug');
mobileDebug.log(`Device Info: ${navigator.userAgent}`);
mobileDebug.log(`Screen: ${window.innerWidth}x${window.innerHeight}`);
mobileDebug.log(`Touch support: ${('ontouchstart' in window)}`);


// Debug function for development
function debugConversationState() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        mobileDebug.log('=== CONVERSATION STATE DEBUG ===');
        mobileDebug.log(`User ID: ${currentUserId}`);
        mobileDebug.log(`Current Scenario: ${currentScenario}`);
        mobileDebug.log(`Current Response: ${currentResponse ? 'Set' : 'Not set'}`);
        mobileDebug.log(`Audio played: ${audioHasBeenPlayed}`);
        mobileDebug.log(`Text visible: ${isTextCurrentlyVisible}`);
        mobileDebug.log(`Recording: ${isRecording}`);
        mobileDebug.log(`Paused: ${isPaused}`);
        mobileDebug.log(`LLM Audio Playing: ${isLlmAudioPlaying}`);
        mobileDebug.log(`Local History Length: ${conversationHistory.length}`);
    }
}

// Debug timer for development environments
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(debugConversationState, 30000);
}

// Additional mobile-specific optimizations
if (isMobile) {
    // Prevent viewport scaling on input focus
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
        metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    // Add mobile-friendly CSS class
    document.body.classList.add('mobile-device');
    if (isAndroid) {
        document.body.classList.add('android-device');
    }

    // Mobile-specific audio context handling
    document.addEventListener('touchstart', function() {
        // Create AudioContext on first touch for mobile browsers
        if (typeof window.audioContextInitialized === 'undefined') {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                const testContext = new AudioContextClass();
                if (testContext.state === 'suspended') {
                    testContext.resume();
                }
                window.audioContextInitialized = true;
                mobileDebug.log('AudioContext initialized for mobile');
            }
        }
    }, { once: true });

    // Optimize for mobile performance
    if (window.DeviceMotionEvent) {
        // Disable unnecessary motion events
        window.addEventListener('devicemotion', function(e) {
            e.preventDefault();
        }, { passive: false });
    }

    // Handle mobile orientation changes
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            mobileDebug.log(`Orientation changed to: ${window.orientation}`);
            // Force repaint after orientation change
            document.body.style.display = 'none';
            document.body.offsetHeight; // Trigger reflow
            document.body.style.display = '';
        }, 100);
    });
}

// Network status monitoring for better error handling
window.addEventListener('online', function() {
    mobileDebug.log('Network connection restored');
});

window.addEventListener('offline', function() {
    mobileDebug.log('Network connection lost');
    showStatus(elements.recordingStatus, '📶 Connexion réseau perdue', 'warning');
});

// Visibility API for better resource management
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        mobileDebug.log('App moved to background');
        // Pause any ongoing recordings when app goes to background
        if (isRecording && !isPaused) {
            pauseRealTimeSpeech();
        }
    } else {
        mobileDebug.log('App moved to foreground');
    }
});

// Final initialization log
mobileDebug.log('✅ All event listeners and optimizations loaded');
console.log('🚀 FR-AI-Tutor Frontend fully initialized with Mobile Debug System');

// Closing brace for DOMContentLoaded event listener
});