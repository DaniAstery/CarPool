import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";

export default function WaitingForRidersScreen({ navigation }) {
  // Real-time state parameters for live UI updates
  const [seatsFilled, setSeatsFilled] = useState(0);
  const [statusText, setStatusText] = useState("Waiting for riders to join");
  const [activityLogs, setActivityLogs] = useState([]);

  useEffect(() => {
    // Stage 1: First Rider Joins after 3 seconds
    const timer1 = setTimeout(() => {
      setSeatsFilled(1);
      setStatusText("Riders are joining...");
      setActivityLogs((prev) => [
        { id: "1", message: "Passenger Alpha joined", time: "Just now" },
        ...prev,
      ]);
      console.log("Simulation Log: Rider 1 connected.");
    }, 3000);

    // Stage 2: Second Rider Joins after 6 seconds
    const timer2 = setTimeout(() => {
      setSeatsFilled(2);
      setActivityLogs((prev) => [
        { id: "2", message: "Passenger Beta joined", time: "Just now" },
        { id: "1", message: "Passenger Alpha joined", time: "3 min ago" },
      ]);
      console.log("Simulation Log: Rider 2 connected.");
    }, 6000);

    // Stage 3: Auto-Advance to next blueprint step once capacity limits near
    const timer3 = setTimeout(() => {
      console.log("Simulation Log: Forwarding to pickup optimization segment.");
      navigation.navigate("PickupProposalScreen");
    }, 10000);

    // Cleanup memory allocations on unmount
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Top Header Row Panel */}
      <View style={styles.headerBlock}>
        <TouchableOpacity style={styles.menuButton} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Corridor Online</Text>
        <TouchableOpacity style={styles.notificationButton} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* Active Status Banner */}
        <View style={styles.statusBannerCard}>
          <View style={[
            styles.greenPulseIndicator, 
            seatsFilled > 0 && styles.orangePulseIndicator
          ]} />
          <View style={styles.statusTextFrame}>
            <Text style={styles.statusMainText}>You are Online</Text>
            <Text style={styles.statusSubText}>{statusText}</Text>
          </View>
        </View>

        {/* Core Main Shared Manifest Card */}
        <View style={styles.manifestCard}>
          <Text style={styles.routeHeaderLabel}>Megenagna ➔ Bole</Text>
          <Text style={styles.routeSubLabelText}>via Bole Road Corridor</Text>

          {/* Precision Circular Graphical Meter Frame with conditional boundary highlight colors */}
          <View style={styles.progressCircleWrapper}>
            <View style={[
              styles.outerProgressCircle,
              seatsFilled > 0 && styles.outerProgressCircleActive
            ]}>
              <Text style={styles.circleCounterMetricsText}>{seatsFilled}/3</Text>
              <Text style={styles.circleSubLabelMetricsText}>seats filled</Text>
            </View>
          </View>

          {/* Pricing Metrics Reference Sub-Row */}
          <View style={styles.priceSummaryRow}>
            <Text style={styles.priceLabelText}>Price per seat</Text>
            <Text style={styles.priceValueText}>ETB 80</Text>
          </View>
        </View>

        {/* Recent Activity Log Module Card */}
        {activityLogs.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.activityHeadingText}>Recent Activity</Text>
            <View style={styles.activityCard}>
              {activityLogs.map((log, idx) => (
                <View key={log.id}>
                  <View style={styles.activityItemRow}>
                    <View style={styles.userIconFrame}>
                      <FontAwesome5 name="user" size={11} color="#10B981" />
                    </View>
                    <Text style={styles.activityLogText}>{log.message}</Text>
                    <Text style={styles.activityTimeText}>{log.time}</Text>
                  </View>
                  {idx < activityLogs.length - 1 && <View style={styles.horizontalDivider} />}
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Persistent Bottom Controls */}
      <View style={styles.bottomControlContainer}>
        <TouchableOpacity 
          style={styles.goOfflineOutlinedButton}
          activeOpacity={0.7}
          onPress={() => navigation.navigate("CreateCorridor")}
        >
          <Text style={styles.goOfflineOutlinedButtonText}>GO OFFLINE</Text>
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
  menuButton: { padding: 4 },
  notificationButton: { padding: 4 },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statusBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  greenPulseIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10B981",
    marginRight: 12,
  },
  orangePulseIndicator: {
    backgroundColor: "#F59E0B", // Shifts status to warm alert orange color when load mounts
  },
  statusTextFrame: { flex: 1 },
  statusMainText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  statusSubText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  manifestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  routeHeaderLabel: { fontSize: 18, fontWeight: "700", color: "#111827" },
  routeSubLabelText: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  progressCircleWrapper: { marginVertical: 28, alignItems: "center", justifyContent: "center" },
  outerProgressCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  outerProgressCircleActive: {
    borderColor: "#10B981", // Updates dynamically to a vibrant theme green outline
  },
  circleCounterMetricsText: { fontSize: 28, fontWeight: "800", color: "#111827" },
  circleSubLabelMetricsText: { fontSize: 12, color: "#6B7280", fontWeight: "500", marginTop: 2 },
  priceSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    borderTopWidth: 1,
    borderColor: "#F3F4F6",
    paddingTop: 16,
  },
  priceLabelText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  priceValueText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  activityHeadingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 2,
  },
  activityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  activityItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  userIconFrame: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityLogText: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  activityTimeText: { fontSize: 12, color: "#9CA3AF" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  bottomControlContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#F9FAFB",
  },
  goOfflineOutlinedButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  goOfflineOutlinedButtonText: { color: "#DC2626", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});