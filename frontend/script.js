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

function resetUI() {
  // Reset Sichtbarkeit und Inhalte
  startSection.classList.remove('hidden');
  conversationSection.classList.add('hidden');
  responseContainer.classList.add('hidden');
  recognizedText.textContent = '...';
  responseText.textContent = '...';
  audioPlayback.src = '';
  userAudio.src = '';
}

startBtn.onclick = async () => {
  const scenario = scenarioSelect.value;

  if (!scenario) {
    alert("Veuillez choisir un thème.");
    return;
  }

  startSection.classList.add('hidden');
  conversationSection.classList.remove('hidden');

  if (scenario !== "eigenes") {
const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${selectedScenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression.`;

    try {
      const res = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: intro })
      });

      const data = await res.json();

      responseText.textContent = data.response;
      audioPlayback.src = data.audio_url;
      audioPlayback.type = 'audio/mpeg';
      audioPlayback.play();
    } catch (err) {
      responseText.textContent = 'Erreur lors de la récupération de la réponse.';
      console.error(err);
    }
  }
};

showResponseBtn.onclick = () => {
  responseContainer.classList.remove('hidden');
  audioPlayback.play();
};

newConvBtn.onclick = () => {
  resetUI();
};

recordBtn.onclick = async () => {
  audioChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = event => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    const userAudioURL = URL.createObjectURL(audioBlob);
    userAudio.src = userAudioURL;

    try {
      // Schritt 1: Transkription
      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      const transcribeData = await transcribeRes.json();

      if (transcribeData.error) {
        recognizedText.textContent = `Erreur: ${transcribeData.error}`;
        return;
      }

      recognizedText.textContent = transcribeData.text;

      // Schritt 2: LLM-Antwort
      const respondRes = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcribeData.text,
          user_id: transcribeData.user_id
        })
      });

      const respondData = await respondRes.json();
      responseText.textContent = respondData.response;
      audioPlayback.src = respondData.audio_url;
      audioPlayback.type = 'audio/mpeg';
    } catch (err) {
      recognizedText.textContent = 'Une erreur est survenue.';
      console.error(err);
    }
  };

  mediaRecorder.start();
  recordBtn.disabled = true;
  stopBtn.classList.remove('hidden');
};

stopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordBtn.disabled = false;
    stopBtn.classList.add('hidden');
  }
};