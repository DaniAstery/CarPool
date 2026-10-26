import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import io from "socket.io-client";
import { isValidMapCoordinate, toMapCoordinate } from "../utils/mapCoordinates";

const API_URL = `${(
  process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://3.223.192.195:5000"
).replace(/\/api\/?$/, "").replace(/\/$/, "")}/api`;
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || "http://3.223.192.195:5000";
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const { width } = Dimensions.get("window");
const DEFAULT_MAP_REGION = { latitude: 9.0235, longitude: 38.8275, latitudeDelta: 0.012, longitudeDelta: 0.012 };

export default function StandardScreen({ route, navigation }) {
  const {
    standardRequestId,
    rideId,
    userId,
    pickupData,
    destinationData,
    ride,
  } = route.params || {};
  const activeRideId = standardRequestId || rideId;

  const [isCancelling, setIsCancelling] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const socketRef = useRef(null);
  const mapRef = useRef(null);

  // 1. Radar Pulse Animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  // 2. Socket Connection & Event Listeners
  useEffect(() => {
    if (!activeRideId || !userId) return;

    let didTransition = false;
    let statusPollTimer;
    let statusRequestInFlight = false;

    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      socket.emit("register_user_channel", { userId });
      socket.emit("join_ride_room", { rideId: activeRideId, userId });
    });

    const transitionToLiveTracking = (driverId, activeStatus, rideData = null) => {
      if (didTransition) return;
      didTransition = true;
      navigation.replace("TrackingDriver", {
        rideId: activeRideId,
        userId,
        driverId,
        initialStatus: activeStatus,
        ride: rideData,
      });
    };

    const checkRideStatus = async () => {
      if (didTransition || statusRequestInFlight) return;
      statusRequestInFlight = true;

      try {
        const response = await fetch(`${API_URL}/rides/${activeRideId}`);
        if (!response.ok) {
          throw new Error(`Ride status request failed (HTTP ${response.status}).`);
        }

        const responseData = await response.json();
        const rideData = responseData?.ride || responseData;
        const status = String(rideData?.status || "").toLowerCase().trim();
        if (["accepted", "arrived", "in_trip"].includes(status)) {
          transitionToLiveTracking(
            rideData?.driver_id || rideData?.driverId || rideData?.driver?.id,
            status,
            rideData
          );
        }
      } catch (error) {
        console.warn("Standard ride status refresh failed:", error.message);
      } finally {
        statusRequestInFlight = false;
        if (!didTransition) {
          statusPollTimer = setTimeout(checkRideStatus, 4000);
        }
      }
    };

    const handleRideAccepted = (data) => {
      const dId = data?.driver_id || data?.driverId || data?.driver?.id;
      transitionToLiveTracking(dId, "accepted", data?.ride || data);
    };

    const handleDriverArrived = (data) => {
      const dId = data?.driver_id || data?.driverId || data?.driver?.id;
      transitionToLiveTracking(dId, "arrived", data?.ride || data);
    };

    socket.on("solo_ride_accepted", handleRideAccepted);
    socket.on("ride_accepted", handleRideAccepted);
    socket.on("driver_arrived", handleDriverArrived);
    socket.on("solo_driver_arrived", handleDriverArrived);
    checkRideStatus();

    return () => {
      didTransition = true;
      if (statusPollTimer) clearTimeout(statusPollTimer);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [activeRideId, userId, navigation]);

  const handleCancelRide = async () => {
    Alert.alert("Cancel Request?", "Are you sure you want to stop searching?", [
      { text: "Keep Waiting", style: "cancel" },
      {
        text: "Cancel",
        style: "destructive",
        onPress: async () => {
          setIsCancelling(true);
          try {
            const response = await fetch(`${API_URL}/rides/solo/cancel`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ requestId: activeRideId, user_id: userId }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
              throw new Error(data.message || "Could not cancel this ride request.");
            }
            navigation.navigate("Passenger");
          } catch (error) {
            console.error("Standard ride cancellation failed:", error);
            Alert.alert("Cancellation failed", error.message || "Please try again.");
          } finally {
            setIsCancelling(false);
          }
        },
      },
    ]);
  };

  const pickupCoords = toMapCoordinate(
    pickupData?.lat ??
      pickupData?.latitude ??
      ride?.pickup_lat ??
      ride?.pickupLat ??
      ride?.pickup?.latitude,
    pickupData?.lng ??
      pickupData?.longitude ??
      ride?.pickup_lng ??
      ride?.pickupLng ??
      ride?.pickup?.longitude
  );
  const destCoords = toMapCoordinate(
    destinationData?.lat ??
      destinationData?.latitude ??
      ride?.destination_lat ??
      ride?.destinationLat ??
      ride?.destination?.latitude,
    destinationData?.lng ??
      destinationData?.longitude ??
      ride?.destination_lng ??
      ride?.destinationLng ??
      ride?.destination?.longitude
  );

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3.2],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "bottom", "left"]}>
      {/* 🔝 HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate("Passenger")}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Searching for Captain</Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>#{activeRideId || "---"}</Text>
        </View>
      </View>

      {/* 🗺️ MAP ENGINE */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            ...(pickupCoords || destCoords || DEFAULT_MAP_REGION),
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          showsUserLocation={false}
          showsCompass={false}
        >
          {/* PICKUP MARKER (Emerald Palette) */}
          {isValidMapCoordinate(pickupCoords) && <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.markerWrapper}>
              <Animated.View
                style={[
                  styles.pulseRing,
                  { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
                ]}
              />
              <View style={styles.emeraldCarWrapper}>
                <View style={styles.emeraldCarInnerBubble}>
                  <Ionicons name="navigate" size={17} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </Marker>}

          {/* DESTINATION MARKER (Royal Blue Palette) */}
          {isValidMapCoordinate(destCoords) && (
            <Marker coordinate={destCoords} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.royalBlueDestinationHalo}>
                <View style={styles.royalBlueDestinationBadge} />
              </View>
            </Marker>
          )}

          {GOOGLE_MAPS_API_KEY && isValidMapCoordinate(pickupCoords) && isValidMapCoordinate(destCoords) && (
            <MapViewDirections
              origin={pickupCoords}
              destination={destCoords}
              apikey={GOOGLE_MAPS_API_KEY}
              mode="DRIVING"
              strokeColor="#059669"
              strokeWidth={5}
              lineCap="round"
              resetOnChange={false}
              onReady={(result) => {
                if (result.coordinates.length > 1) {
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: 100, right: 60, bottom: 300, left: 60 },
                    animated: true,
                  });
                }
              }}
              onError={(message) => console.warn("Standard ride route directions failed:", message)}
            />
          )}
        </MapView>

        {/* FLOATING STATUS BANNER */}
        <View style={styles.persistentBanner}>
          <MaterialCommunityIcons name="radar" size={16} color="#059669" style={{ marginRight: 6 }} />
          <Text style={styles.persistentBannerText}>
            Broadcasting request to nearby drivers...
          </Text>
        </View>
      </View>

      {/* 📄 BOTTOM SHEET CARD */}
      <View style={styles.proposalCard}>
        <View style={styles.dragHandleBarArea}>
          <View style={styles.dragHandleIndicator} />
        </View>

        <View style={styles.cardHeaderRow}>
          <View style={styles.locationPinCircle}>
            <Ionicons name="radio-outline" size={20} color="#059669" />
          </View>
          <View style={styles.locationTextWrapper}>
            <Text style={styles.locationTitle}>Finding Your Driver</Text>
            <Text style={styles.locationSubtitle}>Please wait while we confirm your ride</Text>
          </View>
        </View>

        {/* LOCATION SUMMARY */}
        <View style={styles.routeBox}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: "#059669" }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {pickupData?.address || ride?.pickup_address || "Current Pickup Location"}
            </Text>
          </View>
          <View style={styles.routeConnector} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: "#3B82F6" }]} />
            <Text style={styles.routeText} numberOfLines={1}>
              {destinationData?.address || ride?.destination_address || ride?.destination_name || "Selected Destination"}
            </Text>
          </View>
        </View>

        {/* CANCEL ACTION */}
        <TouchableOpacity
          style={[styles.cancelButton, isCancelling && styles.buttonDisabled]}
          onPress={handleCancelRide}
          disabled={isCancelling}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>
            {isCancelling ? "CANCELING..." : "CANCEL REQUEST"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justify: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  headerBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerBadgeText: { fontSize: 11, fontWeight: "700", color: "#64748B" },

  mapContainer: { flex: 1 },
  markerWrapper: { width: 50, height: 50, alignItems: "center", justifyContent: "center" },
  pulseRing: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#059669",
  },
  emeraldCarWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(5, 150, 105, 0.2)",
    justify: "center",
    alignItems: "center",
  },
  emeraldCarInnerBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#059669",
    justify: "center",
    alignItems: "center",
    elevation: 4,
  },
  royalBlueDestinationHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    justify: "center",
    alignItems: "center",
  },
  royalBlueDestinationBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#3B82F6",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  persistentBanner: {
    position: "absolute",
    top: 15,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  persistentBannerText: { fontSize: 12, color: "#1E293B", fontWeight: "600" },

  proposalCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  dragHandleBarArea: { paddingVertical: 10, alignItems: "center" },
  dragHandleIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1" },

  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justify: "center",
    marginRight: 12,
  },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  locationSubtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  routeBox: {
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { fontSize: 13, fontWeight: "600", color: "#334155", marginLeft: 10, flex: 1 },
  routeConnector: { width: 2, height: 12, backgroundColor: "#CBD5E1", marginLeft: 3, marginVertical: 2 },

  cancelButton: {
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justify: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  cancelButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
});