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
  Image,
  Linking,
  Animated,
  PanResponder,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";
import { playSound } from "../../utils/soundPlayer"; // 👈 1. Import sound player here


const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://100.108.52.79:5000/api";

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const { height } = Dimensions.get("window");

// Distance calculation utility (Haversine formula)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing calculation utility for 3D camera & Arrow rotation
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const toDeg = (value) => (value * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

export default function TripInProgressScreen({ navigation, route }) {
  const mapRef = useRef(null);
  const { user } = useAuth();

  const currentDriverId = route?.params?.driverId || user?.id || user?.driver_id || 10;
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";
  const rideOfferId = route?.params?.rideOfferId || route?.params?.rideId || null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [mapHubData, setMapHubData] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);

  // Map readiness state to ensure auto-centering fires reliably
  const [isMapReady, setIsMapReady] = useState(false);
  const hasFittedMapRef = useRef(false);

  // Destination coordinates
  const destinationLocation = {
    latitude: parseFloat(mapHubData?.end_latitude || mapHubData?.start_latitude || 9.0125),
    longitude: parseFloat(mapHubData?.end_longitude || mapHubData?.start_longitude || 38.7535),
    name: mapHubData?.end_hub_name || mapHubData?.start_hub_name || "Destination Terminal"
  };

  // Calculate current bearing to point the arrow at the destination
  const currentBearing = driverLocation && destinationLocation?.latitude
    ? calculateBearing(
        driverLocation.latitude,
        driverLocation.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude
      )
    : 0;

  // Draggable Bottom Sheet Animation Setup
  const [isExpanded, setIsExpanded] = useState(true);
  const translateY = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.spring(translateY, { toValue: height * 0.40, useNativeDriver: true, bounciness: 4 }).start(() => setIsExpanded(false));
        } else if (gestureState.dy < -50 || gestureState.vy < -0.5) {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(() => setIsExpanded(true));
        } else {
          Animated.spring(translateY, { toValue: isExpanded ? 0 : height * 0.40, useNativeDriver: true, bounciness: 4 }).start();
        }
        panY.setValue(0);
      },
    })
  ).current;

  const togglePanelState = () => {
    Animated.spring(translateY, {
      toValue: isExpanded ? height * 0.40 : 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
    setIsExpanded(!isExpanded);
  };

  // Fetch initial map hubs
  useEffect(() => {
    if (!currentDriverId) return;
    async function fetchMapCoordinates() {
      try {
        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const res = await fetch(`${API_BASE_URL}/rides/map_coordinates?${queryParam}`);
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) return;
        const data = await res.json();
        if (res.ok && data.success && data.coordinates) setMapHubData(data.coordinates);
      } catch (err) {
        console.error("Error fetching map coordinates:", err);
      }
    }
    fetchMapCoordinates();
    const interval = setInterval(fetchMapCoordinates, 4000);
    return () => clearInterval(interval);
  }, [currentDriverId, rideOfferId]);

  // Handle 3D Recenter Functionality
  const handleRecenter3D = (loc = driverLocation) => {
    if (mapRef.current && loc && destinationLocation?.latitude) {
      const bearing = calculateBearing(
        loc.latitude,
        loc.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude
      );
      mapRef.current.animateCamera({
        center: loc,
        pitch: 65,
        heading: bearing,
        zoom: 17,
        altitude: 500,
      }, { duration: 1500 });
    }
  };

  // Trigger auto-center ONLY when the map is fully loaded and we have coordinates
  useEffect(() => {
    if (isMapReady && driverLocation && destinationLocation?.latitude && !hasFittedMapRef.current) {
      handleRecenter3D(driverLocation);
      hasFittedMapRef.current = true;
    }
  }, [isMapReady, driverLocation, destinationLocation?.latitude]);

  // Poll live tracking data
  useEffect(() => {
    let isMounted = true;
    async function pollLiveTransitData() {
      try {
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${rideOfferId || currentDriverId}`);
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }
        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);

        if (data.driverLocation) {
          setDriverLocation({
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          });
        }

        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p) => ({
            id: parseInt(p.userId || p.user_id || p.id, 10),
            name: p.full_name || p.name || `Rider #${p.userId || p.id}`,
            phone: p.phone_number || "",
            rating: p.rating || "5.00",
            profilePhoto: p.profile_photo_url || "",
            status: (p.status || "in_trip").toLowerCase()
          }));
          setPassengerStates(parsedPassengers);
        }
        setLoading(false);
      } catch (err) {
        console.log("Transit tracking error:", err);
        if (isMounted) setLoading(false);
      }
    }
    pollLiveTransitData();
    const transitInterval = setInterval(pollLiveTransitData, 3000);
    return () => {
      isMounted = false;
      clearInterval(transitInterval);
    };
  }, [rideOfferId, currentDriverId]);

  const handleCallPassenger = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert("Contact Unavailable", "Passenger has no registered phone number.");
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleFinishTrip = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rides/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: currentDriverId }),
      });
      const rawText = await response.text();
      if (response.ok) {
        const result = JSON.parse(rawText);
        const resolvedRideOfferId = result.rideOffer?.id || rideOfferId;
        
        // 🎵 Play sound 7 before unmounting the view
        await playSound("7");

        navigation.replace("TripEarningsSummary", {
          rideOfferId: resolvedRideOfferId,
          routeId: routeId,
          finalPrice: result.finalPrice,
          ridersCount: result.updatedRidersCount
        });
      } else {
        Alert.alert("Execution Error", "Could not finalize transition parameters.");
      }
    } catch (err) {
      console.error("Network error:", err);
      Alert.alert("Network Failure", "Unable to establish communication with backend.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading Live Navigation HUD...</Text>
      </View>
    );
  }

  const distanceKm = driverLocation
    ? calculateDistanceKm(driverLocation.latitude, driverLocation.longitude, destinationLocation.latitude, destinationLocation.longitude)
    : 0.0;
  const estimatedMinutes = Math.max(1, Math.round((distanceKm / 25) * 60));
  const activeCount = passengerStates.length;
  const totalSeats = rideMetrics?.total_seats || mapHubData?.total_seats || 4;
  const pricePerSeat = parseFloat(rideMetrics?.price_per_seat || mapHubData?.price_per_seat) || 80;
  const totalEarnings = activeCount * pricePerSeat;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      
      {/* HUD Header Status Block */}
      <View style={styles.headerBlock}>
        <View style={styles.statusBarIndicator}>
          <View style={styles.pulseLiveDot} />
          <Text style={styles.headerTitleText}>Trip In Progress</Text>
        </View>
        <TouchableOpacity style={styles.gpsNavButton} onPress={() => handleRecenter3D()}>
          <MaterialCommunityIcons name="crosshairs-gps" size={15} color="#2563EB" style={{ marginRight: 4 }} />
          <Text style={styles.gpsNavText}>Re-center</Text>
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          customMapStyle={professionalRideMapStyle}
          showsBuildings={true}
          showsTraffic={true}
          rotateEnabled={true}
          pitchEnabled={true}
          zoomEnabled={true}
          scrollEnabled={true}
          compassEnabled={true}
          onMapReady={() => setIsMapReady(true)}
        >
          {/* Flat Directional Arrow Marker */}
          {driverLocation && (
            <Marker 
              coordinate={driverLocation} 
              anchor={{ x: 0.5, y: 0.5 }} 
              flat={true} 
              rotation={currentBearing} 
              zIndex={2}
            >
              <View style={styles.arrowMarkerHalo}>
                <View style={styles.arrowMarkerCore}>
                  <MaterialCommunityIcons 
                    name="navigation" 
                    size={20} 
                    color="#FFFFFF" 
                    style={{ transform: [{ rotate: '-45deg' }] }} 
                  />
                </View>
              </View>
            </Marker>
          )}

          {/* Destination Marker */}
          {destinationLocation?.latitude && destinationLocation?.longitude && (
            <Marker coordinate={destinationLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={1}>
              <View style={styles.destPinBadge}>
                <Text style={styles.destPinText}>DROP-OFF</Text>
              </View>
            </Marker>
          )}

          {/* Navigation Route Line */}
          {driverLocation && destinationLocation?.latitude && (
            <MapViewDirections
              origin={driverLocation}
              destination={destinationLocation}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={6}
              strokeColor="#2563EB"
              optimizeWaypoints={true}
            />
          )}
        </MapView>
      </View>

      {/* Draggable Bottom Sheet Dashboard Drawer */}
      <Animated.View style={[styles.slidingPanelDrawer, { transform: [{ translateY: translateY }] }]}>
        <View {...panResponder.panHandlers}>
          <TouchableOpacity activeOpacity={0.9} onPress={togglePanelState} style={styles.dragHandleContainer}>
            <View style={styles.dragIndicatorBar} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.transitStatusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerSubtitle}>DESTINATION HUB</Text>
              <Text style={styles.transitStatusBannerText} numberOfLines={1}>{destinationLocation.name}</Text>
            </View>
            <View style={styles.metricsBadgeColumn}>
              <Text style={styles.metricBadgeValue}>{distanceKm.toFixed(1)} km</Text>
              <Text style={styles.metricBadgeSubLabel}>~{estimatedMinutes} mins ETA</Text>
            </View>
          </View>

          <Text style={styles.sectionHeadingLabel}>On-Board Manifest Registry ({activeCount})</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>No active passengers signed into transit registry.</Text>
            ) : (
              passengerStates.map((passenger, index) => (
                <View key={`transit-rider-${passenger.id}-${index}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentityRow}>
                    {passenger.profilePhoto ? (
                      <Image source={{ uri: passenger.profilePhoto }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarWrapperCircle}>
                        <FontAwesome5 name="user" size={11} color="#2563EB" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerNameText} numberOfLines={1}>{passenger.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Text style={styles.passengerRatingText}>{passenger.rating}</Text>
                        {passenger.phone ? <Text style={styles.passengerPhoneText}> • {passenger.phone}</Text> : null}
                      </View>
                    </View>
                  </View>
                  <View style={styles.passengerRightCluster}>
                    <TouchableOpacity style={styles.callIconButton} onPress={() => handleCallPassenger(passenger.phone)}>
                      <Ionicons name="call" size={14} color="#10B981" />
                    </TouchableOpacity>
                    <View style={styles.transitBadgePill}>
                      <Text style={styles.transitBadgePillText}>IN TRIP</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionHeadingLabel}>Live Corridor Balance Ledger</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Active Seats Occupied</Text>
              <Text style={styles.ledgerValue}>{activeCount} / {totalSeats} seats</Text>
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Est. Payout Value</Text>
              <Text style={styles.driverGainValue}>ETB {totalEarnings.toFixed(2)}</Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      {/* Finish Trip Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.actionCTAButton, submitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={submitting}
          onPress={handleFinishTrip}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.actionCTAButtonText}>FINISH CORRIDOR TRIP</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const professionalRideMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F8FAFC" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748B" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#F1F5F9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#F1F5F9" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#CBD5E1" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#BAE6FD" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },
  
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", zIndex: 10 },
  statusBarIndicator: { flexDirection: "row", alignItems: "center" },
  pulseLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 8 },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  gpsNavButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: "#BFDBFE" },
  gpsNavText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },
  
  mapContainer: { flex: 1, backgroundColor: "#E5E7EB" },

  arrowMarkerHalo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  arrowMarkerCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  
  destPinBadge: { backgroundColor: "#0284C7", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 2, borderColor: "#FFFFFF" },
  destPinText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  
  slidingPanelDrawer: { position: "absolute", bottom: 70, left: 0, right: 0, height: height * 0.58, backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, borderWidth: 1, borderColor: "#E5E7EB", zIndex: 20 },
  dragHandleContainer: { width: "100%", alignItems: "center", paddingVertical: 10 },
  dragIndicatorBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1" },

  transitStatusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#2563EB", borderRadius: 12, padding: 12, marginBottom: 16 },
  bannerSubtitle: { fontSize: 9, fontWeight: "700", color: "#BFDBFE", letterSpacing: 0.6, marginBottom: 2 },
  transitStatusBannerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  metricsBadgeColumn: { alignItems: "flex-end", paddingLeft: 12 },
  metricBadgeValue: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  metricBadgeSubLabel: { color: "#E0E7FF", fontSize: 10, fontWeight: "600", marginTop: 2 },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
  emptyManifestText: { paddingVertical: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentityRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  avatarWrapperCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 10 },
  avatarImage: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: "#E5E7EB" },
  passengerNameText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  passengerRatingText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginLeft: 4 },
  passengerPhoneText: { fontSize: 11, color: "#9CA3AF" },
  
  passengerRightCluster: { flexDirection: "row", alignItems: "center" },
  callIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginRight: 8, borderWidth: 1, borderColor: "#A7F3D0" },
  transitBadgePill: { backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE" },
  transitBadgePillText: { color: "#2563EB", fontSize: 10, fontWeight: "700" },
  
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 16 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  driverGainValue: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB", zIndex: 30 },
  actionCTAButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionCTAButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 }
});