import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";

const API_BASE_URL = "http://192.168.112.52:5000/api";

const PICKUP_LOCATION = { latitude: 9.0115, longitude: 38.7945 };
const { width } = Dimensions.get("window");

export default function NavigateToPickupScreen({ navigation, route }) {
  const mapRef = useRef(null);

  const [activeRideOfferId, setActiveRideOfferId] = useState(() => {
    const passedId = route?.params?.rideId || route?.params?.ride_offer_id || null;
    return passedId ? parseInt(passedId, 10) : null;
  });
  
  const [resolvedRouteId, setResolvedRouteId] = useState(
    route?.params?.routeId || route?.params?.route_id || "1"
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [currentRideStatus, setCurrentRideStatus] = useState("accepted");
  
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0045, longitude: 38.7865 });

  // Thread safety lock reference
  const rideIdRef = useRef(activeRideOfferId);

  // 🚀 FAST-PATH IDENTITY RESOLUTION
  useEffect(() => {
  let isSubscribed = true;

  async function resolveActiveOfferInstance() {
    try {
      const discoveryRes = await fetch(`${API_BASE_URL}/rides/active-accepted-offer`);
      
      if (discoveryRes.ok && isSubscribed) {
        const data = await discoveryRes.json();
        
        if (data?.id) {
          const resolvedId = parseInt(data.id, 10);
          rideIdRef.current = resolvedId;
          setActiveRideOfferId(resolvedId);
          if (data.route_id) setResolvedRouteId(data.route_id);

          // 🎯 1. Restore persistent status ('arrived' -> shows Start Trip)
          if (data.status) {
            setCurrentRideStatus(data.status);
          }

          // 🎯 2. Restore joined passenger array
          if (Array.isArray(data.passengers)) {
            setPassengerList(data.passengers);
          }
        }
      }
    } catch (err) {
      console.log("Error restoring active offer state:", err.message);
    } finally {
      if (isSubscribed) setLoading(false);
    }
  }

  resolveActiveOfferInstance();
  return () => { isSubscribed = false; };
}, []);

  // 🔄 TELEMETRY STREAMING PIPELINE
  useEffect(() => {
    let isMounted = true;
    let manifestPollInterval;

    async function pollLiveManifestData() {
      const currentId = rideIdRef.current;
      if (!currentId) return;

      try {
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${currentId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);
        
        if (data.rideStatus) {
          setCurrentRideStatus(data.rideStatus.toLowerCase().trim());
        }

        if (data.driverLocation) {
          setDriverLocation({
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          });
        }

        if (data.passengers && Array.isArray(data.passengers)) {
          // 🎯 FILTER: Keep only passengers who have committed to the run
          const acceptedPassengers = data.passengers.filter(p => {
            const status = p.status ? p.status.toString().toLowerCase().trim() : "";
            return status === "accepted" || status === "arrived" || status === "in_trip" || status === "intransit";
          });

          const parsedPassengers = acceptedPassengers.map((p, index) => {
            const rawId = p.userId || p.user_id || p.id;
            const uniqueId = rawId ? parseInt(rawId, 10) : (index + 1);
            const rawStatus = p.status ? p.status.toString().toLowerCase().trim() : "accepted";

            return {
              id: uniqueId,
              name: `Rider ${uniqueId}`,
              latitude: PICKUP_LOCATION.latitude + (index * 0.0004 - 0.0002),
              longitude: PICKUP_LOCATION.longitude + (index * 0.0004 - 0.0002),
              status: rawStatus === "arrived" ? "Arrived" : (rawStatus === "intransit" || rawStatus === "in_trip") ? "In Transit" : "Accepted"
            };
          });
          setPassengerStates(parsedPassengers);
        }
      } catch (err) {
        console.log("Telemetry database synchronization handling error:", err);
      }
    }

    pollLiveManifestData();
    manifestPollInterval = setInterval(pollLiveManifestData, 2200);

    return () => {
      isMounted = false;
      clearInterval(manifestPollInterval);
    };
  }, []);

  const handleWorkflowAction = async () => {
    const targetRideId = rideIdRef.current;

    if (!targetRideId) {
      Alert.alert("Allocation Error", "Corridor routing identification payload mapping is incomplete.");
      return;
    }

    setSubmitting(true);
    try {
      if (currentRideStatus === "arrived") {
        console.log(`📡 Transferring state to transit engine matrix for Offer ID: [${targetRideId}]`);
        const response = await fetch(`${API_BASE_URL}/rides/start-trip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ride_offer_id: targetRideId }),
        });

        const result = await response.json();

        if (response.ok) {
          console.log("🚀 Trip successfully activated in DB! Shifting view parameters.");
          navigation.replace("TripInProgress", { 
            routeId: resolvedRouteId, 
            rideOfferId: targetRideId
          });
        } else {
          Alert.alert("Trip Initiation Aborted", result.error || "Check backend engine rules.");
        }
        return;
      }

      console.log(`📍 Locking terminal hub station arrival logs for Offer ID: [${targetRideId}]`);
      const response = await fetch(`${API_BASE_URL}/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: targetRideId }),
      });

      const result = await response.json();

      if (response.ok) {
        setCurrentRideStatus("arrived");
        console.log("✅ Arrival verified and synchronized across regional matching relays.");
      } else {
        Alert.alert("Arrival Failure", result.error || "Driver status update rejected.");
      }
    } catch (err) {
      Alert.alert("Connection Failed", "Could not submit context data points to endpoint service maps.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !activeRideOfferId) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Locating Active Corridor Offer...</Text>
      </View>
    );
  }

  const activeCount = passengerStates.length;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.headerBlock}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Navigate To Pickup</Text>
        <View style={styles.statusBadgeHUD}>
          <Text style={styles.statusBadgeHUDText}>ID: #{activeRideOfferId || "..."}</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            ...PICKUP_LOCATION,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          customMapStyle={minimalMapStyle}
        >
          <Marker coordinate={PICKUP_LOCATION} anchor={{ x: 0.5, y: 0.5 }}>
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

          <Polyline coordinates={[driverLocation, PICKUP_LOCATION]} strokeColor="#EF4444" strokeWidth={4} />

          {passengerStates.map((passenger) => (
            <Marker key={`marker-node-rider-${passenger.id}`} coordinate={{ latitude: passenger.latitude, longitude: passenger.longitude }}>
              <View style={[styles.passengerTrackingPin, passenger.status === "Arrived" ? { backgroundColor: "#10B981" } : passenger.status === "In Transit" ? { backgroundColor: "#3B82F6" } : { backgroundColor: "#D97706" }]}>
                <Text style={styles.markerText}>{passenger.id}</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[styles.statusBanner, currentRideStatus === "arrived" && { backgroundColor: "#3B82F6" }]}>
            <FontAwesome5 name="route" size={13} color="#FFFFFF" style={{ marginRight: 10 }} />
            <View style={styles.bannerTextFrame}>
              <Text style={styles.bannerMainText}>
                {currentRideStatus === "arrived" ? "Arrival Confirmed" : `Proceeding with ${activeCount} Passengers`}
              </Text>
              <Text style={styles.bannerSubText}>
                {currentRideStatus === "arrived" ? "All riders identified. Initialize transit matrix below." : "Awaiting gathering alignment at terminal hub node"}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHeadingLabel}>Co-Rider Acceptance Matrix</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <Text style={{ color: "#6B7280", fontSize: 13 }}>No confirmed passengers in this run.</Text>
              </View>
            ) : (
              passengerStates.map((passenger) => (
                <View key={`list-row-rider-${passenger.id}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentity}>
                    <View style={styles.avatarCircle}>
                      <Ionicons name="person" size={13} color="#4B5563" />
                    </View>
                    <Text style={styles.passengerName}>{passenger.name}</Text>
                  </View>
                  <View style={passenger.status === "Arrived" ? styles.statusArrivedBadge : passenger.status === "In Transit" ? styles.statusTransitBadge : styles.statusAcceptedBadge}>
                    <Text style={passenger.status === "Arrived" ? styles.statusArrivedText : passenger.status === "In Transit" ? styles.statusTransitText : styles.statusAcceptedText}>
                      {passenger.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>

      <View style={styles.footerContainer}>
        <TouchableOpacity 
            style={[styles.actionButton, submitting && { opacity: 0.6 }, currentRideStatus === "arrived" && { backgroundColor: "#3B82F6" }]}
            activeOpacity={0.85}
            disabled={submitting}
            onPress={handleWorkflowAction}
        >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={currentRideStatus === "arrived" ? "play-sharp" : "location-sharp"} size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
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
  mapContainer: { flex: 1, minHeight: 240 },
  hubStationWrapper: { justifyContent: "center", alignItems: "center" },
  hubStationPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", zIndex: 5 },
  hubStationPulseRing: { position: "absolute", width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  driverCarPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  passengerTrackingPin: { width: 20, height: 20, borderRadius: 10, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  markerText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  slidingPanelDrawer: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, borderWidth: 1, borderColor: "#E5E7EB", marginTop: -10 },
  statusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#059669", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
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
  statusTransitBadge: { backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusTransitText: { color: "#3B82F6", fontSize: 10, fontWeight: "700" },
  statusAcceptedBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusAcceptedText: { color: "#D97706", fontSize: 10, fontWeight: "700" },
  footerContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  actionButton: { backgroundColor: "#059669", borderRadius: 10, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 },
});