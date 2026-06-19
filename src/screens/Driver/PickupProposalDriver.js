import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function PickupProposalDriver({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Precision Header Row Layout */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Pickup Point Proposed</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView 
        style={styles.contentBody} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        
        {/* Status Indicator Bar */}
        <View style={styles.statusBannerCard}>
          <View style={styles.bluePulseIndicator} />
          <View style={styles.statusTextFrame}>
            <Text style={styles.statusMainText}>Optimization Algorithm Active</Text>
            <Text style={styles.statusSubText}>Calculated optimal hub for maximum pooling efficiency</Text>
          </View>
        </View>

        {/* 2. Core Optimized Hub Node Card */}
        <Text style={styles.sectionHeading}>Proposed Pickup Node</Text>
        
        <View style={styles.proposalCard}>
          <View style={styles.hubHeaderRow}>
            <View style={styles.locationIconWrapper}>
              <MaterialCommunityIcons name="map-marker-radius" size={24} color="#059669" />
            </View>
            <View style={styles.hubMetaFrame}>
              <Text style={styles.hubTitleText}>Megenagna Roundabout</Text>
              <Text style={styles.hubSubtitleText}>Addis Ababa, Corridor Gate A</Text>
            </View>
          </View>

          <View style={styles.horizontalRowDivider} />

          {/* 3. Walk Metrics Metadata Box */}
          <View style={styles.metricRowItem}>
            <Ionicons name="walk" size={18} color="#4B5563" style={{ marginRight: 10 }} />
            <Text style={styles.metricHighlightText}>~3 min walk</Text>
            <Text style={styles.metricLabelText}> for all matched riders</Text>
          </View>
        </View>

        {/* Match Breakdown Summary Preview */}
        <Text style={[styles.sectionHeading, { marginTop: 24 }]}>Pool Overview</Text>
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <Text style={styles.overviewLabel}>Matched Passenger Clusters</Text>
            <Text style={styles.overviewValue}>2 Groups</Text>
          </View>
          <View style={styles.horizontalRowDivider} />
          <View style={styles.overviewRow}>
            <Text style={styles.overviewLabel}>Total Corridor Manifest</Text>
            <Text style={styles.overviewValue}>2 / 3 Seats Filled</Text>
          </View>
        </View>

      </ScrollView>

      {/* 4. Precise Dual Action Decision Buttons Row Footer */}
      <View style={styles.bottomActionRow}>
        <TouchableOpacity 
          style={styles.rejectButton}
          activeOpacity={0.7}
          onPress={() => {
            console.log("Proposal rejected. Re-routing queue loop...");
            navigation.navigate("WaitingForRiders");
          }}
        >
          <Text style={styles.rejectButtonText}>REJECT</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.acceptButton}
          activeOpacity={0.8}
          onPress={() => {
            console.log("Proposal accepted. Forwarding driver to pick up location corridor...");
            navigation.navigate("TripDepartureScreen");
          }}
        >
          <Text style={styles.acceptButtonText}>ACCEPT</Text>
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
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  statusBannerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  bluePulseIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3B82F6",
    marginRight: 12,
  },
  statusTextFrame: { flex: 1 },
  statusMainText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  statusSubText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 2,
  },
  proposalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
  },
  hubHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
  },
  locationIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  hubMetaFrame: { flex: 1 },
  hubTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  hubSubtitleText: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  horizontalRowDivider: { height: 1, backgroundColor: "#F3F4F6" },
  metricRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  metricHighlightText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  metricLabelText: { fontSize: 14, color: "#4B5563" },
  overviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
  },
  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  overviewLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  overviewValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  bottomActionRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  rejectButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rejectButtonText: { color: "#DC2626", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
  acceptButton: {
    flex: 2,
    backgroundColor: "#059669", // Dark green theme accent block matching your palette matrix
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});