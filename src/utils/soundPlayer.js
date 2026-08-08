import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

// Cache active audio players to avoid reloading assets
const playerCache = {};

const soundFiles = {
  1: require("../../assets/sounds/1.mp3"),
  2: require("../../assets/sounds/2.mp3"),
  3: require("../../assets/sounds/3.mp3"),
  4: require("../../assets/sounds/4.mp3"),
  "1": require("../../assets/sounds/1.mp3"),
  "2": require("../../assets/sounds/2.mp3"),
  "3": require("../../assets/sounds/3.mp3"),
  "4": require("../../assets/sounds/4.mp3"),
  "1.mp3": require("../../assets/sounds/1.mp3"),
  "2.mp3": require("../../assets/sounds/2.mp3"),
  "3.mp3": require("../../assets/sounds/3.mp3"),
  "4.mp3": require("../../assets/sounds/4.mp3"),
  offer: require("../../assets/sounds/1.mp3"),
  success_chime: require("../../assets/sounds/2.mp3"),
  complete: require("../../assets/sounds/3.mp3"),
  soft_tap: require("../../assets/sounds/4.mp3"),
};

// Configure global audio mode once so it mixes seamlessly without ducking background apps
setAudioModeAsync({
  playsInSilentMode: true,
  interruptionMode: "mixWithOthers", // Crucial: Tells Android NOT to request audio focus or lower other apps
});

export async function playSound(soundKey) {
  try {
    const fileSource = soundFiles[soundKey];
    
    if (!fileSource) {
      console.log(`⚠️ Audio play error: Sound key "${soundKey}" not found.`);
      return;
    }

    let player = playerCache[soundKey];

    if (!player) {
      player = createAudioPlayer(fileSource);
      player.volume = 1.0;
      playerCache[soundKey] = player;
    }

    // expo-audio stays paused at the end, so reset position to start before playing
    player.seekTo(0);
    player.play();
  } catch (err) {
    console.log(`⚠️ Audio play error (${soundKey}):`, err.message);
  }
}