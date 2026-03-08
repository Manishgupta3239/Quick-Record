(function () {
    const messageEl = document.getElementById('message');
    const errorEl = document.getElementById('error');
    const buttonsEl = document.getElementById('buttons');
    const chooseScreenBtn = document.getElementById('chooseScreenBtn');
    const continueWithoutMicBtn = document.getElementById('continueWithoutMicBtn');
    const closeBtn = document.getElementById('closeBtn');
    const recordingUi = document.getElementById('recordingUi');
    const recordingStatus = document.getElementById('recordingStatus');
    const statusEl = document.getElementById('status');

    let micStream = null;
    let displayStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let audioContext = null;
    let mimeType = '';
    let includeMic = true;

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
        return types.find(function (t) { return MediaRecorder.isTypeSupported(t); }) || 'video/webm';
    }

    function getExtensionForMimeType(mt) {
        return mt.startsWith('video/mp4') ? 'mp4' : 'webm';
    }

    function mixDisplayAndMic(displayStream, micStream) {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
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
        const mixedStream = new MediaStream([videoTrack].concat(destination.stream.getAudioTracks()));
        return { mixedStream: mixedStream, audioContext: ctx };
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onloadend = function () { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function stopAllStreams() {
        if (displayStream) {
            displayStream.getTracks().forEach(function (t) { t.stop(); });
            displayStream = null;
        }
        if (micStream) {
            micStream.getTracks().forEach(function (t) { t.stop(); });
            micStream = null;
        }
        if (audioContext) {
            audioContext.close().catch(function () {});
            audioContext = null;
        }
    }

    function finishRecording(blob) {
        stopAllStreams();
        recordingUi.style.display = 'none';
        messageEl.style.display = 'block';
        messageEl.textContent = 'Saving recording…';
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const ext = getExtensionForMimeType(mimeType);
        const filename = 'screen-recording-' + ts + '.' + ext;
        blobToDataUrl(blob).then(function (dataUrl) {
            chrome.runtime.sendMessage({ action: 'download-recording', dataUrl: dataUrl, filename: filename }).catch(function () {});
            chrome.runtime.sendMessage({ action: 'recording-complete-from-tab' }).catch(function () {});
            messageEl.textContent = 'Recording saved. You can close this tab.';
            setTimeout(function () { window.close(); }, 1500);
        }).catch(function (err) {
            messageEl.textContent = 'Save failed. You can close this tab.';
        });
    }

    function startRecordingWithStream(streamToRecord) {
        mimeType = getSupportedMimeType();
        mediaRecorder = new MediaRecorder(streamToRecord, { mimeType: mimeType });
        recordedChunks = [];
        mediaRecorder.ondataavailable = function (e) {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = function () {
            const blob = new Blob(recordedChunks, { type: mimeType });
            finishRecording(blob);
        };
        mediaRecorder.start(1000);
        buttonsEl.style.display = 'none';
        messageEl.style.display = 'none';
        recordingUi.style.display = 'block';
        chrome.runtime.sendMessage({ action: 'recording-started-from-tab' }).catch(function () {});
    }

    function onDisplayReady(stream) {
        displayStream = stream;
        displayStream.getVideoTracks()[0].addEventListener('ended', function () {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        });
        messageEl.textContent = 'Starting recording…';
        let streamToRecord = displayStream;
        if (includeMic && micStream) {
            try {
                const mixed = mixDisplayAndMic(displayStream, micStream);
                audioContext = mixed.audioContext;
                streamToRecord = mixed.mixedStream;
            } catch (e) {
                console.warn('Mix failed, recording without mic', e);
            }
        }
        startRecordingWithStream(streamToRecord);
    }

    chooseScreenBtn.addEventListener('click', function () {
        chooseScreenBtn.disabled = true;
        messageEl.textContent = 'Choose what to share in the dialog…';
        navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            audio: true
        }).then(function (stream) {
            onDisplayReady(stream);
        }).catch(function (err) {
            messageEl.textContent = 'Screen sharing was cancelled or failed.';
            chooseScreenBtn.disabled = false;
        });
    });

    continueWithoutMicBtn.addEventListener('click', function () {
        includeMic = false;
        continueWithoutMicBtn.style.display = 'none';
        messageEl.textContent = 'Click "Choose screen to share" to continue.';
        if (micStream) {
            micStream.getTracks().forEach(function (t) { t.stop(); });
            micStream = null;
        }
    });

    closeBtn.addEventListener('click', function () { window.close(); });

    chrome.runtime.onMessage.addListener(function (message) {
        if (message.action === 'stop-recording' && mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    });

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        micStream = stream;
        messageEl.textContent = 'Microphone allowed. Click to choose what to share.';
        buttonsEl.style.display = 'block';
        chooseScreenBtn.style.display = 'inline-block';
        continueWithoutMicBtn.style.display = 'none';
    }).catch(function (err) {
        messageEl.textContent = 'Microphone was denied. You can continue without your voice.';
        errorEl.style.display = 'none';
        buttonsEl.style.display = 'block';
        chooseScreenBtn.style.display = 'inline-block';
        continueWithoutMicBtn.style.display = 'inline-block';
        includeMic = false;
    });
})();
