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

export default function WaitingForPassengersScreen({ navigation }) {
  const [countdown, setCountdown] = useState(30); // Starts at 30 seconds for Passenger 3
  const [currentPhase, setCurrentPhase] = useState("WAITING_P3"); // WAITING_P3, SCANNING_P4, LOCKED_READY
  
  const [manifest, setManifest] = useState([
    { id: "p1", name: "Passenger 1", status: "Walking", eta: "1 min", distance: "45m" },
    { id: "p2", name: "Passenger 2", status: "Walking", eta: "2 min", distance: "80m" },
  ]);

  const [pricePerSeat, setPricePerSeat] = useState(120); 
  const [totalYield, setTotalYield] = useState(240);    

  // 1. Countdown Ticking Engine
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          setCurrentPhase("LOCKED_READY");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerInterval);
  }, [currentPhase]);

  // 2. Automated Simulation Timeline
  useEffect(() => {
    const p3ArrivalEvent = setTimeout(() => {
      if (currentPhase === "WAITING_P3") {
        setManifest([
          { id: "p1", name: "Passenger 1", status: "Arrived", eta: "0 min", distance: "0m" },
          { id: "p2", name: "Passenger 2", status: "Arrived", eta: "0 min", distance: "0m" },
          { id: "p3", name: "Passenger 3", status: "Arrived", eta: "0 min", distance: "0m" }
        ]);
        setPricePerSeat(80); 
        setTotalYield(240);  
        setCurrentPhase("SCANNING_P4");
        setCountdown(45); // Reset countdown for the 4th passenger opportunity
      }
    }, 5000);

    return () => clearTimeout(p3ArrivalEvent);
  }, [currentPhase]);

  const handleAcceptFourthPassenger = () => {
    setManifest((prev) => [
      ...prev,
      { id: "p4", name: "Passenger 4 (Bonus)", status: "Arrived", eta: "0 min", distance: "0m" }
    ]);
    setPricePerSeat(70); 
    setTotalYield(280);  
    setCurrentPhase("LOCKED_READY"); 
    setCountdown(0); 
  };

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
        <Text style={styles.headerTitleText}>Waiting for Passengers</Text>
        <View style={[styles.timerBadge, currentPhase === "LOCKED_READY" && styles.timerLocked]}>
          <Text style={styles.timerText}>
            {currentPhase === "LOCKED_READY" ? "READY" : formatTimer(countdown)}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        <View style={styles.locationContextBar}>
          <View style={styles.contextDot} />
          <Text style={styles.contextBarText}>
            {currentPhase === "LOCKED_READY" ? "Manifest finalized. You can now start the trip." : "Megenagna Hub • Waiting for commuters to gather"}
          </Text>
        </View>

        {/* Passenger List */}
        <Text style={styles.sectionHeadingLabel}>Rider Roster Status</Text>
        <View style={styles.manifestCard}>
          {manifest.map((passenger, index) => (
            <View key={passenger.id}>
              <View style={styles.passengerRow}>
                <View style={[styles.avatarCircle, passenger.status === "Arrived" && styles.avatarCircleArrived]}>
                  <FontAwesome5 name="user" size={11} color={passenger.status === "Arrived" ? "#10B981" : "#4B5563"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passengerNameText}>{passenger.name}</Text>
                  <Text style={styles.passengerMetaText}>
                    {passenger.status === "Arrived" ? "At vehicle stop point" : `Walking • ${passenger.distance} away`}
                  </Text>
                </View>
                <Text style={[styles.statusBadgeText, passenger.status === "Arrived" && styles.statusBadgeTextArrived]}>
                  {passenger.status === "Arrived" ? "Boarded" : `ETA ${passenger.eta}`}
                </Text>
              </View>
              {index < manifest.length - 1 && <View style={styles.horizontalDivider} />}
            </View>
          ))}

          {/* 4th Passenger Bonus Offer Box */}
          {currentPhase === "SCANNING_P4" && (
            <View>
              <View style={styles.horizontalDivider} />
              <View style={styles.bonusScanCard}>
                <View style={styles.bonusHeaderLine}>
                  <Text style={styles.bonusTitleText}>⚡ 4th Seat Corridor Match Found!</Text>
                  <Text style={styles.bonusClockText}>{countdown}s left</Text>
                </View>
                <Text style={styles.bonusDescriptionText}>
                  A commuter matches your direct corridor exit route. Tap to add them and maximize yield layout.
                </Text>
                <TouchableOpacity style={styles.acceptBonusActionBtn} activeOpacity={0.8} onPress={handleAcceptFourthPassenger}>
                  <Text style={styles.acceptBonusBtnText}>ACCEPT SEAT BONUS (+ETB 40)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Ledger */}
        <Text style={styles.sectionHeadingLabel}>Corridor Financial Metrics</Text>
        <View style={styles.financialCardGrid}>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabelText}>Dynamic Commuter Seat Cost</Text>
            <Text style={styles.financialValueText}>ETB {pricePerSeat}</Text>
          </View>
          <View style={styles.horizontalCardDivider} />
          <View style={styles.financialRow}>
            <Text style={styles.financialLabelText}>Guaranteed Gross Route Yield</Text>
            <Text style={styles.driverTotalYieldText}>ETB {totalYield}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Footer Navigation Trigger to DriverDepartureScreen */}
      {/* Footer Navigation Trigger to Screen 10 */}
        <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={[styles.primaryDispatchButton, currentPhase !== "LOCKED_READY" && styles.dispatchButtonDisabled]}
            disabled={currentPhase !== "LOCKED_READY"}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("TripInProgress")} // Routes cleanly forward to Screen 10
        >
            <Text style={styles.primaryDispatchButtonText}>START CORRIDOR TRIP</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        </View>

    </SafeAreaView>
  );
}

// Keep your existing styles unchanged...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  timerBadge: { backgroundColor: "#FFF1F2", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  timerLocked: { backgroundColor: "#D1FAE5" },
  timerText: { color: "#E11D48", fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 14 },
  locationContextBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 18 },
  contextDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981", marginRight: 8 },
  contextBarText: { fontSize: 12, color: "#4B5563", fontWeight: "500" },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 16, overflow: "hidden" },
  passengerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  avatarCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarCircleArrived: { backgroundColor: "#D1FAE5" },
  passengerNameText: { fontSize: 14, fontWeight: "600", color: "#111827" },
  passengerMetaText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  statusBadgeText: { fontSize: 12, color: "#4B5563", fontWeight: "500" },
  statusBadgeTextArrived: { color: "#10B981", fontWeight: "700" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  bonusScanCard: { backgroundColor: "#FFF5F5", marginHorizontal: -16, padding: 14, borderTopWidth: 1, borderColor: "#FEE2E2" },
  bonusHeaderLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  bonusTitleText: { fontSize: 13, fontWeight: "700", color: "#9B1C1C" },
  bonusClockText: { fontSize: 12, fontWeight: "700", color: "#DC2626", fontFamily: "monospace" },
  bonusDescriptionText: { fontSize: 12, color: "#7F1D1D", lineHeight: 16, marginBottom: 10 },
  acceptBonusActionBtn: { backgroundColor: "#DC2626", borderRadius: 6, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  acceptBonusBtnText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
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