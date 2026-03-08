async function setupOffscreenDocument() {
    const path = 'offscreen.html';
    const offscreenUrl = chrome.runtime.getURL(path);

    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: path,
        reasons: ['DISPLAY_MEDIA', 'USER_MEDIA'],
        justification: 'Screen and audio recording (display + microphone)'
    });
}

function setRecordingBadge(recording) {
    if (recording) {
        chrome.action.setBadgeText({ text: 'REC' });
        chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

async function sendToOffscreen(msg, retries = 10) {
    for (let i = 0; i < retries; i++) {
        try {
            return await chrome.runtime.sendMessage(msg);
        } catch {
            if (i === retries - 1) throw new Error('Offscreen document not responding');
            await new Promise(r => setTimeout(r, 100 * (i + 1)));
        }
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'start-recording') {
        const includeMic = message.includeMic === true;
        setupOffscreenDocument()
            .then(() => sendToOffscreen({ action: 'offscreen-start-recording', includeMic }))
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error('Start recording failed:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true;
    }

    if (message.action === 'stop-recording') {
        chrome.storage.local.set({ isRecording: false, startTime: null });
        if (recordingTabId != null) {
            chrome.tabs.sendMessage(recordingTabId, { action: 'stop-recording' }).catch(() => {});
            recordingTabId = null;
        } else {
            sendToOffscreen({ action: 'offscreen-stop-recording' }).catch(() => {
                chrome.offscreen.closeDocument().catch(() => {});
            });
        }
    }

    if (message.action === 'recording-started-from-tab') {
        if (sender.tab && sender.tab.id) {
            recordingTabId = sender.tab.id;
            chrome.storage.local.set({ isRecording: true, startTime: Date.now() });
            setRecordingBadge(true);
            chrome.runtime.sendMessage({ action: 'recording-started' }).catch(() => {});
        }
    }

    if (message.action === 'recording-complete-from-tab') {
        recordingTabId = null;
        chrome.storage.local.set({ isRecording: false, startTime: null });
        setRecordingBadge(false);
    }

    if (message.action === 'recording-started') {
        chrome.storage.local.set({ isRecording: true, startTime: Date.now() });
        setRecordingBadge(true);
    }

    if (message.action === 'recording-complete') {
        chrome.storage.local.set({ isRecording: false, startTime: null });
        setRecordingBadge(false);
        chrome.offscreen.closeDocument().catch(() => {});
    }

    if (message.action === 'recording-failed') {
        chrome.storage.local.set({ isRecording: false, startTime: null });
        setRecordingBadge(false);
        chrome.offscreen.closeDocument().catch(() => {});
    }

    if (message.action === 'download-recording' && message.dataUrl && message.filename) {
        chrome.downloads.download({
            url: message.dataUrl,
            filename: message.filename,
            saveAs: true
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Download error:', chrome.runtime.lastError.message);
            }
        });
    }

});
let recordingTabId = null;

chrome.storage.local.get(['isRecording'], (result) => {
    setRecordingBadge(!!result.isRecording);
});

chrome.commands.onCommand.addListener((command) => {
    if (command !== 'start-stop-recording') return;
    chrome.storage.local.get(['isRecording'], (result) => {
        if (result.isRecording) {
            chrome.storage.local.set({ isRecording: false, startTime: null });
            setRecordingBadge(false);
            if (recordingTabId != null) {
                chrome.tabs.sendMessage(recordingTabId, { action: 'stop-recording' }).catch(() => {});
                recordingTabId = null;
            } else {
                sendToOffscreen({ action: 'offscreen-stop-recording' }).catch(() => {
                    chrome.offscreen.closeDocument().catch(() => {});
                });
            }
        } else {
            chrome.storage.local.get(['includeMic'], (storage) => {
                const includeMic = storage.includeMic === true;
                if (includeMic) {
                    chrome.tabs.create({ url: chrome.runtime.getURL('record-tab.html') });
                } else {
                    setupOffscreenDocument()
                        .then(() => sendToOffscreen({ action: 'offscreen-start-recording', includeMic: false }))
                        .catch(err => console.error('Start recording failed:', err));
                }
            });
        }
    });
});
