import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import PoolOfferCard from "../components/PoolOfferCard";
import { Ionicons, FontAwesome5, MaterialIcons } from "@expo/vector-icons";

const API_URL = "http://192.168.204.52:5000/api"; 
const STATIC_USER_ID = 1; 

export default function PassengerScreen({ navigation }) {
  const [checkingGatekeeper, setCheckingGatekeeper] = useState(true);

  // Dashboard state placeholders
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [isSoloRide, setIsSoloRide] = useState(false); 
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  /* 🚪 RUNS FIRST THING ON LOAD */
  useEffect(() => {
    let isMounted = true;

    async function checkUserRoutingStatus() {
      try {
        console.log(`📡 [Gatekeeper] Fetching baseline status context for User: ${STATIC_USER_ID}`);
        
        // 1. First get the user's active macro state to find their current offerId
        const statusRes = await fetch(`${API_URL}/routes/status/${STATIC_USER_ID}`);
        if (!statusRes.ok) throw new Error("Macro status query failed.");
        const statusData = await statusRes.json();

        // 2. If an active tracking context is found, sync with the passenger-track pipeline layer
        if (statusData && statusData.status !== "idle" && statusData.matched_ride_offer_id) {
          const offerId = statusData.matched_ride_offer_id;
          
          console.log(`📡 [Gatekeeper] Routing through track pipeline: /rides/passenger-track/${offerId}/user/${STATIC_USER_ID}`);
          const trackRes = await fetch(`${API_URL}/rides/passenger-track/${offerId}/user/${STATIC_USER_ID}`);
          
          if (trackRes.ok) {
            const trackData = await trackRes.json();
            
            // Determine targeted viewport profile based on specific passenger pool status
            let targetScreen = "MatchingScreen";
            if (["accepted", "arrived"].includes(trackData.passengerSelfStatus)) {
              targetScreen = "LiveTrackingScreen";
            } else if (["in_trip", "completed"].includes(trackData.passengerSelfStatus)) {
              targetScreen = "TripDeparture";
            }

            if (isMounted) {
              console.log(`🚀 [Success] Intercepted state [${trackData.passengerSelfStatus}] -> Redirecting to ${targetScreen}`);
              navigation.reset({
                index: 0,
                routes: [{ 
                  name: targetScreen, 
                  params: {
                    routeId: trackData.routeId || statusData.routeId,
                    rideOfferId: offerId,
                    userId: STATIC_USER_ID
                  } 
                }],
              });
              return; // Halt drop-down execution completely
            }
          }
        }
      } catch (err) {
        console.log("❌ Gatekeeper runtime tracing error:", err);
      }

      // 🟢 Clear to render workspace if user status context evaluates to 'idle'
      if (isMounted) {
        setCheckingGatekeeper(false);
      }
    }

    checkUserRoutingStatus();
    return () => { isMounted = false; };
  }, [navigation]);

  /* ---------------- HUB WORKSPACE FUNCTIONS ---------------- */
  const searchHubs = async (text) => {
    setSearchText(text);
    if (text.length < 2) { setHubs([]); return; }
    setLoadingHubs(true);
    try {
      const res = await fetch(`${API_URL}/hubs/search/${text}`);
      const data = await res.json();
      setHubs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log(err);
    } finally { setLoadingHubs(false); }
  };

  const selectHub = async (hub) => {
    setSelectedPickupHub(hub);
    setSearchText(hub.name);
    setHubs([]); setRoutes([]); setSelectedRoutes([]);
    setLoadingRoutes(true); setLoadingRides(true);
    try {
      const routesRes = await fetch(`${API_URL}/routes/from/${hub.name}`);
      const routesData = await routesRes.json();
      setRoutes(Array.isArray(routesData) ? routesData : []);

      if (hub.id) {
        const ridesRes = await fetch(`${API_URL}/rides?route_id=${parseInt(hub.id, 10)}`);
        const ridesData = await ridesRes.json();
        setSelectedRoutes(Array.isArray(ridesData) ? ridesData : []);
      }
    } catch (err) {
      console.log(err);
    } finally { setLoadingRoutes(false); setLoadingRides(false); }
  };

  const joinPool = async (item) => {
    try {
      const pickupHubId = selectedPickupHub ? selectedPickupHub.id : null;
      const isLiveDriverOffer = Object.prototype.hasOwnProperty.call(item, 'driver_id') || Object.prototype.hasOwnProperty.call(item, 'price_per_seat');
      
      let endpoint = isLiveDriverOffer ? `${API_URL}/rides/join-pool` : `${API_URL}/routes/join`;
      let payload = isLiveDriverOffer 
        ? { ride_id: item.id, passenger_id: STATIC_USER_ID, pickup_hub_id: pickupHubId, dropoff_hub_id: item.dropoff_hub_id || null, seats_booked: 1 }
        : { route_id: item.route_id || item.id, user_id: STATIC_USER_ID, pickup_hub_id: pickupHubId, dropoff_hub_id: null, booking_type: isSoloRide ? "solo" : "shared" };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) return;
      const data = await res.json();
      
      navigation.navigate(data.navigateTo || "MatchingScreen", {
        routeId: isLiveDriverOffer ? item.route_id : (item.route_id || item.id),
        hubId: pickupHubId,
        userId: STATIC_USER_ID,
        rideOfferId: data.pool?.matched_ride_offer_id || data.pool?.id || null,
      });
    } catch (err) {
      Alert.alert("Error", "Matchmaker cluster update timeout.");
    }
  };

  // 🛡️ SHOWS ONLY SPIN WHEEL UNTIL STATUS VERIFICATION COMPLETES
  if (checkingGatekeeper) {
    return (
      <View style={styles.gatekeeperContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.gatekeeperText}>Synchronizing current pipeline state...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }} edges={["top", "left", "right"]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Find Shared Ride</Text>

        <TextInput
          placeholder="Search pickup hub..."
          value={searchText}
          onChangeText={searchHubs}
          style={styles.inputBox}
          placeholderTextColor="#9CA3AF"
        />

        {loadingHubs && <ActivityIndicator style={{ marginBottom: 10 }} color="#10B981" />}

        {hubs.map((hub) => (
          <TouchableOpacity key={`hub-${hub.id}`} style={styles.suggestion} onPress={() => selectHub(hub)}>
            <Text style={styles.suggestionText}>{hub.name}</Text>
          </TouchableOpacity>
        ))}

        <Text style={styles.label}>Select Service Tier</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity style={[styles.tierButton, !isSoloRide && styles.activeTierButton]} onPress={() => setIsSoloRide(false)}>
            <Ionicons name="people" size={20} color={!isSoloRide ? "#FFF" : "#374151"} />
            <Text style={[styles.tierText, !isSoloRide && styles.activeTierText]}>Shared Pool</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tierButton, isSoloRide && styles.activeSoloButton]} onPress={() => setIsSoloRide(true)}>
            <FontAwesome5 name="user-alt" size={14} color={isSoloRide ? "#FFF" : "#374151"} />
            <Text style={[styles.tierText, isSoloRide && styles.activeTierText]}>Solo Buyout</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Available Corridors</Text>
        {loadingRoutes ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#10B981" />
        ) : (
          routes.map((route) => (
            <TouchableOpacity key={`route-${route.id}`} style={styles.routeCard} onPress={() => joinPool(route)}>
              <Text style={styles.routeText}>{Array.isArray(route.stops) ? route.stops.join(" → ") : "Route Blueprint"}</Text>
              <Text style={styles.subText}>Tap to join active matchmaking cluster</Text>
            </TouchableOpacity>
          ))
        )}

        <Text style={styles.label}>Available Live Offers</Text>
        {loadingRides ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#10B981" />
        ) : selectedRoutes.length === 0 ? (
          <Text style={styles.secondaryEmptyText}>Select departure hub above to trace live driver fleets.</Text>
        ) : (
          selectedRoutes.map((rideOffer) => (
            <PoolOfferCard key={`offer-${rideOffer.id}`} route={rideOffer} isSoloIntent={isSoloRide} onPress={() => joinPool(rideOffer)} />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 20, color: "#111827" },
  inputBox: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 15, padding: 18, marginBottom: 15, fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB" },
  suggestion: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  suggestionText: { fontSize: 15, color: "#1F2937", fontWeight: "500" },
  label: { fontSize: 16, fontWeight: "700", marginTop: 15, marginBottom: 10, color: "#374151" },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  tierButton: { flex: 1, flexDirection: "row", backgroundColor: "#F3F4F6", padding: 15, borderRadius: 12, justifyContent: "center", alignItems: "center", marginHorizontal: 5, borderWidth: 1, borderColor: "#E5E7EB" },
  activeTierButton: { backgroundColor: "#111827", borderColor: "#111827" },
  activeSoloButton: { backgroundColor: "#10B981", borderColor: "#10B981" },
  tierText: { marginLeft: 8, fontWeight: "700", color: "#374151" },
  activeTierText: { color: "#FFF" },
  routeCard: { backgroundColor: "#F9FAFB", padding: 18, borderRadius: 15, marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  routeText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  subText: { fontSize: 12, color: "#10B981", fontWeight: "700", marginTop: 5 },
  secondaryEmptyText: { color: "#9CA3AF", fontSize: 13, textAlign: "center", marginVertical: 15, fontStyle: "italic" },
  gatekeeperContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  gatekeeperText: { marginTop: 12, color: "#4B5563", fontWeight: "600", fontSize: 14, letterSpacing: 0.3 }
});