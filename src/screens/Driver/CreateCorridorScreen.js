import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from '../../AuthContext';

const API_URL = "http://192.168.123.52:5000"; 

export default function CreateCorridorScreen({ navigation }) {
  // 🔐 1. ACCESS GLOBAL AUTHENTICATION ENVIRONMENT STATE
  const { user, isLoading: isAuthLoading, logoutSession } = useAuth();
  const currentDriverId = 10; 
  const activeVehicleId = 2; // 🛠️ Hardcoded to Vehicle ID #2 for streamlined development testing

  // Operational Settings
  const [capacity, setCapacity] = useState(4);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [currentHub, setCurrentHub] = useState(null);

  // Loading States
  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLocating, setIsLocating] = useState(true);

  // Lists from Backend
  const [predefinedCorridors, setPredefinedCorridors] = useState([]);
  const [passengerRequests, setPassengerRequests] = useState([]);

  // 🚦 2. GATEKEEPER LOCK: Active Driver Session Recovery
  useEffect(() => {
    if (isAuthLoading || !currentDriverId) return;

    async function checkActiveDriverSession() {
      try {
        console.log(`📡 Fetching status for Driver from: ${API_URL}/api/rides/driver-active-session/${currentDriverId}`);
        const res = await fetch(`${API_URL}/api/rides/driver-active-session/${currentDriverId}`);
        if (!res.ok) return;

        const data = await res.json();
        console.log("📦 Active Session Payload:", data);

        if (data && data.hasActiveSession) {
          const normalizedStatus = (data.status || "").toLowerCase().trim();
          const targetRouteId = data.routeId || data.route_id;
          const targetRideId = data.rideOfferId || data.ride_offer_id || data.id;
          const passengers = data.passengers || [];

          if (passengers.length > 0) {
            const hasAcceptedRider = passengers.some(p => (p.status || "").toLowerCase().trim() === "accepted");
            const hasSingleMatchedRider = passengers.length === 1 && passengers.some(p => (p.status || "").toLowerCase().trim() === "matched");
            const hasArrivedRider = passengers.some(p => (p.status || "").toLowerCase().trim() === "arrived");

            if (hasAcceptedRider) {
              navigation.replace("ProposalDriver", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
            if (hasSingleMatchedRider) {
              navigation.replace("WaitingForRiders", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
            if (hasArrivedRider) {
              navigation.replace("TripInProgress", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
          }

          switch (normalizedStatus) {
            case "pending":
              navigation.replace("WaitingForRiders", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "accepted":
            case "arrived":
              navigation.replace("NavigateToPickup", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "in_trip":
            case "inprogress":
            case "in_transit": 
              navigation.replace("TripInProgress", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "completed":
              navigation.replace("TripEarningsSummary", { rideOfferId: targetRideId, driverId: currentDriverId });
              break;
          }
        }
      } catch (err) {
        console.log("❌ Driver session verification failed:", err);
      }
    }

    checkActiveDriverSession();
  }, [currentDriverId, isAuthLoading]);

  // 🌍 3. AUTO-LOCATION DISCOVERY ENGINE
  useEffect(() => {
    if (!currentDriverId) return;

    const autoLocateDriver = async () => {
      setIsLocating(true);
      // Hardcoded coordinates to Gerji Hub for instant testing
      const fakeDriverCoords = { latitude: 9.0022471, longitude: 38.8100596 };

      try {
        console.log("📡 Validating location for closest Hub...");
        const response = await fetch(`${API_URL}/api/passenger/validate-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_lat: fakeDriverCoords.latitude,
            user_lng: fakeDriverCoords.longitude,
            user_id: currentDriverId,
          }),
        });

        const data = await response.json();
        
        if (response.ok && data.nearestHub) {
          console.log(`🎯 Auto-Located Nearest Hub: ${data.nearestHub.name}`);
          handleHubSelection(data.nearestHub);
        } else {
          console.log("⚠️ Driver is out of Hub range.");
        }
      } catch (err) {
        console.log("❌ Location auto-discovery network error:", err);
      } finally {
        setIsLocating(false);
      }
    };

    autoLocateDriver();
  }, [currentDriverId]);

  // 📍 4. HUB SELECTION ENGINE
  const handleHubSelection = async (hub) => {
    setCurrentHub(hub);
    setSelectedRoute(null);
    setLoadingCorridors(true);
    
    try {
      console.log(`📡 Fetching active corridors and demand maps for: ${hub.name}`);
      const [corridorRes, requestsRes] = await Promise.all([
        fetch(`${API_URL}/api/routes/from/${encodeURIComponent(hub.name)}`),
        fetch(`${API_URL}/api/corridors/passenger-requests`)
      ]);

      const corridorsData = await corridorRes.json();
      const requestsData = await requestsRes.json();

      setPredefinedCorridors(Array.isArray(corridorsData) ? corridorsData : []);

      const localRequests = Array.isArray(requestsData)
        ? requestsData.filter(req => req.start_location && req.start_location.toLowerCase() === hub.name.toLowerCase())
        : [];
      setPassengerRequests(localRequests);

    } catch (err) {
      console.log("❌ Failed to pull corridors for selected hub:", err);
      Alert.alert("Data Error", "Could not synchronize corridors for this hub.");
    } finally {
      setLoadingCorridors(false);
    }
  };

  // 🚀 5. LIVE DISPATCH / GO ONLINE TRIGGER
  const handleGoOnline = async () => {
    if (!currentDriverId) {
      Alert.alert("Session Error", "Authentication expired. Please log in again.");
      return;
    }

    if (!selectedRoute) {
      Alert.alert("Selection Required", "Please select a corridor route to launch.");
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch(`${API_URL}/api/rides/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          vehicle_id: activeVehicleId, // Sends hardcoded 1 perfectly
          route_id: selectedRoute.route_id,
          total_seats: capacity,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Launch Rejected", data.error || "Could not spin up the pool session.");
        return;
      }

      Alert.alert("Online Status Live! 🚀", `Your corridor is published. We matched ${data.filled || 0} rider(s) immediately.`);
      
      navigation.navigate("WaitingForRiders", { 
        ride: {
          id: data.ride_id,
          start_location: data.start_location,
          end_location: data.end_location,
          total_seats: data.total_seats,
          filled: data.filled,
          price_per_seat: data.price_per_seat,
          driver_name: data.driver_name,
        }
      });

    } catch (err) {
      console.log("❌ Dispatch push failed:", err);
      Alert.alert("Network Exception", "Connection to the dispatch server timed out.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (isAuthLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Synchronizing profiles...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* 👑 VISUAL HEADER */}
      <View style={styles.headerBlock}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitleText}>Dispatch Center</Text>
          <Text style={styles.headerSubtext}>Active Vehicle: #{activeVehicleId}</Text>
        </View>
        <TouchableOpacity style={styles.logoutIconButton} onPress={logoutSession}>
          <Ionicons name="power" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* 🗺️ AUTO-LOCATION STATUS BLOCK */}
        <Text style={styles.sectionHeading}>GPS Tracking Status</Text>
        <View style={styles.gpsBanner}>
          {isLocating ? (
            <View style={styles.gpsLoadingWrapper}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={styles.gpsStatusText}>Locating nearest corridor hub...</Text>
            </View>
          ) : currentHub ? (
            <View style={styles.gpsSuccessWrapper}>
              <View style={styles.gpsIndicatorDot} />
              <Text style={styles.gpsHubText}>Active at: <Text style={styles.boldText}>{currentHub.name}</Text></Text>
            </View>
          ) : (
            <View style={styles.gpsSuccessWrapper}>
              <View style={[styles.gpsIndicatorDot, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.gpsHubText}>No Hub nearby. Please move closer to a station corridor.</Text>
            </View>
          )}
        </View>

        {/* 🔥 REALTIME DEMAND RADAR INDICATOR */}
        {passengerRequests.length > 0 && (
          <View style={styles.demandIndicatorBadge}>
            <View style={styles.badgeLeftRow}>
              <Ionicons name="flash" size={16} color="#D97706" />
              <Text style={styles.demandIndicatorText}>
                {passengerRequests.length} passengers waiting here!
              </Text>
            </View>
            <View style={styles.highDemandPill}>
              <Text style={styles.highDemandText}>SURGE</Text>
            </View>
          </View>
        )}

        {/* 🛣️ CORRIDORS LIST */}
        <Text style={styles.sectionHeading}>Select Active Corridor</Text>
        {loadingCorridors ? (
          <View style={styles.skeletonContainer}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.skeletonText}>Reading active corridor blueprints...</Text>
          </View>
        ) : predefinedCorridors.length === 0 ? (
          <View style={styles.fallbackContainer}>
            <Ionicons name="map-outline" size={32} color="#9CA3AF" />
            <Text style={styles.fallbackText}>
              {currentHub ? "No corridors mapped out from this hub yet." : "Waiting for GPS connection to verify nearby paths."}
            </Text>
          </View>
        ) : (
          predefinedCorridors.map((route) => {
            const isSelected = selectedRoute?.route_id === route.route_id;
            return (
              <TouchableOpacity 
                key={route.route_id} 
                style={[styles.routeCard, isSelected && styles.selectedItemBorder]}
                onPress={() => setSelectedRoute(route)}
                activeOpacity={0.8}
              >
                <View style={styles.routeCardLeft}>
                  <View style={[styles.routeIconFrame, isSelected && styles.selectedIconFrame]}>
                    <MaterialCommunityIcons name="bus-side" size={20} color={isSelected ? "#059669" : "#4B5563"} />
                  </View>
                  <View style={styles.routeDetails}>
                    <Text style={[styles.routeText, isSelected && styles.selectedRouteText]}>
                      {route.stops.join(" ➔ ")}
                    </Text>
                    <Text style={styles.routeSubPrice}>Estimated Fare: {route.base_price || 100} ETB</Text>
                  </View>
                </View>
                {isSelected && (
                  <View style={styles.selectedCheckCircle}>
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* 👥 CAPACITY CONTROLLER */}
        <Text style={[styles.sectionHeading, { marginTop: 15 }]}>Vehicle Pool Limits</Text>
        <View style={styles.detailsContainerCard}>
          <View style={styles.detailRowItem}>
            <View style={styles.labelGroup}>
              <Text style={styles.detailRowLabel}>Seats Available</Text>
              <Text style={styles.detailRowSubtitle}>Maximum passenger threshold</Text>
            </View>
            <View style={styles.counterControlWrapper}>
              <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => Math.max(1, p - 1))}>
                <Ionicons name="remove" size={16} color="#1F2937" />
              </TouchableOpacity>
              <Text style={styles.counterValueText}>{capacity}</Text>
              <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => p + 1)}>
                <Ionicons name="add" size={16} color="#1F2937" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ⚡ DISPATCH SHUNT TRIGGER */}
        <TouchableOpacity 
          style={[styles.goOnlineActionButton, !selectedRoute && styles.disabledButton]}
          onPress={handleGoOnline}
          disabled={isPublishing || !selectedRoute}
          activeOpacity={0.9}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.btnContentRow}>
              <Ionicons name="radio" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.goOnlineActionText}>GO ONLINE</Text>
            </View>
          )}
        </TouchableOpacity>
                
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#4B5563", fontSize: 13, fontWeight: "600" },
  
  // Header
  headerBlock: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    backgroundColor: "#FFFFFF", 
    borderBottomWidth: 1, 
    borderColor: "#E5E7EB" 
  },
  headerLeft: { flexDirection: "column" },
  headerTitleText: { fontSize: 16, fontWeight: "800", color: "#111827" },
  headerSubtext: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "500" },
  logoutIconButton: { backgroundColor: "#FEF2F2", padding: 8, borderRadius: 8 },

  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  boldText: { fontWeight: "800", color: "#111827" },

  // Gps Tracker Banner
  gpsBanner: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 14, marginBottom: 15, borderWidth: 1, borderColor: "#E5E7EB" },
  gpsLoadingWrapper: { flexDirection: "row", alignItems: "center", gap: 10 },
  gpsStatusText: { fontSize: 13, color: "#4B5563", fontWeight: "600" },
  gpsSuccessWrapper: { flexDirection: "row", alignItems: "center", gap: 8 },
  gpsIndicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" },
  gpsHubText: { fontSize: 13, color: "#4B5563", fontWeight: "500" },

  // Form Controls
  sectionHeading: { fontSize: 11, fontWeight: "800", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },

  // Demand indicators
  demandIndicatorBadge: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#FFFBEB", 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 15, 
    borderWidth: 1, 
    borderColor: "#FDE68A" 
  },
  badgeLeftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  demandIndicatorText: { color: "#B45309", fontSize: 12, fontWeight: "700" },
  highDemandPill: { backgroundColor: "#D97706", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  highDemandText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },

  // Corridor Cards
  skeletonContainer: { paddingVertical: 30, alignItems: "center", gap: 10 },
  skeletonText: { color: "#6B7280", fontSize: 12, fontWeight: "500" },
  fallbackContainer: { paddingVertical: 30, alignItems: "center", gap: 8 },
  fallbackText: { color: "#9CA3AF", fontSize: 12, fontWeight: "500", textAlign: "center", paddingHorizontal: 20 },
  
  routeCard: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#FFFFFF", 
    padding: 14, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: "#E5E7EB" 
  },
  routeCardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  routeIconFrame: { backgroundColor: "#F3F4F6", padding: 8, borderRadius: 10, marginRight: 12 },
  selectedIconFrame: { backgroundColor: "#ECFDF5" },
  routeDetails: { flex: 1 },
  routeText: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  selectedRouteText: { color: "#065F46" },
  routeSubPrice: { fontSize: 11, color: "#6B7280", marginTop: 3, fontWeight: "500" },
  selectedItemBorder: { borderColor: "#10B981", borderWidth: 2, backgroundColor: "#F0FDF4" },
  selectedCheckCircle: { backgroundColor: "#10B981", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  // Capacity Counter
  detailsContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 20 },
  detailRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  labelGroup: { flexDirection: "column" },
  detailRowLabel: { fontSize: 13, color: "#111827", fontWeight: "700" },
  detailRowSubtitle: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "400" },
  counterControlWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", padding: 3, borderRadius: 10 },
  counterButton: { width: 32, height: 32, backgroundColor: "#FFFFFF", borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  counterValueText: { fontSize: 14, fontWeight: "800", paddingHorizontal: 16 },

  // Launch Controls
  goOnlineActionButton: { backgroundColor: "#10B981", borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 10 },
  disabledButton: { backgroundColor: "#D1D5DB" },
  btnContentRow: { flexDirection: "row", alignItems: "center" },
  goOnlineActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }
});