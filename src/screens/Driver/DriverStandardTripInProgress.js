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
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

const { width } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

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

const resolveDestinationCoordinates = (rawRide) => {
  const lat = parseFloat(rawRide?.destination_lat ?? 8.9806);
  const lng = parseFloat(rawRide?.destination_lng ?? 38.7915);
  return {
    latitude: isNaN(lat) ? 8.9806 : lat,
    longitude: isNaN(lng) ? 38.7915 : lng,
  };
};

// Haversine formula to calculate distance between two GPS coordinates in kilometers
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function DriverStandardTripInProgress({ route, navigation }) {
  const { rideId, ride, driverId } = route.params || {};
  const mapRef = useRef(null);
  const lastCoordsRef = useRef(null); // Tracks previous GPS point for distance accumulation

  const rawRideData = ride?.ride || ride || {};
  const currentRideId = rideId || rawRideData.id;
  const currentDriverId = driverId || rawRideData.driver_id || 33;
  const passengerId = rawRideData.user_id || 27;

  // 1. Core State & Loading Control
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pricingConfig, setPricingConfig] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 2. Coordinates & Metrics
  const destinationCoords = resolveDestinationCoordinates(rawRideData);
  const [driverCoords, setDriverCoords] = useState({
    latitude: parseFloat(rawRideData.driver_lat ?? rawRideData.pickup_lat ?? 9.0105),
    longitude: parseFloat(rawRideData.driver_lng ?? rawRideData.pickup_lng ?? 38.7613),
  });
  const [heading, setHeading] = useState(0);

  // TRUE METERED START: Start at 0.0 km so sitting still doesn't charge estimated route distance
  const [distanceKm, setDistanceKm] = useState(0.0);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [livePrice, setLivePrice] = useState(0);

  // Passenger & Metadata
  const passengerName = rawRideData.passenger_name || `Passenger #${passengerId}`;
  const passengerPhone = rawRideData.passenger_phone || "251998476704";
  const destinationName = rawRideData.destination_name || "Bole Medhanialem";
  const destinationAddress = rawRideData.destination_address || "Bole Road, Addis Ababa";

  // 3. Fetch Pricing Config (ID: 1 for Addis Ababa) on Mount
  useEffect(() => {
    initTripSession();

    // Timer incrementing elapsed minutes every 60s for time-based fare calculation
    const timer = setInterval(() => {
      setElapsedMinutes((prev) => prev + 1);
    }, 60000);

    return () => clearInterval(timer);
  }, [currentRideId]);

  const initTripSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const pricingRes = await fetch(`${API_URL}/api/pricing/1`);
      if (!pricingRes.ok) {
        throw new Error("Failed to fetch pricing configuration from database.");
      }
      const pricingData = await pricingRes.json();
      setPricingConfig(pricingData);
    } catch (err) {
      console.error("❌ Trip init error:", err);
      setError(err.message || "Error connecting to database server.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Dynamic Fare Engine (Powered by DB pricing_configs row #1)
  useEffect(() => {
    if (!pricingConfig) return;

    const base = parseFloat(pricingConfig.base_flag_down || 130.00);
    const ratePerKm = parseFloat(pricingConfig.rate_per_km || 28.00);
    const ratePerMin = parseFloat(pricingConfig.rate_per_minute || 2.50);
    const fuelMult = parseFloat(pricingConfig.fuel_multiplier || 1.00);
    const surgeMult = parseFloat(pricingConfig.surge_multiplier || 1.00);
    const minFare = parseFloat(pricingConfig.minimum_fare || 160.00);

    const subtotal = (base + (distanceKm * ratePerKm) + (elapsedMinutes * ratePerMin)) * fuelMult * surgeMult;
    const calculatedFare = Math.round(Math.max(subtotal, minFare));

    setLivePrice(calculatedFare);
  }, [distanceKm, elapsedMinutes, pricingConfig]);

  // 5. Live GPS Tracking & Meter Distance Accumulation
  useEffect(() => {
    let locationSubscription;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5, // Check every 5 meters
        },
        (loc) => {
          const newLat = Number(loc.coords.latitude);
          const newLng = Number(loc.coords.longitude);

          // Accumulate actual metered distance traveled
          if (lastCoordsRef.current) {
            const deltaKm = calculateHaversineDistance(
              lastCoordsRef.current.latitude,
              lastCoordsRef.current.longitude,
              newLat,
              newLng
            );

            // Filter out GPS jump/jitter (ignore movements < 3 meters or unrealistically large teleports > 1 km)
            if (deltaKm > 0.003 && deltaKm < 1.0) {
              setDistanceKm((prevDist) => parseFloat((prevDist + deltaKm).toFixed(2)));
            }
          }

          lastCoordsRef.current = { latitude: newLat, longitude: newLng };
          setDriverCoords({ latitude: newLat, longitude: newLng });

          if (loc.coords.heading) {
            setHeading(Number(loc.coords.heading));
          }
        }
      );
    })();

    return () => locationSubscription?.remove();
  }, []);

  // 6. Auto-Fit Camera
  useEffect(() => {
    if (mapRef.current && driverCoords?.latitude && destinationCoords?.latitude) {
      mapRef.current.fitToCoordinates([driverCoords, destinationCoords], {
        edgePadding: { top: 120, right: 60, bottom: 350, left: 60 },
        animated: true,
      });
    }
  }, [driverCoords.latitude, destinationCoords.latitude]);

  // Handle Complete Trip against backend completion endpoint
  const handleCompleteTrip = async () => {
    if (isSubmitting || !pricingConfig) return;
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/api/rides/solo/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_id: currentRideId,
          actual_distance_km: distanceKm,
          elapsed_minutes: elapsedMinutes,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const { total_fare, driver_net_payout, platform_fee } = data.fare_breakdown || {};
        
        Alert.alert(
          "Trip Completed!",
          `Collect ${total_fare || livePrice} ETB from rider.\n\nYour Earnings: ${driver_net_payout || 'N/A'} ETB\nPlatform Fee: -${platform_fee || 'N/A'} ETB`,
          [
            {
              text: "Done",
              onPress: () => navigation.replace("CreateCorridor"),
            },
          ]
        );
      } else {
        Alert.alert("Error", data.message || "Unable to finalize trip.");
      }
    } catch (err) {
      console.error("❌ Completion error:", err);
      Alert.alert("Network Error", "Could not connect to server while finalizing trip.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCallPassenger = () => {
    if (passengerPhone) Linking.openURL(`tel:${passengerPhone}`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Loading Addis Ababa Pricing Config...</Text>
      </View>
    );
  }

  if (error || !pricingConfig) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Configuration Error</Text>
        <Text style={styles.errorSub}>{error || "Could not load pricing config ID 1."}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initTripSession}>
          <Text style={styles.retryButtonText}>Retry Connection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* MINIMAL MAP */}
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
        {/* DESTINATION MARKER */}
        <Marker
          coordinate={destinationCoords}
          title="Drop-off Location"
          description={destinationName}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.destinationHalo}>
            <View style={styles.targetBadge}>
              <Text style={styles.targetBadgeText}>DROP-OFF</Text>
            </View>
            <View style={styles.destinationBadge}>
              <Ionicons name="flag" size={13} color="#FFFFFF" />
            </View>
          </View>
        </Marker>

        {/* DRIVER CAR MARKER */}
        {driverCoords?.latitude && (
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
        {driverCoords?.latitude && destinationCoords?.latitude && (
          <Polyline
            coordinates={[driverCoords, destinationCoords]}
            strokeColor="#111827"
            strokeWidth={5}
            geodesic={true}
          />
        )}
      </MapView>

      {/* TOP FLOATING STATUS BAR */}
      <View style={styles.topStatusCard}>
        <View style={[styles.statusDot, { backgroundColor: "#10B981" }]} />
        <Text style={styles.statusText}>Trip In Progress • Live Meter Active</Text>
      </View>

      {/* BOTTOM CONTROL SHEET */}
      <View style={styles.bottomSheet}>
        {/* DESTINATION ROW */}
        <View style={styles.destinationRow}>
          <View style={styles.destinationIconWrapper}>
            <Ionicons name="location" size={20} color="#EF4444" />
          </View>
          <View style={styles.destinationTextWrapper}>
            <Text style={styles.destinationTitleText} numberOfLines={1}>{destinationName}</Text>
            <Text style={styles.destinationSubtext} numberOfLines={1}>{destinationAddress}</Text>
          </View>
        </View>

        <View style={styles.horizontalDivider} />

        {/* PASSENGER ROW */}
        <View style={styles.passengerRow}>
          <View style={[styles.avatarCircle, { backgroundColor: "#111827" }]}>
            <Text style={styles.avatarText}>
              {passengerName.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.passengerInfo}>
            <Text style={styles.passengerNameText}>{passengerName}</Text>
            <Text style={styles.pickupSubtext}>On Board</Text>
          </View>

          {passengerPhone ? (
            <TouchableOpacity style={styles.callButton} onPress={handleCallPassenger}>
              <Ionicons name="call" size={20} color="#111827" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* METRICS CARD */}
        <View style={styles.metricsCard}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>CURRENT FARE</Text>
            <Text style={styles.metricValue}>{livePrice} ETB</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>DISTANCE</Text>
            <Text style={styles.metricValue}>{distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>ELAPSED</Text>
            <Text style={styles.metricValue}>{elapsedMinutes} min</Text>
          </View>
        </View>

        {/* COMPLETE TRIP BUTTON */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleCompleteTrip}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.actionButtonText}>Complete Trip & Collect</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF", padding: 24 },
  loadingText: { marginTop: 12, fontSize: 13, color: "#64748B", fontWeight: "600" },
  errorTitle: { fontSize: 18, fontWeight: "800", color: "#DC2626", marginBottom: 6 },
  errorSub: { fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 16 },
  retryButton: { backgroundColor: "#111827", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  retryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  destinationHalo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  targetBadge: {
    position: "absolute",
    top: -20,
    backgroundColor: "#EF4444",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
  destinationBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  carMarkerWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
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
    backgroundColor: "#1F2937",
    justifyContent: "center",
    alignItems: "center",
  },

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
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: "#111827", fontWeight: "700", fontSize: 13 },

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

  destinationRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  destinationIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  destinationTextWrapper: { flex: 1 },
  destinationTitleText: { color: "#111827", fontSize: 16, fontWeight: "800" },
  destinationSubtext: { color: "#6B7280", fontSize: 13, marginTop: 2 },

  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 16 },

  passengerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  passengerInfo: { flex: 1 },
  passengerNameText: { color: "#111827", fontSize: 16, fontWeight: "700" },
  pickupSubtext: { color: "#10B981", fontSize: 13, fontWeight: "600", marginTop: 2 },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },

  metricsCard: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "space-around",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  metricItem: { alignItems: "center", flex: 1 },
  metricLabel: { color: "#6B7280", fontSize: 10, fontWeight: "700", marginBottom: 2 },
  metricValue: { color: "#111827", fontSize: 15, fontWeight: "800" },
  metricDivider: { width: 1, height: 24, backgroundColor: "#E5E7EB" },

  actionButton: {
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});