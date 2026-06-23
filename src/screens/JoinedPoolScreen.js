import React, { useState } from "react";
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Button,
} from "react-native";
import MapView, { Marker } from "react-native-maps"; // 📍 Imported map elements

export default function PassengerJoinedPoolScreen({ route, navigation }) {
  const ride = route?.params?.ride || {};
  const [status, setStatus] = useState("confirmed");

  // coordinates localized near central Addis Ababa
  const passengerLocation = {
    latitude: 9.0222,
    longitude: 38.7468,
  };

  const driverLocation = {
    latitude: 9.0255,
    longitude: 38.7425,
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 🗺️ INTERACTIVE MAP VIEW */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: (passengerLocation.latitude + driverLocation.latitude) / 2,
            longitude: (passengerLocation.longitude + driverLocation.longitude) / 2,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
        >
          {/* Passenger Placement */}
          <Marker 
            coordinate={passengerLocation} 
            title="Your Location" 
            pinColor="blue"
          />
          
          {/* Driver/Hub Placement */}
          <Marker 
            coordinate={driverLocation} 
            title="Pickup Hub" 
            pinColor="green"
          />
        </MapView>
      </View>

      {/* STATUS CARD */}
      <View style={styles.successCard}>
        <Text style={styles.successTitle}>
          🚖 {ride.start_location || "Bole"} → {ride.end_location || "Mexiko"}
        </Text>

        <Text style={styles.successSubtitle}>
          {status === "confirmed" && "Ride confirmed. Tap I'm On My Way."}
          {status === "enroute" && "Heading to driver location..."}
          {status === "arrived" && "Waiting for driver confirmation."}
        </Text>

        <Text style={styles.successSubtitle}>
          👥 {ride.filled ?? 1}/{ride.total_seats ?? 4}
        </Text>
      </View>

      {/* DRIVER CARD */}
      <View style={styles.card}>
        <Text style={styles.label}>DRIVER</Text>
        <Text style={styles.driver}>
          {ride.driver_name || "Dawit K."} ⭐ {ride.driver_rating || "4.9"}
        </Text>
        <Text style={styles.sub}>
          {ride.make || "Toyota"} {ride.model || "Vitz"}
        </Text>
        <Text style={styles.sub}>
          📍 Driver is waiting nearby at the designated corridor hub
        </Text>
      </View>

      {/* ACTIONS */}
      {status === "confirmed" && (
        <Button
          title="I'm On My Way"
          onPress={() => {
            setStatus("enroute"); 
            navigation.navigate("LiveTrackingScreen", { ride });
          }}
        />
      )}

      {status === "enroute" && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => setStatus("arrived")}
        >
          <Text style={styles.buttonText}>📍 I'VE ARRIVED</Text>
        </TouchableOpacity>
      )}

      {status === "arrived" && (
        <View style={styles.waitBox}>
          <Text style={styles.waitText}>
            ⏳ Waiting for driver confirmation...
          </Text>
        </View>
      )}

      {/* CANCEL */}
      <TouchableOpacity style={styles.cancelButton}>
        <Text style={styles.cancelText}>CANCEL RIDE</Text>
      </TouchableOpacity>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 15,
  },
  mapContainer: {
    height: 250,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 15,
  },
  map: {
    ...StyleSheet.absoluteFillObject, // map fills entire wrapper frame safely
  },
  successCard: {
    backgroundColor: "#ecfdf5",
    padding: 18,
    borderRadius: 16,
    marginBottom: 15,
  },
  successTitle: {
    color: "#15803d",
    fontSize: 20,
    fontWeight: "700",
  },
  successSubtitle: {
    color: "#374151",
    marginTop: 3,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 15,
  },
  label: {
    fontWeight: "700",
    color: "#444",
  },
  driver: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 8,
  },
  sub: {
    color: "#666",
    marginTop: 3,
  },
  cancelButton: {
    borderWidth: 2,
    borderColor: "#dc2626",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 'auto', // push cancel action directly to the page foot area cleanly
  },
  cancelText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 15,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  waitBox: {
    padding: 16,
    backgroundColor: "#e5e7eb",
    borderRadius: 12,
    marginTop: 15,
  },
  waitText: {
    textAlign: "center",
    fontWeight: "600",
    color: "#374151"
  },
});