import { Audio } from "expo-av";

// Cache sound objects to prevent lag or memory leaks
const soundCache = {};

const soundFiles = {
  offer: require("../assets/offerPing.mp3"),
  success_chime: require("../assets/successChime.mp3"),
  complete: require("../assets/CompletedTrip.mp3"),
  soft_tap: require("../assets/Accepted.mp3"),
};

export async function playSound(soundKey) {
  try {
    let soundObj = soundCache[soundKey];

    if (!soundObj) {
      const { sound } = await Audio.Sound.createAsync(soundFiles[soundKey], {
        shouldPlay: false,
        volume: 1.0,
      });
      soundCache[soundKey] = sound;
      soundObj = sound;
    }

    await soundObj.stopAsync();
    await soundObj.setPositionAsync(0);
    await soundObj.playAsync();
  } catch (err) {
    console.log(`⚠️ Audio play error (${soundKey}):`, err.message);
  }
}