import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";
import { playSound } from "../utils/soundPlayer";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0235,
  longitude: 38.8275,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Fetch real street-level driving route from OSRM public driving router
const fetchDrivingRoute = async (origin, destination) => {
  if (!origin || !destination || !origin.latitude || !destination.latitude || !origin.longitude || !destination.longitude) {
    return [];
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
    }
  } catch (err) {
    console.log("⚠️ OSRM driving route request failed, utilizing direct path fallback");
  }

  return [origin, destination];
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (3 Distinct Ride-App Markers: User, Pickup, Destination)
// ------------------------------------------------------------------
const TrackingMap = memo(({ currentLocation, pickupLocation, destinationLocation, routeCoordinates, mapRef, isDrawerExpanded }) => {
  const hasFitted = useRef(false);

  useEffect(() => {
    if (mapRef.current && pickupLocation?.latitude && destinationLocation?.latitude && !hasFitted.current) {
      hasFitted.current = true;
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      const coordsToFit = [
        ...(currentLocation?.latitude ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : []),
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
        ...routeCoordinates
      ];

      try {
        mapRef.current.fitToCoordinates(coordsToFit, {
          edgePadding: { top: 80, right: 60, bottom: bottomPadding, left: 60 },
          animated: true,
        });
      } catch (e) {}
    }
  }, [currentLocation, pickupLocation, destinationLocation, routeCoordinates, mapRef, isDrawerExpanded]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🔵 1. Passenger / User Current Device GPS Marker (Cyan/Blue Dot) */}
      {currentLocation && currentLocation.latitude && (
        <Marker coordinate={currentLocation} title="Your Location" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.userMarkerHalo}>
            <View style={styles.userMarkerDot} />
          </View>
        </Marker>
      )}

      {/* 🟢 2. Pickup Hub Marker (Emerald Green Ride-App Dot) */}
      {pickupLocation && pickupLocation.latitude && pickupLocation.longitude && (
        <Marker 
          coordinate={{ latitude: Number(pickupLocation.latitude), longitude: Number(pickupLocation.longitude) }} 
          title={pickupLocation.title || "Pickup Hub"} 
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.glowingEmeraldOuterHalo}>
            <View style={styles.glowingEmeraldBadge} />
          </View>
        </Marker>
      )}

      {/* 🔵 3. Destination Hub Marker (Royal Blue Ride-App Dot) */}
      {destinationLocation && destinationLocation.latitude && destinationLocation.longitude && (
        <Marker 
          coordinate={{ latitude: Number(destinationLocation.latitude), longitude: Number(destinationLocation.longitude) }} 
          title={destinationLocation.title || "Destination Hub"} 
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.glowingDestinationOuterHalo}>
            <View style={styles.glowingDestinationBadge} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Real Street-Level Polyline Route Path (Pickup to Destination) */}
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#059669"
          strokeWidth={5}
          geodesic={true}
        />
      )}
    </MapView>
  );
});

export default function LiveTrackingScreen({ route, navigation }) {
  const { user } = useAuth();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);
  const rideOfferId = route?.params?.rideOfferId || 0;

  // 🎵 Placed correctly inside the component function scope
  const arrivedSoundPlayedRef = useRef(false);

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [myStatus, setMyStatus] = useState("accepted");
  const [driverState, setDriverState] = useState("accepted");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [vehicleInfo, setVehicleInfo] = useState("Corridor Shuttle");
  const [coRiders, setCoRiders] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  
  const [pickupLocation, setPickupLocation] = useState({ latitude: null, longitude: null, title: "Pickup Hub" });
  const [destinationLocation, setDestinationLocation] = useState({ latitude: null, longitude: null, title: "Destination Hub" });
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  const [pickupHubName, setPickupHubName] = useState("Fetching Pickup Hub...");
  const [dropoffHubName, setDropoffHubName] = useState("Fetching Destination...");

  const mapRef = useRef(null);

  // 1. DISABLE ANDROID BACK BUTTON DURING ACTIVE HUB PRESENCE / TRACKING
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  const navigateToDeparture = useCallback(() => {
    navigation.replace("TripDeparture", { rideOfferId, userId: currentUserId });
  }, [navigation, rideOfferId, currentUserId]);

  // Fetch initial GPS location
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (loc && isMounted) {
            setCurrentLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            });
          }
        }
      } catch (err) {
        console.log("📍 Location skip:", err.message);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // 2. FETCH PRECISE AUTHORITATIVE PICKUP & DESTINATION COORDINATES FROM MAP_COORDINATES
  useEffect(() => {
    let isMounted = true;
    async function fetchMapCoordinatesEndpoint() {
      if (!rideOfferId) return;
      try {
        const res = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
        const data = await res.json();
        if (data.success && data.coordinates && isMounted) {
          const coords = data.coordinates;
          const startLat = parseFloat(coords.start_latitude);
          const startLng = parseFloat(coords.start_longitude);
          const endLat = parseFloat(coords.end_latitude);
          const endLng = parseFloat(coords.end_longitude);

          if (startLat && startLng) {
            setPickupLocation({
              latitude: startLat,
              longitude: startLng,
              title: coords.start_hub_name || "Pickup Hub"
            });
          }

          if (endLat && endLng) {
            setDestinationLocation({
              latitude: endLat,
              longitude: endLng,
              title: coords.end_hub_name || "Destination Hub"
            });
          }

          if (coords.start_hub_name) setPickupHubName(coords.start_hub_name);
          if (coords.end_hub_name) setDropoffHubName(coords.end_hub_name);
        }
      } catch (err) {
        console.log("⚠️ Error fetching map_coordinates endpoint:", err);
      }
    }

    fetchMapCoordinatesEndpoint();
    return () => { isMounted = false; };
  }, [rideOfferId]);

  // 3. GENERATE STREET-LEVEL ROUTE POLYLINE FROM PICKUP HUB TO DESTINATION HUB
  useEffect(() => {
    let isMounted = true;
    async function updateStreetRoute() {
      if (pickupLocation.latitude && destinationLocation.latitude) {
        const routePoints = await fetchDrivingRoute(pickupLocation, destinationLocation);
        if (isMounted && routePoints.length > 0) {
          setRouteCoordinates(routePoints);
        }
      }
    }
    updateStreetRoute();
    return () => { isMounted = false; };
  }, [pickupLocation, destinationLocation]);

  // Poll presence status (Driver state & co-riders) + Sound 5 trigger on arrival transition
  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function fetchHubPresenceStatus() {
      if (!isSubscribed || !currentUserId || !rideOfferId) return;

      try {
        const res = await fetch(`${API_URL}/api/rides/presence-status/${rideOfferId}/${currentUserId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (isSubscribed && data.success) {
          if (data.pickup_hub) setPickupHubName(data.pickup_hub);
          if (data.dropoff_hub) setDropoffHubName(data.dropoff_hub);
          if (data.driverName) setDriverName(data.driverName);
          if (data.vehicleInfo) setVehicleInfo(data.vehicleInfo);
          if (data.driver_status) setDriverState(data.driver_status.toLowerCase());

          const passengers = data.passengers || [];
          const myRow = passengers.find(
            (p) => parseInt(p.user_id || p.userId || p.id, 10) === currentUserId
          );

          const rawMyStatus = myRow?.status?.toLowerCase() || "accepted";
          
          if (rawMyStatus === "in_trip" || data.driver_status?.toLowerCase() === "in_trip") {
            navigateToDeparture();
            return;
          }

          // 🎵 TRIGGER SOUND "5" THE MOMENT STATUS CHANGES TO ARRIVED
          if (rawMyStatus === "arrived" && !arrivedSoundPlayedRef.current) {
            arrivedSoundPlayedRef.current = true;
            playSound("5");
          }

          setMyStatus(rawMyStatus);

          const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
          const parsedCoRiders = passengers
            .filter((p) => parseInt(p.user_id || p.userId || p.id, 10) !== currentUserId)
            .map((p, idx) => ({
              id: parseInt(p.user_id || p.userId || p.id, 10),
              name: p.full_name || `Rider ${p.user_id || p.userId || p.id}`,
              status: (p.status || "accepted").toUpperCase(),
              color: colorPalette[idx % colorPalette.length],
            }));

          setCoRiders(parsedCoRiders);
        }
      } catch (err) {
        // Suppress background poll errors
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(fetchHubPresenceStatus, 3500);
        }
      }
    }

    fetchHubPresenceStatus();
    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [currentUserId, rideOfferId, navigateToDeparture]);

  const handleSignalArrival = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/rides/signal-arrival`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId, ride_offer_id: rideOfferId }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Arrival Error", data.error || "Could not update arrival status.");
        return;
      }

      setMyStatus("arrived");
      playSound("5");  
      if (data.passengers && Array.isArray(data.passengers)) {
        const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
        const instantCoRiders = data.passengers
          .filter((p) => parseInt(p.userId || p.user_id, 10) !== currentUserId)
          .map((p, idx) => ({
            id: parseInt(p.userId || p.user_id, 10),
            name: p.full_name || `Rider ${p.userId || p.user_id}`,
            status: (p.status || "arrived").toUpperCase(),
            color: colorPalette[idx % colorPalette.length],
          }));
        setCoRiders(instantCoRiders);
      }
    } catch (err) {
      Alert.alert("Network Error", "Failed to reach server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isArrived = myStatus === "arrived" || myStatus === "completed";

  return (
    <SafeAreaView style={styles.container}>
      {/* MAP SECTION */}
      <View style={styles.mapContainer}>
        <TrackingMap 
          currentLocation={currentLocation} 
          pickupLocation={pickupLocation}
          destinationLocation={destinationLocation}
          routeCoordinates={routeCoordinates}
          mapRef={mapRef} 
          isDrawerExpanded={isDrawerExpanded}
        />
      </View>

      {/* COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        
        {/* Toggle Handle Header */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Hub Presence & Matching</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                To <Text style={styles.boldText}>{pickupHubName}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, isArrived ? styles.badgeArrived : styles.badgeAccepted]}>
                <Text style={styles.badgeText}>{myStatus.toUpperCase()}</Text>
              </View>
              <View style={styles.expandToggleBadge}>
                <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
                <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Scrollable Content */}
        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          {/* Route Corridor Details */}
          <View style={styles.routeCard}>
            <View style={styles.routeItem}>
              <Ionicons name="location-sharp" size={18} color="#059669" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>PICKUP HUB</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{pickupHubName}</Text>
              </View>
            </View>

            <View style={styles.routeDivider} />

            <View style={styles.routeItem}>
              <Ionicons name="flag-sharp" size={18} color="#3B82F6" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>DESTINATION</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{dropoffHubName}</Text>
              </View>
            </View>
          </View>

          {/* Driver Card */}
          <View style={styles.driverCard}>
            <Ionicons name="car" size={22} color="#2F4F4F" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.driverLabel}>{driverName} • {vehicleInfo}</Text>
              <Text style={styles.driverSub}>Driver Status: <Text style={styles.boldText}>{driverState.toUpperCase()}</Text></Text>
            </View>
          </View>

          {/* Co-Riders Matrix */}
          <View style={styles.rosterContainer}>
            <Text style={styles.sectionHeader}>Co-Riders Presence Matrix</Text>
            
            <View style={styles.riderRow}>
              <View style={[styles.avatar, { backgroundColor: "#2F4F4F" }]}>
                <Text style={styles.avatarText}>YOU</Text>
              </View>
              <Text style={styles.riderName}>{user?.full_name || `You (User ${currentUserId})`}</Text>
              <Text style={[styles.statusTag, isArrived ? styles.tagArrived : styles.tagAccepted]}>
                {myStatus.toUpperCase()}
              </Text>
            </View>

            {coRiders.map((rider) => (
              <View key={rider.id} style={styles.riderRow}>
                <View style={[styles.avatar, { backgroundColor: rider.color }]}>
                  <Text style={styles.avatarText}>{rider.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.riderName}>{rider.name}</Text>
                <Text style={[
                  styles.statusTag, 
                  rider.status === "ARRIVED" ? styles.tagArrived :
                  (rider.status === "ACCEPTED" || rider.status === "MATCHED") ? styles.tagAccepted :
                  styles.tagPending
                ]}>
                  {rider.status}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Action Button */}
        {isDrawerExpanded && (
          <TouchableOpacity
            style={[styles.actionButton, (isArrived || isSubmitting) && styles.actionButtonDisabled]}
            disabled={isArrived || isSubmitting}
            onPress={handleSignalArrival}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.actionButtonText}>
                {isArrived ? "Awaiting Co-Riders & Driver Dispatch" : "I've Arrived at Hub"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  mapContainer: { flex: 1 },
  userMarkerHalo: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(14, 165, 233, 0.2)", justifyContent: "center", alignItems: "center" },
  userMarkerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#0EA5E9", borderWidth: 2, borderColor: "#FFFFFF" },
  glowingEmeraldOuterHalo: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(5, 150, 105, 0.2)", justifyContent: "center", alignItems: "center" },
  glowingEmeraldBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#059669", borderWidth: 2, borderColor: "#FFFFFF" },
  glowingDestinationOuterHalo: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(59, 130, 246, 0.2)", justifyContent: "center", alignItems: "center" },
  glowingDestinationBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#3B82F6", borderWidth: 2, borderColor: "#FFFFFF" },
  slidingPanelDrawer: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 15 },
  drawerExpanded: { height: height * 0.52 },
  drawerCollapsed: { height: 110 },
  dragHandleContainer: { width: "100%", paddingVertical: 6, alignItems: "center" },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%", paddingBottom: 4 },
  previewLeftCluster: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: "700", color: "#1E293B" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#0F172A" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeAccepted: { backgroundColor: "#E0F2FE" },
  badgeArrived: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#0369A1" },
  expandToggleBadge: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  expandToggleText: { fontSize: 11, color: "#64748B", marginRight: 2 },
  drawerScrollBody: { marginTop: 8 },
  routeCard: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8, marginLeft: 26 },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#64748B", letterSpacing: 0.5 },
  routeValue: { fontSize: 13, fontWeight: "600", color: "#1E293B", marginTop: 1 },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 12, padding: 12, marginBottom: 12 },
  driverLabel: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  driverSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  rosterContainer: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
  sectionHeader: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8 },
  riderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 10 },
  avatarText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  riderName: { flex: 1, fontSize: 12, fontWeight: "600", color: "#1E293B" },
  statusTag: { fontSize: 10, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagAccepted: { backgroundColor: "#E0F2FE", color: "#0369A1" },
  tagArrived: { backgroundColor: "#ECFDF5", color: "#059669" },
  tagPending: { backgroundColor: "#FEF3C7", color: "#D97706" },
  actionButton: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 6, marginBottom: 10 },
  actionButtonDisabled: { backgroundColor: "#9CA3AF" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" }
});