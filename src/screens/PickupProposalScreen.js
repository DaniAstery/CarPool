import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from '../AuthContext'; 

const API_URL = "http://192.168.1.3:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW
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
        <Marker coordinate={currentLocation} title="Your Location" description="GPS Position">
          <View style={styles.userMarker}>
            <Ionicons name="person" size={16} color="#FFF" />
          </View>
        </Marker>
      )}

      {meetupLocation && meetupLocation.latitude && (
        <Marker 
          coordinate={{ latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }} 
          title={meetupLocation.name || "Pickup Hub"} 
          description="Corridor Meeting Point"
        >
          <View style={styles.pickupMarker}>
            <MaterialCommunityIcons name="map-marker-radius" size={22} color="#FFF" />
          </View>
        </Marker>
      )}

      {currentLocation && meetupLocation && meetupLocation.latitude && (
        <Polyline
          coordinates={[
            currentLocation, 
            { latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }
          ]}
          strokeColor="#2F4F4F"
          strokeWidth={4}
          lineDashPattern={[6, 6]}
        />
      )}
    </MapView>
  );
});

export default function PickupProposalScreen({ navigation }) {
  const { user } = useAuth();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);

  const [userAccepted, setUserAccepted] = useState(false);
  const [myDbStatus, setMyDbStatus] = useState("searching");
  const [coRiders, setCoRiders] = useState([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [driverState, setDriverState] = useState("pending");
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  
  // 🎯 Dynamic Meetup Hub State
  const [meetupHub, setMeetupHub] = useState({
    name: "Resolving Hub...",
    latitude: DEFAULT_LOCATION.latitude,
    longitude: DEFAULT_LOCATION.longitude
  });

  const mapRef = useRef(null);

  // 🚨 PASS RIDE OFFER ID TO LIVETRACKING
  const navigateToTracking = useCallback((rideOfferId) => {
    navigation.replace("LiveTracking", { rideOfferId });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
          }
        }
      } catch (err) {
        console.log("📍 Location resolution non-fatal skip:", err.message);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function checkProposalStatus() {
      if (!isSubscribed || !currentUserId) return;

      try {
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${API_URL}/api/rides/proposal-manifest/${currentUserId}`, {
          signal: controller.signal,
        });
        clearTimeout(abortTimeout);

        if (res.status === 404 || !res.ok) {
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.replace("Home");
          return;
        }

        if (isSubscribed) {
          const data = await res.json();
          const passengers = data.passengers || [];

          // Hub provided by backend
          if (data.hub && data.hub.latitude) {
            setMeetupHub(data.hub);
          }

          const normalizedAcceptedIds = (data.accepted_passengers || []).map(id => parseInt(id, 10));
          const isUserAcceptedInOffer = normalizedAcceptedIds.includes(currentUserId);
          
          const myRow = passengers.find(p => parseInt(p.user_id, 10) === currentUserId);
          const myRoutePoolStatus = myRow ? (myRow.status || "searching").toLowerCase().trim() : "searching";
          const rawMyStatus = (userAccepted || isUserAcceptedInOffer) ? "accepted" : myRoutePoolStatus;

          setMyDbStatus(rawMyStatus);
          if (rawMyStatus === "accepted") setUserAccepted(true);

          const currentDriverStatus = (data.driver_status || "pending").toLowerCase().trim();
          setDriverState(currentDriverStatus);

          // 🚨 AUTOMATIC NAVIGATION TRIGGER WHEN DRIVER ACCEPTS
          const activeRideOfferId = data.ride_offer_id || data.rideOfferId || data.matched_ride_offer_id || data.id;
          if (currentDriverStatus === "accepted" && activeRideOfferId) {
            navigateToTracking(activeRideOfferId);
            return; // Exit early & stop polling
          }

          if (Array.isArray(passengers)) {
            const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
            const parsedCoRiders = passengers
              .filter(p => parseInt(p.user_id, 10) !== currentUserId)
              .map((p, idx) => {
                const pId = parseInt(p.user_id, 10);
                const isCoRiderAccepted = normalizedAcceptedIds.includes(pId);
                const pRoutePoolStatus = (p.status || "searching").toLowerCase().trim();
                const riderEffectiveStatus = isCoRiderAccepted ? "accepted" : pRoutePoolStatus;

                return {
                  id: pId,
                  name: `Rider ${pId}`,
                  status: riderEffectiveStatus.toUpperCase(),
                  color: colorPalette[idx % colorPalette.length],
                };
              });
            setCoRiders(parsedCoRiders);
          }
        }
      } catch (err) {
        // Suppress transient network drops
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
  }, [currentUserId, navigateToTracking, navigation, userAccepted]);

      useEffect(() => {
          console.log("🔍 [PickupProposal Mount] Raw Auth user object:", user);
          console.log("🎯 [PickupProposal Mount] Resolved currentUserId:", currentUserId);
        }, [user, currentUserId]);


  const handleAcceptProposal = async () => {
    setUserAccepted(true);
    setMyDbStatus("accepted");

    try {
      const response = await fetch(`${API_URL}/api/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });

      if (response.ok) {
        const data = await response.json();
        // If driver already accepted, trigger navigation immediately with returned ride_offer_id
        if (data.ride_offer_id && driverState === "accepted") {
          navigateToTracking(data.ride_offer_id);
        }
      } else {
        console.warn("⚠️ Server rejected proposal acceptance.");
        // Rollback state if proposal acceptance fails
        setUserAccepted(false);
        setMyDbStatus("searching");
      }
    } catch (err) {
      console.error("❌ Network error during proposal acceptance:", err.message);
      setUserAccepted(false);
      setMyDbStatus("searching");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        {initialCheckDone ? (
          <MemoizedMap currentLocation={currentLocation} meetupLocation={meetupHub} mapRef={mapRef} />
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
          Meetup at <Text style={styles.boldText}>{meetupHub.name}</Text>
        </Text>

        <View style={styles.rosterContainer}>
          <Text style={styles.sectionHeader}>Matching Corridor Pool</Text>
          
          <View style={styles.riderRow}>
            <View style={[styles.avatar, { backgroundColor: "#2F4F4F" }]}>
              <Text style={styles.avatarText}>YOU</Text>
            </View>
            <Text style={styles.riderName}>You (User {currentUserId})</Text>
            <Text style={[
              styles.statusTag, 
              myDbStatus === "accepted" ? styles.statusAccepted : 
              (myDbStatus === "matched" || myDbStatus === "searching") ? styles.statusMatched : 
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
                (rider.status === "MATCHED" || rider.status === "SEARCHING") ? styles.statusMatched : 
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
            {userAccepted ? "Waiting for driver..." : "Accept Pickup Spot"}
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
  userMarker: { backgroundColor: "#10B981", padding: 8, borderRadius: 20, borderWidth: 2, borderColor: "#FFF", elevation: 4 },
  pickupMarker: { backgroundColor: "#2F4F4F", padding: 8, borderRadius: 20, elevation: 4 },
  panel: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, elevation: 8 },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 14, color: "#666", marginTop: 4, marginBottom: 16 },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  timerBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF3E0", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  timerText: { fontSize: 13, fontWeight: "700", color: "#E28743", marginLeft: 4 },
  rosterContainer: { marginVertical: 10 },
  sectionHeader: { fontSize: 12, fontWeight: "600", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  riderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  riderName: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: "500", color: "#333" },
  statusTag: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  statusAccepted: { backgroundColor: "#E8F5E9", color: "#2E7D32" },
  statusMatched: { backgroundColor: "#E3F2FD", color: "#1565C0" },
  statusPending: { backgroundColor: "#FFF8E1", color: "#F57F17" },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4F4", padding: 12, borderRadius: 12, marginVertical: 12 },
  driverText: { marginLeft: 10, fontSize: 14, color: "#444" },
  actionButton: { backgroundColor: "#2F4F4F", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 8 },
  actionButtonDisabled: { backgroundColor: "#A0B2B2" },
  actionButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});