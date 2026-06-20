import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";

export default function TripDepartureScreen({ navigation }) {
  // Simulating manifest state management for our matched passengers
  const [passengers, setPassengers] = useState([
    { id: "1", name: "Abebe Kebede", seats: 1, status: "Waiting" },
    { id: "2", name: "Aster Tolossa", seats: 1, status: "Waiting" },
  ]);

  // Cycle passenger status: Waiting ➔ Arrived ➔ Collected
  const advancePassengerStatus = (id) => {
    setPassengers((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          if (p.status === "Waiting") return { ...p, status: "Arrived" };
          if (p.status === "Arrived") return { ...p, status: "Collected" };
        }
        return p;
      })
    );
  };

  // The trip can only start if every matched rider has been successfully collected
  const allPassengersCollected = passengers.every((p) => p.status === "Collected");

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Precise Header Row */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Head to Pickup Point</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* 2. Dispatch Instruction Banner Card */}
        <View style={styles.dispatchBannerCard}>
          <FontAwesome5 name="map-marker-alt" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
          <View style={styles.dispatchTextFrame}>
            <Text style={styles.dispatchMainText}>Proceed to Megenagna Roundabout</Text>
            <Text style={styles.dispatchSubText}>Riders are walking to this location</Text>
          </View>
        </View>

        {/* 3. Passenger Manifest Checklist Module */}
        <Text style={styles.sectionHeading}>Passenger Manifest</Text>
        
        {passengers.map((passenger) => (
          <View key={passenger.id} style={styles.passengerCard}>
            <View style={styles.passengerMetaRow}>
              <View style={styles.avatarCircle}>
                <FontAwesome5 name="user" size={14} color="#4B5563" />
              </View>
              <View style={styles.passengerInfo}>
                <Text style={styles.passengerNameText}>{passenger.name}</Text>
                <Text style={styles.passengerSeatText}>
                  {passenger.seats} {passenger.seats === 1 ? "seat" : "seats"} reserved
                </Text>
              </View>

              {/* Dynamic Status Action Toggler Badge */}
              <TouchableOpacity
                style={[
                  styles.statusBadgeButton,
                  passenger.status === "Arrived" && styles.statusBadgeArrived,
                  passenger.status === "Collected" && styles.statusBadgeCollected,
                ]}
                activeOpacity={0.8}
                onPress={() => advancePassengerStatus(passenger.id)}
                disabled={passenger.status === "Collected"}
              >
                <Text style={[
                  styles.statusBadgeText,
                  passenger.status !== "Waiting" && styles.statusBadgeTextLight
                ]}>
                  {passenger.status === "Waiting" && "MARK ARRIVED"}
                  {passenger.status === "Arrived" && "MARK COLLECTED"}
                  {passenger.status === "Collected" && "COLLECTED ✓"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Informative Step Tip */}
        <View style={styles.tipBox}>
          <Ionicons name="information-circle-outline" size={16} color="#4B5563" style={{ marginRight: 6 }} />
          <Text style={styles.tipText}>Tap action buttons to log boardings as riders enter your vehicle.</Text>
        </View>

      </ScrollView>

      {/* 4. Core Primary Trip Action Footer */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          style={[
            styles.startTripButton,
            !allPassengersCollected && styles.startTripButtonDisabled
          ]}
          activeOpacity={0.8}
          disabled={!allPassengersCollected}
          onPress={() => {
            console.log("Corridor trip initiated live towards Bole destination node.");
            navigation.navigate("TripCompletionScreen");
          }}
        >
          <Text style={styles.startTripButtonText}>START TRIP</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  headerBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
  },
  backButton: { width: 32, height: 32, alignItems: "center", justifyBox: "center" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  dispatchBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937", // Crisp deep dark slate background
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  dispatchTextFrame: { flex: 1 },
  dispatchMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  dispatchSubText: { fontSize: 12, color: "#9CA3AF", marginTop: 3 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 2,
  },
  passengerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  passengerMetaRow: { flexDirection: "row", alignItems: "center" },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  passengerInfo: { flex: 1 },
  passengerNameText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  passengerSeatText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  statusBadgeButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 120,
    alignItems: "center",
  },
  statusBadgeArrived: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  statusBadgeCollected: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700", color: "#374151", letterSpacing: 0.2 },
  statusBadgeTextLight: { color: "#FFFFFF" },
  tipBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  tipText: { fontSize: 12, color: "#6B7280", fontStyle: "italic", textAlign: "center" },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  startTripButton: {
    backgroundColor: "#059669", // Vibrant dark green activation accent
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  startTripButtonDisabled: {
    backgroundColor: "#9CA3AF", // Soft layout gray color while lock conditions are missing
  },
  startTripButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});