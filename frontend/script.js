const recordBtn = document.getElementById('record');
const recognizedText = document.getElementById('recognizedText');
const responseText = document.getElementById('responseText');
const audioPlayback = document.getElementById('audioPlayback');

let mediaRecorder;
let audioChunks = [];

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

        try {
            // Schritt 1: Transkription
            const transcribeRes = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData
            });

            const transcribeData = await transcribeRes.json();

            if (transcribeData.error) {
                recognizedText.textContent = `Fehler: ${transcribeData.error}`;
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

            // Schritt 3: MP3-Audio abspielen
            audioPlayback.src = respondData.audio_url;
            audioPlayback.type = 'audio/mpeg';  // Optional: explizit MP3
            audioPlayback.play();
        } catch (err) {
            console.error('Fehler beim Verarbeiten der Anfrage:', err);
            recognizedText.textContent = 'Ein Fehler ist aufgetreten.';
        }
    };

    mediaRecorder.start();
    recordBtn.disabled = true;
    recordBtn.textContent = 'Aufnahme läuft...';

    setTimeout(() => {
        mediaRecorder.stop();
        recordBtn.disabled = false;
        recordBtn.textContent = 'Aufnahme starten';
    }, 15000);
};