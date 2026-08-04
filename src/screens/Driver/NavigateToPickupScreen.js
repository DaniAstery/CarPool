import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";

const { width, height } = Dimensions.get("window");

// 🌐 NETWORK HOST CONFIGURATION & API KEY
const API_URL = "http://192.168.1.3:5000/api";
const GOOGLE_MAPS_API_KEY = "AIzaSyDZo26RtMEWndm5gPqMO9M2bcCZHOdpqao";

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function NavigateToPickup({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS
  const { user } = useAuth();
  const currentDriverId =
    route?.params?.driverId || user?.id || user?.driver_id || 10;
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id || null;
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";

  // 📍 2. STATE MATRIX
  const mapRef = useRef(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [mapHubData, setMapHubData] = useState(null);

  const [offerDetails, setOfferDetails] = useState(null);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [hasArrived, setHasArrived] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);

  // 📍 Resolved Hub Coordinates & Name from Dedicated /api/rides/map_coordinates Endpoint
  const pickupLocation = {
    latitude: parseFloat(mapHubData?.start_latitude || 9.0105),
    longitude: parseFloat(mapHubData?.start_longitude || 38.7935),
    name: mapHubData?.start_hub_name || "Pickup Terminal"
  };

  // Compute live distance between device GPS and pickup hub in km
  const currentDriverDistance = driverLocation && pickupLocation
    ? getDistanceFromLatLonInKm(driverLocation.latitude, driverLocation.longitude, pickupLocation.latitude, pickupLocation.longitude)
    : null;

  // 📡 3. GPS LIVE TRACKING
  useEffect(() => {
    let locationSubscription;

    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (location) => {
            setDriverLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      } catch (err) {
        console.log("GPS Location initialization failed:", err);
      }
    })();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // 🗺️ 4. FETCH MAP COORDINATES & HUB DATA FROM DEDICATED ENDPOINT
  useEffect(() => {
    if (!currentDriverId) return;

    async function fetchMapCoordinates() {
      try {
        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const res = await fetch(`${API_URL}/rides/map_coordinates?${queryParam}`);
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return;
        }

        const data = await res.json();
        if (res.ok && data.success && data.coordinates) {
          setMapHubData(data.coordinates);
        }
      } catch (err) {
        console.error("Error fetching map coordinates:", err);
      }
    }

    fetchMapCoordinates();
    const interval = setInterval(fetchMapCoordinates, 4000);
    return () => clearInterval(interval);
  }, [currentDriverId, rideOfferId]);

  // 🔄 5. PASSENGER MANIFEST & STATUS POLLING
  useEffect(() => {
    async function syncRideManifest() {
      try {
        const url = `${API_URL}/rides/driver-cluster-offer/${currentDriverId}`;
        const res = await fetch(url);

        if (!res.ok) return;

        const data = await res.json();
        setNetworkError(null);

        if (!data) return;

        setOfferDetails(data);

        // Check backend status for arrival sync
        const currentStatus = data.status ? data.status.toString().trim().toLowerCase() : "";
        if (currentStatus === "arrived" || currentStatus === "inprogress") {
          setHasArrived(true);
        }

        // 1. Clean parse of arrived_passengers array
        let cleanArrivedIds = [];
        if (data.arrived_passengers) {
          if (Array.isArray(data.arrived_passengers)) {
            cleanArrivedIds = data.arrived_passengers.map((id) => parseInt(id, 10));
          } else if (typeof data.arrived_passengers === "string") {
            cleanArrivedIds = data.arrived_passengers
              .replace(/[{}]/g, "")
              .split(",")
              .map((id) => parseInt(id.trim(), 10))
              .filter((id) => !isNaN(id));
          }
        }

        // 2. Safely parse passenger list from available backend keys
        let rawPassengers = [];
        if (Array.isArray(data.passengers)) {
          rawPassengers = data.passengers;
        } else if (Array.isArray(data.route_pool_passengers)) {
          rawPassengers = data.route_pool_passengers;
        } else if (typeof data.route_pool_passengers === "string") {
          try {
            rawPassengers = JSON.parse(data.route_pool_passengers);
          } catch (e) {
            rawPassengers = [];
          }
        }

        // 3. Unified Roster Mapping with Arrived Status Synchronization
        const unifiedRoster = rawPassengers.map((rider) => {
          const userId = parseInt(rider.user_id || rider.id, 10);
          
          let rawDbStatus = rider?.status
            ? rider.status.toString().trim().toLowerCase()
            : "accepted";

          let finalStatus =
            cleanArrivedIds.includes(userId) || rawDbStatus === "arrived"
              ? "arrived"
              : rawDbStatus;

          const passengerName =
            rider?.passenger_name ||
            rider?.full_name ||
            rider?.name ||
            `Passenger ${userId}`;

          return {
            user_id: userId,
            status: finalStatus,
            name: passengerName,
            phone_number: rider.phone_number,
          };
        });

        setPoolPassengers(unifiedRoster);
      } catch (err) {
        console.error("❌ [Manifest Sync] Connection Error:", err.message);
        setNetworkError(`Cannot connect to host: ${API_URL}`);
      }
    }

    syncRideManifest();
    const pollInterval = setInterval(syncRideManifest, 4000);
    return () => clearInterval(pollInterval);
  }, [currentDriverId]);

  // 🎯 6. ACTION HANDLERS (Arrival & Trip Start)
  const handleArrived = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        console.log("✅ Driver arrival recorded:", data);
        setHasArrived(true);
      } else {
        console.warn("⚠️ Arrival update failed:", data.error);
      }
    } catch (err) {
      console.error("❌ Network error sending arrival update:", err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStartTrip = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/rides/start-trip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
        }),
      });

      const responseData = await res.json();

      if (res.ok) {
        const finalRideOfferId = parseInt(
          responseData.ride_offer?.id || responseData.rideOfferId || rideOfferId,
          10
        );
        const activeRouteId = responseData.ride_offer?.routeId || routeId;

        console.log(`🚀 [Start Trip Success] Transitioning to TripInProgress for Ride Offer #${finalRideOfferId}`);

        navigation.replace("TripInProgress", {
          routeId: activeRouteId,
          route_id: activeRouteId,
          rideOfferId: finalRideOfferId,
          ride_offer_id: finalRideOfferId,
          driverId: currentDriverId,
        });
      } else {
        Alert.alert(
          "Start Trip Failed", 
          responseData.error || "Could not launch trip sequence."
        );
      }
    } catch (error) {
      console.error("❌ Network error starting trip:", error);
      Alert.alert("Connection Failure", "Could not reach Corridor routing hub.");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleMainActionButton = () => {
    if (!hasArrived) {
      handleArrived();
    } else {
      handleStartTrip();
    }
  };

  const renderStatusBadge = (status) => {
    const normStatus = (status || "matched").toLowerCase();

    if (normStatus === "accepted" || normStatus === "confirmed") {
      return (
        <View style={[styles.badge, styles.badgeAccepted]}>
          <Text style={[styles.badgeText, styles.textAccepted]}>Accepted</Text>
        </View>
      );
    }
    if (normStatus === "arrived") {
      return (
        <View style={[styles.badge, styles.badgeArrived]}>
          <Text style={[styles.badgeText, styles.textArrived]}>Arrived</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeSearching]}>
        <Text style={[styles.badgeText, styles.textSearching]}>{normStatus}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {hasArrived ? "At Hub - Ready to Start" : "Navigating to Hub"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ERROR BANNER */}
      {networkError && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color="#FFFFFF" />
          <Text style={styles.errorBannerText}>{networkError}</Text>
        </View>
      )}

      {/* MAP AREA WITH REALISTIC ROAD ROUTING */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: driverLocation?.latitude || 9.0105,
            longitude: driverLocation?.longitude || 38.7935,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          customMapStyle={cleanMinimalMapStyle}
        >
          {/* Driver Circular Marker */}
          {driverLocation && (
            <Marker coordinate={driverLocation} title="Your Vehicle Position" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={2}>
              <View style={styles.driverPinnedContainer}>
                <View style={styles.driverPinBadge}>
                  <Text style={styles.driverPinText}>YOU</Text>
                </View>
                <View style={styles.glowingDriverHalo}>
                  <View style={styles.driverMarkerBubble}>
                    <MaterialCommunityIcons name="car-side" size={16} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            </Marker>
          )}

          {/* Pickup Hub Circular Marker */}
          {pickupLocation?.latitude && pickupLocation?.longitude && (
            <Marker coordinate={pickupLocation} title={pickupLocation.name} description="Assigned Staging Hub" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={1}>
              <View style={styles.driverPinnedContainer}>
                <View style={[styles.driverPinBadge, { backgroundColor: "#0284C7" }]}>
                  <Text style={styles.driverPinText}>PICKUP</Text>
                </View>
                <View style={[styles.glowingDriverHalo, { backgroundColor: "rgba(2, 132, 199, 0.15)", borderColor: "rgba(2, 132, 199, 0.4)" }]}>
                  <View style={[styles.driverMarkerBubble, { backgroundColor: "#0284C7" }]}>
                    <Ionicons name="location" size={16} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            </Marker>
          )}

          {/* Realistic Road Route Line */}
          {driverLocation && pickupLocation?.latitude && (
            <MapViewDirections
              origin={driverLocation}
              destination={pickupLocation}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={4}
              strokeColor="#EF4444"
              optimizeWaypoints={true}
              onReady={(result) => {
                const bottomPadding = isSheetCollapsed ? 150 : height * 0.45;
                mapRef.current?.fitToCoordinates(result.coordinates, {
                  edgePadding: {
                    right: 60,
                    bottom: bottomPadding,
                    left: 60,
                    top: 100,
                  },
                });
              }}
            />
          )}
        </MapView>

        {/* 📏 Distance Banner */}
        {currentDriverDistance !== null && (
          <View style={styles.persistentDistanceBanner}>
            <Ionicons name="navigate" size={14} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.persistentDistanceText}>
              Distance to <Text style={styles.boldText}>{pickupLocation.name}</Text>:{" "}
              <Text style={[styles.boldText, { color: currentDriverDistance <= 2.0 ? "#10B981" : "#EF4444" }]}>
                {currentDriverDistance.toFixed(2)} km
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* RIDE MANIFEST CARD */}
      <View style={[styles.proposalCard, isSheetCollapsed && styles.proposalCardCollapsed]}>
        <TouchableOpacity 
          style={styles.dragHandleBarArea} 
          activeOpacity={0.8}
          onPress={() => setIsSheetCollapsed(!isSheetCollapsed)}
        >
          <View style={styles.dragHandleIndicator} />
          <View style={styles.collapseToggleRow}>
            <Text style={styles.collapseToggleTitle}>
              {isSheetCollapsed ? "Tap to view manifest & details ↗" : "Swipe down or tap to expand map view ↙"}
            </Text>
            <Ionicons name={isSheetCollapsed ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
          </View>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollSheetContent}>
          {/* LOCATION DETAILS WITH RESOLVED HUB NAME */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons
                name={hasArrived ? "checkmark-circle" : "navigate"}
                size={20}
                color="#10B981"
              />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>
                {pickupLocation.name}
              </Text>
              <Text style={styles.locationSubtitle}>
                {hasArrived
                  ? "You have arrived. Verify passengers before launching trip."
                  : "Head to the staging area to meet your passengers."}
              </Text>
            </View>
          </View>

          {/* ROSTER MANIFEST TABLE */}
          <Text style={styles.sectionHeading}>{`Confirmed Manifest (${poolPassengers.length} Passengers)`}</Text>
          <View style={styles.statusTable}>
            {poolPassengers.length === 0 ? (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#6B7280", fontSize: 13 }}>
                  Fetching passenger data...
                </Text>
              </View>
            ) : (
              poolPassengers.map((passenger) => {
                const pId = parseInt(passenger.user_id || passenger.id, 10);
                const isArrived = passenger.status === "arrived";

                return (
                  <View key={`pickup-rider-row-${pId}`} style={styles.tableRow}>
                    <View style={styles.tableUserLabelGroup}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={isArrived ? "#D97706" : "#10B981"}
                      />
                      <Text style={styles.tableUserText}>
                        {passenger.name}
                      </Text>
                    </View>
                    {renderStatusBadge(passenger.status)}
                  </View>
                );
              })
            )}
          </View>

          {/* DYNAMIC ACTION BUTTON */}
          <View style={styles.actionButtonContainer}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                hasArrived ? styles.startTripButton : styles.arriveButton,
              ]}
              onPress={handleMainActionButton}
              disabled={isActionLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.actionButtonText}>
                {isActionLoading
                  ? "PROCESSING..."
                  : hasArrived
                  ? "START TRIP"
                  : "I HAVE ARRIVED AT HUB"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// 🎨 STYLES
const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#111111" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  errorBannerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
    textAlign: "center",
  },
  mapContainer: { flex: 1 },
  
  // Clean Circular Map Marker Styles
  driverPinnedContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  driverPinBadge: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  driverPinText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  glowingDriverHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  driverMarkerBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  persistentDistanceBanner: {
    position: "absolute",
    top: 15,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  persistentDistanceText: { fontSize: 12, color: "#1E293B", fontWeight: "600" },
  boldText: { fontWeight: "800" },

  // Bottom Card & Collapsible Sheet
  proposalCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  proposalCardCollapsed: { maxHeight: 90, overflow: "hidden" },
  dragHandleBarArea: { paddingVertical: 10, alignItems: "center" },
  dragHandleIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 6 },
  collapseToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  collapseToggleTitle: { fontSize: 11, fontWeight: "700", color: "#64748B", marginRight: 4 },
  scrollSheetContent: { paddingBottom: 20 },

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  locationPinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 16, fontWeight: "800", color: "#111" },
  locationSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8, color: "#4B5563" },
  statusTable: { marginBottom: 16 },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F3F4F6",
  },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 14, marginLeft: 10, fontWeight: "600", color: "#111" },
  
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 85,
    alignItems: "center",
  },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeArrived: { backgroundColor: "#FEF3C7" },
  badgeSearching: { backgroundColor: "#F3F4F6" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  textAccepted: { color: "#10B981" },
  textArrived: { color: "#D97706" },
  textSearching: { color: "#4B5563" },
  
  actionButtonContainer: { marginTop: 4 },
  actionButton: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  arriveButton: { backgroundColor: "#10B981" },
  startTripButton: { backgroundColor: "#0284C7" },
  actionButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});