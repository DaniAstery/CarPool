import { useEffect } from 'react';
import * as Location from 'expo-location';

// ⚠️ Ensure this IP matches your server machine and port 5001
const SERVER_URL = 'http://100.108.52.79:5001/api/location/ping';

export const useLocationPinger = (userOrId, isActive = false) => {
  // Extract primitive user ID safely from object or raw value
  const userId = typeof userOrId === 'object' 
    ? (userOrId?.id || userOrId?.userId) 
    : userOrId;

  useEffect(() => {
    console.log('🔍 [Pinger Hook Triggered]', { userId, isActive });

    if (!userId || !isActive) {
      if (!userId) console.warn('⚠️ [Pinger Aborted]: userId is missing or undefined.');
      if (!isActive) console.warn('⚠️ [Pinger Aborted]: isActive is false.');
      return;
    }

    let subscription = null;

    const startPinger = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('⚠️ [GPS Ping]: Location permission denied.');
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 3,
          },
          async (location) => {
            const { latitude, longitude, heading } = location.coords;

            console.log(`📡 [Sending Live GPS] User: ${userId} | Lat: ${latitude} | Lng: ${longitude}`);

            try {
              const response = await fetch(SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  user_id: userId,
                  lat: latitude,
                  lng: longitude,
                  heading: heading || 0.0,
                }),
              });

              const resData = await response.json();
              console.log('✅ [Ping Response]:', resData);
            } catch (err) {
              console.warn('⚠️ [GPS Ping Network Error]:', err.message);
            }
          }
        );
      } catch (err) {
        console.error('❌ [GPS Watcher Error]:', err);
      }
    };

    startPinger();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [userId, isActive]);
};