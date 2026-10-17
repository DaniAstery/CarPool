import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Button,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PassengerJoinedPoolScreen({ route, navigation }) {
  const ride = route?.params?.ride || {};

  const [status, setStatus] = useState("confirmed");

  return (
    <SafeAreaView style={styles.container}>

      {/* STATUS CARD */}
      <View style={styles.successCard}>
        <Text style={styles.successTitle}>
          🚖 {ride.start_location || "Start"} → {ride.end_location || "End"}
        </Text>

        <Text style={styles.successSubtitle}>
          {status === "confirmed" && "Ride confirmed. Tap I'm On My Way."}
          {status === "enroute" && "Heading to driver location..."}
          {status === "arrived" && "Waiting for driver confirmation."}
        </Text>

        <Text style={styles.successSubtitle}>
          👥 {ride.filled ?? 0}/{ride.total_seats ?? 3}
        </Text>
      </View>

      {/* DRIVER CARD */}
      <View style={styles.card}>
        <Text style={styles.label}>DRIVER</Text>

        <Text style={styles.driver}>
          {ride.driver_name || "Driver"} ⭐ {ride.driver_rating || "4.5"}
        </Text>

        <Text style={styles.sub}>
          {ride.make || "Car"} {ride.model || ""}
        </Text>

        <Text style={styles.sub}>
          📍 Driver is waiting nearby
        </Text>
      </View>

      {/* ACTIONS */}
      {status === "confirmed" && (
        <Button
          title="I'm On My Way"
          onPress={() => {
            setStatus("enroute"); // optional: update UI state
            navigation.navigate("LiveTrackingScreen", { ride });
          }}
        />
      )}

      {status === "enroute" && (
        <TouchableOpacity
          style={styles.button}
          onPress={() => setStatus("arrived")}
        >
          <Text style={styles.buttonText}>
            📍 I'VE ARRIVED
          </Text>
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
        <Text style={styles.cancelText}>
          CANCEL RIDE
        </Text>
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

  map: {
    height: 250,   // MUST exist
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 15,
  },

  mapText: {
    color: "#666",
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

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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

  callButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },

  callText: {
    fontSize: 22,
  },

  seats: {
    color: "#666",
  },

  progressTrack: {
    height: 8,
    backgroundColor: "#e5e7eb",
    borderRadius: 20,
    marginVertical: 15,
  },

  progressFill: {
    width: "66%",
    height: 8,
    backgroundColor: "#16a34a",
    borderRadius: 20,
  },

  location: {
    fontSize: 16,
    marginBottom: 12,
  },

  cancelButton: {
    borderWidth: 2,
    borderColor: "#dc2626",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
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
  backgroundColor: "#f3f4f6",
  borderRadius: 12,
  marginTop: 15,
},

waitText: {
  textAlign: "center",
  fontWeight: "600",
},


cancelText: {
  color: "#dc2626",
  fontWeight: "700",
},
});