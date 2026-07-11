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
  Dimensions,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import PoolOfferCard from "../components/PoolOfferCard";
import { Ionicons, FontAwesome5, MaterialIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const API_URL = "http://192.168.204.52:5000/api"; 
const STATIC_USER_ID = 1; // Explicitly anchored to match your platform test parameters

export default function PassengerScreen({ navigation }) {
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);

  // App Configuration States
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [isSoloRide, setIsSoloRide] = useState(false); 

  // Loading States
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  // 🛡️ GATEKEEPER RENDERING SAFETY CONTAINER
  const [checkingGatekeeper, setCheckingGatekeeper] = useState(true);

  /* 🚪 GATEKEEPER APP LIFE-CYCLE STATE RECOVERY PIPELINE */
  useEffect(() => {
    async function runGatekeeperCheck() {
      try {
        console.log(`🛡️ [Gatekeeper] Scanning active session layout for Passenger ID: [${STATIC_USER_ID}]`);
        const res = await fetch(`${API_URL}/routes/status/${STATIC_USER_ID}`);
        
        if (!res.ok) throw new Error("Status check query rejected by routing server.");
        
        const data = await res.json();
        
        // If passenger has an unresolved active record thread, execute auto-routing recovery
        if (data && data.status !== "idle" && data.navigateTo) {
          console.log(`🚀 [Gatekeeper Recovery] Catching state [${data.status}] -> Relocating views to: ${data.navigateTo}`);
          
          navigation.reset({
            index: 0,
            routes: [{ 
              name: data.navigateTo, 
              params: {
                routeId: data.routeId,
                rideOfferId: data.matched_ride_offer_id,
                ride_offer_id: data.matched_ride_offer_id,
                rideId: data.matched_ride_offer_id,
                userId: STATIC_USER_ID
              } 
            }],
          });
          return;
        }
      } catch (err) {
        console.log("Gatekeeper local networking failure:", err);
      } finally {
        // Allow dashboard to render cleanly only if no active states are recovered
        setCheckingGatekeeper(false);
      }
    }
    
    runGatekeeperCheck();
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
      
      let endpoint = `${API_URL}/routes/join`;
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

      console.log(`📡 Dispatching passenger intent: ${endpoint}`);

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorHtml = await res.text();
        console.log("⚠️ Raw Server Error Intercept:", errorHtml.slice(0, 200));
        Alert.alert("Router Disconnect", "Verification processing failed. Check parameter layout structures.");
        return;
      }

      const data = await res.json();
      console.log("✅ Server response received successfully:", data);

      const computedRouteId = isLiveDriverOffer ? item.route_id : (item.route_id || item.id);

      // Handle cases where the endpoint safely intercepts a duplicate action and passes a navigation direction
      const finalTargetScreen = data.navigateTo || "MatchingScreen";

      navigation.navigate(finalTargetScreen, {
        routeId: computedRouteId,
        hubId: pickupHubId,
        userId: STATIC_USER_ID,
        rideOfferId: data.pool?.matched_ride_offer_id || data.pool?.id || null,
        ride_offer_id: data.pool?.matched_ride_offer_id || data.pool?.id || null,
        ride: {
          corridor: corridorLabel,
          time: isLiveDriverOffer ? "Driver waiting" : "Evaluating Hub Options...",
          price: isLiveDriverOffer 
            ? `ETB ${parseInt(item.price_per_seat, 10)}`
            : `ETB ${item.base_price || 150}`,
        }
      });
    } catch (err) {
      console.log("Critical execution block crash:", err);
      Alert.alert("Connection Failure", "Could not reach matchmaking server pipeline layer.");
    }
  };

  // 🛡️ GATEKEEPER RENDERING GUARD INTERCEPT
  if (checkingGatekeeper) {
    return (
      <View style={styles.gatekeeperContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.gatekeeperText}>Resuming Corridor Session...</Text>
      </View>
    );
  }
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFF" }} edges={["top", "left", "right"]}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
          <TouchableOpacity key={`hub-suggestion-${hub.id || hub.name}`} style={styles.suggestion} onPress={() => selectHub(hub)}>
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

        {/* AVAILABLE CORRIDORS SECTION */}
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
              key={`route-blueprint-${route.route_id || route.id}`}
              style={styles.routeCard}
              onPress={() => joinPool(route)} 
            >
              <Text style={styles.routeText}>
                {Array.isArray(route.stops) ? route.stops.join(" → ") : "Invalid route Blueprint configuration"}
              </Text>
              <Text style={styles.subText}>Tap to join active matchmaking cluster</Text>
            </TouchableOpacity>
          ))
        )}

        {/* RIDES OPTIONS LIST */}
        <Text style={styles.label}>Available Live Offers</Text>

        {loadingRides ? (
          <ActivityIndicator style={{ marginVertical: 20 }} color="#10B981" />
        ) : selectedRoutes.length === 0 ? (
          <Text style={styles.secondaryEmptyText}>Select a departure point above to load dynamic driver dispatches.</Text>
        ) : (
          selectedRoutes.map((rideOffer) => (
            <PoolOfferCard
              key={`live-offer-card-${rideOffer.id}`}
              route={rideOffer}
              isSoloIntent={isSoloRide}
              onPress={() => joinPool(rideOffer)} 
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
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 20, color: "#111827" },
  inputBox: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 15, padding: 18, marginBottom: 15, fontSize: 15, color: "#111827", backgroundColor: "#F9FAFB" },
  suggestion: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  suggestionText: { fontSize: 15, color: "#1F2937", fontWeight: "500" },
  label: { fontSize: 16, fontWeight: "700", marginTop: 15, marginBottom: 10, color: "#374151" },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 15, marginBottom: 10 },
  requestLink: { color: "#10B981", fontWeight: "700", fontSize: 14 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 15 },
  tierButton: { flex: 1, flexDirection: "row", backgroundColor: "#F3F4F6", padding: 15, borderRadius: 12, justifyContent: "center", alignItems: "center", marginHorizontal: 5, borderWidth: 1, borderColor: "#E5E7EB" },
  activeTierButton: { backgroundColor: "#111827", borderColor: "#111827" },
  activeSoloButton: { backgroundColor: "#10B981", borderColor: "#10B981" },
  tierText: { marginLeft: 8, fontWeight: "700", color: "#374151" },
  activeTierText: { color: "#FFF" },
  routeCard: { backgroundColor: "#F9FAFB", padding: 18, borderRadius: 15, marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  routeText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  subText: { fontSize: 12, color: "#10B981", fontWeight: "700", marginTop: 5 },
  emptyRoutesBlock: { padding: 24, alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 15, borderWidth: 1, borderColor: "#E5E7EB", width: "100%" },
  emptyText: { color: "#6B7280", marginBottom: 14, textAlign: "center", fontSize: 14, fontWeight: "500" },
  secondaryEmptyText: { color: "#9CA3AF", fontSize: 13, textAlign: "center", marginVertical: 15, fontStyle: "italic" },
  requestCorridorBtn: { flexDirection: "row", backgroundColor: "#10B981", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems: "center" },
  requestCorridorBtnText: { color: "#FFF", fontWeight: "700", marginLeft: 8 },
  floatingDriverBtn: { position: "absolute", top: 60, right: 0, backgroundColor: "#111827", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, zIndex: 9999, elevation: 10, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#374151" },
  floatingDriverText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  gatekeeperContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  gatekeeperText: { marginTop: 12, color: "#4B5563", fontWeight: "600", fontSize: 14, letterSpacing: 0.3 }
});