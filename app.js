// ===== DANCE ALARM CLOCK - Main Application =====

// DOM Elements
const video = document.getElementById('camera');
const canvas = document.getElementById('poseCanvas');
const ctx = canvas.getContext('2d');
const alarmTimeDisplay = document.getElementById('alarmTime');
const currentTimeDisplay = document.getElementById('currentTime');
const danceMeterFill = document.getElementById('danceMeterFill');
const timeBubble = document.getElementById('timeBubble');
const statusIcon = document.getElementById('statusIcon');
const statusText = document.getElementById('statusText');
const startBtn = document.getElementById('startBtn');
const setAlarmBtn = document.getElementById('setAlarmBtn');
const danceMeterContainer = document.getElementById('danceMeterContainer');
const instructions = document.querySelector('.instructions');
const discoBall = document.querySelector('.disco-ball');
const rickrollAudio = document.getElementById('rickroll');
const confettiContainer = document.getElementById('confetti-container');

// Alarm screen elements
const alarmSetScreen = document.getElementById('alarmSetScreen');
const alarmSetTime = document.getElementById('alarmSetTime');
const currentTimeBig = document.getElementById('currentTimeBig');
const cancelAlarmBtn = document.getElementById('cancelAlarmBtn');
const alarmRingingScreen = document.getElementById('alarmRingingScreen');
const stopAlarmFill = document.getElementById('stopAlarmFill');
const stopAlarmProgress = document.getElementById('stopAlarmProgress');
const danceStatusRinging = document.getElementById('danceStatusRinging');

// State Variables
let detector = null;
let isRunning = false;
let lastPose = null;
let isDancing = false;
let movementHistory = [];
let alarmIsSet = false;

// Alarm mode states
let alarmMode = 'setup'; // 'setup', 'waiting', 'ringing'
let alarmCheckInterval = null;
let danceSecondsToStop = 0;
let lastStopDanceTime = null;
const SECONDS_TO_STOP_ALARM = 10;

// Time tracking - in minutes from midnight (0 = 12:00 AM, 1439 = 11:59 PM)
let currentAlarmMinutes = 0; // Start at 12:00 AM (midnight)
const MAX_MINUTES = 24 * 60 - 1; // 11:59 PM = 1439 minutes

// Dance detection settings - balanced for accuracy
const MOVEMENT_THRESHOLD = 20; // Higher threshold to avoid false positives from jitter
const MOVEMENT_HISTORY_SIZE = 6; // More frames for stability
const MIN_DANCE_FRAMES = 4; // Need consistent movement for this many frames

// Time advancement rate: 1 second of dancing = 1 minute of alarm time
const MINUTES_PER_SECOND = 1;

let lastDanceUpdateTime = null;
const handWarning = document.getElementById('handWarning');

// Funny status messages
const STATUS_IDLE = [
    { icon: '😴', text: 'Zzz... No dancing?' },
    { icon: '🥱', text: 'Bored... dance maybe?' },
    { icon: '👀', text: 'I see you... why no dance?' },
    { icon: '🐌', text: 'Move it or lose it!' },
    { icon: '🧍', text: 'Standing still...' },
];

const STATUS_DANCING = [
    { icon: '🕺', text: 'YEAH! GET IT!' },
    { icon: '💃', text: 'DANCE MACHINE!' },
    { icon: '🔥', text: 'YOURE ON FIRE!' },
    { icon: '🤩', text: 'INCREDIBLE MOVES!' },
    { icon: '🎉', text: 'PARTY TIME!' },
    { icon: '⚡', text: 'ELECTRIC!' },
    { icon: '🌟', text: 'SUPERSTAR!' },
    { icon: '🚀', text: 'TO THE MOON!' },
];

// ===== INITIALIZATION =====

startBtn.addEventListener('click', startApp);
setAlarmBtn.addEventListener('click', setAlarm);

async function startApp() {
    instructions.classList.add('hidden');
    statusText.textContent = 'Loading AI...';
    statusIcon.textContent = '🤖';

    try {
        // Check if TensorFlow.js is loaded
        if (typeof tf === 'undefined') {
            throw new Error('TensorFlow.js not loaded. Check internet connection.');
        }

        // Check if pose detection is loaded
        if (typeof poseDetection === 'undefined') {
            throw new Error('Pose Detection not loaded. Check internet connection.');
        }

        // Set backend to WebGL (most compatible)
        statusText.textContent = 'Setting up AI backend...';
        await tf.ready();
        console.log('TensorFlow.js backend:', tf.getBackend());

        await setupCamera();
        await setupPoseDetection();
        isRunning = true;
        discoBall.classList.add('active');
        danceMeterContainer.classList.remove('hidden'); // Show the time bar
        updateCurrentTime();
        setInterval(updateCurrentTime, 1000);
        updateTimeDisplay();
        detectPose();
    } catch (error) {
        console.error('Error starting app:', error);
        statusText.textContent = 'Error! Refresh page';
        statusIcon.textContent = '❌';

        // Show error details in console
        console.error('Full error details:', error.message);
    }
}

// ===== CAMERA SETUP =====

async function setupCamera() {
    statusText.textContent = 'Accessing camera...';

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    });

    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve();
        };
    });
}

// ===== POSE DETECTION SETUP =====

async function setupPoseDetection() {
    statusText.textContent = 'Loading dance detector...';

    try {
        const model = poseDetection.SupportedModels.MoveNet;
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true
        };

        detector = await poseDetection.createDetector(model, detectorConfig);
        statusText.textContent = 'Ready! Dance to move time forward!';
        statusIcon.textContent = '😎';
    } catch (error) {
        console.error('Pose detection setup error:', error);
        throw new Error('Failed to load dance detector: ' + error.message);
    }
}

// ===== POSE DETECTION LOOP =====

async function detectPose() {
    if (!isRunning) return;

    try {
        const poses = await detector.estimatePoses(video);

        if (poses.length > 0) {
            const pose = poses[0];
            analyzeDanceMovement(pose);
            drawPose(pose);
        } else {
            // No person detected
            if (isDancing) {
                stopDancing();
            }
            setIdleStatus();
        }
    } catch (error) {
        console.error('Pose detection error:', error);
    }

    requestAnimationFrame(detectPose);
}

// ===== IMPROVED DANCE ANALYSIS =====

// Movement velocity history for better detection
let velocityHistory = [];
const VELOCITY_HISTORY_SIZE = 8;

function analyzeDanceMovement(pose) {
    const keypoints = pose.keypoints;

    // Check visibility of key body parts
    const leftWrist = keypoints.find(kp => kp.name === 'left_wrist');
    const rightWrist = keypoints.find(kp => kp.name === 'right_wrist');
    const leftAnkle = keypoints.find(kp => kp.name === 'left_ankle');
    const rightAnkle = keypoints.find(kp => kp.name === 'right_ankle');
    const leftKnee = keypoints.find(kp => kp.name === 'left_knee');
    const rightKnee = keypoints.find(kp => kp.name === 'right_knee');
    const leftElbow = keypoints.find(kp => kp.name === 'left_elbow');
    const rightElbow = keypoints.find(kp => kp.name === 'right_elbow');
    const nose = keypoints.find(kp => kp.name === 'nose');

    const handsVisible = (leftWrist && leftWrist.score > 0.15) || (rightWrist && rightWrist.score > 0.15);
    const legsVisible = (leftAnkle && leftAnkle.score > 0.15) || (rightAnkle && rightAnkle.score > 0.15) ||
        (leftKnee && leftKnee.score > 0.15) || (rightKnee && rightKnee.score > 0.15);
    const bodyVisible = (nose && nose.score > 0.3);

    const limbsVisible = handsVisible || legsVisible || bodyVisible;

    // Show/hide warning
    if (!limbsVisible && handWarning) {
        handWarning.classList.remove('hidden');
    } else if (handWarning) {
        handWarning.classList.add('hidden');
    }

    // WEIGHTED body part tracking - hands and feet move more when dancing
    const weightedParts = [
        { name: 'left_wrist', weight: 2.5 },
        { name: 'right_wrist', weight: 2.5 },
        { name: 'left_elbow', weight: 1.5 },
        { name: 'right_elbow', weight: 1.5 },
        { name: 'left_ankle', weight: 2.0 },
        { name: 'right_ankle', weight: 2.0 },
        { name: 'left_knee', weight: 1.5 },
        { name: 'right_knee', weight: 1.5 },
        { name: 'left_shoulder', weight: 1.0 },
        { name: 'right_shoulder', weight: 1.0 },
        { name: 'left_hip', weight: 1.2 },
        { name: 'right_hip', weight: 1.2 },
        { name: 'nose', weight: 0.8 }
    ];

    let weightedMovement = 0;
    let totalWeight = 0;
    let maxVelocity = 0;

    if (lastPose) {
        weightedParts.forEach(part => {
            const current = keypoints.find(kp => kp.name === part.name);
            const previous = lastPose.keypoints.find(kp => kp.name === part.name);

            if (current && previous && current.score > 0.15 && previous.score > 0.15) {
                const dx = current.x - previous.x;
                const dy = current.y - previous.y;
                const velocity = Math.sqrt(dx * dx + dy * dy);

                // Apply weight
                weightedMovement += velocity * part.weight;
                totalWeight += part.weight;

                // Track maximum velocity (for detecting sudden movements)
                if (velocity > maxVelocity) {
                    maxVelocity = velocity;
                }
            }
        });
    }

    lastPose = pose;

    // Calculate weighted average velocity
    const avgVelocity = totalWeight > 0 ? weightedMovement / totalWeight : 0;

    // Combine average and max velocity for better detection
    // Max velocity helps detect quick jerky dance moves
    const combinedScore = avgVelocity * 0.6 + maxVelocity * 0.4;

    // Update velocity history with exponential smoothing
    velocityHistory.push(combinedScore);
    if (velocityHistory.length > VELOCITY_HISTORY_SIZE) {
        velocityHistory.shift();
    }

    // Calculate smoothed movement score with recent frames weighted more
    let smoothedScore = 0;
    let weightSum = 0;
    velocityHistory.forEach((v, i) => {
        const recencyWeight = (i + 1) / velocityHistory.length; // Recent frames weighted more
        smoothedScore += v * recencyWeight;
        weightSum += recencyWeight;
    });
    smoothedScore = weightSum > 0 ? smoothedScore / weightSum : 0;

    // Dynamic threshold - lower when movement is detected
    const dynamicThreshold = isDancing ? MOVEMENT_THRESHOLD * 0.7 : MOVEMENT_THRESHOLD;

    // Detect dancing based on smoothed score AND limbs must be visible
    const isCurrentlyDancing = limbsVisible && smoothedScore > dynamicThreshold;

    // Update status text with movement level for debugging
    if (limbsVisible && alarmMode === 'setup' && !isDancing) {
        const movementLevel = Math.min(Math.floor(smoothedScore / MOVEMENT_THRESHOLD * 100), 100);
        if (movementLevel > 30) {
            statusText.textContent = `Moving... ${movementLevel}%`;
        }
    }

    if (isCurrentlyDancing && !isDancing) {
        // Started dancing!
        startDancing();
    } else if (!isCurrentlyDancing && isDancing) {
        // Stopped dancing
        stopDancing();
    }

    if (isDancing) {
        // Update progress based on mode
        if (alarmMode === 'ringing') {
            updateStopAlarmProgress();
            danceStatusRinging.textContent = '🔥 KEEP DANCING! 🔥';
        } else if (alarmMode === 'setup') {
            updateDanceProgress();
        }
    } else if (alarmMode === 'ringing') {
        // Not dancing in ringing mode - reset stop progress
        lastStopDanceTime = null;
        danceStatusRinging.textContent = 'START DANCING!';
    }
}

function startDancing() {
    isDancing = true;
    lastDanceUpdateTime = Date.now();
    document.body.classList.add('dancing');
    statusIcon.classList.add('dancing');

    // Only play music in setup mode (alarm ringing has its own music)
    if (alarmMode === 'setup') {
        rickrollAudio.volume = 0.7;
        rickrollAudio.play().catch(e => console.log('Audio play prevented:', e));
    }

    setDancingStatus();
}

function stopDancing() {
    isDancing = false;
    lastDanceUpdateTime = null;
    document.body.classList.remove('dancing');
    statusIcon.classList.remove('dancing');

    // Only pause music in setup mode
    if (alarmMode === 'setup') {
        rickrollAudio.pause();
    }

    setIdleStatus();
}

function updateDanceProgress() {
    if (!lastDanceUpdateTime) {
        lastDanceUpdateTime = Date.now();
        return;
    }

    const now = Date.now();
    const elapsedSeconds = (now - lastDanceUpdateTime) / 1000;

    // Every second of dancing = 1 minute forward on alarm
    const minutesToAdd = Math.floor(elapsedSeconds * MINUTES_PER_SECOND);

    if (minutesToAdd > 0) {
        const previousMinutes = currentAlarmMinutes;
        currentAlarmMinutes = Math.min(currentAlarmMinutes + minutesToAdd, MAX_MINUTES);
        lastDanceUpdateTime = now;

        // Check if we crossed an hour boundary for celebration
        const previousHour = Math.floor(previousMinutes / 60);
        const currentHour = Math.floor(currentAlarmMinutes / 60);

        if (currentHour > previousHour) {
            celebrateHourChange(currentHour);
        }

        updateTimeDisplay();
    }

    // Update dancing status randomly
    if (Math.random() < 0.02) {
        setDancingStatus();
    }
}

function updateTimeDisplay() {
    // Update the alarm time display
    const hours24 = Math.floor(currentAlarmMinutes / 60);
    const minutes = currentAlarmMinutes % 60;

    let displayHour = hours24 % 12;
    if (displayHour === 0) displayHour = 12;
    const ampm = hours24 < 12 ? 'AM' : 'PM';

    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const timeString = `${displayHour}:${minutesStr} ${ampm}`;

    alarmTimeDisplay.textContent = timeString;

    // Update progress bar (0% = 12:00 AM, 100% = 11:59 PM)
    const progressPercent = (currentAlarmMinutes / MAX_MINUTES) * 100;
    danceMeterFill.style.width = `${Math.max(progressPercent, 1)}%`;

    // Position the time bubble to follow the progress (left to right)
    const bubblePosition = Math.max(progressPercent, 2); // Min 2% so it's visible
    timeBubble.style.left = `${bubblePosition}%`;
    timeBubble.textContent = timeString;
}

function celebrateHourChange(hour) {
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    const ampm = hour < 12 ? 'AM' : 'PM';

    // Big celebration text
    const celebText = document.createElement('div');
    celebText.className = 'hour-change-text';
    celebText.textContent = `${displayHour}:00 ${ampm}! 🎉`;
    document.body.appendChild(celebText);

    setTimeout(() => celebText.remove(), 2000);

    // Confetti explosion!
    createConfetti(50);
}

function setAlarm() {
    if (currentAlarmMinutes === 0) {
        // Can't set alarm at 12:00 AM - need to dance first!
        statusText.textContent = 'Dance first to set a time!';
        statusIcon.textContent = '💃';
        return;
    }

    alarmIsSet = true;
    alarmMode = 'waiting';

    // Get alarm time string
    const hours24 = Math.floor(currentAlarmMinutes / 60);
    const minutes = currentAlarmMinutes % 60;
    let displayHour = hours24 % 12;
    if (displayHour === 0) displayHour = 12;
    const ampm = hours24 < 12 ? 'AM' : 'PM';
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const timeString = `${displayHour}:${minutesStr} ${ampm}`;

    // Show alarm set screen
    danceMeterContainer.classList.add('hidden');
    alarmSetScreen.classList.remove('hidden');
    alarmSetTime.textContent = timeString;

    // Stop current dancing music
    rickrollAudio.pause();
    isDancing = false;
    document.body.classList.remove('dancing');

    // Start checking for alarm time
    alarmCheckInterval = setInterval(checkAlarmTime, 1000);

    createConfetti(100);
}

function cancelAlarm() {
    alarmIsSet = false;
    alarmMode = 'setup';
    currentAlarmMinutes = 0;

    if (alarmCheckInterval) {
        clearInterval(alarmCheckInterval);
        alarmCheckInterval = null;
    }

    alarmSetScreen.classList.add('hidden');
    danceMeterContainer.classList.remove('hidden');
    updateTimeDisplay();
}

function checkAlarmTime() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Update current time display
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const secondsStr = seconds < 10 ? '0' + seconds : seconds;
    currentTimeBig.textContent = `${hours}:${minutesStr}:${secondsStr} ${ampm}`;

    // Check if alarm should trigger
    if (currentMinutes >= Math.floor(currentAlarmMinutes / 60) * 60 + (currentAlarmMinutes % 60)) {
        triggerAlarm();
    }
}

function triggerAlarm() {
    if (alarmCheckInterval) {
        clearInterval(alarmCheckInterval);
        alarmCheckInterval = null;
    }

    alarmMode = 'ringing';
    danceSecondsToStop = 0;
    lastStopDanceTime = null;

    // Hide waiting screen, show ringing screen
    alarmSetScreen.classList.add('hidden');
    alarmRingingScreen.classList.remove('hidden');

    // Play alarm sound (rickroll!)
    rickrollAudio.volume = 1.0;
    rickrollAudio.currentTime = 0;
    rickrollAudio.play().catch(e => console.log('Audio play prevented:', e));

    // Update UI
    stopAlarmFill.style.width = '0%';
    stopAlarmProgress.textContent = `0 / ${SECONDS_TO_STOP_ALARM} seconds`;
    danceStatusRinging.textContent = 'START DANCING!';
}

function updateStopAlarmProgress() {
    if (alarmMode !== 'ringing') return;

    if (!lastStopDanceTime) {
        lastStopDanceTime = Date.now();
        return;
    }

    const now = Date.now();
    const elapsed = (now - lastStopDanceTime) / 1000;
    danceSecondsToStop += elapsed;
    lastStopDanceTime = now;

    const progressPercent = Math.min((danceSecondsToStop / SECONDS_TO_STOP_ALARM) * 100, 100);
    stopAlarmFill.style.width = `${progressPercent}%`;
    stopAlarmProgress.textContent = `${Math.floor(danceSecondsToStop)} / ${SECONDS_TO_STOP_ALARM} seconds`;

    if (danceSecondsToStop >= SECONDS_TO_STOP_ALARM) {
        stopAlarm();
    }
}

function stopAlarm() {
    alarmMode = 'setup';
    alarmIsSet = false;
    danceSecondsToStop = 0;
    currentAlarmMinutes = 0;

    // Stop music
    rickrollAudio.pause();
    rickrollAudio.currentTime = 0;

    // Hide ringing screen
    alarmRingingScreen.classList.add('hidden');
    danceMeterContainer.classList.remove('hidden');

    // Big celebration
    const celebText = document.createElement('div');
    celebText.className = 'hour-change-text';
    celebText.textContent = 'ALARM STOPPED! 🎉';
    document.body.appendChild(celebText);
    setTimeout(() => celebText.remove(), 2000);

    createConfetti(150);
    updateTimeDisplay();
}

// Add event listener for cancel button
if (cancelAlarmBtn) {
    cancelAlarmBtn.addEventListener('click', cancelAlarm);
}

// ===== DRAW POSE =====

function drawPose(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror the canvas to match video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);

    // Draw keypoints
    pose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.3) {
            ctx.beginPath();
            ctx.arc(keypoint.x, keypoint.y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = isDancing ? '#ff0080' : '#00ffff';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });

    // Draw skeleton lines
    const connections = [
        ['left_shoulder', 'right_shoulder'],
        ['left_shoulder', 'left_elbow'],
        ['left_elbow', 'left_wrist'],
        ['right_shoulder', 'right_elbow'],
        ['right_elbow', 'right_wrist'],
        ['left_shoulder', 'left_hip'],
        ['right_shoulder', 'right_hip'],
        ['left_hip', 'right_hip'],
        ['left_hip', 'left_knee'],
        ['left_knee', 'left_ankle'],
        ['right_hip', 'right_knee'],
        ['right_knee', 'right_ankle'],
    ];

    connections.forEach(([start, end]) => {
        const startPoint = pose.keypoints.find(kp => kp.name === start);
        const endPoint = pose.keypoints.find(kp => kp.name === end);

        if (startPoint && endPoint && startPoint.score > 0.3 && endPoint.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(startPoint.x, startPoint.y);
            ctx.lineTo(endPoint.x, endPoint.y);
            ctx.strokeStyle = isDancing ? '#ff0080' : '#00ffff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    });

    ctx.restore();
}

// ===== STATUS UPDATES =====

function setIdleStatus() {
    const status = STATUS_IDLE[Math.floor(Math.random() * STATUS_IDLE.length)];
    statusIcon.textContent = status.icon;
    statusText.textContent = status.text;
}

function setDancingStatus() {
    const status = STATUS_DANCING[Math.floor(Math.random() * STATUS_DANCING.length)];
    statusIcon.textContent = status.icon;
    statusText.textContent = status.text;
}

// ===== CONFETTI =====

function createConfetti(count) {
    const colors = ['#ff0080', '#00ffff', '#ffff00', '#ff6600', '#00ff00', '#ff00ff'];

    for (let i = 0; i < count; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
        confetti.style.animationDelay = `${Math.random() * 0.5}s`;
        confettiContainer.appendChild(confetti);

        setTimeout(() => confetti.remove(), 4000);
    }
}

// ===== TIME UPDATES =====

function updateCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    currentTimeDisplay.textContent = `${hours}:${minutesStr} ${ampm}`;
}

// Initialize display
updateTimeDisplay();
