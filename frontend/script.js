async function startRecording() {
    document.getElementById("transcript").innerText = "Aufnahme läuft...";
    // Hier müsste echte Aufnahme-Logik stehen
    const dummyText = "Bonjour, comment ça va ?";

    document.getElementById("transcript").innerText = dummyText;

    const response = await fetch("/api/respond", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: dummyText })
    });

    const result = await response.json();
    document.getElementById("response").innerText = result.response;
}
