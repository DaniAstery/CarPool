import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Linking,
  Platform,
} from "react-native";
import MapView, { Marker, Polyline, Circle, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

const { width } = Dimensions.get("window");

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

// Helper to extract numeric pickup location strictly from ride_request_solo payload
const resolvePickupCoordinates = (params) => {
  const rawRide = params?.ride?.ride || params?.ride || params || {};

  const lat = parseFloat(
    rawRide.pickup_lat ?? rawRide.pickupLat ?? rawRide.passenger_lat ?? 9.0105
  );
  const lng = parseFloat(
    rawRide.pickup_lng ?? rawRide.pickupLng ?? rawRide.passenger_lng ?? 38.7613
  );

  return {
    latitude: isNaN(lat) ? 9.0105 : lat,
    longitude: isNaN(lng) ? 38.7613 : lng,
  };
};

export default function DriverEnRouteScreen({ route, navigation }) {
  const { rideId, ride } = route.params || {};
  const mapRef = useRef(null);

  // 1. Resolve Passenger Pickup Coordinates from ride_request_solo
  const passengerPickupCoords = resolvePickupCoordinates(route.params);

  // 2. Driver Location State
  const [driverCoords, setDriverCoords] = useState({
    latitude: parseFloat(ride?.driver_lat ?? 9.0300),
    longitude: parseFloat(ride?.driver_lng ?? 38.7400),
  });
  const [heading, setHeading] = useState(0);

  // Ride details
  const rawRideData = ride?.ride || ride || {};
  const passengerName = rawRideData.passenger_name || `Passenger #${rawRideData.user_id || ""}`;
  const passengerPhone = rawRideData.passenger_phone || "";
  const destinationName = rawRideData.destination_name || "Destination";
  const farePrice = rawRideData.price || 150;
  const distanceKm = rawRideData.distance_km || 5.2;

  // 3. Live Driver Tracking
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

  // 4. Auto-Fit Map View Camera
  useEffect(() => {
    if (
      mapRef.current &&
      driverCoords?.latitude &&
      passengerPickupCoords?.latitude
    ) {
      mapRef.current.fitToCoordinates(
        [driverCoords, passengerPickupCoords],
        {
          edgePadding: { top: 140, right: 60, bottom: 300, left: 60 },
          animated: true,
        }
      );
    }
  }, [driverCoords.latitude, passengerPickupCoords.latitude]);

  const handleCallPassenger = () => {
    if (passengerPhone) {
      Linking.openURL(`tel:${passengerPhone}`);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* STANDARD UBER/LYFT MINIMAL MAP */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...driverCoords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        customMapStyle={cleanMinimalMapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* PASSENGER PICKUP HUB MARKER WITH HALO */}
        <Marker
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
        </Marker>

        {/* 2KM RADIUS GEOFENCE CIRCLE */}
        <Circle
          center={passengerPickupCoords}
          radius={500}
          strokeColor="#059669"
          fillColor="rgba(5, 150, 105, 0.15)"
          strokeWidth={2}
        />

        {/* DRIVER CAR MARKER */}
        {driverCoords?.latitude && (
          <Marker
            coordinate={driverCoords}
            title="Your Vehicle Location"
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

        {/* ACTIVE DRIVER TO PICKUP POLYLINE */}
        {driverCoords?.latitude && passengerPickupCoords?.latitude && (
          <Polyline
            coordinates={[driverCoords, passengerPickupCoords]}
            strokeColor="#059669"
            strokeWidth={5}
            geodesic={true}
          />
        )}
      </MapView>

      {/* TOP FLOATING STATUS BAR */}
      <View style={styles.topStatusCard}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>En Route to Pickup Hub</Text>
      </View>

      {/* BOTTOM CONTROL CARD */}
      <View style={styles.bottomSheet}>
        <View style={styles.passengerRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {passengerName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.passengerInfo}>
            <Text style={styles.passengerNameText}>{passengerName}</Text>
            <Text style={styles.pickupSubtext}>Heading to Dropoff: {destinationName}</Text>
          </View>

          {passengerPhone ? (
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCallPassenger}
            >
              <Ionicons name="call" size={20} color="#059669" />
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

        {/* ARRIVED BUTTON */}
        <TouchableOpacity
          style={styles.arrivedButton}
          onPress={() =>
            navigation.navigate("WaitingForPassengers", {
              rideId: rideId || rawRideData.id,
              ride: rawRideData,
            })
          }
        >
          <Text style={styles.arrivedButtonText}>Arrived at Pickup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Target Pin / Halo Styles
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

  // Driver Car Marker Styles
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
    backgroundColor: "#059669",
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
    backgroundColor: "#059669",
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
    backgroundColor: "#ECFDF5",
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
    justifyContent: "space-around",
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

  // Button
  arrivedButton: {
    backgroundColor: "#059669",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  arrivedButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});