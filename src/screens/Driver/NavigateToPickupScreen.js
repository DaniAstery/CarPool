import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const API_BASE_URL = "http://192.168.204.52:5000/api";

export default function NavigateToPickupScreen({ navigation, route }) {
  const mapRef = useRef(null);

  // Core state handles
  const [activeRideOfferId, setActiveRideOfferId] = useState(
    route?.params?.rideId || route?.params?.ride_offer_id || null
  );
  const [resolvedRouteId, setResolvedRouteId] = useState(
    route?.params?.routeId || route?.params?.route_id || "1"
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [currentRideStatus, setCurrentRideStatus] = useState("accepted");
  
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0045, longitude: 38.7865 });
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };

  // Real-Time Telemetry Streaming & Discovery Lifecycle
  useEffect(() => {
    let isMounted = true;
    let manifestPollInterval;

    async function pollLiveManifestData() {
      try {
        let currentId = activeRideOfferId;

        // 🎯 DISCOVERY LOCK: If local state lacks an ID, fetch the active 'accepted' row from the DB
        if (!currentId) {
          const discoveryRes = await fetch(`${API_BASE_URL}/rides/active-accepted-offer`);
          if (discoveryRes.ok) {
            const discoveryData = await discoveryRes.json();
            if (isMounted) {
              currentId = discoveryData.id;
              setActiveRideOfferId(discoveryData.id);
              if (discoveryData.route_id) setResolvedRouteId(discoveryData.route_id);
            }
          }
        }

        if (!currentId) {
          console.log("Waiting for an active accepted ride offer to register in database...");
          return;
        }

        console.log(`📡 Streaming live context stream for Offer ID: [${currentId}]`);
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${currentId}`);
        
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);
        
        if (data.rideStatus) {
          setCurrentRideStatus(data.rideStatus.toLowerCase());
        }

        if (data.driverLocation) {
          setDriverLocation({
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          });
        }

        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p, index) => {
            const rawId = p.userId || p.user_id || p.id;
            const uniqueId = rawId ? parseInt(rawId, 10) : (index + 1);
            const rawStatus = (p.status || "matched").toLowerCase();

            return {
              id: uniqueId,
              name: `Rider ${uniqueId}`,
              latitude: pickupLocation.latitude + (index * 0.0004 - 0.0002),
              longitude: pickupLocation.longitude + (index * 0.0004 - 0.0002),
              status: rawStatus === "arrived" ? "Arrived" : "Accepted"
            };
          });

          setPassengerStates(parsedPassengers);
        } else {
          setPassengerStates([]);
        }

        setLoading(false);
      } catch (err) {
        console.log("Telemetry exception frame block caught:", err);
        if (isMounted) setLoading(false);
      }
    }

    pollLiveManifestData();
    manifestPollInterval = setInterval(pollLiveManifestData, 2500);

    return () => {
      isMounted = false;
      clearInterval(manifestPollInterval);
    };
  }, [activeRideOfferId]);

  // Dynamic Camera Recalibration Bound Box Adjustment
  useEffect(() => {
    if (mapRef.current && !loading) {
      mapRef.current.fitToCoordinates([driverLocation, pickupLocation], {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  }, [driverLocation, loading]);

  // State Action Workflow Router Handler
  const handleWorkflowAction = async () => {
    if (!activeRideOfferId) {
      Alert.alert("Error", "No active ride context selected to process arrival.");
      return;
    }

    // 🚀 STEP 2: Status is already updated to 'arrived'. Second click triggers trip startup navigation.
    if (currentRideStatus === "arrived") {
      navigation.replace("TripInProgress", { 
        routeId: resolvedRouteId, 
        rideOfferId: activeRideOfferId
      });
      return;
    }

    // 🚀 STEP 1: Driver clicks for the first time to log arrival at pickup destination terminal hub
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: activeRideOfferId }),
      });

      if (response.ok) {
        // 🎯 Shifts state locally. Changes layout to "START CORRIDOR TRIP" instead of immediately executing replace transition
        setCurrentRideStatus("arrived");
        console.log("Arrival committed! Interface flipped to start-trip configuration state.");
      } else {
        const result = await response.json();
        Alert.alert("Arrival Sync Failure", result.error || "Could not update state.");
      }
    } catch (err) {
      Alert.alert("Server Connection Error", "Verify network link route paths directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !activeRideOfferId) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Locating Active Accepted Corridor Offer...</Text>
      </View>
    );
  }

  const activeCount = passengerStates.length;
  const pricePerSeat = parseFloat(rideMetrics?.price_per_seat) || 80;
  const totalEarnings = activeCount * pricePerSeat;
  const isFullyPacked = activeCount >= 3;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      
      {/* HUD Header Bar */}
      <View style={styles.headerBlock}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Navigate To Pickup</Text>
        <View style={styles.statusBadgeHUD}>
          <Text style={styles.statusBadgeHUDText}>ID: #{activeRideOfferId || "Searching..."}</Text>
        </View>
      </View>

      {/* Dynamic Packing Value Proposition Banner */}
      {isFullyPacked && (
        <View style={styles.toastNotification}>
          <Ionicons name="sparkles" size={16} color="#15803D" style={{ marginRight: 8 }} />
          <Text style={styles.toastText}>
            Corridor fully packed! Cost per seat optimized to ETB {pricePerSeat} for all riders.
          </Text>
        </View>
      )}

      {/* Tracking Canvas Interface */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            ...pickupLocation,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          customMapStyle={minimalMapStyle}
        >
          <Marker coordinate={pickupLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.hubStationWrapper}>
              <View style={styles.hubStationPin}>
                <Ionicons name="flag" size={12} color="#FFFFFF" />
              </View>
              <View style={styles.hubStationPulseRing} />
            </View>
          </Marker>

          <Marker coordinate={driverLocation}>
            <View style={styles.driverCarPin}>
              <FontAwesome5 name="car-side" size={11} color="#FFFFFF" />
            </View>
          </Marker>

          <Polyline
            coordinates={[driverLocation, pickupLocation]}
            strokeColor="#EF4444"
            strokeWidth={4}
          />

          {passengerStates.map((passenger) => (
            <Marker 
              key={`marker-node-rider-${passenger.id}`} 
              coordinate={{ latitude: passenger.latitude, longitude: passenger.longitude }}
            >
              <View style={[styles.passengerTrackingPin, passenger.status === "Arrived" ? { backgroundColor: "#10B981" } : { backgroundColor: "#D97706" }]}>
                <Text style={styles.markerText}>{passenger.id}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      {/* Ledger & Status Drawer */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={[styles.statusBanner, isFullyPacked && styles.statusBannerSuccess]}>
            <FontAwesome5 name="route" size={13} color="#FFFFFF" style={{ marginRight: 10 }} />
            <View style={styles.bannerTextFrame}>
              <Text style={styles.bannerMainText}>
                {isFullyPacked ? "Corridor Fully Packed" : `Proceeding with ${activeCount} Passengers`}
              </Text>
              <Text style={styles.bannerSubText}>
                {currentRideStatus === "arrived" ? "Arrival recorded. Initialize trip parameters below." : "Awaiting gathering alignment at terminal hub node"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHeadingLabel}>Co-Rider Acceptance Matrix</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.map((passenger) => (
              <View key={`list-row-rider-${passenger.id}`} style={styles.passengerRow}>
                <View style={styles.passengerIdentity}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person" size={13} color="#4B5563" />
                  </View>
                  <Text style={styles.passengerName}>{passenger.name}</Text>
                </View>

                <View style={passenger.status === "Arrived" ? styles.statusArrivedBadge : styles.statusAcceptedBadge}>
                  <Text style={passenger.status === "Arrived" ? styles.statusArrivedText : styles.statusAcceptedText}>
                    {passenger.status.toUpperCase()}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionHeadingLabel}>Corridor Ledger Summary</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Passenger Seat Rate</Text>
              <Text style={styles.ledgerValue}>ETB {pricePerSeat.toFixed(2)}</Text>
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Est. Total Revenue</Text>
              <Text style={styles.driverGainValue}>ETB {totalEarnings.toFixed(2)}</Text>
            </View>
          </View>
          
        </ScrollView>
      </View>

      {/* Sticky Bottom Actions Footprint Bar */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={[
              styles.actionButton, 
              submitting && { opacity: 0.6 }, 
              currentRideStatus === "arrived" && { backgroundColor: "#3B82F6" } // Flips to clean blue layout state
            ]}
            activeOpacity={0.85}
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
                  {currentRideStatus === "arrived" ? "START CORRIDOR TRIP" : "ARRIVED AT PICKUP POINT"}
                </Text>
              </>
            )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const minimalMapStyle = [{ elementType: "geometry", stylers: [{ color: "#F5F5F5" }] }, { featureType: "poi", stylers: [{ visibility: "off" }] }];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", zIndex: 10 },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  statusBadgeHUD: { backgroundColor: "#F3F4F6", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeHUDText: { color: "#4B5563", fontSize: 11, fontWeight: "700" },
  toastNotification: { flexDirection: "row", backgroundColor: "#DCFCE7", padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: "#BBF7D0" },
  toastText: { flex: 1, fontSize: 12, color: "#15803D", fontWeight: "500" },
  mapContainer: { flex: 1, minHeight: 240 },
  hubStationWrapper: { justifyContent: "center", alignItems: "center" },
  hubStationPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", zIndex: 5 },
  hubStationPulseRing: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  driverCarPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  passengerTrackingPin: { width: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  markerText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  slidingPanelDrawer: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, borderWidth: 1, borderColor: "#E5E7EB", marginTop: -10 },
  statusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#3B82F6", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  statusBannerSuccess: { backgroundColor: "#059669" },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  bannerSubText: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentity: { flexDirection: "row", alignItems: "center" },
  avatarCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginRight: 10 },
  passengerName: { fontSize: 13, color: "#374151", fontWeight: "600" },
  statusArrivedBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusArrivedText: { color: "#10B981", fontSize: 10, fontWeight: "700" },
  statusAcceptedBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusAcceptedText: { color: "#D97706", fontSize: 10, fontWeight: "700" },
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 16 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  driverGainValue: { fontSize: 15, fontWeight: "800", color: "#059669" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  footerContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  actionButton: { backgroundColor: "#059669", borderRadius: 10, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});