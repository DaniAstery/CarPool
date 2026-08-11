import { useEffect } from 'react';
import * as Location from 'expo-location';

// Replace with machine IP or emulator host (10.0.2.2 for Android Emulator)
const SERVER_URL = 'http://192.168.1.3:5001/api/driver/location';

export const useLocationPinger = (user, isActive = false) => {
  useEffect(() => {
    if (!user?.id || !isActive) return;

    let intervalId;

    const sendPing = async () => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        await fetch(SERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.id,
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            heading: location.coords.heading || 0.0,
          }),
        });
      } catch (err) {
        console.warn('⚠️ [GPS Ping Failed]:', err.message);
      }
    };

    // Immediate ping, then interval every 5 seconds
    sendPing();
    intervalId = setInterval(sendPing, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [user, isActive]);
};