let timerInterval = null;
let seconds = 0;
let isRecording = false;

const timerDisplay = document.getElementById('timer');
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('status');
const includeMicCheckbox = document.getElementById('includeMic');

chrome.storage.local.get(['isRecording', 'startTime', 'includeMic'], (result) => {
    if (result.includeMic !== undefined) {
        includeMicCheckbox.checked = result.includeMic;
    }
    if (result.isRecording) {
        isRecording = true;
        recordBtn.textContent = 'Stop Recording';
        recordBtn.classList.add('recording');
        statusText.textContent = 'Recording in progress...';
        includeMicCheckbox.disabled = true;
        if (result.startTime) {
            seconds = Math.floor((Date.now() - result.startTime) / 1000);
        }
        startTimer();
    }
});

function formatTime(s) {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

function startTimer() {
    timerDisplay.textContent = formatTime(seconds);
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        timerDisplay.textContent = formatTime(seconds);
    }, 1000);
}

function resetState() {
    isRecording = false;
    clearInterval(timerInterval);
    timerInterval = null;
    seconds = 0;
    timerDisplay.textContent = '00:00:00';
    recordBtn.textContent = 'Start Recording';
    recordBtn.classList.remove('recording');
    recordBtn.disabled = false;
    includeMicCheckbox.disabled = false;
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'recording-started') {
        isRecording = true;
        seconds = 0;
        recordBtn.textContent = 'Stop Recording';
        recordBtn.classList.add('recording');
        recordBtn.disabled = false;
        includeMicCheckbox.disabled = true;
        statusText.textContent = 'Recording...';
        startTimer();
    }

    if (message.action === 'recording-complete') {
        resetState();
        statusText.textContent = 'Recording saved!';
        setTimeout(() => { statusText.textContent = ''; }, 3000);
    }

    if (message.action === 'recording-failed') {
        resetState();
        statusText.textContent = message.error || 'Recording failed. Try again.';
    }

});

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        const includeMic = includeMicCheckbox.checked;
        chrome.storage.local.set({ includeMic });
        recordBtn.disabled = true;

        if (includeMic) {
            statusText.textContent = 'Allow microphone in the new tab, then choose screen…';
            chrome.tabs.create({ url: chrome.runtime.getURL('record-tab.html') });
            window.close();
            return;
        }

        statusText.textContent = 'Starting...';
        try {
            const response = await chrome.runtime.sendMessage({ action: 'start-recording', includeMic: false });
            if (!response?.success) {
                statusText.textContent = response?.error || 'Failed to start';
                recordBtn.disabled = false;
            } else {
                statusText.textContent = 'Choose a screen to share...';
                window.close();
            }
        } catch (err) {
            statusText.textContent = 'Failed to start';
            recordBtn.disabled = false;
        }
    } else {
        recordBtn.disabled = true;
        statusText.textContent = 'Saving recording...';
        clearInterval(timerInterval);

        chrome.storage.local.set({ isRecording: false, startTime: null });
        chrome.runtime.sendMessage({ action: 'stop-recording' }).catch(() => {});
    }
});
