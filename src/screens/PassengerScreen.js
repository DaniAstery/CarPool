import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from '../AuthContext'; 
import * as Location from 'expo-location';

const API_URL = "http://192.168.123.52:5000/api"; 
const STATIC_USER_ID = 1; 

export default function PassengerScreen({ navigation }) {
  const { user, logoutSession } = useAuth();

  // 🛡️ GATEKEEPER & CORE SYSTEM STATES
  const [checkingGatekeeper, setCheckingGatekeeper] = useState(true);
  const [isLocating, setIsLocating] = useState(true);
  const [loadingRoutes, setLoadingRoutes] = useState(false);

  // LOCATIONS & RADIAL STATE METRICS
  const [userCoords, setUserCoords] = useState(null);
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [distanceToHub, setDistanceToHub] = useState(null); // in meters
  const [routes, setRoutes] = useState([]);
  const [isSoloRide, setIsSoloRide] = useState(false); 

  /* 🚪 FIRST THING ON LOAD: STACK INTERCEPT STATUS LIFECYCLE GATEKEEPER */
  useEffect(() => {
    let isMounted = true;

    async function checkUserRoutingStatus() {
      try {
        console.log(`📡 [Gatekeeper] Fetching pure route_pool status for Passenger User: ${STATIC_USER_ID}`);
        
        // Target the dedicated passenger status layout route
        const statusRes = await fetch(`${API_URL}/passenger/status/${STATIC_USER_ID}`);
        if (!statusRes.ok) throw new Error("Macro status query rejected.");
        const statusData = await statusRes.json();

        // 🎯 EXACT STATUS-TO-SCREEN ROUTING MATRIX
        if (statusData && statusData.status !== "idle" && statusData.status !== "completed") {
          
          let targetScreen = null;

          if (statusData.status === "searching") {
            targetScreen = "MatchingScreen";
          } else if (statusData.status === "matched") {
            targetScreen = "PickupProposal";
          } else if (["accepted", "arrived"].includes(statusData.status)) {
            targetScreen = "LiveTracking";
          } else if (statusData.status === "in_trip") {
            targetScreen = "TripDeparture"; 
          }

          if (isMounted && targetScreen) {
            console.log(`🚀 [Gatekeeper Intercept] route_pool status: [${statusData.status}] -> Redirecting to: ${targetScreen}`);
            navigation.reset({
              index: 0,
              routes: [{ 
                name: targetScreen, 
                params: {
                  routeId: statusData.routeId || null,
                  rideOfferId: statusData.matched_ride_offer_id,
                  userId: STATIC_USER_ID
                } 
              }],
            });
            return; 
          }
        }
      } catch (err) {
        console.log("❌ Passenger gatekeeper stack engine failure:", err);
      }

      if (isMounted) {
        setCheckingGatekeeper(false);
      }
    }

    checkUserRoutingStatus();
    return () => { isMounted = false; };
  }, [navigation]);

  /* 📍 GEOLOCATION POOLING & DYNAMIC PROXIMITY HUB RESOLVER */
  useEffect(() => {
    let locationSubscription = null;

    async function startHubTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert("Permission Required", "We need location services active to auto-match you with nearby hubs.");
          setIsLocating(false);
          return;
        }

        // Subscribing to location changes for passive matching updates
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, 
            distanceInterval: 15, 
          },
          (location) => {
            const { latitude, longitude } = location.coords;
            setUserCoords({ latitude, longitude });
            resolveClosestHub(latitude, longitude);
          }
        );
      } catch (err) {
        console.error("❌ Geolocator startup failed:", err);
        setIsLocating(false);
      }
    }

    startHubTracking();
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const resolveClosestHub = async (lat, lng) => {
    try {
      const response = await fetch(`${API_URL}/passenger/validate-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_lat: lat, user_lng: lng }),
      });

      const validationData = await response.json();

      if (validationData && validationData.nearestHub) {
        const targetHub = validationData.nearestHub;
        setSelectedPickupHub(targetHub);
        
        if (validationData.distanceInMeters) {
          setDistanceToHub(Math.round(validationData.distanceInMeters));
        } else {
          const dist = calculateHaversine(lat, lng, parseFloat(targetHub.latitude), parseFloat(targetHub.longitude));
          setDistanceToHub(Math.round(dist * 1000));
        }

        fetchActiveCorridors(targetHub.name);
      }
    } catch (err) {
      console.log("Error querying closest hub matrix:", err);
    } finally {
      setIsLocating(false);
    }
  };

  const calculateHaversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  };

  const fetchActiveCorridors = async (hubName) => {
    setLoadingRoutes(true);
    try {
      const res = await fetch(`${API_URL}/routes/from/${encodeURIComponent(hubName)}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("Route corridor compilation lookup error:", err);
      setRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  };

  /* 🚀 JOIN POOL PIPELINE & ROUTE TRANSITION */
  /* 🚀 DIAGNOSTIC JOIN POOL PIPELINE & ROUTE TRANSITION */
  const joinPool = async (item) => {
    try {
      // 1. Diagnostics Alert to verify the touch event triggers instantly
      console.log("👉 [Touch Trigger] joinPool function invoked for item:", item);

      if (!userCoords) {
        // Fallback fallback coordinates if geolocation watch hasn't saved state yet
        console.log("⚠️ userCoords was null, applying Gerji Hub fallback coordinates for API compliance");
        setUserCoords({ latitude: 9.0022471, longitude: 38.8100596 });
      }

      const pickupHubId = selectedPickupHub ? selectedPickupHub.id : 7; // Resolves null values instantly to your active hub ID (Gerji = 7)
      const targetRouteId = parseInt(item.route_id || item.id || item._id, 10);
      
      if (!targetRouteId || isNaN(targetRouteId)) {
        Alert.alert("System Sync Error", `Could not resolve a valid corridor route sequence ID. Extracted: ${targetRouteId}`);
        return;
      }

      const payload = {
        user_lat: userCoords?.latitude || 9.0022471,
        user_lng: userCoords?.longitude || 38.8100596,
        user_id: STATIC_USER_ID,
        pickup_hub_id: pickupHubId,
        route_id: targetRouteId,
        dropoff_hub_id: null,
        booking_type: isSoloRide ? "solo" : "shared"
      };

      console.log("📡 [Network Dispatch] Sending payload to backend:", JSON.stringify(payload));

      // 2. Wrap fetch in a timeout promise to prevent silent stalls if the server drops requests
      const fetchPromise = fetch(`${API_URL}/routes/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Network Timeout")), 4000)
      );

      // Race them!
      const res = await Promise.race([fetchPromise, timeoutPromise]);

      console.log(`📥 [Server Response Received] Status Code: ${res.status}`);

      if (res.status === 403) {
        const errorData = await res.json();
        Alert.alert("Out of Pool Range", errorData.message || "Range validation failure.");
        return;
      }

      const data = await res.json();
      console.log("📥 [Backend Response Body]:", JSON.stringify(data));
      
      const isRecovered = data.alreadyActive === true;
      const targetScreen = isRecovered ? (data.navigateTo || "MatchingScreen") : "MatchingScreen";

      const navigationParams = {
        routeId: targetRouteId,
        hubId: pickupHubId,
        userId: STATIC_USER_ID, 
        poolId: data.pool?.id || data.poolId || null, 
        rideOfferId: data.matched_ride_offer_id || null,
        poolStatus: data.pool?.status || "searching",
        ride: {
          corridor: item.stops ? item.stops.join(" ➔ ") : "Gerji ➔ Megenagna",
          time: "Evaluating Corridor Options...",
          price: `ETB ${item.base_price || 150}`,
        }
      };

      console.log(`🧭 [Navigation Dispatch] Success! Switching to: ${targetScreen}`);
      navigation.navigate(targetScreen, navigationParams);

    } catch (err) {
      console.error("❌ Join Pool Exception caught:", err);
      
      // 3. Fallback Navigation Bypass if the backend drops the connection
      Alert.alert(
        "Backend Offline / Timeout",
        `Could not reach ${API_URL}/routes/join. Would you like to force navigate to MatchingScreen for UI layout testing?`,
        [
          {
            text: "Force Navigate",
            onPress: () => {
              console.log("🔀 [Bypass] Forcing navigation to MatchingScreen");
              navigation.navigate("MatchingScreen", {
                routeId: parseInt(item.route_id || item.id, 10) || 3,
                hubId: selectedPickupHub ? selectedPickupHub.id : 7,
                userId: STATIC_USER_ID,
                poolId: null,
                poolStatus: "searching",
                ride: {
                  corridor: item.stops ? item.stops.join(" ➔ ") : "Gerji ➔ Megenagna",
                  time: "Evaluating Corridor Options...",
                  price: `ETB ${item.base_price || 150}`,
                }
              });
            }
          },
          { text: "Cancel", style: "cancel" }
        ]
      );
    }
  };
  if (checkingGatekeeper) {
    return (
      <View style={styles.gatekeeperContainer}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.gatekeeperText}>Analyzing Active Pool Session...</Text>
      </View>
    );
  }

  const isOutOfRange = distanceToHub > 1000;
  const formattedDistance = distanceToHub !== null 
    ? (distanceToHub >= 1000 ? `${(distanceToHub / 1000).toFixed(1)} km` : `${distanceToHub}m`) 
    : "Locating...";

  return (
    <SafeAreaView style={styles.outerContainer}>
      
      {/* FLOATING LOGOUT UTILITY */}
      <TouchableOpacity 
        style={styles.floatingLogoutBtn} 
        onPress={() => {
          Alert.alert("Logout", `Sign out of session for ${user?.full_name || "Passenger"}?`, [
            { text: "Stay" },
            { text: "Logout", style: "destructive", onPress: () => logoutSession() }
          ]);
        }}
      >
        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
      </TouchableOpacity>

      {/* 📍 1. PROXIMITY BANNERS */}
      <View style={styles.heroHeaderZone}>
        <View style={styles.hubHeader}>
          <View style={[styles.iconCircle, { backgroundColor: isOutOfRange ? "#FEF3C7" : "#D1FAE5" }]}>
            <Ionicons 
              name="location-sharp" 
              size={26} 
              color={isOutOfRange ? "#D97706" : "#059669"} 
            />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.hubSubText}>NEAREST PICKUP ZONE</Text>
            <Text style={styles.hubTitle} numberOfLines={1}>
              {selectedPickupHub ? selectedPickupHub.name : "Detecting Hub..."}
            </Text>
          </View>
        </View>

        <View style={[styles.rangeBadgeBox, isOutOfRange ? styles.alertRangeBox : styles.optimalRangeBox]}>
          <View style={styles.rangeRow}>
            <MaterialCommunityIcons 
              name={isOutOfRange ? "walk" : "run-fast"} 
              size={18} 
              color={isOutOfRange ? "#B45309" : "#047857"} 
            />
            <Text style={[styles.rangeValueText, { color: isOutOfRange ? "#B45309" : "#047857" }]}>
              {formattedDistance} Away
            </Text>
          </View>
          <Text style={[styles.rangeHintText, { color: isOutOfRange ? "#D97706" : "#059669" }]}>
            {isOutOfRange 
              ? "Walk closer to the hub (<1km) to unlock corridor scheduling."
              : "Inside active loading range. You are clear to match!"
            }
          </Text>
        </View>
      </View>

      {/* 🚗 2. TIERS */}
      <View style={styles.toggleRowContainer}>
        <Text style={styles.toggleSectionHeading}>Match Profile</Text>
        <View style={styles.toggleButtonGroup}>
          <TouchableOpacity 
            style={[styles.archetypeButton, !isSoloRide && styles.activeArchetypeButton]}
            onPress={() => setIsSoloRide(false)}
          >
            <Ionicons name="people" size={18} color={!isSoloRide ? "#FFF" : "#4B5563"} />
            <Text style={[styles.archetypeText, !isSoloRide && styles.activeArchetypeText]}>Corridor Share</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.archetypeButton, isSoloRide && styles.activeSoloButton]}
            onPress={() => setIsSoloRide(true)}
          >
            <FontAwesome5 name="user-alt" size={14} color={isSoloRide ? "#FFF" : "#4B5563"} />
            <Text style={[styles.archetypeText, isSoloRide && styles.activeArchetypeText]}>Express Solo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🚀 3. RENDERING CARDS MATRIX */}
      <View style={{ flex: 1 }}>
        <View style={styles.listSectionHeader}>
          <Text style={styles.sectionTitle}>Available Corridors</Text>
          {loadingRoutes && <ActivityIndicator size="small" color="#059669" />}
        </View>

        {isLocating ? (
          <View style={styles.fallbackBlock}>
            <ActivityIndicator size="large" color="#059669" style={{ marginBottom: 12 }} />
            <Text style={styles.fallbackTitle}>Locating Your Nearest Hub...</Text>
            <Text style={styles.fallbackSub}>Calculating GPS satellite telemetry values.</Text>
          </View>
        ) : routes.length === 0 ? (
          <View style={styles.fallbackBlock}>
            <MaterialCommunityIcons name="transit-connection-variant" size={54} color="#D1D5DB" style={{ marginBottom: 10 }} />
            <Text style={styles.fallbackTitle}>No Open Corridors Found</Text>
            <Text style={styles.fallbackSub}>
              There are currently no active routes mapped from {selectedPickupHub?.name || "your location"}.
            </Text>
          </View>
        ) : (
          <ScrollView 
            style={styles.container} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {routes.map((route, index) => {
              const seatCount = route.filled_seats || 0;
              const maxSeats = route.capacity || 4;
              const hasActiveQueue = seatCount > 0;

              return (
                <TouchableOpacity 
                  key={route.route_id || route.id || `route-${index}`} 
                  style={[
                    styles.supremeCard,
                    isOutOfRange && styles.disabledCard
                  ]} 
                  onPress={() => joinPool(route)}
                  disabled={isOutOfRange}
                  activeOpacity={0.8}
                >
                  <View style={styles.cardHeader}>
                    <View style={styles.routePill}>
                      <Text style={styles.routeLabel}>
                        {route.stops && route.stops.length > 0 
                          ? route.stops.join(" ➔ ") 
                          : `Route #${route.id || route.route_id}`
                        }
                      </Text>
                    </View>
                    
                    <View style={[
                      styles.seatBadge, 
                      hasActiveQueue ? styles.activeSeatBadge : styles.emptySeatBadge
                    ]}>
                      <View style={[
                        styles.pulseDot, 
                        { backgroundColor: hasActiveQueue ? "#10B981" : "#9CA3AF" }
                      ]} />
                      <Text style={[
                        styles.seatText, 
                        { color: hasActiveQueue ? "#047857" : "#4B5563" }
                      ]}>
                        {seatCount}/{maxSeats} Filled
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.priceContainer}>
                      <Text style={styles.priceLabel}>ESTIMATED FARE</Text>
                      <Text style={styles.priceText}>
                        ETB {isSoloRide ? (route.base_price * 2.5) : route.base_price}
                      </Text>
                    </View>

                    <View style={styles.actionArrowZone}>
                      <Text style={[
                        styles.actionText, 
                        { color: isOutOfRange ? "#9CA3AF" : "#059669" }
                      ]}>
                        {isOutOfRange ? "Out of Range" : "Request Pool"}
                      </Text>
                      <Ionicons 
                        name="chevron-forward-circle" 
                        size={22} 
                        color={isOutOfRange ? "#D1D5DB" : "#059669"} 
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#F9FAFB" },
  gatekeeperContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  gatekeeperText: { marginTop: 12, color: "#4B5563", fontWeight: "700", fontSize: 14, letterSpacing: 0.2 },
  heroHeaderZone: { backgroundColor: "#FFFFFF", padding: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: "#111827", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 3, marginBottom: 16 },
  hubHeader: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  hubSubText: { fontSize: 10, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1 },
  hubTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginTop: 2 },
  rangeBadgeBox: { padding: 12, borderRadius: 16, borderWidth: 1 },
  optimalRangeBox: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  alertRangeBox: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  rangeRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  rangeValueText: { fontSize: 14, fontWeight: "800", marginLeft: 6 },
  rangeHintText: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  floatingLogoutBtn: { position: "absolute", top: 12, right: 16, zIndex: 10, padding: 8, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#F3F4F6" },
  toggleRowContainer: { paddingHorizontal: 20, marginBottom: 18 },
  toggleSectionHeading: { fontSize: 11, fontWeight: "800", color: "#6B7280", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  toggleButtonGroup: { flexDirection: "row", backgroundColor: "#F3F4F6", padding: 4, borderRadius: 14 },
  archetypeButton: { flex: 1, flexDirection: "row", height: 40, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  activeArchetypeButton: { backgroundColor: "#111827" },
  activeSoloButton: { backgroundColor: "#059669" },
  archetypeText: { fontSize: 13, fontWeight: "700", marginLeft: 6, color: "#4B5563" },
  activeArchetypeText: { color: "#FFFFFF" },
  listSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  container: { flex: 1, paddingHorizontal: 20 },
  supremeCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  disabledCard: { opacity: 0.65, backgroundColor: "#F3F4F6", borderColor: "#E5E7EB" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1, borderBottomColor: "#F3F4F6", paddingBottom: 12, marginBottom: 12 },
  routePill: { flex: 1, paddingRight: 8 },
  routeLabel: { fontSize: 15, fontWeight: "800", color: "#111827", lineHeight: 20 },
  seatBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  emptySeatBadge: { backgroundColor: "#F3F4F6" },
  activeSeatBadge: { backgroundColor: "#D1FAE5" },
  pulseDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  seatText: { fontSize: 11, fontWeight: "800" },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceContainer: { flexDirection: "column" },
  priceLabel: { fontSize: 9, fontWeight: "800", color: "#9CA3AF", letterSpacing: 0.5 },
  priceText: { fontSize: 18, fontWeight: "900", color: "#111827", marginTop: 1 },
  actionArrowZone: { flexDirection: "row", alignItems: "center" },
  actionText: { fontSize: 12, fontWeight: "800", marginRight: 6 },
  fallbackBlock: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60, paddingHorizontal: 40 },
  fallbackTitle: { fontSize: 16, fontWeight: "800", color: "#374151", marginTop: 8 },
  fallbackSub: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 4, lineHeight: 18 }
});