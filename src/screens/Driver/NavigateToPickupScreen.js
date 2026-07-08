import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

// Production network cluster gateway layout setup
const API_BASE_URL = "http://192.168.253.52:5000/api";

export default function NavigateToPickupScreen({ navigation, route }) {
  const mapRef = useRef(null);

  // Extract parameters passed down from previous stack navigation context
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";
  const rideOfferId = route?.params?.rideId || route?.params?.ride_offer_id || 1;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [currentRideStatus, setCurrentRideStatus] = useState("pending");
  
  // Default coordinates centered on Megenagna Blue Taxi Stop area
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0045, longitude: 38.7865 });
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };

  const [countdown, setCountdown] = useState(300); // 5:00 Minutes target countdown
  const [pulseAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

  // Real-Time Telemetry Polling Loop: Monitors passenger status changes and ride offer transitions
  useEffect(() => {
    console.log(`📡 Driver Telemetry streaming active for Ride Offer ID: [${rideOfferId}]`);
    let isMounted = true;

    async function pollLiveManifestData() {
      try {
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${rideOfferId}`);
        
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);
        
        // Track the current high-level status of the offer directly from the backend
        if (data.rideStatus) {
          setCurrentRideStatus(data.rideStatus.toLowerCase());
        }

        if (data.driverLocation) {
          const newDriverLoc = {
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          };
          setDriverLocation(newDriverLoc);

          // Zoom map to max bounding viewport accommodating driver and destination positions
          if (mapRef.current) {
            mapRef.current.fitToCoordinates([newDriverLoc, pickupLocation], {
              edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
              animated: true,
            });
          }
        }

        // Map properties matching endpoint JSON signature (userId, status)
        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p, index) => {
            const passengerId = parseInt(p.userId || p.user_id || p.id, 10);
            const rawStatus = (p.status || "accepted").toLowerCase();
            let statusLabel = "Accepted";
            
            if (rawStatus === "arrived") {
              statusLabel = "Arrived";
            }

            const scatterLat = pickupLocation.latitude + (index * 0.0003 - 0.00015);
            const scatterLng = pickupLocation.longitude + (index * 0.0003 - 0.00015);

            return {
              id: passengerId,
              name: `Rider ${passengerId}`,
              latitude: scatterLat,
              longitude: scatterLng,
              status: statusLabel
            };
          });
          
          setPassengerStates(parsedPassengers);
        } else {
          setPassengerStates([]);
        }

        setLoading(false);
      } catch (err) {
        console.log("Telemetry engine reading fault:", err);
        if (isMounted) setLoading(false);
      }
    }

    pollLiveManifestData();
    const manifestPollInterval = setInterval(pollLiveManifestData, 2500); // Polling frame window

    return () => {
      isMounted = false;
      clearInterval(manifestPollInterval);
    };
  }, [rideOfferId]);

  // 🎯 Action Flow Orchestration Button (Three-Step Progression Logic)
  const handleWorkflowAction = async () => {
    // STEP 2: If status is already 'arrived' in DB, click routes driver smoothly to TripInProgress Screen
    if (currentRideStatus === "arrived") {
      navigation.replace("TripInProgress", { 
        routeId: routeId, 
        rideOfferId: rideOfferId,
        rideStatus: "inprogress"
      });
      return;
    }

    // STEP 1: First click fires network handshake to change ride status to 'arrived' 
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: rideOfferId }),
      });

      const result = await response.json();

      if (response.ok) {
        // Optimistically flip the label to "START TRIP" immediately
        setCurrentRideStatus("arrived");
      } else {
        Alert.alert("Arrival Sync Failure", result.error || "Could not update state.");
      }
    } catch (err) {
      Alert.alert("Server Connection Error", "Verify network routing path to backend cluster setup.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  if (loading) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Syncing Corridor Manifest Matrix...</Text>
      </View>
    );
  }

  const activeCount = passengerStates.length;
  const pricePerSeat = parseFloat(rideMetrics?.price_per_seat) || 100;
  const totalEarnings = activeCount * pricePerSeat;
  const isFullyPacked = activeCount >= 3;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      
      {/* Header Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Navigate To Pickup</Text>
        <View style={styles.countdownPill}>
          <Ionicons name="time-outline" size={12} color="#DC2626" style={{ marginRight: 4 }} />
          <Text style={styles.countdownPillText}>{formatTimer(countdown)}</Text>
        </View>
      </View>

      {/* Dynamic Optimization Toast Notification */}
      {isFullyPacked && (
        <View style={styles.toastNotification}>
          <Ionicons name="sparkles" size={16} color="#15803D" style={{ marginRight: 8 }} />
          <Text style={styles.toastText}>
            Corridor fully packed! Cost per seat dropped to ETB {pricePerSeat} for all riders.
          </Text>
        </View>
      )}

      {/* Canvas Map Tracker */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: 9.0115,       
            longitude: 38.7945,
            latitudeDelta: 0.005,  
            longitudeDelta: 0.005,
          }}
          customMapStyle={minimalMapStyle}
        >
          {/* Target Hub Station Pin */}
          <Marker coordinate={pickupLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.hubStationWrapper}>
              <View style={styles.hubStationPin}>
                <Ionicons name="flag" size={13} color="#FFFFFF" />
              </View>
              <View style={styles.hubStationPulseRing} />
            </View>
          </Marker>

          {/* Driver Vector Marker */}
          <Marker coordinate={driverLocation}>
            <View style={styles.driverCarPin}>
              <FontAwesome5 name="car-side" size={12} color="#FFFFFF" />
            </View>
          </Marker>

          {/* 🎯 REDLINE PATH MAPPING POLYLINE */}
          <Polyline
            coordinates={[driverLocation, pickupLocation]}
            strokeColor="#EF4444"
            strokeWidth={4}
            geodesic={true}
          />

          {/* Live Passenger Vector Nodes */}
          {passengerStates.map((passenger) => (
            <Marker key={`marker-${passenger.id}`} coordinate={{ latitude: passenger.latitude, longitude: passenger.longitude }}>
              <View style={[styles.passengerTrackingPin, passenger.status === "Arrived" ? { backgroundColor: "#10B981" } : { backgroundColor: "#D97706" }]}>
                <MaterialCommunityIcons 
                  name={passenger.status === "Arrived" ? "account-check" : "account-clock"} 
                  size={11} 
                  color="#FFFFFF" 
                />
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      {/* Sliding Ledger & Co-Rider Status Sheet */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Dynamic Progress Indicator Bar */}
          <View style={[styles.statusBanner, isFullyPacked && styles.statusBannerSuccess]}>
            <FontAwesome5 name="route" size={13} color="#FFFFFF" style={{ marginRight: 10 }} />
            <View style={styles.bannerTextFrame}>
              <Text style={styles.bannerMainText}>
                {isFullyPacked ? "Corridor Fully Packed" : `Proceeding with ${activeCount} Riders`}
              </Text>
              <Text style={styles.bannerSubText}>
                Awaiting convergence at terminal hub node
              </Text>
            </View>
          </View>

          {/* Co-Rider Acceptance Matrix */}
          <Text style={styles.sectionHeadingLabel}>Co-Rider Acceptance Matrix</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>Awaiting corridor user group configurations...</Text>
            ) : (
              passengerStates.map((passenger) => (
                <View key={`rider-${passenger.id}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentity}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person" size={13} color="#4B5563" />
                    </View>
                    <Text style={styles.passengerName}>{passenger.name}</Text>
                  </View>

                  {passenger.status === "Arrived" ? (
                    <View style={styles.statusArrivedBadge}>
                      <Ionicons name="checkmark-circle" size={14} color="#10B981" style={{ marginRight: 4 }} />
                      <Text style={styles.statusArrivedText}>ARRIVED</Text>
                    </View>
                  ) : (
                    <View style={styles.statusAcceptedBadge}>
                      <MaterialCommunityIcons name="account-arrow-right" size={14} color="#D97706" style={{ marginRight: 4 }} />
                      <Text style={styles.statusAcceptedText}>ACCEPTED</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Live Earnings Metric Card */}
          <Text style={styles.sectionHeadingLabel}>Corridor Ledger Summary</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Passenger Seat Rate</Text>
              <Text style={styles.ledgerValue}>ETB {pricePerSeat}</Text>
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Est. Total Revenue</Text>
              <Text style={styles.driverGainValue}>ETB {totalEarnings}</Text>
            </View>
          </View>
          
        </ScrollView>
      </View>

      {/* Persistent Call-to-Action Footer Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={[
              styles.actionButton, 
              submitting && { opacity: 0.6 }, 
              currentRideStatus === "arrived" && { backgroundColor: "#3B82F6" }
            ]}
            activeOpacity={0.8}
            disabled={submitting}
            onPress={handleWorkflowAction}
        >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons 
                  name={currentRideStatus === "arrived" ? "play-sharp" : "location-sharp"} 
                  size={18} 
                  color="#FFFFFF" 
                  style={{ marginRight: 8 }} 
                />
                <Text style={styles.actionButtonText}>
                  {currentRideStatus === "arrived" ? "START TRIP" : "ARRIVED AT PICKUP POINT"}
                </Text>
              </>
            )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const minimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", zIndex: 10 },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  countdownPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  countdownPillText: { color: "#DC2626", fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  toastNotification: { flexDirection: "row", backgroundColor: "#DCFCE7", padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: "#BBF7D0", zIndex: 10 },
  toastText: { flex: 1, fontSize: 13, color: "#15803D" },
  mapContainer: { flex: 1, minHeight: 220 },
  hubStationWrapper: { justifyContent: "center", alignItems: "center" },
  hubStationPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", zIndex: 5 },
  hubStationPulseRing: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  driverCarPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  passengerTrackingPin: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  slidingPanelDrawer: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, borderWidth: 1, borderColor: "#E5E7EB" },
  statusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#3B82F6", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  statusBannerSuccess: { backgroundColor: "#059669" },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
  emptyManifestText: { paddingVertical: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentity: { flexDirection: "row", alignItems: "center" },
  avatarCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginRight: 10 },
  passengerName: { fontSize: 14, color: "#374151", fontWeight: "600" },
  statusArrivedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusArrivedText: { color: "#10B981", fontSize: 11, fontWeight: "700" },
  statusAcceptedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusAcceptedText: { color: "#D97706", fontSize: 11, fontWeight: "700" },
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 16 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  driverGainValue: { fontSize: 15, fontWeight: "800", color: "#059669" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  footerContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  actionButton: { backgroundColor: "#059669", borderRadius: 10, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});