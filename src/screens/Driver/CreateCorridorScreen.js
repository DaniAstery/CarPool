import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// 🎯 BASE ENDPOINT CONFIGURATION
const API_URL = "http://192.168.173.52:5000"; 

export default function CreateCorridorScreen({ route, navigation }) {
  // Safe authentication fallback (Replace with your actual Global Context Hooks)
  const currentAuthenticatedUser = route?.params?.user || { id: 1, activeVehicleId: null };
  const currentDriverId = currentAuthenticatedUser?.id || 1;

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
  
  // Lists fetched from backend
  const [passengerRequests, setPassengerRequests] = useState([]);
  const [predefinedCorridors, setPredefinedCorridors] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // 🚦 UPGRADED NAVIGATION SESSION GATEKEEPER LOCK
  useEffect(() => {
    async function checkActiveDriverSession() {
      try {
        // 🎯 FIX: Query the runtime profile status using currentDriverId 
        console.log(`📡 Fetching status for Driver from: ${API_URL}/api/rides/driver-active-session/${currentDriverId}`);
        const res = await fetch(`${API_URL}/api/rides/driver-active-session/${currentDriverId}`);
        if (!res.ok) {
          console.log(`⚠️ Network check response failed with status level: ${res.status}`);
          return;
        }

        const data = await res.json();
        console.log("📦 Active Session Payload Received:", data);

        if (data && data.hasActiveSession) {
          const normalizedStatus = (data.status || "").toLowerCase().trim();
          const targetRouteId = data.routeId || data.route_id;
          const targetRideId = data.rideOfferId || data.ride_offer_id || data.id;

          console.log(`🗺️ Gatekeeper evaluating active state matrix for Status: [${normalizedStatus}]`);

          switch (normalizedStatus) {
            case "pending":
              console.log(`⏳ State recovery routing to [WaitingForRiders]`);
              navigation.replace("WaitingForRiders", {
                routeId: targetRouteId,
                rideOfferId: targetRideId,
                ride_offer_id: targetRideId,
                driverId: data.driverId || currentDriverId
              });
              break;

            case "accepted":
            case "arrived":
              console.log(`🗺️ State recovery routing to [NavigateToPickup]`);
              navigation.replace("NavigateToPickup", {
                routeId: targetRouteId,
                rideId: targetRideId,       
                rideOfferId: targetRideId,  
                ride_offer_id: targetRideId, 
                driverId: data.driverId || currentDriverId
              });
              break;

                        // 🎯 UPDATED CASE MATRIX: Matches the new snake_case 'in_trip' database standard
              case "in_trip":
              case "inprogress":
              case "in_transit": 
                // FIX: Changed ${status} to ${normalizedStatus}
                console.log(`🚗 Matching active state caught [${normalizedStatus}]. Routing directly to HUD.`);
                navigation.replace("TripInProgress", {
                  routeId: targetRouteId,
                  rideOfferId: targetRideId,
                  ride_offer_id: targetRideId,
                  driverId: data.driverId || currentDriverId
                });
                break;


              case "completed":
              console.log(`💰 State recovery routing to [TripEarningsSummary]`);
              navigation.replace("TripEarningsSummary", {
                rideOfferId: targetRideId,
                ride_offer_id: targetRideId,
                driverId: data.driverId || currentDriverId
              });
              break;

            default:
              console.log(`⚠️ Gatekeeper bypass: Unhandled database status vector [${data.status}]`);
              break;
          }
        } else {
          console.log("No active or uncompleted session profiles found for driver. Manual entry unlocked.");
        }
      } catch (err) {
        console.log("❌ Failed to verify driver dispatch gatekeeper status:", err);
      }
    }

    if (currentDriverId) {
      checkActiveDriverSession();
    }
  }, [currentDriverId]);

  // Trigger hub search when driver types
  useEffect(() => {
    if (hubSearchTerm.trim().length > 1) {
      searchStartingHubs();
    } else {
      setFoundHubs([]);
    }
  }, [hubSearchTerm]);

  const searchStartingHubs = async () => {
    setIsSearchingHubs(true);
    try {
      const res = await fetch(`${API_URL}/api/hubs/search/${hubSearchTerm}`);
      const data = await res.json();
      setFoundHubs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("Hub search error:", err);
    } finally {
      setIsSearchingHubs(false);
    }
  };

  const handleSelectHub = async (hubName) => {
    setSelectedHubName(hubName);
    setHubSearchTerm(""); 
    setFoundHubs([]);
    setLoadingRoutes(true);
    
    try {
      const routeRes = await fetch(`${API_URL}/api/routes/from/${encodeURIComponent(hubName)}`);
      const routeData = await routeRes.json();
      setPredefinedCorridors(Array.isArray(routeData) ? routeData : []);

      const reqRes = await fetch(`${API_URL}/api/corridors/passenger-requests`);
      const reqData = await reqRes.json();
      
      const localizedRequests = Array.isArray(reqData) 
        ? reqData.filter(req => req.start_location && req.start_location.toLowerCase() === hubName.toLowerCase())
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
      Alert.alert("Selection Required", "Please select an active corridor route blueprint.");
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch(`${API_URL}/api/rides/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          vehicle_id: currentAuthenticatedUser.activeVehicleId, 
          route_id: selectedRouteId,
          total_seats: capacity,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Launch Failed", data.error || "Could not publish corridor pool.");
        return;
      }

      Alert.alert("Live! 🚀", `Corridor Published! Matched with ${data.filled} passenger(s).`);
      
      if (navigation) {
        navigation.navigate("WaitingForRiders", { 
          ride: {
            id: data.ride_id,
            start_location: data.start_location,
            end_location: data.end_location,
            total_seats: data.total_seats,
            filled: data.filled,
            price_per_seat: data.price_per_seat,
            driver_name: data.driver_name,
            make: data.make,
            model: data.model
          }
        });
      }

    } catch (err) {
      console.log("Publish error:", err);
      Alert.alert("Network Error", "Could not connect to dispatch server.");
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

        <Text style={[styles.sectionHeading, { marginTop: 15 }]}>Active Ride Target</Text>
        <View style={styles.corridorRouteContainer}>
          <Text style={styles.locationValueText}>From: {routeDisplay.start}</Text>
          <View style={styles.verticalConnectorLine} />
          <Text style={styles.locationValueText}>To: {routeDisplay.end}</Text>
        </View>

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

        {passengerRequests.length > 0 && (
          <View style={styles.demandIndicatorBadge}>
            <Ionicons name="people" size={14} color="#0369a1" />
            <Text style={styles.demandIndicatorText}>
              {passengerRequests.length} passenger(s) waiting on segments near this hub!
            </Text>
          </View>
        )}

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
            <Text style={styles.goOnlineActionText}>GO ONLINE</Text>
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
  demandIndicatorBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0f9ff", padding: 10, borderRadius: 8, gap: 8, marginBottom: 12, borderWidth: 1, borderColor: "#bae6fd" },
  demandIndicatorText: { color: "#0369a1", fontSize: 12, fontWeight: "600" },
  goOnlineActionButton: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 10 },
  goOnlineActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" }
});