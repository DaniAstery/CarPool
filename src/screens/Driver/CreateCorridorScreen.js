import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function CreateCorridorScreen({ navigation }) {
  // Input parameters configured matching the blueprint layout state
  const [capacity, setCapacity] = useState(3);
  const pricePerSeat = "80";
  const vehicleType = "Minivan";

  const adjustCapacity = (amount) => {
    setCapacity((prev) => Math.max(1, prev + amount));
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Precise Clean Top Navigation Header */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Create Corridor</Text>
        <View style={{ width: 32 }} /> {/* Layout balancer */}
      </View>

      <ScrollView 
        style={styles.contentBody} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        
        {/* 2. Select Corridor Mapping Cluster */}
        <Text style={styles.sectionHeading}>Select Corridor</Text>
        
        <View style={styles.corridorRouteContainer}>
          {/* Start Location Node Row */}
          <TouchableOpacity style={styles.locationInputRow} activeOpacity={0.9}>
            <View style={styles.iconIndicatorWrapper}>
              <View style={styles.startCoreDot} />
            </View>
            <View style={styles.locationMetaFrame}>
              <Text style={styles.locationLabelText}>Start Location</Text>
              <Text style={styles.locationValueText}>Megenagna</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Linking Internal Divider Guideline */}
          <View style={styles.verticalConnectorLine} />

          {/* End Location Node Row */}
          <TouchableOpacity style={styles.locationInputRow} activeOpacity={0.9}>
            <View style={styles.iconIndicatorWrapper}>
              <Ionicons name="location" size={18} color="#EF4444" />
            </View>
            <View style={styles.locationMetaFrame}>
              <Text style={styles.locationLabelText}>End Location</Text>
              <Text style={styles.locationValueText}>Bole</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Dynamic Static Path Label Footer */}
        <Text style={styles.routeFooterNote}>via Bole Road Corridor</Text>

        {/* 3. Operational Ride Details Container Block */}
        <Text style={[styles.sectionHeading, { marginTop: 28 }]}>Ride Details</Text>
        
        <View style={styles.detailsContainerCard}>
          
          {/* Capacity Control Matrix Row */}
          <View style={styles.detailRowItem}>
            <Text style={styles.detailRowLabel}>Capacity (seats)</Text>
            <View style={styles.counterControlWrapper}>
              <TouchableOpacity 
                style={styles.counterButton} 
                onPress={() => adjustCapacity(-1)}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={16} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.counterValueText}>{capacity}</Text>
              <TouchableOpacity 
                style={styles.counterButton} 
                onPress={() => adjustCapacity(1)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.horizontalRowDivider} />

          {/* Static Pricing Matrix Information Frame */}
          <View style={styles.detailRowItem}>
            <Text style={styles.detailRowLabel}>Price per seat (ETB)</Text>
            <View style={styles.valueDisplayFrame}>
              <Text style={styles.valueDisplayHighlightText}>{pricePerSeat}</Text>
            </View>
          </View>

          <View style={styles.horizontalRowDivider} />

          {/* Asset Classification Frame Row */}
          <View style={styles.detailRowItem}>
            <Text style={styles.detailRowLabel}>Vehicle Type</Text>
            <TouchableOpacity style={styles.dropdownDisplaySelector} activeOpacity={0.8}>
              <Text style={styles.dropdownValueText}>{vehicleType}</Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>

        </View>

        {/* 4. Main Deployment Action Button Framework */}
        <TouchableOpacity 
          style={styles.goOnlineActionButton}
          activeOpacity={0.8}
          onPress={() => {
            console.log("Corridor configuration initialized live.");
            // Linking next step segment: navigation.navigate("CorridorOnlineWaitingScreen");
          }}
        >
          <Text style={styles.goOnlineActionText}>GO ONLINE</Text>
        </TouchableOpacity>

      </ScrollView>
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
  backButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  contentBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 2,
  },
  corridorRouteContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 4,
  },
  locationInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconIndicatorWrapper: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  startCoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#10B981",
  },
  locationMetaFrame: {
    flex: 1,
  },
  locationLabelText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  locationValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginTop: 2,
  },
  verticalConnectorLine: {
    position: "absolute",
    left: 25,
    top: 36,
    width: 1,
    height: 28,
    backgroundColor: "#E5E7EB",
    zIndex: 2,
  },
  routeFooterNote: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
    marginLeft: 4,
    fontStyle: "italic",
  },
  detailsContainerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
  },
  detailRowItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  detailRowLabel: {
    fontSize: 13,
    color: "#4B5563",
    fontWeight: "500",
  },
  counterControlWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 3,
  },
  counterButton: {
    width: 28,
    height: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  counterValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 14,
  },
  valueDisplayFrame: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 50,
    alignItems: "center",
  },
  valueDisplayHighlightText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  dropdownDisplaySelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dropdownValueText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
  },
  horizontalRowDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  goOnlineActionButton: {
    backgroundColor: "#059669", // Vibrant exact green configuration accent
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 32,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  goOnlineActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});