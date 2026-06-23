import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export default function CreateCorridorScreen({ navigation }) {
  const [capacity, setCapacity] = useState(3);
  const pricePerSeat = "80";
  const vehicleType = "Minivan";

  // --- 📡 LIVE DEMAND SIMULATION STATES ---
  const [incomingRequest, setIncomingRequest] = useState(null);
  const slideAnim = React.useRef(new Animated.Value(-150)).current;

  // Simulate on-demand network pings based on passenger actions
  useEffect(() => {
    // 1. Simulating a pre-matched bundle notification (2/3 riders ready) after 2 seconds
    const timer1 = setTimeout(() => {
      triggerIncomingNotification({
        id: "req-101",
        type: "BUNDLE", // Matches two riders already aggregated
        route: "Megenagna → Bole",
        detail: "via Bole Road Corridor",
        statusText: "2/3 Riders Pre-Matched",
        payout: "160 ETB",
        icon: "account-group"
      });
    }, 2000);

    // 2. Simulating a single passenger broadcast waiting for a driver to initiate after 9 seconds
    const timer2 = setTimeout(() => {
      triggerIncomingNotification({
        id: "req-102",
        type: "SINGLE",
        route: "Sarbet → Kazanchis",
        detail: "via Ring Road Corridor",
        statusText: "1 Single Rider Waiting",
        payout: "80 ETB",
        icon: "account"
      });
    }, 9000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const triggerIncomingNotification = (requestData) => {
    setIncomingRequest(requestData);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8
    }).start();
  };

  const dismissNotification = () => {
    Animated.timing(slideAnim, {
      toValue: -180,
      duration: 250,
      useNativeDriver: true
    }).start(() => setIncomingRequest(null));
  };

  const handleAcceptDemand = (request) => {
    dismissNotification();
    // Transition straight into your matching or navigation flow setup
    if (navigation) {
      navigation.navigate("WaitingForRiders", { liveRequest: request });
    }
  };

  const adjustCapacity = (amount) => {
    setCapacity((prev) => Math.max(1, prev + amount));
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 🔔 TOP SIMULATED HUD PUSH NOTIFICATION */}
      {incomingRequest && (
        <Animated.View style={[styles.notificationAlertFrame, { transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.notificationHeader}>
            <View style={styles.badgeRow}>
              <View style={[styles.pulseDot, incomingRequest.type === "BUNDLE" ? styles.bgGreen : styles.bgBlue]} />
              <Text style={styles.notificationMetaText}>
                {incomingRequest.type === "BUNDLE" ? "⚡ HIGH DEMAND BUNDLE AVAILABLE" : "👤 PASSENGER BROADCAST NEARBY"}
              </Text>
            </View>
            <TouchableOpacity onPress={dismissNotification}>
              <Ionicons name="close" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.notificationBody}>
            <MaterialCommunityIcons name={incomingRequest.icon} size={24} color="#111827" style={styles.paxIcon} />
            <View style={styles.routeMetaInfo}>
              <Text style={styles.notificationRouteText}>{incomingRequest.route}</Text>
              <Text style={styles.notificationSubText}>{incomingRequest.detail} • <Text style={styles.boldStatus}>{incomingRequest.statusText}</Text></Text>
            </View>
            <Text style={styles.notificationPayoutText}>{incomingRequest.payout}</Text>
          </View>

          <View style={styles.notificationActionRow}>
            <TouchableOpacity style={styles.declineMiniBtn} onPress={dismissNotification}>
              <Text style={styles.declineMiniText}>Ignore</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.acceptMiniBtn, incomingRequest.type === "BUNDLE" ? styles.accentGreenBtn : styles.accentBlueBtn]} 
              onPress={() => handleAcceptDemand(incomingRequest)}
            >
              <Text style={styles.acceptMiniText}>
                {incomingRequest.type === "BUNDLE" ? "ACCEPT & FETCH PAIR" : "LAUNCH CORRIDOR"}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* 1. Precise Clean Top Navigation Header */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation && navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Create Corridor</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView 
        style={styles.contentBody} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        
        {/* 🗺️ ACTIVE RADAR CONTEXT */}
        <View style={styles.radarStatusCard}>
          <MaterialCommunityIcons name="radar" size={18} color="#059669" style={styles.spinningRadarIcon} />
          <Text style={styles.radarStatusText}>Demand radar active. Matching corridors will pop up as passengers request your area.</Text>
        </View>

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
        <Text style={[styles.sectionHeading, { marginTop: 24 }]}>Ride Details</Text>
        
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
          onPress={() => navigation && navigation.navigate("WaitingForRiders")}
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
  /* --- 🔔 SIMULATED NOTIFICATION OVERLAY STYLING --- */
  notificationAlertFrame: {
    position: "absolute",
    top: 50,
    left: 12,
    right: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    zIndex: 999,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  bgGreen: { backgroundColor: "#10B981" },
  bgBlue: { backgroundColor: "#3B82F6" },
  notificationMetaText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  notificationBody: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  paxIcon: {
    marginRight: 10,
  },
  routeMetaInfo: {
    flex: 1,
  },
  notificationRouteText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  notificationSubText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 1,
  },
  boldStatus: {
    fontWeight: "600",
    color: "#111827",
  },
  notificationPayoutText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#059669",
    marginLeft: 8,
  },
  notificationActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  declineMiniBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  declineMiniText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "600",
  },
  acceptMiniBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  accentGreenBtn: { backgroundColor: "#059669" },
  accentBlueBtn: { backgroundColor: "#3B82F6" },
  acceptMiniText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  /* --- 🗺️ ACTIVE RADAR HEADER FRAME --- */
  radarStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  spinningRadarIcon: {
    marginRight: 8,
  },
  radarStatusText: {
    flex: 1,
    fontSize: 12,
    color: "#065F46",
    lineHeight: 16,
    fontWeight: "500",
  },

  /* --- ORIGINAL SYSTEM SPEC STYLING PRESERVED --- */
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
    paddingTop: 16,
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
    backgroundColor: "#059669",
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