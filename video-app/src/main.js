import AgoraRTC from "agora-rtc-sdk-ng";


let client = null;
let localAudioTrack = null; 
let localVideoTrack = null; 

// connection parameters
let appId = "23514cfd35004e0690e18e3a0eb7c76c";
let channel = "test";
let token = "007eJxTYFB1NHTRdbGVXKl7eMoXt9jXPiGGEo+t808L68//uKzl12kFBiNjU0OT5LQUY1MDA5NUAzNLg1RDi1TjRIPUJPNkc7Pk4qa2zIZARobwE+sZGRkgEMRnYShJLS5hYAAArfweNw==";
let uid = 0; 

// Initialize the AgoraRTC client
function initializeClient() {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    setupEventListeners();
}

// Handle client events
function setupEventListeners() {
    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        console.log("subscribe success");

        if (mediaType === "video") {
            displayRemoteVideo(user);
        }

        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    });

    client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "video") {
            const remotePlayerContainer = document.getElementById(user.uid);
            remotePlayerContainer && remotePlayerContainer.remove();
        }
    });
}

// Join a channel and publish local media
async function joinChannel() {
    await client.join(appId, channel, token, uid);
    await createLocalTracks();
    await publishLocalTracks();
    displayLocalVideo();
    console.log("Publish success!");
}

// Create local audio and video tracks
async function createLocalTracks() {
    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    localVideoTrack = await AgoraRTC.createCameraVideoTrack();
}

// Publish local audio and video tracks
async function publishLocalTracks() {
    await client.publish([localAudioTrack, localVideoTrack]);
}

function displayLocalVideo() {
    const container = document.getElementById("video-streams");

    const localPlayerContainer = document.createElement("div");
    localPlayerContainer.id = uid;
    localPlayerContainer.className = "video-player";
    localPlayerContainer.textContent = `Local user ${uid}`;

    container.appendChild(localPlayerContainer);
    localVideoTrack.play(localPlayerContainer);
}

function displayRemoteVideo(user) {
    const container = document.getElementById("video-streams");

    const remotePlayerContainer = document.createElement("div");
    remotePlayerContainer.id = user.uid.toString();
    remotePlayerContainer.className = "video-player";
    remotePlayerContainer.textContent = `Remote user ${user.uid}`;

    container.appendChild(remotePlayerContainer);
    user.videoTrack.play(remotePlayerContainer);
}
// Leave the channel and clean up
async function leaveChannel() {
    // Close local tracks
    localAudioTrack.close();
    localVideoTrack.close();

    // Remove local video container
    const localPlayerContainer = document.getElementById(uid);
    localPlayerContainer && localPlayerContainer.remove();

    // Remove all remote video containers
    client.remoteUsers.forEach((user) => {
        const playerContainer = document.getElementById(user.uid);
        playerContainer && playerContainer.remove();
    });

    // Leave the channel
    await client.leave();
}

let micEnabled = true;
let camEnabled  = true;
let micButton = document.getElementById("mic-button");
let camButton = document.getElementById("camera-button");

// microphone toggle
async function micToggle() {
    micEnabled = !micEnabled;
    await localAudioTrack.setEnabled(micEnabled);
    micButton.textContent = micEnabled ? "Mic on" : "Mic off";
}

// camera toggle
async function camToggle() {
    camEnabled = !camEnabled;
    await localVideoTrack.setEnabled(camEnabled);
    camButton.textContent = camEnabled ? "Camera on" : "Camera off";
}

// Set up button click handlers
function setupButtonHandlers() {
    document.getElementById("join").onclick = joinChannel;
    document.getElementById("leave").onclick = leaveChannel;
    micButton.onclick = micToggle;
    camButton.onclick = camToggle;
}

// Start the basic call
function startBasicCall() {
    initializeClient();
    window.onload = setupButtonHandlers;
}

startBasicCall();