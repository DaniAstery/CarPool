import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

// 🌐 Configure your central local backend gateway host endpoint
const API_URL = "http://192.168.238.52:5000"; 
const CURRENT_USER_ID = 1; // Logged-in profile session framework fallback target

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  const [coRiders, setCoRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRejecting, setIsRejecting] = useState(false); // 🛡️ Prevents parallel interaction loops

  // Persistent mutable pointer frame tracking across execution intervals
  const activeRideOfferIdRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, 
    longitude: 38.7935,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });

  const routeId = route?.params?.routeId || "1";

  // 1. Fetch Core Device Geolocation Parameters
  useEffect(() => {
    (async () => {
      try {
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
      } catch (err) {
        console.log("Location tracking dropout:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 2. 🔄 Dynamic Sync Engine: Long Polls table row changes
  useEffect(() => {
    console.log(`📡 Initializing matching sync engine for User: [${CURRENT_USER_ID}]`);

    async function checkProposalStatus() {
      try {
        const res = await fetch(`${API_URL}/api/rides/active-proposal/${CURRENT_USER_ID}`);
        if (!res.ok) return;
        
        const data = await res.json();
        const { rideOfferId, manifestPassengers, acceptedPassengers } = data;

        // Anchor active ID into reference memory frame
        activeRideOfferIdRef.current = rideOfferId;

        const cleanManifest = manifestPassengers || [];
        const cleanAccepted = acceptedPassengers || [];

        if (cleanAccepted.includes(CURRENT_USER_ID)) {
          setUserAccepted(true);
        }

        // Parse trailing co-riders parameters directly from state records
        const parsedCoRiders = cleanManifest
          .filter((id) => id !== CURRENT_USER_ID)
          .map((id, index) => ({
            id: id,
            name: `Rider (ID: ${id})`,
            status: cleanAccepted.includes(id) ? "Accepted" : "Pending",
            color: index === 0 ? "#E28743" : "#764ABC"
          }));

        setCoRiders(parsedCoRiders);

        // 🚀 TRIP START TRIGGER STATE MACHINE
        const totalExpected = cleanManifest.length;
        const totalConfirmed = cleanAccepted.length;

        if (totalExpected > 0 && totalConfirmed >= totalExpected) {
          console.log("🎉 All batch criteria verified. Syncing map routing view...");
          clearInterval(pollInterval);
          
          setTimeout(() => {
            navigation.replace("LiveTrackingScreen", { routeId, rideOfferId });
          }, 1500);
        }

      } catch (err) {
        console.log("Sync pooling worker cycle exception:", err);
      }
    }

    checkProposalStatus();
    const pollInterval = setInterval(checkProposalStatus, 2500);

    return () => clearInterval(pollInterval);
  }, [navigation]);

  // 3. 📤 Dispatch Live Pickup Acceptance Checkpoint
  const handleAccept = async () => {
    const resolvedRideOfferId = activeRideOfferIdRef.current;

    if (!resolvedRideOfferId) {
      Alert.alert("Syncing Matrix", "Awaiting baseline corridor data packets.");
      return;
    }

    try {
      setUserAccepted(true); 
      
      const res = await fetch(`${API_URL}/api/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: resolvedRideOfferId,
          user_id: CURRENT_USER_ID
        }),
      });

      if (!res.ok) {
        setUserAccepted(false);
        Alert.alert("Transaction Error", "Could not commit acceptance parameters.");
      }
    } catch (err) {
      setUserAccepted(false);
      console.log("Fatal handshake write exception:", err);
    }
  };

  // 4. ❌ Dispatch Decline & Atomic Swap Request
  const handleDecline = async () => {
    const resolvedRideOfferId = activeRideOfferIdRef.current;

    if (!resolvedRideOfferId) {
      Alert.alert("System Processing", "Awaiting configuration parameters.");
      return;
    }

    Alert.alert(
      "Decline Offer?",
      "Are you sure you want to reject this offer? You will return to the hub station queue line.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            setIsRejecting(true);
            try {
              const res = await fetch(`${API_URL}/api/routes/decline-proposal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  user_id: CURRENT_USER_ID,
                  ride_offer_id: resolvedRideOfferId
                }),
              });

              if (res.ok) {
                console.log(`❌ Successfully exited ride offer allocation: [${resolvedRideOfferId}]`);
                
                // Clear screen stack memory frame and drop them clean back onto the core station board
                navigation.reset({
                  index: 0,
                  routes: [{ name: "HubDashboardScreen", params: { userId: CURRENT_USER_ID } }],
                });
              } else {
                Alert.alert("Rejection Denied", "Could not safely exit active allocation.");
                setIsRejecting(false);
              }
            } catch (err) {
              console.log("Fatal decline tracking exception:", err);
              Alert.alert("Network Failure", "Could not connect to matching server.");
              setIsRejecting(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#1C75BC" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header View */}
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

      {/* Info Configuration Card */}
      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons name="location-sharp" size={20} color="#1C75BC" />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.locationSubtitle}>On Megenagna Road (Main Corridor)</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Recommended Walk Targets</Text>

          <View style={styles.matrixContainer}>
            <View style={styles.matrixRow}>
              <View style={styles.iconLabelGroup}>
                <MaterialCommunityIcons name="walk" size={18} color="#3A82F6" />
                <Text style={styles.passengerLabel}>Your walk (User 1)</Text>
              </View>
              <Text style={[styles.metricsValue, { color: "#3A82F6", fontWeight: "600" }]}>180m (2 min)</Text>
            </View>

            {coRiders.map((rider) => (
              <View key={rider.id} style={styles.matrixRow}>
                <View style={styles.iconLabelGroup}>
                  <MaterialCommunityIcons name="walk" size={18} color={rider.color} />
                  <Text style={styles.passengerLabel}>{rider.name} walk</Text>
                </View>
                <Text style={[styles.metricsValue, { color: rider.color }]}>210m (3 min)</Text>
              </View>
            ))}
          </View>

          <View style={styles.horizontalDivider} />

          {/* Dynamic Verification Table Grid */}
          <Text style={styles.sectionHeading}>Acceptance Status</Text>
          
          <View style={styles.statusTable}>
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#3A82F6" />
                <Text style={styles.tableUserText}>You (ID: 1)</Text>
              </View>
              <View style={[styles.badge, userAccepted ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, userAccepted ? styles.textAccepted : styles.textPending]}>
                  {userAccepted ? "Accepted" : "Pending"}
                </Text>
              </View>
            </View>

            {coRiders.map((rider) => (
              <View key={rider.id} style={styles.tableRow}>
                <View style={styles.tableUserLabelGroup}>
                  <Ionicons name="person" size={14} color={rider.color} />
                  <Text style={styles.tableUserText}>{rider.name}</Text>
                </View>
                <View style={[styles.badge, rider.status === "Accepted" ? styles.badgeAccepted : styles.badgePending]}>
                  <Text style={[styles.badgeText, rider.status === "Accepted" ? styles.textAccepted : styles.textPending]}>
                    {rider.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Atomic Transaction Action Group */}
          <View style={styles.actionButtonContainer}>
            {isRejecting ? (
              <View style={styles.waitingBanner}>
                <ActivityIndicator size="small" color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={[styles.waitingBannerText, { color: "#EF4444" }]}>Processing swap request...</Text>
              </View>
            ) : !userAccepted ? (
              <View style={styles.buttonButtonGroup}>
                {/* DECLINE CALLOUT */}
                <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.7}>
                  <Text style={styles.declineButtonText}>DECLINE</Text>
                </TouchableOpacity>
                {/* ACCEPT CALLOUT */}
                <TouchableOpacity style={styles.acceptButton} onPress={handleAccept} activeOpacity={0.8}>
                  <Text style={styles.acceptButtonText}>ACCEPT PICKUP</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.waitingBanner}>
                {coRiders.some(r => r.status === "Pending") ? (
                  <>
                    <ActivityIndicator size="small" color="#666666" style={{ marginRight: 8 }} />
                    <Text style={styles.waitingBannerText}>Waiting for co-riders to accept...</Text>
                  </>
                ) : (
                  <Text style={styles.successBannerText}>🎉 Everyone accepted! Launching interface routing...</Text>
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
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  center: { alignItems: "center", justifyContent: "center" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF", zIndex: 10 },
  backButton: { fontSize: 24, color: "#000000", fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  mapContainer: { flex: 1 },
  hubMarkerContainer: { alignItems: "center", justifyContent: "center" },
  hubMarkerPin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", zIndex: 2, borderWidth: 2, borderColor: "#FFFFFF" },
  hubMarkerPulse: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(16, 185, 129, 0.2)", zIndex: 1 },
  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "65%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EBF5FF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  locationSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionHeading: { fontSize: 13, fontWeight: "700", color: "#111111", marginBottom: 10, textTransform: "capitalize" },
  matrixContainer: { marginBottom: 14 },
  matrixRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  iconLabelGroup: { flexDirection: "row", alignItems: "center" },
  passengerLabel: { fontSize: 13, color: "#4B5563", marginLeft: 8 },
  metricsValue: { fontSize: 13, fontWeight: "500" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 14 },
  statusTable: { marginBottom: 20 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, color: "#111111", marginLeft: 10, fontWeight: "500" },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 80, alignItems: "center" },
  badgePending: { backgroundColor: "#EFF6FF" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textPending: { color: "#3B82F6" },
  textAccepted: { color: "#10B981" },
  actionButtonContainer: { marginTop: 10 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between" },
  declineButton: { width: "32%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700", fontSize: 13 },
  acceptButton: { width: "64%", backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  waitingBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  waitingBannerText: { color: "#4B5563", fontSize: 13, fontWeight: "600" },
  successBannerText: { color: "#10B981", fontSize: 13, fontWeight: "700" },
});