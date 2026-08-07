import { Audio } from "expo-av";

// Cache sound objects to prevent lag or memory leaks
const soundCache = {};

const soundFiles = {
  // Numeric and string keys without extension
  1: require("../../assets/sounds/1.mp3"),
  2: require("../../assets/sounds/2.mp3"),
  3: require("../../assets/sounds/3.mp3"),
  4: require("../../assets/sounds/4.mp3"),
  "1": require("../../assets/sounds/1.mp3"),
  "2": require("../../assets/sounds/2.mp3"),
  "3": require("../../assets/sounds/3.mp3"),
  "4": require("../../assets/sounds/4.mp3"),

  // Keys with .mp3 extension
  "1.mp3": require("../../assets/sounds/1.mp3"),
  "2.mp3": require("../../assets/sounds/2.mp3"),
  "3.mp3": require("../../assets/sounds/3.mp3"),
  "4.mp3": require("../../assets/sounds/4.mp3"),

  // Semantic fallback aliases
  offer: require("../../assets/sounds/1.mp3"),
  success_chime: require("../../assets/sounds/2.mp3"),
  complete: require("../../assets/sounds/3.mp3"),
  soft_tap: require("../../assets/sounds/4.mp3"),
};

export async function playSound(soundKey) {
  try {
    const fileSource = soundFiles[soundKey];
    
    if (!fileSource) {
      console.log(`⚠️ Audio play error: Sound key "${soundKey}" not found in soundFiles dictionary.`);
      return;
    }

    let soundObj = soundCache[soundKey];

    if (!soundObj) {
      const { sound } = await Audio.Sound.createAsync(fileSource, {
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