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
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";

const { width, height } = Dimensions.get("window");
const API_URL = "http://192.168.1.3:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (Auto-focuses & frames User GPS + Pickup Hub)
// ------------------------------------------------------------------
const TrackingMap = memo(({ currentLocation, meetupLocation, mapRef, isDrawerExpanded }) => {
  useEffect(() => {
    if (mapRef.current && currentLocation?.latitude && meetupLocation?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      mapRef.current.fitToCoordinates(
        [
          { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          { latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }
        ],
        {
          edgePadding: { top: 70, right: 50, bottom: bottomPadding, left: 50 },
          animated: true,
        }
      );
    }
  }, [currentLocation, meetupLocation, mapRef, isDrawerExpanded]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={currentLocation || DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🔵 Your Phone's Live GPS Marker */}
      {currentLocation && (
        <Marker coordinate={currentLocation} title="Your GPS Location" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.userMarkerHalo}>
            <View style={styles.userMarkerDot} />
          </View>
        </Marker>
      )}

      {/* 🚏 Pickup Hub Station Marker */}
      {meetupLocation && meetupLocation.latitude && (
        <Marker coordinate={meetupLocation} title="Pickup Hub Station" anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
          <View style={styles.pickupMarkerContainer}>
            <View style={styles.pickupPinBubble}>
              <MaterialCommunityIcons name="bus-stop" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.pickupPinTip} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Route Path from You to Pickup Hub */}
      {currentLocation && meetupLocation && meetupLocation.latitude && (
        <Polyline
          coordinates={[
            currentLocation, 
            { latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }
          ]}
          strokeColor="#10B981"
          strokeWidth={4}
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

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [myStatus, setMyStatus] = useState("accepted");
  const [driverState, setDriverState] = useState("accepted");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [vehicleInfo, setVehicleInfo] = useState("Corridor Shuttle");
  const [coRiders, setCoRiders] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [meetupLocation, setMeetupLocation] = useState({
    latitude: null,
    longitude: null,
  });

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

  // Poll presence status & hub coordinates
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
          meetupLocation={meetupLocation} 
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
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  mapContainer: { flex: 1 },
  
  // User GPS Marker
  userMarkerHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(16, 185, 129, 0.2)", justifyContent: "center", alignItems: "center" },
  userMarkerDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#10B981", borderWidth: 2, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  
  // Pickup Hub Marker
  pickupMarkerContainer: { alignItems: "center" },
  pickupPinBubble: { backgroundColor: "#2F4F4F", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: "#FFF", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  pickupPinTip: { width: 0, height: 0, backgroundColor: "transparent", borderStyle: "solid", borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#2F4F4F", marginTop: -1 },

  // Sliding Panel Drawer
  slidingPanelDrawer: { 
    position: "absolute", 
    bottom: 0, 
    width: width, 
    backgroundColor: "#FFF", 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingTop: 8, 
    paddingHorizontal: 20, 
    elevation: 15,
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: -3 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 6,
    zIndex: 30 
  },
  drawerCollapsed: { height: 125 },
  drawerExpanded: { maxHeight: height * 0.65 },

  dragHandleContainer: { paddingBottom: 8, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  badgeAccepted: { backgroundColor: "#E3F2FD" },
  badgeArrived: { backgroundColor: "#E8F5E9" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#2F4F4F" },

  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 2 },

  drawerScrollBody: { flexGrow: 0 },
  routeCard: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: "#EAEAEA" },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#888", letterSpacing: 0.5 },
  routeValue: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 1 },
  routeDivider: { height: 1, backgroundColor: "#EAEAEA", marginVertical: 8 },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4F4", padding: 12, borderRadius: 12, marginVertical: 6 },
  driverLabel: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  driverSub: { fontSize: 12, color: "#666" },
  rosterContainer: { marginVertical: 6 },
  sectionHeader: { fontSize: 11, fontWeight: "700", color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  riderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  riderName: { flex: 1, marginLeft: 10, fontSize: 15, fontWeight: "500", color: "#333" },
  statusTag: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  tagAccepted: { backgroundColor: "#E3F2FD", color: "#1565C0" },
  tagArrived: { backgroundColor: "#E8F5E9", color: "#2E7D32" },
  tagPending: { backgroundColor: "#FFF8E1", color: "#F57F17" },
  actionButton: { backgroundColor: "#2F4F4F", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10, marginBottom: Platform.OS === 'android' ? 20 : 10 },
  actionButtonDisabled: { backgroundColor: "#A0B2B2" },
  actionButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});