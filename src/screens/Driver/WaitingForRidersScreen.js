import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function WaitingForRidersScreen({ navigation }) {
  
  // Simulation: Automatically transition to Screen 3 (Riders Joining) after 4 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      // navigation.navigate("RidersJoiningScreen");
      console.log("Next lifecycle step triggered: Riders joining...");
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

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

      <View style={styles.contentBody}>
        
        {/* Active Status Status Card Banner */}
        <View style={styles.statusBannerCard}>
          <View style={styles.greenPulseIndicator} />
          <View style={styles.statusTextFrame}>
            <Text style={styles.statusMainText}>You are Online</Text>
            <Text style={styles.statusSubText}>Waiting for riders to join</Text>
          </View>
        </View>

        {/* Core Main Shared Manifest Card */}
        <View style={styles.manifestCard}>
          <Text style={styles.routeHeaderLabel}>Megenagna ➔ Bole</Text>
          <Text style={styles.routeSubLabelText}>via Bole Road Corridor</Text>

          {/* Precision 0/3 Circle Graphical Meter Frame */}
          <View style={styles.progressCircleWrapper}>
            <View style={styles.outerProgressCircle}>
              <Text style={styles.circleCounterMetricsText}>0/3</Text>
              <Text style={styles.circleSubLabelMetricsText}>seats filled</Text>
            </View>
          </View>

          {/* Pricing Metrics Reference Sub-Row */}
          <View style={styles.priceSummaryRow}>
            <Text style={styles.priceLabelText}>Price per seat</Text>
            <Text style={styles.priceValueText}>ETB 80</Text>
          </View>
        </View>

        {/* Space Spacer Node Component Box */}
        <View style={{ flex: 1 }} />

        {/* Secondary Deactivation Target Trigger */}
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
  menuButton: {
    padding: 4,
  },
  notificationButton: {
    padding: 4,
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  contentBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
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
  statusTextFrame: {
    flex: 1,
  },
  statusMainText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  statusSubText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  manifestCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 20,
    alignItems: "center",
  },
  routeHeaderLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  routeSubLabelText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
  },
  progressCircleWrapper: {
    marginVertical: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  outerProgressCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: "#E5E7EB", // Clear gray border representation for empty slots
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  circleCounterMetricsText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
  },
  circleSubLabelMetricsText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
    marginTop: 2,
  },
  priceSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    borderTopWidth: 1,
    borderColor: "#F3F4F6",
    paddingTop: 16,
  },
  priceLabelText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  priceValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
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
  goOfflineOutlinedButtonText: {
    color: "#DC2626", // Crisp destructive text matching outline style guide
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});