const recordBtn = document.getElementById('record');
const stopBtn = document.getElementById('stop');
const resetBtn = document.getElementById('reset');
const scenarioSelect = document.getElementById('scenario');
const recognizedText = document.getElementById('recognizedText');
const responseText = document.getElementById('responseText');
const audioPlayback = document.getElementById('audioPlayback');

let mediaRecorder;
let audioChunks = [];
let recordingTimeout;

recordBtn.onclick = async () => {
    const selectedScenario = scenarioSelect.value;

    if (selectedScenario !== 'libre') {
        const intro = `J'apprends le français au niveau B1/B2. Je voudrais avoir une conversation avec toi sur le thème « ${selectedScenario} ». Corrige-moi si je fais des erreurs et aide-moi à améliorer ma grammaire et mon expression.`;

        responseText.textContent = "Génération de la question...";

        try {
            const respondRes = await fetch('/api/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: intro,
                    user_id: "scenario"
                })
            });

            const respondData = await respondRes.json();
            responseText.textContent = respondData.response;
            audioPlayback.src = respondData.audio_url;
            audioPlayback.play();

            setTimeout(startVoiceRecording, 1000);
        } catch (err) {
            console.error("Erreur pendant la génération du scénario :", err);
            responseText.textContent = "Erreur lors de la génération.";
        }
    } else {
        startVoiceRecording();
    }
};

function startVoiceRecording() {
    audioChunks = [];
    recognizedText.textContent = '';
    responseText.textContent = '';
    audioPlayback.src = '';

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = handleRecordingStop;

        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        resetBtn.disabled = false;
        recordBtn.textContent = 'Enregistrement...';

        // Optionaler Auto-Stopp nach 15 Sekunden
        recordingTimeout = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 15000);
    });
}

stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearTimeout(recordingTimeout);
        stopBtn.disabled = true;
    }
};

resetBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        clearTimeout(recordingTimeout);
    }
    audioChunks = [];
    recognizedText.textContent = 'Réinitialisé.';
    responseText.textContent = '';
    audioPlayback.src = '';
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    resetBtn.disabled = true;
    recordBtn.textContent = 'Commencer';
};

async function handleRecordingStop() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');

    try {
        const transcribeRes = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData
        });

        const transcribeData = await transcribeRes.json();
        if (transcribeData.error) {
            recognizedText.textContent = `Erreur : ${transcribeData.error}`;
            return;
        }

        recognizedText.textContent = transcribeData.text;

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
        audioPlayback.play();
    } catch (err) {
        console.error('Erreur pendant la reconnaissance :', err);
        recognizedText.textContent = 'Une erreur est survenue.';
    } finally {
        recordBtn.disabled = false;
        stopBtn.disabled = true;
        resetBtn.disabled = true;
        recordBtn.textContent = 'Commencer';
    }
}