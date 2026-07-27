import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const API_URL = "http://192.168.63.52:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

const MEETUP_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW: Displays both Device Location & Pickup Hub
// ------------------------------------------------------------------
const MemoizedMap = memo(({ currentLocation, meetupLocation, mapRef }) => {
  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={currentLocation || DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {currentLocation && (
        <Marker coordinate={currentLocation} title="Your Device Location" description="Current GPS position">
          <View style={styles.userMarker}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
        </Marker>
      )}

      <Marker coordinate={meetupLocation} title="Pickup Hub" description="Corridor meeting point">
        <View style={styles.pickupMarker}>
          <MaterialCommunityIcons name="map-marker-radius" size={22} color="#FFF" />
        </View>
      </Marker>

      {currentLocation && (
        <Polyline
          coordinates={[currentLocation, meetupLocation]}
          strokeColor="#2F4F4F"
          strokeWidth={4}
          lineDashPattern={[6, 6]}
        />
      )}
    </MapView>
  );
});

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  const [myDbStatus, setMyDbStatus] = useState("matched");
  const [coRiders, setCoRiders] = useState([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [driverState, setDriverState] = useState("pending");
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const mapRef = useRef(null);

  const currentUserId = parseInt(
    route?.params?.userId || 
    route?.params?.user_id || 
    route?.params?.id || "12",
    10
  );

  const routeId = route?.params?.routeId || route?.params?.route_id || "4";
  const initialRideOfferId =
    route?.params?.rideOfferId ||
    route?.params?.ride_offer_id ||
    route?.params?.ride_id ||
    route?.params?.id ||
    "1";

  const activeRideOfferIdRef = useRef(initialRideOfferId);

  const navigateToTracking = useCallback(() => {
    navigation.replace("LiveTracking", {
      id: activeRideOfferIdRef.current || 1,
      rideOfferId: activeRideOfferIdRef.current || 1,
      ride_offer_id: activeRideOfferIdRef.current || 1,
      routeId,
      route_id: routeId,
      userId: currentUserId,
      user_id: currentUserId,
      initialUserArrived: true,
    });
  }, [navigation, routeId, currentUserId]);

  // GPS Resolution
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const locationPromise = Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
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
        console.log("📍 Location resolution non-fatal skip:", err.message);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Countdown Timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Status Polling from Dedicated Endpoint
  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function checkProposalStatus() {
      if (!isSubscribed) return;

      try {
        if (!isNaN(currentUserId)) {
          const controller = new AbortController();
          const abortTimeout = setTimeout(() => controller.abort(), 2500);

          const res = await fetch(`${API_URL}/api/rides/pool-status/${currentUserId}`, {
            signal: controller.signal,
          });
          clearTimeout(abortTimeout);

          if (res.ok && isSubscribed) {
            const data = await res.json();

            if (data.ride_offer_id || data.id) {
              activeRideOfferIdRef.current = data.ride_offer_id || data.id;
            }

            const passengers = data.passengers || [];
            const myRow = passengers.find(
              (p) => parseInt(p.userId || p.user_id || p.id, 10) === currentUserId
            );
            
            const rawMyStatus = (myRow?.status || data.status || "matched").toLowerCase();
            setMyDbStatus(rawMyStatus);

            if (["accepted", "confirmed"].includes(rawMyStatus)) {
              setUserAccepted(true);
            }

            const poolStatus = (data.pool_status || data.pool?.status || "").toLowerCase();
            const driverStatus = (data.driver_status || "").toLowerCase();
            const generalStatus = (data.status || "").toLowerCase();

            const isThresholdMet =
              ["arrived", "in_trip", "departed", "completed"].includes(rawMyStatus) ||
              (driverStatus === "accepted" && ["ready", "matched", "accepted", "dispatched", "confirmed"].includes(poolStatus));

            if (isThresholdMet) {
              navigateToTracking();
              return;
            }

            if (data.driver_status) setDriverState(data.driver_status);

            if (Array.isArray(passengers)) {
              const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
              const parsedCoRiders = passengers
                .filter((p) => parseInt(p.userId || p.user_id || p.id, 10) !== currentUserId)
                .map((p, idx) => {
                  const riderRawStatus = (p.status || "matched").toLowerCase();
                  let displayStatus = "MATCHED";
                  if (riderRawStatus === "accepted" || riderRawStatus === "confirmed") displayStatus = "ACCEPTED";
                  else if (riderRawStatus === "pending") displayStatus = "PENDING";
                  else if (riderRawStatus === "matched") displayStatus = "MATCHED";
                  else displayStatus = riderRawStatus.toUpperCase();

                  return {
                    id: p.userId || p.user_id || p.id,
                    name: `Rider ${p.userId || p.user_id || p.id}`,
                    status: displayStatus,
                    color: colorPalette[idx % colorPalette.length],
                  };
                });
              setCoRiders(parsedCoRiders);
            }
          }
        }
      } catch (err) {
        // Suppress temporary network drops
      } finally {
        if (isSubscribed) {
          setInitialCheckDone(true);
          timerId = setTimeout(checkProposalStatus, 3000);
        }
      }
    }

    checkProposalStatus();

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [currentUserId, navigateToTracking]);

  const handleAcceptProposal = async () => {
    setUserAccepted(true);
    setMyDbStatus("accepted");

    try {
      const resolvedRideId = 
        activeRideOfferIdRef.current || 
        route?.params?.rideOfferId || 
        route?.params?.ride_offer_id || 
        1;

      const payload = {
        userId: currentUserId,
        user_id: currentUserId,
        rideOfferId: resolvedRideId,
        ride_offer_id: resolvedRideId,
      };

      const response = await fetch(`${API_URL}/api/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        console.warn("⚠️ Server rejected proposal acceptance:", data);
      }
    } catch (err) {
      console.error("❌ Network error during proposal acceptance:", err.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        {initialCheckDone ? (
          <MemoizedMap
            currentLocation={currentLocation}
            meetupLocation={MEETUP_LOCATION}
            mapRef={mapRef}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="small" color="#2F4F4F" />
          </View>
        )}
      </View>

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

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionHeader}>Matching Corridor Pool</Text>
          
          <View style={styles.riderRow}>
            <View style={[styles.avatar, { backgroundColor: "#2F4F4F" }]}>
              <Text style={styles.avatarText}>YOU</Text>
            </View>
            <Text style={styles.riderName}>You</Text>
            <Text style={[
              styles.statusTag, 
              myDbStatus === "accepted" ? styles.statusAccepted : 
              myDbStatus === "matched" ? styles.statusMatched : 
              styles.statusPending
            ]}>
              {myDbStatus.toUpperCase()}
            </Text>
          </View>

          {coRiders.map((rider) => (
            <View key={rider.id} style={styles.riderRow}>
              <View style={[styles.avatar, { backgroundColor: rider.color }]}>
                <Text style={styles.avatarText}>{rider.id}</Text>
              </View>
              <Text style={styles.riderName}>{rider.name}</Text>
              <Text style={[
                styles.statusTag, 
                rider.status === "ACCEPTED" ? styles.statusAccepted : 
                rider.status === "MATCHED" ? styles.statusMatched : 
                styles.statusPending
              ]}>
                {rider.status}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.driverCard}>
          <Ionicons name="car-sport" size={20} color="#2F4F4F" />
          <Text style={styles.driverText}>
            Driver Status: <Text style={styles.boldText}>{driverState.toUpperCase()}</Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.actionButton, userAccepted && styles.actionButtonDisabled]}
          disabled={userAccepted}
          onPress={handleAcceptProposal}
        >
          <Text style={styles.actionButtonText}>
            {userAccepted ? "Waiting for driver to arrive at hub..." : "Accept Pickup Spot"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  mapContainer: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  mapPlaceholder: { flex: 1, backgroundColor: "#EAEAEA", justifyContent: "center", alignItems: "center" },
  userMarker: {
    backgroundColor: "#10B981",
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
    elevation: 4,
  },
  pickupMarker: {
    backgroundColor: "#2F4F4F",
    padding: 8,
    borderRadius: 20,
    elevation: 4,
  },
  panel: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 8,
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
  title: { fontSize: 20, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 4, marginBottom: 16 },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timerText: { fontSize: 13, fontWeight: "700", color: "#E28743", marginLeft: 4 },
  rosterContainer: { marginVertical: 10 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  riderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  riderName: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: "500", color: "#333" },
  statusTag: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  statusAccepted: { backgroundColor: "#E8F5E9", color: "#2E7D32" },
  statusMatched: { backgroundColor: "#E3F2FD", color: "#1565C0" },
  statusPending: { backgroundColor: "#FFF8E1", color: "#F57F17" },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F4F4",
    padding: 12,
    borderRadius: 12,
    marginVertical: 12,
  },
  driverText: { marginLeft: 10, fontSize: 14, color: "#444" },
  actionButton: {
    backgroundColor: "#2F4F4F",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  actionButtonDisabled: { backgroundColor: "#A0B2B2" },
  actionButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});