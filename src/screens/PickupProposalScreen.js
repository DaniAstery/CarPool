import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";


const { width } = Dimensions.get("window");

// 🌐 Production Local Area Network IP Configuration
const API_URL = "http://192.168.112.52:5000"; 

// 📍 Exact Geographic Target: Megenagna Blue Taxi Stop, Addis Ababa
const MEETUP_LOCATION = {
  latitude: 9.0192,
  longitude: 38.8015,
};

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  const [coRiders, setCoRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45); 
  const [driverState, setDriverState] = useState("pending"); 
  const mapRef = useRef(null);

  const currentUserId = route?.params?.userId ? parseInt(route?.params?.userId, 10) : 1;
  const routeId = route?.params?.routeId || "1";
  
  const activeRideOfferIdRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0115, 
    longitude: 38.7915,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });

  const totalAcceptedCount = (userAccepted ? 1 : 0) + coRiders.filter(r => r.status === "Accepted" || r.status === "Arrived").length;
  const isBaselinePairReady = totalAcceptedCount >= 2;

  // Generates a clean street-following simulated route to Megenagna
  const getRouteCoordinates = () => {
    return [
      { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
      // Turning points to match layout grid mapping
      { latitude: currentLocation.latitude + 0.002, longitude: currentLocation.longitude + 0.001 },
      { latitude: currentLocation.latitude + 0.004, longitude: currentLocation.longitude + 0.005 },
      { latitude: MEETUP_LOCATION.latitude - 0.001, longitude: MEETUP_LOCATION.longitude - 0.002 },
      { latitude: MEETUP_LOCATION.latitude, longitude: MEETUP_LOCATION.longitude },
    ];
  };

  // Request Location Permissions & Frame Viewport
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let location = await Location.getCurrentPositionAsync({});
          const userCoords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          };
          setCurrentLocation(userCoords);
          
          // Fit map boundaries beautifully to hold both the user and meetup targets
          mapRef.current?.fitToCoordinates(
            [
              { latitude: location.coords.latitude, longitude: location.coords.longitude },
              MEETUP_LOCATION
            ],
            {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: true,
            }
          );
        }
      } catch (err) {
        console.log("Location configuration skipped:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Window acceptance countdown
  useEffect(() => {
    if (!isBaselinePairReady) return; 

    if (timeLeft <= 0) {
      handleWindowExpiry();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, isBaselinePairReady]);

  const handleWindowExpiry = () => {
    console.log("⏰ Pool acceptance window expired.");
    const user1Accepted = currentUserId === 1 ? userAccepted : coRiders.find(r => r.id === 1)?.status === "Accepted" || coRiders.find(r => r.id === 1)?.status === "Arrived";
    const user2Accepted = currentUserId === 2 ? userAccepted : coRiders.find(r => r.id === 2)?.status === "Accepted" || coRiders.find(r => r.id === 2)?.status === "Arrived";

    if (user1Accepted && user2Accepted && driverState === "accepted") {
      navigation.replace("LiveTracking", { 
        routeId, 
        rideOfferId: activeRideOfferIdRef.current || 1,
        userId: currentUserId,
        forcedLaunchPrice: 120 
      });
    }
  };

  // 📡 Real-Time Status Check
  useEffect(() => {
    let pollInterval;

    async function checkProposalStatus() {
      try {
        const cleanUserId = parseInt(currentUserId, 10);
        if (isNaN(cleanUserId)) return;

        const url = `${API_URL}/api/rides/status/${cleanUserId}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          console.warn(`⚠️ Poll failed with status code: ${res.status}`);
          return;
        }
        
        const data = await res.json();

        // Safe extraction of the active match ID
        const rideOfferId = data.matched_ride_offer_id;
        if (rideOfferId) {
          activeRideOfferIdRef.current = parseInt(rideOfferId, 10);
        }

        // Parse driver claim status
        const parsedDriverStatus = (data.rideStatus || "pending").toLowerCase().trim();
        setDriverState(parsedDriverStatus);

        const passengersList = data.passengers || [];
        const fullRosterIds = passengersList.map(p => parseInt(p.userId || p.user_id, 10));

        // Sync current user local acceptance state with backend ledger status
        const currentUserRecord = passengersList.find(p => parseInt(p.userId || p.user_id, 10) === currentUserId);
        const dbUserPoolStatus = (currentUserRecord?.status || "").toLowerCase().trim();
        const localUserAccepted = dbUserPoolStatus === "accepted" || dbUserPoolStatus === "arrived";

        if (localUserAccepted && !userAccepted) {
          setUserAccepted(true);
        }

        // Map co-rider updates dynamically with matched -> accepted states
        const parsedCoRiders = fullRosterIds
          .filter((id) => id !== currentUserId)
          .map((id, index) => {
            const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
            const serverPassengerRecord = passengersList.find(p => parseInt(p.userId || p.user_id, 10) === id);
            
            const passengerStatus = (serverPassengerRecord?.status || "").toLowerCase().trim();
            let mappedStatus = "Matched"; 

            if (passengerStatus === "accepted") {
              mappedStatus = "Accepted";
            } else if (passengerStatus === "arrived") {
              mappedStatus = "Arrived";
            }

            return {
              id: id,
              name: `Rider ${id}`,
              status: mappedStatus, 
              color: colorPalette[index % colorPalette.length]
            };
          });

        setCoRiders(parsedCoRiders);

        // Auto-launch evaluation triggers
        const allPassengersAccepted = fullRosterIds.every(id => {
          if (id === currentUserId) return localUserAccepted || userAccepted;
          const riderRecord = parsedCoRiders.find(r => r.id === id);
          return riderRecord?.status === "Accepted" || riderRecord?.status === "Arrived";
        });
        
        const driverAccepted = parsedDriverStatus === "accepted";
        const isCorePairReadyInDb = fullRosterIds.slice(0, 2).every(id => {
          if (id === currentUserId) return localUserAccepted || userAccepted;
          const riderRecord = parsedCoRiders.find(r => r.id === id);
          return riderRecord?.status === "Accepted" || riderRecord?.status === "Arrived";
        });

        if (driverAccepted && (allPassengersAccepted || (isCorePairReadyInDb && timeLeft === 0) || dbUserPoolStatus === "arrived")) {
          console.log("🎉 All metrics cleared. Proceeding to live route map tracking.");
          clearInterval(pollInterval);
          navigation.replace("LiveTracking", { 
            routeId, 
            rideOfferId: rideOfferId || 1, 
            userId: currentUserId,
            initialUserArrived: dbUserPoolStatus === "arrived"
          });
          return;
        }

      } catch (err) {
        console.log("Sync pooling connection error:", err.message);
      }
    }

    checkProposalStatus();
    pollInterval = setInterval(checkProposalStatus, 3000); 
    return () => clearInterval(pollInterval);
  }, [navigation, currentUserId, userAccepted, timeLeft, driverState]);

  // ⚡ One-Step Acceptance Handshake Action
  const handleAccept = async () => {
    console.log(`🚀 [UI Action] Accepting active matching proposal for User: ${currentUserId}`);
    setUserAccepted(true);

    try {
      const url = `${API_URL}/api/rides/accept-active-proposal`;
      console.log(`📡 Sending single-handshake POST to: ${url}`);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: parseInt(currentUserId, 10)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP error returned with code ${res.status}`);
      }

      console.log("✅ [Handshake Success] Proposal accepted:", data);

      if (data.matched_ride_offer_id) {
        activeRideOfferIdRef.current = parseInt(data.matched_ride_offer_id, 10);
      }

    } catch (err) {
      console.log("❌ Single-handshake acceptance failure:", err.message);
      setUserAccepted(false);
      Alert.alert(
        "Acceptance Failed", 
        `Server could not record acceptance update:\n\n${err.message}`
      );
    }
  };

  const handleDecline = async () => {
    Alert.alert(
      "Decline Corridor Pool?",
      "Are you sure you want to reject this proposal?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/rides/decline-proposal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: currentUserId, ride_offer_id: activeRideOfferIdRef.current || 1 }),
              });
            } catch (err) {
              console.log("Decline processing failure:", err);
            }
            
            navigation.reset({
              index: 0,
              routes: [{ name: "HubDashboardScreen", params: { userId: currentUserId } }],
            });
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Request</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={false}
          customMapStyle={cleanMinimalMapStyle}
        >
          {/* Real-time walking route: Beautiful crimson-red corridor line matching high-end ride apps */}
          <Polyline
            coordinates={getRouteCoordinates()}
            strokeColor="#DC2626"
            strokeWidth={4}
            geodesic={true}
          />

          {/* User Location Pin */}
          <Marker 
            coordinate={{ 
              latitude: currentLocation.latitude, 
              longitude: currentLocation.longitude 
            }}
          >
            <View style={styles.proMarkerContainer}>
              <View style={styles.proMarkerPulse} />
              <View style={styles.proMarkerRing}>
                <View style={styles.proMarkerCore}>
                  <Ionicons name="navigate" size={12} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </Marker>

          {/* Meetup / Hub Destination Pin */}
          <Marker coordinate={MEETUP_LOCATION}>
            <View style={styles.meetupMarkerContainer}>
              <View style={styles.meetupMarkerPulse} />
              <View style={styles.meetupMarkerRing}>
                <View style={styles.meetupMarkerCore}>
                  <Ionicons name="pin" size={12} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </Marker>
        </MapView>
      </View>

      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.priceTierCard}>
            <Text style={styles.priceTierHeading}>ESTIMATED SEAT CORRIDOR FARE</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>
                {totalAcceptedCount >= 3 ? "ETB 80" : totalAcceptedCount === 2 && timeLeft === 0 ? "ETB 120" : "ETB 80 - 120"}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>Dynamic Tier</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>• 2 Passengers Accepted (Forced Run): <Text style={{fontWeight:'700'}}>ETB 120</Text></Text>
              <Text style={styles.breakdownText}>• 3+ Passengers Accepted (Full Discount): <Text style={{color:'#10B981', fontWeight:'700'}}>ETB 80</Text></Text>
            </View>
          </View>

          {/* DRIVER STATUS */}
          <View style={[styles.driverStatusBox, driverState === "accepted" ? styles.driverAccepted : styles.driverPending]}>
            <Ionicons 
              name={driverState === "accepted" ? "checkmark-circle" : "time-outline"} 
              size={16} 
              color={driverState === "accepted" ? "#065F46" : "#854D0E"} 
            />
            <Text style={[styles.driverStatusText, driverState === "accepted" ? {color: "#065F46"} : {color: "#854D0E"}]}>
              {driverState === "accepted" ? "Driver Claimed & Scheduled" : "Waiting for driver to claim pool reservation..."}
            </Text>
          </View>

          <View style={[styles.timerBanner, !isBaselinePairReady ? styles.timerWaiting : timeLeft < 15 ? styles.timerUrgent : null]}>
            <MaterialCommunityIcons 
              name={isBaselinePairReady ? "clock-fast" : "clock-alert-outline"} 
              size={18} 
              color={!isBaselinePairReady ? "#6B7280" : timeLeft < 15 ? "#EF4444" : "#1C75BC"} 
            />
            <Text style={[styles.timerText, !isBaselinePairReady ? {color: "#6B7280"} : timeLeft < 15 ? {color: "#EF4444"} : null]}>
              {!isBaselinePairReady 
                ? "Awaiting baseline pair to open cluster window..." 
                : `Discount Window Remaining: ${timeLeft}s`}
            </Text>
          </View>

          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}><Ionicons name="location-sharp" size={20} color="#1C75BC" /></View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.locationSubtitle}>Main Corridor pickup target point</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Co-Rider Matrix Check</Text>
          
          <View style={styles.statusTable}>
            {/* YOU (CURRENT USER) */}
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#3A82F6" />
                <Text style={styles.tableUserText}>You (Rider {currentUserId})</Text>
              </View>
              <View style={[styles.badge, userAccepted ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, userAccepted ? styles.textAccepted : styles.textPending]}>
                  {userAccepted ? "Accepted" : "Matched"}
                </Text>
              </View>
            </View>

            {/* CO-RIDERS */}
            {coRiders.map((rider) => (
              <View key={`rider-row-${rider.id}`} style={styles.tableRow}>
                <View style={styles.tableUserLabelGroup}>
                  <Ionicons name="person" size={14} color={rider.color} />
                  <Text style={styles.tableUserText}>
                    {rider.name}
                    {rider.id > 2 && (
                      <Text style={{fontSize: 11, color: '#6B7280'}}> (Window Controlled)</Text>
                    )}
                  </Text>
                </View>
                <View 
                  style={[
                    styles.badge, 
                    rider.status === "Accepted" || rider.status === "Arrived" 
                      ? styles.badgeAccepted 
                      : styles.badgePending
                  ]}
                >
                  <Text 
                    style={[
                      styles.badgeText, 
                      rider.status === "Accepted" || rider.status === "Arrived" 
                        ? styles.textAccepted 
                        : styles.textPending
                    ]}
                  >
                    {rider.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.actionButtonContainer}>
            <View style={styles.buttonButtonGroup}>
              <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.7}>
                <Text style={styles.declineButtonText}>DECLINE</Text>
              </TouchableOpacity>
              
              {!userAccepted ? (
                <TouchableOpacity 
                  style={styles.acceptButton} 
                  onPress={handleAccept} 
                  activeOpacity={0.8}
                >
                  <Text style={styles.acceptButtonText}>ACCEPT PROPOSAL</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.waitingBanner}>
                  <ActivityIndicator size="small" color="#1C75BC" style={{ marginRight: 8 }} />
                  <Text style={styles.waitingBannerText}>
                    {driverState !== "accepted" ? "Waiting on driver claim..." : "Waiting for group to finalize..."}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// 🗺️ Desaturated professional map config layout
const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#efefef" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d6d6d6" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e2ff" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF" },
  backButton: { fontSize: 24, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  mapContainer: { flex: 1 },

  // 📍 User Marker (Brand Blue Theme)
  proMarkerContainer: { alignItems: "center", justifyContent: "center", width: 40, height: 40 },
  proMarkerPulse: { position: "absolute", width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(28, 117, 188, 0.15)", transform: [{ scale: 1.25 }] },
  proMarkerRing: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255, 255, 255, 0.95)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
  proMarkerCore: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#1C75BC", alignItems: "center", justifyContent: "center" },

  // 🎯 Meetup Marker (Vibrant Red-Orange Theme)
  meetupMarkerContainer: { alignItems: "center", justifyContent: "center", width: 40, height: 40 },
  meetupMarkerPulse: { position: "absolute", width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(220, 38, 38, 0.2)", transform: [{ scale: 1.35 }] },
  meetupMarkerRing: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4, borderWidth: 1.5, borderColor: "#DC2626" },
  meetupMarkerCore: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#DC2626", alignItems: "center", justifyContent: "center" },

  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "75%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 24, elevation: 10 },
  priceTierCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  priceTierHeading: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: { backgroundColor: "#EBF5FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tierBadgeText: { fontSize: 11, color: "#1C75BC", fontWeight: "700" },
  priceBreakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  driverStatusBox: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1 },
  driverPending: { backgroundColor: "#FEF9C3", borderColor: "#FEF08A" },
  driverAccepted: { backgroundColor: "#D1FAE5", borderColor: "#A7F3D0" },
  driverStatusText: { fontSize: 12, fontWeight: "600", marginLeft: 6 },
  timerBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EBF5FF", paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  timerWaiting: { backgroundColor: "#F3F4F6", borderWidth: 0.5, borderColor: "#D1D5DB" },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: { fontSize: 13, color: "#1C75BC", marginLeft: 6, fontWeight: "600" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EBF5FF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusTable: { marginBottom: 16 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500" },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 80, alignItems: "center" },
  badgePending: { backgroundColor: "#EFF6FF" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textPending: { color: "#3B82F6" },
  textAccepted: { color: "#10B981" },
  actionButtonContainer: { marginTop: 4 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  declineButton: { width: "30%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: { width: "66%", backgroundColor: "#1C75BC", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" },
  waitingBanner: { width: "66%", flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  waitingBannerText: { color: "#4B5563", fontSize: 13, fontWeight: "600" },
});