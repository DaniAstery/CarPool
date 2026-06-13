import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";

export default function LiveTrackingScreen() {
  // 📍 CORE PICKUP HUB (center of system)
  const pickupLocation = {
    latitude: 9.020,
    longitude: 38.770,
  };

  // 🚗 DRIVER approaching (smooth movement)
  const [driverLocation, setDriverLocation] = useState({
    latitude: 9.010,
    longitude: 38.760,
  });

  // 👤 PASSENGERS (clustered within ~100–300m)
  const passengers = [
    {
      id: 1,
      latitude: 9.021,
      longitude: 38.771,
      walk: 120, // meters
    },
    {
      id: 2,
      latitude: 9.019,
      longitude: 38.768,
      walk: 210,
    },
    {
      id: 3,
      latitude: 9.022,
      longitude: 38.769,
      walk: 280,
    },
  ];

  // 🚗 driver movement toward pickup (ETA simulation)
  useEffect(() => {
    const interval = setInterval(() => {
      setDriverLocation((prev) => ({
        latitude: prev.latitude + (pickupLocation.latitude - prev.latitude) * 0.08,
        longitude: prev.longitude + (pickupLocation.longitude - prev.longitude) * 0.08,
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {/* 📍 PICKUP HUB (MAIN FOCUS) */}
        <Marker coordinate={pickupLocation} title="Pickup Hub">
          <View style={styles.pickupHub} />
        </Marker>

        {/* 🚗 DRIVER */}
        <Marker coordinate={driverLocation} title="Driver">
          <View style={styles.driverPin}>
            <Text style={{ color: "white" }}>🚗</Text>
          </View>
        </Marker>

        {/* 👥 PASSENGERS (cluster view) */}
        {passengers.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.latitude, longitude: p.longitude }}>
            <View style={styles.passengerPin}>
              <Text style={{ color: "white", fontSize: 10 }}>{p.id}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* 📊 SMART PICKUP ANALYTICS PANEL */}
      <View style={styles.panel}>
        <Text style={styles.title}>🚖 Corridor Pool Optimized</Text>

        <Text style={styles.text}>
          📍 Pickup is centrally chosen for minimum total walking
        </Text>

        <Text style={styles.text}>
          👥 3 passengers clustered within 100–300m radius
        </Text>

        <Text style={styles.text}>
          🚶 Avg walking distance: ~200m (comfortable zone)
        </Text>

        <Text style={styles.text}>
          🚗 Driver ETA: ~3–5 minutes
        </Text>

        <Text style={styles.highlight}>
          ✔ Balanced comfort + efficiency achieved
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // 📍 pickup hub (important visual anchor)
  pickupHub: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1DB954",
    borderWidth: 3,
    borderColor: "white",
  },

  // 🚗 driver
  driverPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },

  // 👥 passengers
  passengerPin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },

  // 📊 panel
  panel: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    elevation: 6,
  },

  title: {
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 6,
  },

  text: {
    fontSize: 13,
    marginBottom: 3,
    color: "#333",
  },

  highlight: {
    marginTop: 6,
    fontWeight: "bold",
    color: "#1DB954",
  },
});