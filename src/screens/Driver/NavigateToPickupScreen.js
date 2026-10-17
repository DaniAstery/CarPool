import React, { useState, useEffect, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";
import { playSound } from "../../utils/soundPlayer"; // 👈 Sound Player imported
import { isValidMapCoordinate, toMapCoordinate } from "../../utils/mapCoordinates";

const { width, height } = Dimensions.get("window");

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const DEFAULT_MAP_REGION = {
  latitude: 9.0235,
  longitude: 38.8275,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const parsePassengerIds = (value) => {
  const ids = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.replace(/[{}\[\]]/g, "").split(",")
      : [];
  return ids.map((id) => parseInt(id, 10)).filter(Number.isInteger);
};

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

// Calculate exact bearing/heading between coordinates if compass is unavailable
const calculateBearing = (startLat, startLng, destLat, destLng) => {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const destLatRad = (destLat * Math.PI) / 180;
  const destLngRad = (destLng * Math.PI) / 180;

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  let computedHeading = (Math.atan2(y, x) * 180) / Math.PI;
  return (computedHeading + 360) % 360;
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW WITH LOCKED-IN BASELINE STYLINGS & MARKERS
// ------------------------------------------------------------------
const DriverNavigationMap = memo(({ driverLocation, pickupLocation, heading, routeCoordinates, onRouteReady, mapRef, isSheetCollapsed }) => {
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        latitude: driverLocation?.latitude ?? pickupLocation?.latitude ?? DEFAULT_MAP_REGION.latitude,
        longitude: driverLocation?.longitude ?? pickupLocation?.longitude ?? DEFAULT_MAP_REGION.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🟢 1. Driver Current Location Marker */}
      {isValidMapCoordinate(driverLocation) && (
        <Marker
          coordinate={driverLocation}
          title="Your Vehicle Position"
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading || 0}
          flat={true}
          tracksViewChanges={true}
          zIndex={2}
        >
          <View style={styles.emeraldCarWrapper}>
            <View style={styles.emeraldCarInnerBubble}>
              <Ionicons name="navigate" size={17} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 🔵 2. Destination / Pickup Hub Marker */}
      {isValidMapCoordinate(pickupLocation) && (
        <Marker
          coordinate={pickupLocation}
          title={pickupLocation.name}
          description="Assigned Staging Hub"
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={1}
        >
          <View style={styles.royalBlueDestinationHalo}>
            <View style={styles.royalBlueDestinationBadge} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Realistic Road Route Line (MapViewDirections) */}
      {GOOGLE_MAPS_API_KEY && isValidMapCoordinate(driverLocation) && isValidMapCoordinate(pickupLocation) && (
        <MapViewDirections
          origin={driverLocation}
          destination={pickupLocation}
          apikey={GOOGLE_MAPS_API_KEY}
          strokeWidth={5}
          strokeColor="#059669"
          optimizeWaypoints={true}
          onReady={onRouteReady}
        />
      )}
    </MapView>
  );
});

export default function NavigateToPickup({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS
  const { user } = useAuth();
  const currentDriverId =
    route?.params?.driverId || user?.id || user?.driver_id;
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id || null;
  const routeId = route?.params?.routeId || route?.params?.route_id || null;

  // 📍 2. STATE MATRIX
  const mapRef = useRef(null);
  const prevLocRef = useRef(null);
  const arrivedSoundPlayedRef = useRef(new Set()); // 🎵 Tracks unique passenger arrival chimes

  const [driverLocation, setDriverLocation] = useState(null);
  const [mapHubData, setMapHubData] = useState(null);
  const [heading, setHeading] = useState(0);

  const [offerDetails, setOfferDetails] = useState(null);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [hasArrived, setHasArrived] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [networkError, setNetworkError] = useState(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);

  // 📍 Resolved Hub Coordinates & Name from Dedicated /api/rides/map_coordinates Endpoint
  const pickupLocation = {
    ...toMapCoordinate(mapHubData?.start_latitude, mapHubData?.start_longitude),
    name: mapHubData?.start_hub_name || "Pickup Terminal"
  };
  const hasPickupLocation = isValidMapCoordinate(pickupLocation);

  // Compute live distance between device GPS and pickup hub in km
  const currentDriverDistance = isValidMapCoordinate(driverLocation) && hasPickupLocation
    ? getDistanceFromLatLonInKm(driverLocation.latitude, driverLocation.longitude, pickupLocation.latitude, pickupLocation.longitude)
    : null;

  // 📡 3. GPS LIVE TRACKING & COMPASS HEADING
  useEffect(() => {
    let locationSubscription;
    let headingSubscription;

    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 4,
          },
          (location) => {
            const newCoord = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            };

            if (prevLocRef.current) {
              const computedHeading = calculateBearing(
                prevLocRef.current.latitude,
                prevLocRef.current.longitude,
                newCoord.latitude,
                newCoord.longitude
              );
              if (computedHeading > 0 && !headingSubscription) {
                setHeading(computedHeading);
              }
            }
            prevLocRef.current = newCoord;
            setDriverLocation(newCoord);
          }
        );

        headingSubscription = await Location.watchHeadingAsync((headingObj) => {
          if (headingObj) {
            const compassHeading = headingObj.trueHeading >= 0 ? headingObj.trueHeading : headingObj.magHeading;
            if (compassHeading >= 0) {
              setHeading(compassHeading);
            }
          }
        });
      } catch (err) {
        console.log("GPS Location initialization failed:", err);
      }
    })();

    return () => {
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, []);

  // 🗺️ 4. FETCH MAP COORDINATES & HUB DATA FROM DEDICATED ENDPOINT
  useEffect(() => {
    if (!currentDriverId) return;
    let isMounted = true;

    async function fetchMapCoordinates() {
      try {
        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const res = await fetch(`${API_URL}/api/rides/map_coordinates?${queryParam}`);
        const data = await res.json();
        if (!res.ok || !data.success || !data.coordinates) {
          throw new Error(data.error || `Map coordinates request failed (${res.status}).`);
        }
        if (isMounted) {
          setMapHubData(data.coordinates);
          setNetworkError(null);
        }
      } catch (err) {
        console.error("Error fetching map coordinates:", err);
        if (isMounted) setNetworkError(err.message || "Could not load route hub coordinates.");
      }
    }

    fetchMapCoordinates();
    const interval = setInterval(fetchMapCoordinates, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentDriverId, rideOfferId]);

  // 🔄 5. PASSENGER MANIFEST & STATUS POLLING
  useEffect(() => {
    let isMounted = true;
    let isSyncing = false;

    async function syncRideManifest() {
      if (!currentDriverId || isSyncing) return;
      isSyncing = true;
      try {
        const url = `${API_URL}/api/rides/driver-cluster-offer/${currentDriverId}`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`Passenger manifest request failed (${res.status}).`);

        const data = await res.json();
        if (!isMounted) return;
        setNetworkError(null);

        if (!data) return;

        setOfferDetails(data);

        const currentStatus = data.status ? data.status.toString().trim().toLowerCase() : "";
        if (["arrived", "in_trip", "inprogress"].includes(currentStatus)) {
          setHasArrived(true);
        }

        const arrivedIds = new Set(parsePassengerIds(data.arrived_passengers));
        const acceptedIds = new Set(parsePassengerIds(data.accepted_passengers));
        const rawPassengers = Array.isArray(data.passengers)
          ? data.passengers
          : Array.isArray(data.route_pool_passengers)
            ? data.route_pool_passengers
            : typeof data.route_pool_passengers === "string"
              ? JSON.parse(data.route_pool_passengers)
              : [];
        const rosterById = new Map();

        rawPassengers.forEach((rider) => {
          const userId = parseInt(rider?.user_id ?? rider?.userId ?? rider?.id, 10);
          if (!Number.isInteger(userId)) return;
          const dbStatus = String(rider.status || "").trim().toLowerCase();
          const status = arrivedIds.has(userId) || ["arrived", "in_trip", "completed"].includes(dbStatus)
            ? "arrived"
            : acceptedIds.has(userId) || ["accepted", "confirmed"].includes(dbStatus)
              ? "accepted"
              : dbStatus || "matched";
          const current = rosterById.get(userId);
          rosterById.set(userId, {
            user_id: userId,
            status: current?.status === "arrived" || status === "arrived"
              ? "arrived"
              : current?.status === "accepted" || status === "accepted"
                ? "accepted"
                : status,
            name: rider.passenger_name || rider.full_name || rider.name || current?.name || `Passenger ${userId}`,
            phone_number: rider.phone_number || current?.phone_number,
          });
        });

        acceptedIds.forEach((userId) => {
          if (!rosterById.has(userId)) {
            rosterById.set(userId, { user_id: userId, status: "accepted", name: `Passenger ${userId}` });
          }
        });
        arrivedIds.forEach((userId) => {
          const passenger = rosterById.get(userId);
          rosterById.set(userId, {
            ...passenger,
            user_id: userId,
            status: "arrived",
            name: passenger?.name || `Passenger ${userId}`,
          });
        });

        const unifiedRoster = Array.from(rosterById.values());
        unifiedRoster.forEach((passenger) => {
          if (passenger.status === "arrived" && !arrivedSoundPlayedRef.current.has(passenger.user_id)) {
            arrivedSoundPlayedRef.current.add(passenger.user_id);
            playSound("5");
          }
        });
        setPoolPassengers(unifiedRoster);
      } catch (err) {
        console.error("❌ [Manifest Sync] Connection Error:", err.message);
        if (isMounted) setNetworkError(err.message || `Cannot connect to host: ${API_URL}`);
      } finally {
        isSyncing = false;
      }
    }

    syncRideManifest();
    const pollInterval = setInterval(syncRideManifest, 4000);
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [currentDriverId]);

  // 🎯 6. ACTION HANDLERS (Arrival & Trip Start)
  const handleArrived = async () => {
    setIsActionLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/rides/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          ride_offer_id: rideOfferId,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        console.log("✅ Driver arrival recorded:", data);
        setHasArrived(true);
        playSound("1"); // 🎵 Play Sound 1 when driver successfully signals arrival at hub
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
      // 🎵 Play your start trip sound the moment the button is pressed
      playSound("6"); 

      const res = await fetch(`${API_URL}/api/rides/start-trip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          ride_offer_id: rideOfferId,
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
    <SafeAreaView style={styles.container} edges={["top", "right", "bottom", "left"]}>
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

      {/* MAP AREA */}
      <View style={styles.mapContainer}>
        <DriverNavigationMap
          driverLocation={driverLocation}
          pickupLocation={pickupLocation}
          heading={heading}
          mapRef={mapRef}
          isSheetCollapsed={isSheetCollapsed}
          onRouteReady={(result) => {
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

        {!hasPickupLocation && (
          <View style={styles.mapResolutionBanner}>
            <ActivityIndicator size="small" color="#059669" />
            <Text style={styles.mapResolutionText}>Resolving the route pickup hub…</Text>
          </View>
        )}

        {/* 📏 Distance Banner */}
        {currentDriverDistance !== null && (
          <View style={styles.persistentDistanceBanner}>
            <Ionicons name="navigate" size={14} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.persistentDistanceText}>
              Distance to <Text style={styles.boldText}>{pickupLocation.name}</Text>:{" "}
              <Text style={[styles.boldText, { color: currentDriverDistance <= 2.0 ? "#10B981" : "#059669" }]}>
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
          {/* LOCATION DETAILS */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons
                name={hasArrived ? "checkmark-circle" : "navigate"}
                size={20}
                color="#059669"
              />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>
                {hasPickupLocation ? pickupLocation.name : "Resolving pickup hub…"}
              </Text>
              <Text style={styles.locationSubtitle}>
                {hasArrived
                  ? "You have arrived. Verify passengers before launching trip."
                  : "Head to the staging area to meet your passengers."}
              </Text>
            </View>
          </View>

          {/* ROSTER MANIFEST TABLE */}
          <Text style={styles.sectionHeading}>{`Passenger Manifest (${poolPassengers.length})`}</Text>
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
                        color={isArrived ? "#D97706" : "#059669"}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF" },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  errorBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EF4444", paddingVertical: 6, paddingHorizontal: 12 },
  errorBannerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600", marginLeft: 6, textAlign: "center" },
  mapContainer: { flex: 1 },
  mapResolutionBanner: { position: "absolute", top: 64, alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, elevation: 3 },
  mapResolutionText: { marginLeft: 8, color: "#334155", fontSize: 12, fontWeight: "600" },
  emeraldCarWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(5, 150, 105, 0.2)", justifyContent: "center", alignItems: "center" },
  emeraldCarInnerBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 4 },
  royalBlueDestinationHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(59, 130, 246, 0.2)", justifyContent: "center", alignItems: "center" },
  royalBlueDestinationBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#3B82F6", borderWidth: 2, borderColor: "#FFFFFF" },
  persistentDistanceBanner: { position: "absolute", top: 15, alignSelf: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  persistentDistanceText: { fontSize: 12, color: "#1E293B", fontWeight: "600" },
  boldText: { fontWeight: "800" },
  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "75%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 24, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 10 },
  proposalCardCollapsed: { maxHeight: 90, overflow: "hidden" },
  dragHandleBarArea: { paddingVertical: 10, alignItems: "center" },
  dragHandleIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 6 },
  collapseToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  collapseToggleTitle: { fontSize: 11, fontWeight: "700", color: "#64748B", marginRight: 4 },
  scrollSheetContent: { paddingBottom: 20 },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700", color: "#111111" },
  locationSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8, color: "#374151" },
  statusTable: { marginBottom: 16 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500", color: "#1F2937" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, minWidth: 85, alignItems: "center" },
  badgeAccepted: { backgroundColor: "#E0F2FE" },
  badgeArrived: { backgroundColor: "#FEF3C7" },
  badgeSearching: { backgroundColor: "#F3F4F6" },
  badgeText: { fontSize: 11, fontWeight: "600" },
  textAccepted: { color: "#0284C7" },
  textArrived: { color: "#D97706" },
  textSearching: { color: "#4B5563" },
  actionButtonContainer: { marginTop: 4 },
  actionButton: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  arriveButton: { backgroundColor: "#059669" },
  startTripButton: { backgroundColor: "#10B981" },
  actionButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 }
});