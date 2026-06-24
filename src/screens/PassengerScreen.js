import React, { useState } from "react";
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

import PoolOfferCard from "../components/PoolOfferCard";
import { Ionicons, FontAwesome5, MaterialIcons } from "@expo/vector-icons";

export default function PassengerScreen({ navigation }) {
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);

  // App States
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [isSoloRide, setIsSoloRide] = useState(false); // 🚀 Tracks Solo vs Shared selection

  // Loading States
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  /* ---------------- HUB SEARCH ---------------- */
  const searchHubs = async (text) => {
    setSearchText(text);
    if (text.length < 2) {
      setHubs([]);
      return;
    }
    setLoadingHubs(true);
    try {
      const res = await fetch(`http://192.168.238.52:5000/api/hubs/search/${text}`);
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
      const res = await fetch(`http://192.168.238.52:5000/api/routes/from/${hub.name}`);
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
      const res = await fetch(`http://192.168.238.52:5000/api/rides?route_id=${parsedRouteId}`);
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
              const res = await fetch("http://192.168.238.52:5000/api/corridors/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  pickup_hub_id: selectedPickupHub.id,
                  destination_name: destination,
                  user_id: 1,
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

  /* ---------------- JOIN POOL / SOLO RIDE ---------------- */
  const joinPool = async (routeId) => {
    try {
      const pickupHubId = selectedPickupHub ? selectedPickupHub.id : null;
      
      // Look up target route details from local state array to extract visual corridor tags
      const targetRoute = routes.find((r) => parseInt(r.route_id, 10) === parseInt(routeId, 10));
      const corridorLabel = Array.isArray(targetRoute?.stops) 
        ? targetRoute.stops.join(" → ") 
        : "Selected Corridor";

      const res = await fetch("http://192.168.238.52:5000/api/routes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: routeId,
          user_id: 1, // Static placeholder fallback context matching your backend tracking setup
          pickup_hub_id: pickupHubId,
          dropoff_hub_id: null,
          booking_type: isSoloRide ? "solo" : "shared",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Booking failed");
        return;
      }

      /* ⚡ ALIGNMENT FIX: Passing comprehensive routing objects directly into 
        the matching view payload so our real-time status trackers work flawlessly.
      */
      navigation.navigate("MatchingScreen", {
        routeId: routeId,
        hubId: pickupHubId,
        userId: "1", 
        ride: {
          corridor: corridorLabel,
          time: "Evaluating Hub Options...",
          price: isSoloRide 
            ? `ETB ${(parseFloat(targetRoute?.base_price || 150) * 4).toFixed(0)}`
            : `ETB ${targetRoute?.base_price || 150}`,
        }
      });
    } catch (err) {
      console.log("booking error:", err);
      Alert.alert("Connection Failure", "Could not handshake with the matchmaking pipeline engine.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Find Shared Ride</Text>

      {/* HUB SEARCH */}
      <TextInput
        placeholder="Search pickup hub..."
        value={searchText}
        onChangeText={searchHubs}
        style={styles.inputBox}
      />

      {loadingHubs && <ActivityIndicator style={{ marginBottom: 10 }} />}

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
        <ActivityIndicator style={{ marginVertical: 20 }} />
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
            onPress={() => handleRouteSelect(route.route_id || route.id)}
          >
            <Text style={styles.routeText}>
              {Array.isArray(route.stops) ? route.stops.join(" → ") : "Invalid route"}
            </Text>
            <Text style={styles.subText}>
              {isSoloRide
                ? `Solo Buyout Est: ${(parseFloat(route.base_price || 150) * 4).toFixed(0)} ETB`
                : `Base Share Price: ${route.base_price || 150} ETB`}
            </Text>
          </TouchableOpacity>
        ))
      )}

      {/* RIDES OPTIONS LIST */}
      <Text style={styles.label}>Available Options</Text>

      {loadingRides ? (
        <ActivityIndicator style={{ marginVertical: 20 }} />
      ) : (
        selectedRoutes.map((route) => (
          <PoolOfferCard
            key={route.id}
            route={route}
            isSoloIntent={isSoloRide}
            onPress={() => joinPool(route.route_id || route.id)}
          />
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  title: { fontSize: 32, fontWeight: "bold", marginBottom: 20 },
  inputBox: { borderWidth: 1, borderColor: "#ddd", borderRadius: 15, padding: 18, marginBottom: 15 },
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
});