let mediaRecorder = null;
let recordedChunks = [];
let activeStream = null;
let micStream = null;
let audioContext = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'offscreen-start-recording') {
        sendResponse({ received: true });
        startRecording(message.includeMic === true);
    }

    if (message.action === 'offscreen-stop-recording') {
        stopRecording();
    }
});

function getSupportedMimeType() {
    const types = [
        'video/mp4',
        'video/mp4; codecs=avc1',
        'video/mp4; codecs=avc1,aac',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

function getExtensionForMimeType(mimeType) {
    return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/**
 * Mixes display stream (screen + its audio) with microphone stream using Web Audio API.
 * Returns a new MediaStream: display video + mixed audio. Caller must clean up streams and context.
 */
function mixDisplayAndMic(displayStream, micStream) {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    const destination = ctx.createMediaStreamDestination();

    const displayAudioTracks = displayStream.getAudioTracks();
    if (displayAudioTracks.length > 0) {
        const displayAudioStream = new MediaStream(displayAudioTracks);
        const displaySource = ctx.createMediaStreamSource(displayAudioStream);
        displaySource.connect(destination);
    }

    const micSource = ctx.createMediaStreamSource(micStream);
    micSource.connect(destination);

    const videoTrack = displayStream.getVideoTracks()[0];
    const mixedStream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);
    return { mixedStream, audioContext: ctx };
}

async function startRecording(includeMic) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

    micStream = null;
    audioContext = null;

    try {
        activeStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            audio: true
        });

        activeStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopRecording();
        });

        let streamToRecord = activeStream;
        if (includeMic) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const { mixedStream, audioContext: ctx } = mixDisplayAndMic(activeStream, micStream);
                audioContext = ctx;
                streamToRecord = mixedStream;
            } catch (micErr) {
                console.warn('Microphone access denied or failed, recording without mic:', micErr);
                if (micStream) {
                    micStream.getTracks().forEach(t => t.stop());
                    micStream = null;
                }
            }
        }

        const mimeType = getSupportedMimeType();
        mediaRecorder = new MediaRecorder(streamToRecord, { mimeType });
        recordedChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
            const blob = new Blob(recordedChunks, { type: mimeType });
            recordedChunks = [];

            if (activeStream) {
                activeStream.getTracks().forEach(t => t.stop());
                activeStream = null;
            }
            if (micStream) {
                micStream.getTracks().forEach(t => t.stop());
                micStream = null;
            }
            if (audioContext) {
                audioContext.close().catch(() => {});
                audioContext = null;
            }

            try {
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const ext = getExtensionForMimeType(mimeType);
                const filename = `screen-recording-${ts}.${ext}`;
                const dataUrl = await blobToDataUrl(blob);
                chrome.runtime.sendMessage({ action: 'download-recording', dataUrl, filename }).catch(() => {});
            } catch (err) {
                console.error('Download failed:', err);
            }

            chrome.runtime.sendMessage({ action: 'recording-complete' }).catch(() => {});
        };

        mediaRecorder.start(1000);
        chrome.runtime.sendMessage({ action: 'recording-started' }).catch(() => {});

    } catch (err) {
        console.error('Recording failed:', err);
        if (activeStream) {
            activeStream.getTracks().forEach(t => t.stop());
            activeStream = null;
        }
        if (micStream) {
            micStream.getTracks().forEach(t => t.stop());
            micStream = null;
        }
        if (audioContext) {
            audioContext.close().catch(() => {});
            audioContext = null;
        }
        chrome.runtime.sendMessage({
            action: 'recording-failed',
            error: err.name === 'NotAllowedError' ? 'Screen sharing was denied' : err.message
        }).catch(() => {});
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
