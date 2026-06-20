import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function NavigateToPickupScreen({ navigation }) {
  // Initial State: 2 Passengers locked in at a premium non-optimized rate
  const [passengerCount, setPassengerCount] = useState(2);
  const [pricePerSeat, setPricePerSeat] = useState(120); 
  const [totalEarnings, setTotalEarnings] = useState(240); // 2 * 120 = 240
  const [countdown, setCountdown] = useState(300); // 5:00 minutes countdown
  
  const [thirdPassengerJoined, setThirdPassengerJoined] = useState(false);

  // 1. Core Countdown Timer Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Simulate Passenger 3 joining mid-route during the countdown
  useEffect(() => {
    const joinTimer = setTimeout(() => {
      setPassengerCount(3);
      setPricePerSeat(80); // Rate decreases for passengers due to full pool matching
      setTotalEarnings(240); // Driver total gain remains optimized at 240 (3 * 80)
      setThirdPassengerJoined(true);
      console.log("Simulation Log: Passenger 3 joined! Rates optimized successfully.");
    }, 6000);

    return () => clearTimeout(joinTimer);
  }, []);

  // Format seconds into MM:SS format
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Navigate To Pickup</Text>
        <View style={styles.countdownPill}>
          <Ionicons name="time-outline" size={12} color="#DC2626" style={{ marginRight: 4 }} />
          <Text style={styles.countdownPillText}>{formatTimer(countdown)}</Text>
        </View>
      </View>

      {/* Dynamic Optimization Toast Notification */}
 
      {thirdPassengerJoined ? (
        <View style={styles.toastNotification}>
          <Ionicons name="sparkles" size={16} color="#15803D" style={{ marginRight: 8 }} />
          <Text style={styles.toastText}>
            Passenger 3 joined! Cost per seat dropped to ETB 80 for all riders.
          </Text>
        </View>
      ) : null}

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* Nav Dynamic Banner */}
        <View style={[styles.statusBanner, thirdPassengerJoined && styles.statusBannerSuccess]}>
          <FontAwesome5 name="route" size={14} color="#FFFFFF" style={{ marginRight: 10 }} />
          <View style={styles.bannerTextFrame}>
            <Text style={styles.bannerMainText}>
              {thirdPassengerJoined ? "Corridor Fully Packed" : "Proceeding with 2 Riders"}
            </Text>
            <Text style={styles.bannerSubText}>
              {thirdPassengerJoined ? "Maximum occupancy achieved" : "Passenger 3 is still pending arrival"}
            </Text>
          </View>
        </View>

        {/* Target Location Metadata */}
        <View style={styles.destinationHeader}>
          <Text style={styles.hubTitleText}>Megenagna Blue Taxi Stop</Text>
          <Text style={styles.hubDistanceText}>180m • 2 min away</Text>
        </View>

        {/* Visual Map Canvas Placeholder */}
        <View style={styles.mapCanvas}>
          <View style={styles.routeLine} />
          <View style={styles.carIndicator}>
            <FontAwesome5 name="car" size={11} color="#FFFFFF" />
          </View>
          <View style={styles.pinIndicator}>
            <MaterialCommunityIcons name="map-marker" size={22} color="#059669" />
          </View>
          <Text style={styles.etaLabel}>ETA to pickup: 2 min (400m)</Text>
        </View>

        {/* Live Ledger Price breakdown */}
        <Text style={styles.sectionHeadingLabel}>Corridor Ledger Details</Text>
        <View style={styles.ledgerCard}>
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabel}>Active Manifest Count</Text>
            <Text style={styles.ledgerValue}>{passengerCount} / 3 Riders</Text>
          </View>
          <View style={styles.horizontalDivider} />
          
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabel}>Passenger Seat Rate</Text>
            <View style={{ alignItems: 'end' }}>
              <Text style={[styles.ledgerValue, thirdPassengerJoined && styles.priceDroppedText]}>
                ETB {pricePerSeat}
              </Text>
              {!thirdPassengerJoined && <Text style={styles.rateSubHint}>Premium unpooled tier</Text>}
            </View>
          </View>
          <View style={styles.horizontalDivider} />

          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabel}>Total Driver Yield</Text>
            <Text style={styles.driverGainValue}>ETB {totalEarnings}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Persistent Button Actions */}
     // Change this target inside src/screens/driver/NavigateToPickupScreen.js:
        <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={styles.actionButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("WaitingForPassengers")} // Direct skip straight to Screen 8 tracking list
        >
            <Ionicons name="people" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.actionButtonText}>ARRIVED AT PICKUP POINT</Text>
        </TouchableOpacity>
        </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  countdownPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  countdownPillText: { color: "#DC2626", fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  
  toastNotification: { flexDirection: "row", backgroundColor: "#DCFCE7", padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: "#BBF7D0" },
  toastText: { flex: 1, fontSize: 13, color: "#15803D" },
  
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  statusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#3B82F6", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
  statusBannerSuccess: { backgroundColor: "#059669" },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  bannerSubText: { fontSize: 11, color: "#E0F2FE", marginTop: 1 },
  
  destinationHeader: { marginBottom: 16, marginLeft: 2 },
  hubTitleText: { fontSize: 18, fontWeight: "800", color: "#111827" },
  hubDistanceText: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  
  mapCanvas: { height: 150, backgroundColor: "#E5E7EB", borderRadius: 12, position: "relative", justifyContent: "center", alignItems: "center", marginBottom: 24, overflow: "hidden" },
  routeLine: { width: "60%", height: 4, backgroundColor: "#3B82F6", borderRadius: 2 },
  carIndicator: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", position: "absolute", left: "25%" },
  pinIndicator: { position: "absolute", right: "25%" },
  etaLabel: { position: "absolute", bottom: 10, backgroundColor: "#FFFFFF", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 11, fontWeight: "600", color: "#111827" },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 24 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  priceDroppedText: { color: "#10B981" },
  rateSubHint: { fontSize: 10, color: "#D97706", fontWeight: "600", marginTop: 1 },
  driverGainValue: { fontSize: 16, fontWeight: "800", color: "#059669" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  actionButton: { backgroundColor: "#059669", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});