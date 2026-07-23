import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from "react-native";
import { View as RNView } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

// Adjust your local API base URL
const API_URL = "http://192.168.112.52:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0107,
  longitude: 38.7612,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

const MEETUP_LOCATION = {
  latitude: 9.0125,
  longitude: 38.7635,
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW: Prevents map flicker & CPU drag on timer updates
// ------------------------------------------------------------------
const MemoizedMap = memo(({ currentLocation, meetupLocation, mapRef, coRiders }) => {
  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={currentLocation || DEFAULT_LOCATION}
      showsUserLocation={true}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* Pickup Station Marker */}
      <Marker coordinate={meetupLocation} title="Pickup Point">
        <View style={styles.pickupMarker}>
          <MaterialCommunityIcons name="map-marker-radius" size={24} color="#FFF" />
        </View>
      </Marker>

      {/* Polyline connect to pickup point */}
      {currentLocation && (
        <Polyline
          coordinates={[
            {
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            },
            meetupLocation,
          ]}
          strokeColor="#2F4F4F"
          strokeWidth={3}
          lineDashPattern={[5, 5]}
        />
      )}
    </MapView>
  );
});

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  const [coRiders, setCoRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45);
  const [driverState, setDriverState] = useState("pending");
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  
  const mapRef = useRef(null);

  // 1. ROBUST PARAMETER EXTRACTION
  const currentUserId = 
    route?.params?.userId || 
    route?.params?.user_id || 
    route?.params?.id 
      ? parseInt(route?.params?.userId || route?.params?.user_id || route?.params?.id, 10) 
      : 1;

  const routeId = 
    route?.params?.routeId || 
    route?.params?.route_id || 
    "1";

  const initialRideOfferId = 
    route?.params?.rideOfferId || 
    route?.params?.ride_offer_id || 
    route?.params?.ride_id || 
    route?.params?.id || 
    null;

  const activeRideOfferIdRef = useRef(initialRideOfferId);

  // 2. FAST NON-BLOCKING LOCATION INITIALIZATION
  useEffect(() => {
    let isMounted = true;

    async function initLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status === "granted" && isMounted) {
          // Promise race forces GPS to resolve within 2s or fallback immediately
          const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          const timeoutPromise = new Promise((resolve) =>
            setTimeout(() => resolve(null), 2000)
          );

          const location = await Promise.race([locationPromise, timeoutPromise]);

          if (location && isMounted) {
            const coords = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            };
            setCurrentLocation(coords);

            mapRef.current?.fitToCoordinates([coords, MEETUP_LOCATION], {
              edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
              animated: true,
            });
          }
        }
      } catch (err) {
        console.log("📍 Location fetch non-fatal skip:", err.message);
      } finally {
        // ALWAYS unblock rendering instantaneously
        if (isMounted) setLoading(false);
      }
    }

    initLocation();
    return () => { isMounted = false; };
  }, []);

  // 3. COUNTDOWN TIMER (1 Second Interval)
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // 4. NON-OVERLAPPING ASYNC POLLING LOOP
  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function checkProposalStatus() {
      if (!isSubscribed) return;

      try {
        const cleanUserId = parseInt(currentUserId, 10);
        if (!isNaN(cleanUserId)) {
          const controller = new AbortController();
          const abortTimeout = setTimeout(() => controller.abort(), 3500);

          const res = await fetch(`${API_URL}/api/rides/status/${cleanUserId}`, {
            signal: controller.signal,
          });
          clearTimeout(abortTimeout);

          if (res.ok && isSubscribed) {
            const data = await res.json();
            
            if (data.ride_offer_id || data.id) {
              activeRideOfferIdRef.current = data.ride_offer_id || data.id;
            }

            // Sync driver match state
            if (data.driver_status) {
              setDriverState(data.driver_status);
            }

            // Parse Co-Riders
            if (data.passengers && Array.isArray(data.passengers)) {
              const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
              const parsedCoRiders = data.passengers
                .filter((p) => parseInt(p.userId || p.user_id, 10) !== cleanUserId)
                .map((p, idx) => ({
                  id: p.userId || p.user_id,
                  name: `Rider ${p.userId || p.user_id}`,
                  status: (p.status || "Matched").toUpperCase(),
                  color: colorPalette[idx % colorPalette.length],
                }));

              setCoRiders(parsedCoRiders);
            }

            // Auto transition to tracking if accepted by driver and group
            if (data.driver_status === "accepted" && data.pool_status === "ready") {
              navigateToTracking();
              return;
            }
          }
        }
      } catch (err) {
        // Silently capture timeout aborts or temporary packet drops
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(checkProposalStatus, 3000);
        }
      }
    }

    checkProposalStatus();

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [currentUserId]);

  // Handle transition logic
  const navigateToTracking = useCallback(() => {
    navigation.replace("LiveTracking", {
      id: activeRideOfferIdRef.current || 1,
      rideOfferId: activeRideOfferIdRef.current || 1,
      ride_offer_id: activeRideOfferIdRef.current || 1,
      ride_id: activeRideOfferIdRef.current || 1,
      routeId,
      route_id: routeId,
      userId: currentUserId,
      user_id: currentUserId,
    });
  }, [navigation, routeId, currentUserId]);

  const handleAcceptProposal = () => {
    setUserAccepted(true);
    // OPTIONAL: POST to server
    fetch(`${API_URL}/api/rides/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: currentUserId,
        rideOfferId: activeRideOfferIdRef.current,
      }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2F4F4F" />
        <Text style={styles.loadingText}>Preparing Pickup Spot...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* MAP LAYER */}
      <View style={styles.mapContainer}>
        <MemoizedMap
          currentLocation={currentLocation}
          meetupLocation={MEETUP_LOCATION}
          mapRef={mapRef}
          coRiders={coRiders}
        />
      </View>

      {/* OVERLAY PANEL */}
      <View style={styles.panel}>
        <View style={styles.dragHandle} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>Pickup Proposal</Text>
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={16} color="#E28743" />
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          Meetup at <Text style={styles.boldText}>Bole Station Stop B</Text>
        </Text>

        {/* CO-RIDERS ROSTER */}
        <View style={styles.rosterContainer}>
          <Text style={styles.sectionHeader}>Matching Corridor Pool</Text>
          
          <View style={styles.riderRow}>
            <View style={[styles.avatar, { backgroundColor: "#2F4F4F" }]}>
              <Text style={styles.avatarText}>YOU</Text>
            </View>
            <Text style={styles.riderName}>You</Text>
            <Text style={[styles.statusTag, userAccepted ? styles.statusAccepted : styles.statusPending]}>
              {userAccepted ? "ACCEPTED" : "PENDING"}
            </Text>
          </View>

          {coRiders.map((rider) => (
            <View key={rider.id} style={styles.riderRow}>
              <View style={[styles.avatar, { backgroundColor: rider.color }]}>
                <Text style={styles.avatarText}>{rider.id}</Text>
              </View>
              <Text style={styles.riderName}>{rider.name}</Text>
              <Text style={[styles.statusTag, rider.status === "ACCEPTED" ? styles.statusAccepted : styles.statusPending]}>
                {rider.status}
              </Text>
            </View>
          ))}
        </View>

        {/* DRIVER STATUS */}
        <View style={styles.driverCard}>
          <Ionicons name="car-sport" size={20} color="#2F4F4F" />
          <Text style={styles.driverText}>
            Driver Status: <Text style={styles.boldText}>{driverState.toUpperCase()}</Text>
          </Text>
        </View>

        {/* ACTION BUTTON */}
        <TouchableOpacity
          style={[styles.actionButton, userAccepted && styles.actionButtonDisabled]}
          disabled={userAccepted}
          onPress={handleAcceptProposal}
        >
          <Text style={styles.actionButtonText}>
            {userAccepted ? "Waiting for others..." : "Accept Pickup Spot"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFF",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  pickupMarker: {
    backgroundColor: "#2F4F4F",
    padding: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  panel: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
    marginBottom: 16,
  },
  boldText: {
    fontWeight: "700",
    color: "#1A1A1A",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E28743",
    marginLeft: 4,
  },
  rosterContainer: {
    marginVertical: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  riderName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  statusTag: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusAccepted: {
    backgroundColor: "#E8F5E9",
    color: "#2E7D32",
  },
  statusPending: {
    backgroundColor: "#FFF8E1",
    color: "#F57F17",
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F4F4",
    padding: 12,
    borderRadius: 12,
    marginVertical: 12,
  },
  driverText: {
    marginLeft: 10,
    fontSize: 14,
    color: "#444",
  },
  actionButton: {
    backgroundColor: "#2F4F4F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  actionButtonDisabled: {
    backgroundColor: "#A0B2B2",
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});