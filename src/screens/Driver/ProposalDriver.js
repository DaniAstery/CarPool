import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function ProposalDriver({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Header Navigation Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Pickup Proposal</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* 2. Primary Status Notification Bar (Vibrant Green) */}
        <View style={styles.greenStatusBanner}>
          <FontAwesome5 name="user-check" size={14} color="#FFFFFF" style={{ marginRight: 10 }} />
          <View style={styles.bannerTextFrame}>
            <Text style={styles.bannerMainText}>3/3 Riders Joined</Text>
            <Text style={styles.bannerSubText}>Pickup point calculated</Text>
          </View>
        </View>

        {/* 3. Simulated Map Box Placeholder (Matches Wireframe Center Geometry) */}
        <View style={styles.mapCanvasPlaceholder}>
          {/* Visual representations of walking metrics nodes */}
          <View style={[styles.mapNodeBadge, { top: 40, left: 20 }]}>
            <Text style={styles.nodeBadgeText}>180m</Text>
            <Text style={styles.nodeBadgeSubText}>(2 min)</Text>
          </View>
          
          <View style={[styles.mapNodeBadge, { top: 50, right: 20 }]}>
            <Text style={styles.nodeBadgeText}>140m</Text>
            <Text style={styles.nodeBadgeSubText}>(2 min)</Text>
          </View>

          <View style={[styles.mapNodeBadge, { bottom: 40, left: "42%" }]}>
            <Text style={styles.nodeBadgeText}>220m</Text>
            <Text style={styles.nodeBadgeSubText}>(3 min)</Text>
          </View>

          {/* Central Calculated Hub Target Pin */}
          <View style={styles.centralPinMarker}>
            <MaterialCommunityIcons name="map-marker-radius" size={32} color="#059669" />
          </View>
        </View>

        {/* 4. Recommended Pickup Point Descriptor Details */}
        <Text style={styles.sectionHeadingLabel}>Recommended Pickup Point</Text>
        
        <View style={styles.pickupDetailCard}>
          <View style={styles.detailRowHeader}>
            <Ionicons name="location" size={22} color="#059669" style={{ marginRight: 10 }} />
            <View>
              <Text style={styles.hubMainTitleText}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.hubSubTitleText}>On Megenagna Road (Main Road)</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Individual walking breakouts for each passenger */}
          <View style={styles.passengerWalkRow}>
            <Ionicons name="person" size={14} color="#3B82F6" style={{ marginRight: 8 }} />
            <Text style={styles.passengerNameLabel}>Passenger 1</Text>
            <Text style={styles.passengerMetricsText}>180m (2 min)</Text>
          </View>

          <View style={styles.passengerWalkRow}>
            <Ionicons name="person" size={14} color="#F59E0B" style={{ marginRight: 8 }} />
            <Text style={styles.passengerNameLabel}>Passenger 2</Text>
            <Text style={styles.passengerMetricsText}>140m (2 min)</Text>
          </View>

          <View style={styles.passengerWalkRow}>
            <Ionicons name="person" size={14} color="#8B5CF6" style={{ marginRight: 8 }} />
            <Text style={styles.passengerNameLabel}>Passenger 3</Text>
            <Text style={styles.passengerMetricsText}>220m (3 min)</Text>
          </View>
        </View>

      </ScrollView>

      {/* 5. Giant Solid Green Action Activation Core Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={styles.acceptLocationButton}
          activeOpacity={0.8}
          onPress={() => {
            console.log("Pickup proposal approved. Moving to wait sequence graph...");
            navigation.navigate("WaitingForAcceptance");
          }}
        >
          <Text style={styles.acceptLocationButtonText}>ACCEPT PICKUP LOCATION</Text>
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
  
  greenStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#059669", // Vibrant wireframe green block
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  bannerSubText: { fontSize: 12, color: "#D1FAE5", marginTop: 1 },
  
  mapCanvasPlaceholder: {
    height: 180,
    backgroundColor: "#E5E7EB",
    borderRadius: 12,
    marginBottom: 20,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  mapNodeBadge: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  nodeBadgeText: { fontSize: 10, fontWeight: "700", color: "#374151" },
  nodeBadgeSubText: { fontSize: 9, color: "#6B7280" },
  centralPinMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(5, 150, 105, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  
  sectionHeadingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 2,
  },
  pickupDetailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  detailRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  hubMainTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  hubSubTitleText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  passengerWalkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  passengerNameLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500", flex: 1 },
  passengerMetricsText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  
  footerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  acceptLocationButton: {
    backgroundColor: "#059669", // Identical signature solid green 
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptLocationButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});