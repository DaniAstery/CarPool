import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";

const API_URL = "http://192.168.1.3:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const TrackingMap = memo(({ currentLocation, meetupLocation, mapRef }) => {
  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_DEFAULT}
      initialRegion={currentLocation || DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
    >
      {currentLocation && (
        <Marker coordinate={currentLocation} title="Your GPS Location">
          <View style={styles.userMarker}>
            <Ionicons name="navigate" size={16} color="#FFF" />
          </View>
        </Marker>
      )}

      {meetupLocation && (
        <Marker coordinate={meetupLocation} title="Pickup Hub Station">
          <View style={styles.pickupMarker}>
            <MaterialCommunityIcons name="bus-stop" size={22} color="#FFF" />
          </View>
        </Marker>
      )}

      {currentLocation && meetupLocation && (
        <Polyline
          coordinates={[currentLocation, meetupLocation]}
          strokeColor="#10B981"
          strokeWidth={4}
        />
      )}
    </MapView>
  );
});

export default function LiveTrackingScreen({ route, navigation }) {
  const { user } = useAuth();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);
  const rideOfferId = route?.params?.rideOfferId || 0;

  const [myStatus, setMyStatus] = useState("accepted");
  const [driverState, setDriverState] = useState("accepted");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [vehicleInfo, setVehicleInfo] = useState("Corridor Shuttle");
  const [coRiders, setCoRiders] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [meetupLocation, setMeetupLocation] = useState(DEFAULT_LOCATION);

  const [pickupHubName, setPickupHubName] = useState("Fetching Pickup Hub...");
  const [dropoffHubName, setDropoffHubName] = useState("Fetching Destination...");

  const mapRef = useRef(null);

  const navigateToDeparture = useCallback(() => {
    navigation.replace("TripDeparture", { rideOfferId, userId: currentUserId });
  }, [navigation, rideOfferId, currentUserId]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCurrentLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          });
        }
      } catch (err) {
        console.log("📍 Location skip:", err.message);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function fetchHubPresenceStatus() {
      if (!isSubscribed || !currentUserId || !rideOfferId) return;

      try {
        // Dedicated lightweight status endpoint for pre-departure presence tracking
        const res = await fetch(`${API_URL}/api/rides/presence-status/${rideOfferId}/${currentUserId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (isSubscribed && data.success) {
          if (data.pickup_hub) setPickupHubName(data.pickup_hub);
          if (data.dropoff_hub) setDropoffHubName(data.dropoff_hub);
          if (data.driverName) setDriverName(data.driverName);
          if (data.vehicleInfo) setVehicleInfo(data.vehicleInfo);
          if (data.driver_status) setDriverState(data.driver_status.toLowerCase());

          if (data.pickup_lat && data.pickup_lng) {
            setMeetupLocation({
              latitude: parseFloat(data.pickup_lat),
              longitude: parseFloat(data.pickup_lng),
            });
          }

          const passengers = data.passengers || [];
          const myRow = passengers.find(
            (p) => parseInt(p.user_id || p.userId || p.id, 10) === currentUserId
          );

          const rawMyStatus = myRow?.status?.toLowerCase() || "accepted";
          
          // Auto-transition to TripDeparture when driver starts the trip
          if (rawMyStatus === "in_trip" || data.driver_status?.toLowerCase() === "in_trip") {
            navigateToDeparture();
            return;
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
        // Suppress background polling drops
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
      <View style={styles.mapContainer}>
        <TrackingMap currentLocation={currentLocation} meetupLocation={meetupLocation} mapRef={mapRef} />
      </View>

      <View style={styles.panel}>
        <View style={styles.dragHandle} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>Hub Presence & Matching</Text>
          <View style={[styles.statusBadge, isArrived ? styles.badgeArrived : styles.badgeAccepted]}>
            <Text style={styles.badgeText}>{myStatus.toUpperCase()}</Text>
          </View>
        </View>

        {/* Route Corridor Details */}
        <View style={styles.routeCard}>
          <View style={styles.routeItem}>
            <Ionicons name="location-sharp" size={18} color="#10B981" />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={styles.routeLabel}>PICKUP HUB</Text>
              <Text style={styles.routeValue} numberOfLines={1}>{pickupHubName}</Text>
            </View>
          </View>

          <View style={styles.routeDivider} />

          <View style={styles.routeItem}>
            <Ionicons name="flag-sharp" size={18} color="#E28743" />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={styles.routeLabel}>DESTINATION</Text>
              <Text style={styles.routeValue} numberOfLines={1}>{dropoffHubName}</Text>
            </View>
          </View>
        </View>

        {/* Driver Card */}
        <View style={styles.driverCard}>
          <Ionicons name="car" size={22} color="#2F4F4F" />
          <View style={{ marginLeft: 10 }}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  mapContainer: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  userMarker: { backgroundColor: "#10B981", padding: 8, borderRadius: 20, borderWidth: 2, borderColor: "#FFF", elevation: 4 },
  pickupMarker: { backgroundColor: "#2F4F4F", padding: 8, borderRadius: 20, elevation: 4 },
  panel: { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, elevation: 8 },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 20, fontWeight: "700", color: "#1A1A1A" },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeAccepted: { backgroundColor: "#E3F2FD" },
  badgeArrived: { backgroundColor: "#E8F5E9" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#2F4F4F" },
  routeCard: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, marginVertical: 12, borderWidth: 1, borderColor: "#EAEAEA" },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#888", letterSpacing: 0.5 },
  routeValue: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 1 },
  routeDivider: { height: 1, backgroundColor: "#EAEAEA", marginVertical: 8 },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4F4", padding: 12, borderRadius: 12, marginBottom: 10 },
  driverLabel: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  driverSub: { fontSize: 12, color: "#666" },
  rosterContainer: { marginVertical: 6 },
  sectionHeader: { fontSize: 12, fontWeight: "600", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  riderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  riderName: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: "500", color: "#333" },
  statusTag: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  tagAccepted: { backgroundColor: "#E3F2FD", color: "#1565C0" },
  tagArrived: { backgroundColor: "#E8F5E9", color: "#2E7D32" },
  tagPending: { backgroundColor: "#FFF8E1", color: "#F57F17" },
  actionButton: { backgroundColor: "#2F4F4F", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10 },
  actionButtonDisabled: { backgroundColor: "#A0B2B2" },
  actionButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});