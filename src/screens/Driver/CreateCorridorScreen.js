import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export default function CreateCorridorScreen({ navigation }) {
  const [capacity, setCapacity] = useState(4);
  const [pricePerSeat, setPricePerSeat] = useState("100");

  // Selection & Operational States
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [routeDisplay, setRouteDisplay] = useState({ start: "Select a starting hub...", end: "..." });
  
  // Hub Search States
  const [hubSearchTerm, setHubSearchTerm] = useState("");
  const [foundHubs, setFoundHubs] = useState([]);
  const [selectedHubName, setSelectedHubName] = useState(null);
  const [isSearchingHubs, setIsSearchingHubs] = useState(false);
  
  // Lists fetched from your backend endpoints
  const [passengerRequests, setPassengerRequests] = useState([]);
  const [predefinedCorridors, setPredefinedCorridors] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Trigger hub search when driver types
  useEffect(() => {
    if (hubSearchTerm.trim().length > 1) {
      searchStartingHubs();
    } else {
      setFoundHubs([]);
    }
  }, [hubSearchTerm]);

  // 1. Core Hub Search using your /api/hubs/search/:term endpoint
  const searchStartingHubs = async () => {
    setIsSearchingHubs(true);
    try {
      const res = await fetch(`http://192.168.238.52:5000/api/hubs/search/${hubSearchTerm}`);
      const data = await res.json();
      setFoundHubs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("Hub search error:", err);
    } finally {
      setIsSearchingHubs(false);
    }
  };

  // 2. Hub Selection -> Fetches valid corridors using your /api/routes/from/:pickupHub endpoint
  const handleSelectHub = async (hubName) => {
    setSelectedHubName(hubName);
    setHubSearchTerm(""); // Clear search bar
    setFoundHubs([]);
    setLoadingRoutes(true);
    
    try {
      // Fetch matching fixed corridors
      const routeRes = await fetch(`http://192.168.238.52:5000/api/routes/from/${encodeURIComponent(hubName)}`);
      const routeData = await routeRes.json();
      setPredefinedCorridors(Array.isArray(routeData) ? routeData : []);

      // OPTIONAL: Pull open passenger custom requests originating from this hub if table allows
      const reqRes = await fetch("http://192.168.238.52:5000/api/corridors/passenger-requests");
      const reqData = await reqRes.json();
      const localizedRequests = Array.isArray(reqData) 
        ? reqData.filter(req => req.start_location.toLowerCase() === hubName.toLowerCase())
        : [];
      setPassengerRequests(localizedRequests);

    } catch (err) {
      console.log("Error pulling routes for hub:", err);
      Alert.alert("Error", "Could not fetch corridors for this hub.");
    } finally {
      setLoadingRoutes(false);
    }
  };

  const handleSelectPredefined = (route) => {
    setSelectedRouteId(route.route_id);
    setPricePerSeat(route.base_price ? route.base_price.toString() : "100");
    setRouteDisplay({
      start: route.stops[0],
      end: route.stops[route.stops.length - 1]
    });
  };

  const handleGoOnline = async () => {
    if (!selectedRouteId) {
      Alert.alert("Selection Required", "Please select a corridor route before going online.");
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch("http://192.168.238.52:5000/api/rides/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: 1, 
          vehicle_id: 101, 
          route_id: selectedRouteId,
          total_seats: capacity,
          price_per_seat: parseFloat(pricePerSeat)
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to publish");

      Alert.alert("Live! 🚀", "Your route offer is active. Live passengers can now see and book seats!");
      if (navigation) navigation.navigate("WaitingForRiders", { rideId: data.ride_id });
    } catch (err) {
      Alert.alert("Launch Failed", err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.headerTitleText}>Set Up Corridor Route</Text>
      </View>

      <ScrollView style={styles.contentBody} keyboardShouldPersistTaps="handled">
        
        {/* 🔍 STEP 1: SELECT STARTING HUB */}
        <Text style={styles.sectionHeading}>📍 Where are you starting from?</Text>
        <View style={styles.searchSection}>
          <Ionicons name="search" size={18} color="#6B7280" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Type your current Hub (e.g. Megenagna, Bole...)"
            placeholderTextColor="#9CA3AF"
            value={hubSearchTerm}
            onChangeText={setHubSearchTerm}
          />
        </View>

        {/* Hub Search Results Dropdown */}
        {foundHubs.length > 0 && (
          <View style={styles.searchResultsDropdown}>
            {foundHubs.map((hub) => (
              <TouchableOpacity 
                key={hub.id} 
                style={styles.dropdownItem}
                onPress={() => handleSelectHub(hub.name)}
              >
                <Ionicons name="location-sharp" size={16} color="#059669" />
                <Text style={styles.dropdownItemText}>{hub.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedHubName && (
          <View style={styles.activeHubBadge}>
            <Text style={styles.activeHubBadgeText}>Origin Hub: {selectedHubName}</Text>
          </View>
        )}

        {/* 🔏 SELECTED TARGET PREVIEW */}
        <Text style={[styles.sectionHeading, { marginTop: 15 }]}>Active Ride Target</Text>
        <View style={styles.corridorRouteContainer}>
          <Text style={styles.locationValueText}>From: {routeDisplay.start}</Text>
          <View style={styles.verticalConnectorLine} />
          <Text style={styles.locationValueText}>To: {routeDisplay.end}</Text>
        </View>

        {/* 🗺️ STEP 2: AVAILABLE VALID CORRIDORS LIST */}
        <Text style={styles.sectionHeading}>🗺️ Available Corridors from {selectedHubName || "Selected Hub"}</Text>
        
        {loadingRoutes ? (
          <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 20 }} />
        ) : predefinedCorridors.length === 0 ? (
          <Text style={styles.fallbackText}>
            {selectedHubName ? "No corridors mapped out from this hub yet." : "Search and select a hub above to load routes."}
          </Text>
        ) : (
          predefinedCorridors.map((route) => (
            <TouchableOpacity 
              key={route.route_id} 
              style={[styles.routeCard, selectedRouteId === route.route_id && styles.selectedItemBorder]}
              onPress={() => handleSelectPredefined(route)}
            >
              <MaterialCommunityIcons name="routes" size={20} color="#4B5563" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeText}>{route.stops.join(" ➔ ")}</Text>
                <Text style={styles.routeSubPrice}>Fare: {route.base_price || 100} ETB</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        {/* 🛠️ STEP 3: CONSTRAINTS & GO LIVE */}
        <Text style={[styles.sectionHeading, { marginTop: 15 }]}>Capacity Settings</Text>
        <View style={styles.detailsContainerCard}>
          <View style={styles.detailRowItem}>
            <Text style={styles.detailRowLabel}>Seats Available</Text>
            <View style={styles.counterControlWrapper}>
              <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => Math.max(1, p-1))}>
                <Ionicons name="remove" size={16} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.counterValueText}>{capacity}</Text>
              <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => p+1)}>
                <Ionicons name="add" size={16} color="#111827" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.goOnlineActionButton, isPublishing && { backgroundColor: "#047857" }]}
          onPress={handleGoOnline}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.goOnlineActionText}>GO ONLINE & PUBLISH ROUTE</Text>
          )}
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", alignItems: "center" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  sectionHeading: { fontSize: 11, fontWeight: "800", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  searchSection: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB", paddingHorizontal: 12, marginBottom: 8 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: "#111827" },
  searchResultsDropdown: { backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 15, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  dropdownItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", gap: 10 },
  dropdownItemText: { fontSize: 14, color: "#1F2937", fontWeight: "500" },
  activeHubBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, alignSelf: "flex-start", marginBottom: 15, borderWidth: 1, borderColor: "#A7F3D0" },
  activeHubBadgeText: { color: "#065F46", fontWeight: "700", fontSize: 12 },
  corridorRouteContainer: { backgroundColor: "#111827", borderRadius: 12, padding: 14, marginBottom: 15 },
  locationValueText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  verticalConnectorLine: { width: 1, height: 10, backgroundColor: "#374151", marginLeft: 8, marginVertical: 4 },
  fallbackText: { color: "#9CA3AF", fontSize: 13, fontStyle: 'italic', marginVertical: 10, marginLeft: 2 },
  routeCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  routeText: { fontSize: 14, fontWeight: "600", color: "#1F2937" },
  routeSubPrice: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  selectedItemBorder: { borderColor: "#059669", borderWidth: 2, backgroundColor: "#F0FDF4" },
  detailsContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 15 },
  detailRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  detailRowLabel: { fontSize: 13, color: "#4B5563", fontWeight: "600" },
  counterControlWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", padding: 3, borderRadius: 8 },
  counterButton: { width: 28, height: 28, backgroundColor: "#FFF", borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  counterValueText: { fontSize: 14, fontWeight: "700", paddingHorizontal: 12 },
  goOnlineActionButton: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 10 },
  goOnlineActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" }
});