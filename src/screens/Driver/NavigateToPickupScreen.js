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

const { width } = Dimensions.get("window");

// 🌐 NETWORK HOST CONFIGURATION & API KEY
const API_URL = "http://192.168.63.52:5000/api";
const GOOGLE_MAPS_API_KEY = "AIzaSyDZo26RtMEWndm5gPqMO9M2bcCZHOdpqao"; // Replace with your mobile-configured API key

export default function NavigateToPickup({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS
  const { user } = useAuth();
  const currentDriverId =
    route?.params?.driverId || user?.id || user?.driver_id || 10;
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id || 1;
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";

  // 📍 2. STATE MATRIX
  const mapRef = useRef(null);
  const [driverLocation, setDriverLocation] = useState(null);
  
  const [pickupLocation, setPickupLocation] = useState({
    latitude: 9.0227, 
    longitude: 38.8000, 
  });

  const [offerDetails, setOfferDetails] = useState(null);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [hasArrived, setHasArrived] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [networkError, setNetworkError] = useState(null);

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

  // 🔄 4. PASSENGER MANIFEST & STATUS POLLING
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

        // Update hub location if backend provides it
        if (data.hub_latitude && data.hub_longitude) {
          setPickupLocation({
            latitude: parseFloat(data.hub_latitude),
            longitude: parseFloat(data.hub_longitude),
          });
        }

        // Check backend status for arrival sync
        const currentStatus = data.status ? data.status.toString().trim().toLowerCase() : "";
        if (currentStatus === "arrived" || currentStatus === "inprogress") {
          setHasArrived(true);
        }

        // Safely parse passenger list
        const rawPassengers = data.passengers || [];
        const unifiedRoster = rawPassengers.map((rider) => {
          const userId = parseInt(rider.user_id || rider.id, 10);
          return {
            user_id: userId,
            status: rider.status,
            name: rider.name || `Passenger ${userId}`,
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

  // 🎯 5. ACTION HANDLERS (Arrival & Trip Start)
  const handleArrived = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: rideOfferId,
          driver_id: currentDriverId,
        }),
      });

      const responseData = await res.json();

      if (res.ok) {
        setHasArrived(true);
        Alert.alert("Arrival Confirmed", "Passengers have been notified of your arrival.");
      } else {
        Alert.alert("Update Failed", responseData.error || "Could not confirm arrival.");
      }
    } catch (error) {
      Alert.alert("Network Error", "Could not reach Corridor routing hub.");
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
          ride_offer_id: rideOfferId,
          driver_id: currentDriverId,
        }),
      });

      const responseData = await res.json();

      if (res.ok) {
        const finalId = parseInt(responseData.rideOfferId || rideOfferId, 10);
        
        // Navigate to Trip In Progress Screen
        navigation.replace("TripinProgress", {
          routeId: routeId,
          route_id: routeId,
          rideOfferId: finalId,
          ride_offer_id: finalId,
          driverId: currentDriverId,
        });
      } else {
        Alert.alert("Start Trip Failed", responseData.error || "Could not launch trip sequence.");
      }
    } catch (error) {
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

  // Helper for status badge rendering
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
          {/* Driver Location Marker */}
          {driverLocation && (
            <Marker coordinate={driverLocation} zIndex={2}>
              <View style={styles.driverMarkerPin}>
                <Ionicons name="car" size={18} color="#FFFFFF" />
              </View>
            </Marker>
          )}

          {/* Pickup Hub Marker */}
          <Marker coordinate={pickupLocation} zIndex={1}>
            <View style={styles.hubMarkerContainer}>
              <View style={styles.hubMarkerPin}>
                <Ionicons name="flag" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.hubMarkerPulse} />
            </View>
          </Marker>

          {/* Realistic Road Route Line */}
          {driverLocation && pickupLocation && (
            <MapViewDirections
              origin={driverLocation}
              destination={pickupLocation}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={4}
              strokeColor="#EF4444"
              optimizeWaypoints={true}
              onReady={(result) => {
                mapRef.current?.fitToCoordinates(result.coordinates, {
                  edgePadding: {
                    right: 40,
                    bottom: 380,
                    left: 40,
                    top: 80,
                  },
                });
              }}
            />
          )}
        </MapView>
      </View>

      {/* RIDE MANIFEST CARD */}
      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* LOCATION DETAILS */}
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
                {offerDetails?.start_location || "Megenagna Departure Hub"}
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
                  Fetching accepted passenger data...
                </Text>
              </View>
            ) : (
              poolPassengers.map((passenger) => {
                const pId = parseInt(passenger.user_id || passenger.id, 10);
                const isAccepted = passenger.status === "accepted";

                return (
                  <View key={`pickup-rider-row-${pId}`} style={styles.tableRow}>
                    <View style={styles.tableUserLabelGroup}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={isAccepted ? "#10B981" : "#0284C7"}
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
  
  // Map Markers
  driverMarkerPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  hubMarkerContainer: { alignItems: "center", justifyContent: "center" },
  hubMarkerPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  hubMarkerPulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },

  // Bottom Card
  proposalCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "65%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    elevation: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
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
  statusTable: { marginBottom: 20 },
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
  startTripButton: { backgroundColor: "#0284C7" }, // Blue for active trip start
  actionButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});