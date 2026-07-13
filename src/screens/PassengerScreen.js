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

const API_URL = "http://192.168.173.52:5000/api"; 
const STATIC_USER_ID = 1; 

export default function PassengerScreen({ navigation }) {
  // 🛡️ GATEKEEPER RENDERING SAFETY CONTAINER
  const [checkingGatekeeper, setCheckingGatekeeper] = useState(true);

  // App Workspace Layout States
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [isSoloRide, setIsSoloRide] = useState(false); 

  // Loading Indicators
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

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
            targetScreen = "TripInProgress";
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
            return; // 🛑 EXIT EARLY: Keep gatekeeper shield up so dashboard layout doesn't mount
          }
        }
      } catch (err) {
        console.log("❌ Passenger gatekeeper stack engine failure:", err);
      }

      // 🟢 IDLE OR COMPLETED STATUS: Safely drop gatekeeper shield to show default search views
      if (isMounted) {
        setCheckingGatekeeper(false);
      }
    }

    checkUserRoutingStatus();
    return () => { isMounted = false; };
  }, [navigation]);

  /* ---------------- HUB SEARCH ---------------- */
  const searchHubs = async (text) => {
    setSearchText(text);
    if (text.length < 2) {
      setHubs([]);
      return;
    }
    setLoadingHubs(true);
    try {
      const res = await fetch(`${API_URL}/hubs/search/${text}`);
      const data = await res.json();
      setHubs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("hub search error:", err);
      setHubs([]);
    } finally {
      setLoadingHubs(false);
    }
  };

  /* ---------------- SELECT HUB → GET ROUTES ---------------- */
  const selectHub = async (hub) => {
    setSelectedPickupHub(hub);
    setSearchText(hub.name);
    setHubs([]);
    setRoutes([]);
    setSelectedRoutes([]);
    setLoadingRoutes(true);

    try {
      const res = await fetch(`${API_URL}/routes/from/${hub.name}`);
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("route fetch error:", err);
      setRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  };

  /* ---------------- SELECT CORRIDOR → GET RIDES ---------------- */
  const handleRouteSelect = async (routeId) => {
    const parsedRouteId = parseInt(routeId, 10);
    if (!parsedRouteId || isNaN(parsedRouteId)) {
      console.log("⚠️ Aborting fetch: routeId is invalid or NaN:", routeId);
      setSelectedRoutes([]);
      return;
    }

    setLoadingRides(true);
    try {
      const res = await fetch(`${API_URL}/rides?route_id=${parsedRouteId}`);
      const data = await res.json();
      setSelectedRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("ride fetch error:", err);
      setSelectedRoutes([]);
    } finally {
      setLoadingRides(false);
    }
  };

  /* ---------------- 🚀 REQUEST NEW CORRIDOR ---------------- */
  const handleRequestCorridor = async () => {
    if (!selectedPickupHub) {
      Alert.alert("Error", "Please select a starting hub first.");
      return;
    }

    Alert.prompt(
      "Request New Corridor",
      `Where do you want to go from ${selectedPickupHub.name}? Enter destination hub:`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Request",
          onPress: async (destination) => {
            if (!destination || destination.trim() === "") return;
            try {
              const res = await fetch(`${API_URL}/corridors/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pickup_hub_id: selectedPickupHub.id,
                  destination_name: destination,
                  user_id: STATIC_USER_ID,
                }),
              });
              if (res.ok) {
                Alert.alert("Success 🎉", `Corridor to ${destination} requested! We'll alert drivers.`);
              }
            } catch (err) {
              console.log("Corridor request error:", err);
            }
          },
        },
      ]
    );
  };

  /* ---------------- JOIN POOL / BOOK SEAT DIRECTLY ---------------- */
  const joinPool = async (item) => {
    try {
      const pickupHubId = selectedPickupHub ? selectedPickupHub.id : null;
      const isLiveDriverOffer = Object.prototype.hasOwnProperty.call(item, 'driver_id') || Object.prototype.hasOwnProperty.call(item, 'price_per_seat');
      
      let endpoint = isLiveDriverOffer ? `${API_URL}/rides/join-pool` : `${API_URL}/routes/join`;
      let payload = {};
      let corridorLabel = "Selected Corridor";

      if (isLiveDriverOffer) {
        endpoint = `${API_URL}/rides/join-pool`;
        payload = {
          ride_id: item.id,
          passenger_id: STATIC_USER_ID, 
          pickup_hub_id: pickupHubId,
          dropoff_hub_id: item.dropoff_hub_id || null,
          seats_booked: 1
        };
        corridorLabel = `${item.start_location} → ${item.end_location}`;
      } else {
        endpoint = `${API_URL}/routes/join`;
        payload = {
          route_id: item.route_id || item.id,
          user_id: STATIC_USER_ID,
          pickup_hub_id: pickupHubId,
          dropoff_hub_id: null,
          booking_type: isSoloRide ? "solo" : "shared",
        };
        corridorLabel = Array.isArray(item.stops) ? item.stops.join(" → ") : "Selected Route";
      }

      console.log(`📡 Dispatching payload to endpoint: ${endpoint}`);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        Alert.alert("Router Disconnect", "Verification processing failed. Check parameter layout mappings.");
        return;
      }

      const data = await res.json();
      const targetScreen = data.navigateTo || "MatchingScreen";

      navigation.navigate(targetScreen, {
        routeId: isLiveDriverOffer ? item.route_id : (item.route_id || item.id),
        hubId: pickupHubId,
        userId: STATIC_USER_ID, 
        rideOfferId: data.pool?.matched_ride_offer_id || data.pool?.id || null,
        ride: {
          corridor: corridorLabel,
          time: isLiveDriverOffer ? "Driver waiting" : "Evaluating Hub Options...",
          price: isLiveDriverOffer ? `ETB ${parseInt(item.price_per_seat, 10)}` : `ETB ${item.base_price || 150}`,
        }
      });
    } catch (err) {
      Alert.alert("Connection Failure", "Could not reach matchmaking server layer.");
    }
  };
  
  if (checkingGatekeeper) {
    return (
      <View style={styles.gatekeeperContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.gatekeeperText}>Checking active ride status...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }} edges={["top", "left", "right"]}>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Find Shared Ride</Text>

        {/* HUB SEARCH */}
        <TextInput
          placeholder="Search pickup hub..."
          value={searchText}
          onChangeText={searchHubs}
          style={styles.inputBox}
          placeholderTextColor="#9CA3AF"
        />

        {loadingHubs && <ActivityIndicator style={{ marginBottom: 10 }} color="#10B981" />}

        {hubs.map((hub) => (
          <TouchableOpacity key={hub.id || hub.name} style={styles.suggestion} onPress={() => selectHub(hub)}>
            <Text style={styles.suggestionText}>{hub.name}</Text>
          </TouchableOpacity>
        ))}

        {/* RIDE TYPE SELECTION PANEL */}
        <Text style={styles.label}>Select Service Tier</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.tierButton, !isSoloRide && styles.activeTierButton]}
            onPress={() => setIsSoloRide(false)}
          >
            <Ionicons name="people" size={20} color={!isSoloRide ? "#FFF" : "#374151"} />
            <Text style={[styles.tierText, !isSoloRide && styles.activeTierText]}>Shared Pool</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tierButton, isSoloRide && styles.activeSoloButton]}
            onPress={() => setIsSoloRide(true)}
          >
            <FontAwesome5 name="user-alt" size={14} color={isSoloRide ? "#FFF" : "#374151"} />
            <Text style={[styles.tierText, isSoloRide && styles.activeTierText]}>Solo Buyout</Text>
          </TouchableOpacity>
        </View>

        {/* AVAILABLE CORRIDORS */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.label}>Available Corridors</Text>
          {selectedPickupHub && (
            <TouchableOpacity onPress={handleRequestCorridor}>
              <Text style={styles.requestLink}>+ Request New Route</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.floatingDriverBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate("CreateCorridorScreen")}
        >
          <FontAwesome5 name="exchange-alt" size={12} color="#10B981" style={{ marginRight: 8 }} />
          <Text style={styles.floatingDriverText}>SWITCH TO DRIVER</Text>
        </TouchableOpacity>

        {loadingRoutes ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#10B981" />
        ) : routes.length === 0 && selectedPickupHub ? (
          <View style={styles.emptyRoutesBlock}>
            <Text style={styles.emptyText}>No corridors registered from this hub yet.</Text>
            <TouchableOpacity style={styles.requestCorridorBtn} onPress={handleRequestCorridor}>
              <MaterialIcons name="add_location_alt" size={20} color="#FFF" />
              <Text style={styles.requestCorridorBtnText}>Request Custom Corridor</Text>
            </TouchableOpacity>
          </View>
        ) : (
          routes.map((route) => (
            <TouchableOpacity
              key={route.route_id || route.id}
              style={styles.routeCard}
              onPress={() => {
                joinPool(route);
                handleRouteSelect(route.route_id || route.id);
              }} 
            >
              <Text style={styles.routeText}>
                {Array.isArray(route.stops) ? route.stops.join(" → ") : "Invalid route"}
              </Text>
              <Text style={styles.subText}>Tap to load available options</Text>
            </TouchableOpacity>
          ))
        )}

        {/* RIDES OPTIONS LIST */}
        <Text style={styles.label}>Available Options</Text>

        {loadingRides ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#10B981" />
        ) : (
          selectedRoutes.map((route) => (
            <PoolOfferCard
              key={route.id}
              route={route}
              isSoloIntent={isSoloRide}
              onPress={() => joinPool(route)} 
            />
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 20, paddingTop: 10 },
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 20 },
  inputBox: { borderWidth: 1, borderColor: "#ddd", borderRadius: 15, padding: 18, marginBottom: 15, fontSize: 15, backgroundColor: "#F9FAFB" },
  suggestion: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#eee" },
  suggestionText: { fontSize: 15, color: "#1F2937" },
  label: { fontSize: 16, fontWeight: "700", marginTop: 15, marginBottom: 10 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 15, marginBottom: 10 },
  requestLink: { color: "#10B981", fontWeight: "700", fontSize: 14 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  tierButton: { flex: 1, flexDirection: "row", backgroundColor: "#F3F4F6", padding: 15, borderRadius: 12, justifyContent: "center", alignItems: "center", marginHorizontal: 5, borderWidth: 1, borderColor: "#E5E7EB" },
  activeTierButton: { backgroundColor: "#111827", borderColor: "#111827" },
  activeSoloButton: { backgroundColor: "#10B981", borderColor: "#10B981" },
  tierText: { marginLeft: 8, fontWeight: "700", color: "#374151" },
  activeTierText: { color: "#FFF" },
  routeCard: { backgroundColor: "#f5f5f5", padding: 18, borderRadius: 12, marginBottom: 12 },
  routeText: { fontSize: 16, fontWeight: "600" },
  subText: { fontSize: 12, color: "#10B981", fontWeight: "700", marginTop: 5 },
  emptyRoutesBlock: { padding: 20, alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12 },
  emptyText: { color: "#6B7280", marginBottom: 12, textAlign: "center" },
  requestCorridorBtn: { flexDirection: "row", backgroundColor: "#10B981", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems: "center" },
  requestCorridorBtnText: { color: "#FFF", fontWeight: "700", marginLeft: 8 },
  floatingDriverBtn: { position: "absolute", top: 70, right: 20, backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, zIndex: 9999, elevation: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#374151" },
  floatingDriverText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  gatekeeperContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  gatekeeperText: { marginTop: 12, color: "#4B5563", fontWeight: "600", fontSize: 14 }
});