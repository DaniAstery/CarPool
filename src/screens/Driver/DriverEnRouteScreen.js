import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { isValidMapCoordinate, toMapCoordinate } from "../../utils/mapCoordinates";

const { width } = Dimensions.get("window");

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000";

// Clean Uber/Lyft Minimal Map Style
const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "administrative.land_parcel", elementType: "labels.text.fill", stylers: [{ color: "#bdbdbd" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#eeeeee" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#616161" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#e0e0e0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9c9c9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#9e9e9e" }] },
];

const resolvePickupCoordinates = (params) => {
  const rawRide = params?.ride?.ride || params?.ride || params || {};
  return toMapCoordinate(
    rawRide.pickup_lat ?? rawRide.pickupLat ?? rawRide.passenger_lat,
    rawRide.pickup_lng ?? rawRide.pickupLng ?? rawRide.passenger_lng
  );
};

export default function DriverEnRouteScreen({ route, navigation }) {
  const { rideId, ride, driverId } = route.params || {};
  const mapRef = useRef(null);

  const rawRideData = ride?.ride || ride || {};
  const currentRideId = rideId || rawRideData.id;
  const currentDriverId = driverId || rawRideData.driver_id || 33;

  // 1. Interactive Ride Status & Loading State
  const [rideStatus, setRideStatus] = useState(rawRideData.status || "accepted");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Resolve Passenger Coordinates
  const passengerPickupCoords = resolvePickupCoordinates(route.params);

  // 3. Driver Coordinates & Heading State
  const [driverCoords, setDriverCoords] = useState(() =>
    toMapCoordinate(rawRideData.driver_lat, rawRideData.driver_lng)
  );
  const [heading, setHeading] = useState(0);

  // Passenger & Ride Metadata
  const passengerName = rawRideData.passenger_name || `Passenger #${rawRideData.user_id || ""}`;
  const passengerPhone = rawRideData.passenger_phone || "";
  const destinationName = rawRideData.destination_name || "Destination";
  const farePrice = rawRideData.price || 150;
  const distanceKm = rawRideData.distance_km || 5.2;

  // 4. Live GPS Tracking
  useEffect(() => {
    let locationSubscription;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
        },
        (loc) => {
          setDriverCoords({
            latitude: Number(loc.coords.latitude),
            longitude: Number(loc.coords.longitude),
          });
          if (loc.coords.heading) {
            setHeading(Number(loc.coords.heading));
          }
        }
      );
    })();

    return () => locationSubscription?.remove();
  }, []);

  // 5. Auto-Fit Camera
  useEffect(() => {
    if (
      mapRef.current &&
      isValidMapCoordinate(driverCoords) &&
      isValidMapCoordinate(passengerPickupCoords)
    ) {
      mapRef.current.fitToCoordinates(
        [driverCoords, passengerPickupCoords],
        {
          edgePadding: { top: 140, right: 60, bottom: 320, left: 60 },
          animated: true,
        }
      );
    }
  }, [driverCoords?.latitude, passengerPickupCoords?.latitude]);

  // Handle Arrival API Action
const handleMarkArrived = async () => {
  if (isSubmitting) return;
  setIsSubmitting(true);

  try {
    const response = await fetch(`${API_URL}/api/rides/solo/arrived`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        driver_id: currentDriverId,
      }),
    });

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("Server returned an invalid non-JSON response.");
    }

    const data = await response.json();

    if (data.success) {
      setRideStatus("arrived");
    } else {
      Alert.alert("Notice", data.message || "Failed to notify arrival.");
    }
  } catch (err) {
    console.error("❌ Arrival API error:", err);
    Alert.alert("Network Error", "Could not connect to server. Check your connection.");
  } finally {
    setIsSubmitting(false);
  }
};

 // Handle Start Trip Action
  const handleStartTrip = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 1. Update status to 'in_trip' in ride_request_solo table via backend
      const response = await fetch(`${API_URL}/api/rides/solo/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_id: currentRideId,
          status: "in_trip",
        }),
      });

      const data = await response.json();

      if (data.success) {
        // 2. Navigate to DriverStandardTripInProgress with updated status
        navigation.navigate("DriverStandardTripInProgress", {
          rideId: currentRideId,
          ride: { ...rawRideData, status: "in_trip" },
          driverId: currentDriverId,
        });
      } else {
        Alert.alert("Notice", data.message || "Failed to start trip.");
      }
    } catch (err) {
      console.error("❌ Start Trip API error:", err);
      Alert.alert("Network Error", "Could not connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCallPassenger = () => {
    if (passengerPhone) {
      Linking.openURL(`tel:${passengerPhone}`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "right", "bottom", "left"]}>
    <View style={StyleSheet.absoluteFillObject}>
      {/* MINIMAL MAP */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...(isValidMapCoordinate(driverCoords)
            ? driverCoords
            : isValidMapCoordinate(passengerPickupCoords)
              ? passengerPickupCoords
              : { latitude: 9.0235, longitude: 38.8275 }),
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        customMapStyle={cleanMinimalMapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* PASSENGER PICKUP MARKER */}
        {isValidMapCoordinate(passengerPickupCoords) && <Marker
          coordinate={passengerPickupCoords}
          title="Passenger Pickup"
          description={passengerName}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.destinationHalo}>
            <View style={styles.targetBadge}>
              <Text style={styles.targetBadgeText}>PICKUP POINT</Text>
            </View>
            <View style={styles.destinationBadge}>
              <Ionicons name="person" size={13} color="#FFFFFF" />
            </View>
          </View>
        </Marker>}

        {/* GEOFENCE CIRCLE */}
        {isValidMapCoordinate(passengerPickupCoords) && <Circle
          center={passengerPickupCoords}
          radius={500}
          strokeColor={rideStatus === "arrived" ? "#2563EB" : "#059669"}
          fillColor={
            rideStatus === "arrived"
              ? "rgba(37, 99, 235, 0.15)"
              : "rgba(5, 150, 105, 0.15)"
          }
          strokeWidth={2}
        />}

        {/* DRIVER CAR MARKER */}
        {isValidMapCoordinate(driverCoords) && (
          <Marker
            coordinate={driverCoords}
            title="Your Location"
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading}
            flat={true}
            tracksViewChanges={true}
          >
            <View style={styles.carMarkerWrapper}>
              <View style={styles.carMarkerBubble}>
                <Ionicons name="navigate" size={17} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}

        {/* ROUTE POLYLINE */}
        {isValidMapCoordinate(driverCoords) && isValidMapCoordinate(passengerPickupCoords) && (
          <Polyline
            coordinates={[driverCoords, passengerPickupCoords]}
            strokeColor={rideStatus === "arrived" ? "#2563EB" : "#059669"}
            strokeWidth={5}
            geodesic={true}
          />
        )}
      </MapView>

      {/* TOP FLOATING STATUS BAR */}
      <View style={styles.topStatusCard}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: rideStatus === "arrived" ? "#2563EB" : "#059669" },
          ]}
        />
        <Text style={styles.statusText}>
          {rideStatus === "arrived"
            ? "Arrived • Passenger Notified"
            : "En Route to Pickup Hub"}
        </Text>
      </View>

      {/* BOTTOM CONTROL SHEET */}
      <View style={styles.bottomSheet}>
        <View style={styles.passengerRow}>
          <View
            style={[
              styles.avatarCircle,
              { backgroundColor: rideStatus === "arrived" ? "#2563EB" : "#059669" },
            ]}
          >
            <Text style={styles.avatarText}>
              {passengerName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.passengerInfo}>
            <Text style={styles.passengerNameText}>{passengerName}</Text>
            <Text style={styles.pickupSubtext}>
              Heading to Dropoff: {destinationName}
            </Text>
          </View>

          {passengerPhone ? (
            <TouchableOpacity
              style={[
                styles.callButton,
                { backgroundColor: rideStatus === "arrived" ? "#EFF6FF" : "#ECFDF5" },
              ]}
              onPress={handleCallPassenger}
            >
              <Ionicons
                name="call"
                size={20}
                color={rideStatus === "arrived" ? "#2563EB" : "#059669"}
              />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* METRICS ROW */}
        <View style={styles.metricsCard}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>FARE</Text>
            <Text style={styles.metricValue}>{farePrice} ETB</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DISTANCE</Text>
            <Text style={styles.metricValue}>{distanceKm} km</Text>
          </View>
        </View>

        {/* DYNAMIC ACTION BUTTON */}
        {rideStatus === "arrived" ? (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: "#2563EB" }]}
            onPress={handleStartTrip}
          >
            <Text style={styles.actionButtonText}>Start Trip</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: "#059669" }]}
            onPress={handleMarkArrived}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionButtonText}>I Have Arrived</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  // Target Pin
  destinationHalo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(5, 150, 105, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  targetBadge: {
    position: "absolute",
    top: -20,
    backgroundColor: "#059669",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  destinationBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  // Driver Car Marker
  carMarkerWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  carMarkerBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#047857",
    justifyContent: "center",
    alignItems: "center",
  },

  // Top Bar
  topStatusCard: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 36,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },

  // Bottom Sheet
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    width: width,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
  },
  passengerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  passengerInfo: {
    flex: 1,
  },
  passengerNameText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
  },
  pickupSubtext: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  // Metrics Card
 metricsCard: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "space-around", // 👈 Fixed property name
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  metricItem: {
    alignItems: "center",
  },
  metricLabel: {
    color: "#6B7280",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 2,
  },
  metricValue: {
    color: "#059669",
    fontSize: 15,
    fontWeight: "800",
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E5E7EB",
  },

  // Action Button
  actionButton: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});