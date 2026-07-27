import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";

export default function WaitingForPassengersScreen({ navigation }) {
  // 🚖 Real-world Driver Profile Context
  const currentDriverId = 101; 
  const currentDriverHub = "Megenagna"; // Filter token matched against passenger rows

  const [loading, setLoading] = useState(true);
  const [passengers, setPassengers] = useState([]);
  const [rideStatus, setRideStatus] = useState("pooling");
  const [activeRideOfferId, setActiveRideOfferId] = useState(null);

  // Financial Pricing Logic Engine
  const pricePerSeat = passengers.length >= 4 ? 70 : passengers.length === 3 ? 80 : 120;
  const totalGrossYield = passengers.length * pricePerSeat;

  // 📡 Real-Time Database Roster Polling Pipeline
  useEffect(() => {
    console.log(`📡 Querying active matching queues at [${currentDriverHub}] Hub for Driver ID: [${currentDriverId}]`);

    async function streamHubRoster() {
      try {
        const response = await fetch(
          `http://192.168.63.52:5000/api/rides/active-hub-matches?hub=${currentDriverHub}&driverId=${currentDriverId}`
        );
        if (!response.ok) return;

        const data = await response.json();
        
        setPassengers(data.passengers || []);
        setRideStatus(data.status); // 'pooling' or 'ready'
        if (data.rideOfferId) {
          setActiveRideOfferId(data.rideOfferId);
        }
        
        setLoading(false);
      } catch (err) {
        console.log("Database polling dropped out for hub stream:", err);
      }
    }

    // Execute tracking thread instantly and sync every 2.5 seconds
    streamHubRoster();
    const syncInterval = setInterval(streamHubRoster, 2500);

    return () => clearInterval(syncInterval);
  }, [currentDriverHub, currentDriverId]);

  // 📤 Start Corridor Run Transaction Handler
  const handleStartTrip = async () => {
    if (!activeRideOfferId) return;
    
    try {
      const res = await fetch("http://192.168.63.52:5000/api/rides/start-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: activeRideOfferId }),
      });

      if (res.ok) {
        navigation.navigate("ProposalDriver", { rideOfferId: activeRideOfferId });
      }
    } catch (err) {
      console.log("Failed to issue transit start command to backend database:", err);
      navigation.navigate("ProposalDriver", { rideOfferId: activeRideOfferId });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerElements]}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Scanning {currentDriverHub} corridor for matches...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Waiting for Passengers</Text>
        <View style={[styles.timerBadge, rideStatus === "ready" && styles.timerLocked]}>
          <Text style={styles.timerText}>
            {rideStatus === "ready" ? "READY" : "POOLING"}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        <View style={styles.locationContextBar}>
          <View style={[styles.contextDot, rideStatus === "ready" && { backgroundColor: "#10B981" }]} />
          <Text style={styles.contextBarText}>
            {rideStatus === "ready" 
              ? "Threshold met! You can now start the corridor route." 
              : `Hub: ${currentDriverHub} • Awaiting minimum threshold (2+ matched riders)...`}
          </Text>
        </View>

        {/* Live Passenger List directly fed by PostgreSQL filters */}
        <Text style={styles.sectionHeadingLabel}>Rider Roster Status ({passengers.length})</Text>
        <View style={styles.manifestCard}>
          {passengers.length === 0 ? (
            <Text style={styles.emptyManifestText}>Searching for matched riders at {currentDriverHub}...</Text>
          ) : (
            passengers.map((passenger, index) => (
              <View key={passenger.userId}>
                <View style={styles.passengerRow}>
                  <View style={[styles.avatarCircle, rideStatus === "ready" && styles.avatarCircleArrived]}>
                    <FontAwesome5 
                      name="user" 
                      size={11} 
                      color={rideStatus === "ready" ? "#10B981" : "#4B5563"} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.passengerNameText}>Rider (ID: {passenger.userId})</Text>
                    <Text style={styles.passengerMetaText}>Status: {passenger.status.toUpperCase()} • Hub verified</Text>
                  </View>
                  <Text style={[styles.statusBadgeText, rideStatus === "ready" && styles.statusBadgeTextArrived]}>
                    {rideStatus === "ready" ? "Matched" : "Pending"}
                  </Text>
                </View>
                {index < passengers.length - 1 && <View style={styles.horizontalDivider} />}
              </View>
            ))
          )}
        </View>

        {/* Dynamic Ledger Pricing updates as rows insert via Postman */}
        <Text style={styles.sectionHeadingLabel}>Corridor Financial Metrics</Text>
        <View style={styles.financialCardGrid}>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabelText}>Dynamic Commuter Seat Cost</Text>
            <Text style={styles.financialValueText}>ETB {pricePerSeat}</Text>
          </View>
          <View style={styles.horizontalCardDivider} />
          <View style={styles.financialRow}>
            <Text style={styles.financialLabelText}>Guaranteed Gross Route Yield</Text>
            <Text style={styles.driverTotalYieldText}>ETB {totalGrossYield}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Button activates strictly based on real row count parameters */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={[styles.primaryDispatchButton, passengers.length < 2 && styles.dispatchButtonDisabled]}
            disabled={passengers.length < 2}
            activeOpacity={0.8}
            onPress={handleStartTrip} 
        >
            <Text style={styles.primaryDispatchButtonText}>START CORRIDOR TRIP</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centerElements: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "500" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  timerBadge: { backgroundColor: "#FFF1F2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  timerLocked: { backgroundColor: "#D1FAE5" },
  timerText: { color: "#E11D48", fontSize: 13, fontWeight: "700" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  locationContextBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 18 },
  contextDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#F59E0B", marginRight: 8 },
  contextBarText: { fontSize: 12, color: "#4B5563", fontWeight: "500" },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 16, overflow: "hidden" },
  emptyManifestText: { paddingVertical: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  avatarCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarCircleArrived: { backgroundColor: "#D1FAE5" },
  passengerNameText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  passengerMetaText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  statusBadgeText: { fontSize: 12, color: "#4B5563", fontWeight: "500" },
  statusBadgeTextArrived: { color: "#10B981", fontWeight: "700" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  financialCardGrid: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 16 },
  financialRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  financialLabelText: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  financialValueText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  driverTotalYieldText: { fontSize: 16, fontWeight: "800", color: "#10B981" },
  horizontalCardDivider: { height: 1, backgroundColor: "#F3F4F6" },
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  primaryDispatchButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dispatchButtonDisabled: { backgroundColor: "#9CA3AF" },
  primaryDispatchButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
});