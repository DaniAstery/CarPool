import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  
  // Simulation states for co-riders
  const [rider2Status, setRider2Status] = useState("Pending");
  const [rider3Status, setRider3Status] = useState("Pending");

  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, 
    longitude: 38.7935,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });

  const routeId = route?.params?.routeId || "1";
  const ride = route?.params?.ride || { corridor: "Megenagna → Bole" };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        let location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        });
      }
    })();
  }, []);

  // Simulating other riders accepting the proposal over time
  useEffect(() => {
    // Rider 2 accepts after 3 seconds
    const timer1 = setTimeout(() => {
      setRider2Status("Accepted");
    }, 3000);

    // Rider 3 accepts after 6 seconds
    const timer2 = setTimeout(() => {
      setRider3Status("Accepted");
    }, 6000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  // Automatically proceed to Screen 4 (Live Tracking / Walk to Pickup) when everyone has accepted
  useEffect(() => {
    if (userAccepted && rider2Status === "Accepted" && rider3Status === "Accepted") {
      const proceedTimer = setTimeout(() => {
        if (navigation) {
          navigation.replace("LiveTrackingScreen", { routeId, ride });
        }
      }, 2000);
      return () => clearTimeout(proceedTimer);
    }
  }, [userAccepted, rider2Status, rider3Status]);

  const handleAccept = () => {
    setUserAccepted(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Proposed Pickup Point</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Map Backdrop */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={true}
          customMapStyle={cleanMinimalMapStyle}
        >
          <Marker
            coordinate={{
              latitude: currentLocation.latitude + 0.001,
              longitude: currentLocation.longitude + 0.001,
            }}
          >
            <View style={styles.hubMarkerContainer}>
              <View style={styles.hubMarkerPin}>
                <Ionicons name="location" size={18} color="#FFFFFF" />
              </View>
              <View style={styles.hubMarkerPulse} />
            </View>
          </Marker>
        </MapView>
      </View>

      {/* Slide-up Bottom Card containing info and statuses */}
      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Location details Header */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons name="location-sharp" size={20} color="#1C75BC" />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.locationSubtitle}>On Megenagna Road (Main Road)</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Recommended Meeting Point</Text>

          {/* Distances Matrix */}
          <View style={styles.matrixContainer}>
            <View style={styles.matrixRow}>
              <View style={styles.iconLabelGroup}>
                <MaterialCommunityIcons name="walk" size={18} color="#3A82F6" />
                <Text style={styles.passengerLabel}>Your walk</Text>
              </View>
              <Text style={[styles.metricsValue, { color: "#3A82F6", fontWeight: "600" }]}>180m (2 min)</Text>
            </View>

            <View style={styles.matrixRow}>
              <View style={styles.iconLabelGroup}>
                <MaterialCommunityIcons name="walk" size={18} color="#E28743" />
                <Text style={styles.passengerLabel}>Rider 2 walk</Text>
              </View>
              <Text style={[styles.metricsValue, { color: "#E28743" }]}>140m (2 min)</Text>
            </View>

            <View style={styles.matrixRow}>
              <View style={styles.iconLabelGroup}>
                <MaterialCommunityIcons name="walk" size={18} color="#764ABC" />
                <Text style={styles.passengerLabel}>Rider 3 walk</Text>
              </View>
              <Text style={[styles.metricsValue, { color: "#764ABC" }]}>220m (3 min)</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Explicit Image Replication: Acceptance Status Table */}
          <Text style={styles.sectionHeading}>Acceptance Status</Text>
          
          <View style={styles.statusTable}>
            {/* User Row */}
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#3A82F6" />
                <Text style={styles.tableUserText}>You</Text>
              </View>
              <View style={[styles.badge, userAccepted ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, userAccepted ? styles.textAccepted : styles.textPending]}>
                  {userAccepted ? "Accepted" : "Pending"}
                </Text>
              </View>
            </View>

            {/* Rider 2 Row */}
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#E28743" />
                <Text style={styles.tableUserText}>Rider 2</Text>
              </View>
              <View style={[styles.badge, rider2Status === "Accepted" ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, rider2Status === "Accepted" ? styles.textAccepted : styles.textPending]}>
                  {rider2Status}
                </Text>
              </View>
            </View>

            {/* Rider 3 Row */}
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#764ABC" />
                <Text style={styles.tableUserText}>Rider 3</Text>
              </View>
              <View style={[styles.badge, rider3Status === "Accepted" ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, rider3Status === "Accepted" ? styles.textAccepted : styles.textPending]}>
                  {rider3Status}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Row containing Decline & Accept buttons */}
          <View style={styles.actionButtonContainer}>
            {!userAccepted ? (
              <View style={styles.buttonButtonGroup}>
                <TouchableOpacity style={styles.declineButton} activeOpacity={0.7}>
                  <Text style={styles.declineButtonText}>DECLINE</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptButton} onPress={handleAccept} activeOpacity={0.8}>
                  <Text style={styles.acceptButtonText}>ACCEPT PICKUP</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.waitingBanner}>
                {!(rider2Status === "Accepted" && rider3Status === "Accepted") ? (
                  <>
                    <ActivityIndicator size="small" color="#666666" style={{ marginRight: 8 }} />
                    <Text style={styles.waitingBannerText}>Waiting for co-riders to accept...</Text>
                  </>
                ) : (
                  <Text style={styles.successBannerText}>🎉 Everyone accepted! Starting route...</Text>
                )}
              </View>
            )}
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
  },
  backButton: {
    fontSize: 24,
    color: "#000000",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  mapContainer: {
    flex: 1,
  },
  hubMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  hubMarkerPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#10B981", // Green accent pinpoint matching map style
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  hubMarkerPulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    zIndex: 1,
  },
  proposalCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "65%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  locationPinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EBF5FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationTextWrapper: {
    flex: 1,
  },
  locationTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  locationSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 10,
    textTransform: "capitalize",
  },
  matrixContainer: {
    marginBottom: 14,
  },
  matrixRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  iconLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  passengerLabel: {
    fontSize: 13,
    color: "#4B5563",
    marginLeft: 8,
  },
  metricsValue: {
    fontSize: 13,
    fontWeight: "500",
  },
  horizontalDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 14,
  },
  statusTable: {
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F3F4F6",
  },
  tableUserLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  tableUserText: {
    fontSize: 13,
    color: "#111111",
    marginLeft: 10,
    fontWeight: "500",
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 80,
    alignItems: "center",
  },
  badgePending: {
    backgroundColor: "#EFF6FF",
  },
  badgeAccepted: {
    backgroundColor: "#ECFDF5",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  textPending: {
    color: "#3B82F6",
  },
  textAccepted: {
    color: "#10B981",
  },
  actionButtonContainer: {
    marginTop: 10,
  },
  buttonButtonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  declineButton: {
    width: "32%",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 13,
  },
  acceptButton: {
    width: "64%",
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  waitingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  waitingBannerText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
  },
  successBannerText: {
    color: "#10B981",
    fontSize: 13,
    fontWeight: "700",
  },
});