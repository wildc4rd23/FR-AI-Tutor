async function startRecording() {
  const responseEl = document.getElementById("response");
  const transcriptEl = document.getElementById("transcript");
  const audioEl = document.getElementById("audio");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "speech.webm");

    const res = await fetch("/process", { method: "POST", body: formData });
    const data = await res.json();

    transcriptEl.textContent = "Du hast gesagt: " + data.transcript;
    responseEl.textContent = "Antwort: " + data.response;
    audioEl.src = data.tts_url;
  };

  mediaRecorder.start();
  setTimeout(() => mediaRecorder.stop(), 4000);
}
