import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import io from "socket.io-client";

const API_URL = "http://100.108.52.79:5000/api";
const socket = io("http://100.108.52.79:5000");

const { width, height } = Dimensions.get('window');

export default function StandardScreen({ route, navigation }) {
  const { userId, standardRequestId, resolvedHubId, bookingType, ride } = route.params || {};

  const [status, setStatus] = useState("searching"); // 'searching' | 'matched' | 'driver_assigned' | 'cancelled'
  const [driverDetails, setDriverDetails] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [nearbyCars, setNearbyCars] = useState([]);

  // Extract pickup coordinates from ride params or default to Addis Ababa center
  const pickupLat = ride?.pickup_lat || 9.0022471;
  const pickupLng = ride?.pickup_lng || 38.8100596;

  const mapRef = useRef(null);

  // Radar pulse animation for the pickup pin/hub
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Simulate nearby available cars around the pickup hub for visual radar effect
    const mockCars = [
      { id: 1, lat: pickupLat + 0.0025, lng: pickupLng + 0.002 },
      { id: 2, lat: pickupLat - 0.003, lng: pickupLng + 0.0025 },
      { id: 3, lat: pickupLat + 0.0015, lng: pickupLng - 0.003 },
      { id: 4, lat: pickupLat - 0.002, lng: pickupLng - 0.0025 },
    ];
    setNearbyCars(mockCars);
  }, [pickupLat, pickupLng, pulseAnim]);

  /* ⚡ SOCKET & POLLING STATUS SYNC */
  useEffect(() => {
    if (!standardRequestId || !userId) return;

    socket.emit("join_ride_room", { rideId: standardRequestId, userId: userId });

    const handleRideUpdate = (data) => {
      if (data && data.rideId === standardRequestId || data.id === standardRequestId) {
        const newStatus = data.status;
        setStatus(newStatus);

        if (newStatus === "matched" || newStatus === "accepted") {
          setDriverDetails(data.driver || data.driverInfo || null);
          
          setTimeout(() => {
            navigation.replace("LiveTracking", {
              rideId: standardRequestId,
              userId: userId,
              driverId: data.driver_id || data.driverId
            });
          }, 1500);
        }
      }
    };

    socket.on("solo_ride_status_updated", handleRideUpdate);

    // Polling fallback every 5 seconds
    const statusInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/rides/solo/status/${standardRequestId}`);
        const data = await res.json();
        
        if (res.ok && data.success && data.ride) {
          const currentRideStatus = data.ride.status;
          setStatus(currentRideStatus);

          if (["matched", "accepted", "arrived", "in_trip"].includes(currentRideStatus)) {
            clearInterval(statusInterval);
            navigation.replace("LiveTracking", {
              rideId: standardRequestId,
              userId: userId,
              driverId: data.ride.driver_id
            });
          }
        }
      } catch (err) {
        console.log("❌ Error polling solo ride status:", err);
      }
    }, 5000);

    return () => {
      socket.off("solo_ride_status_updated", handleRideUpdate);
      clearInterval(statusInterval);
    };
  }, [standardRequestId, userId, navigation]);

  /* 🛑 CANCEL SOLO RIDE REQUEST */
  const handleCancelRequest = () => {
    Alert.alert(
      "Cancel Direct Ride",
      "Are you sure you want to cancel your dispatch request?",
      [
        { text: "Keep Waiting", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await fetch(`${API_URL}/rides/solo/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId: standardRequestId, user_id: userId })
              });

              const data = await res.json();
              if (res.ok && data.success) {
                navigation.replace("Passenger");
              } else {
                Alert.alert("Error", data.message || "Failed to cancel request.");
                setCancelling(false);
              }
            } catch (err) {
              console.error("❌ Cancellation error:", err);
              Alert.alert("Connection Error", "Could not reach server to cancel.");
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      
      {/* 🗺️ INTERACTIVE MAP BACKGROUND */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: pickupLat,
          longitude: pickupLng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        customMapStyle={mapStyleJson}
      >
        {/* Pickup Location Marker with Radar Wave */}
        <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }}>
          <View style={styles.markerContainer}>
            <Animated.View style={[styles.radarRing, { transform: [{ scale: pulseAnim }] }]} />
            <View style={styles.userPinCore}>
              <Ionicons name="person" size={14} color="#FFFFFF" />
            </View>
          </View>
        </Marker>

        {/* Nearby Available Cars around the Hub */}
        {nearbyCars.map((car) => (
          <Marker key={car.id} coordinate={{ latitude: car.lat, longitude: car.lng }}>
            <View style={styles.carMarkerBox}>
              <FontAwesome5 name="car-side" size={12} color="#2563EB" />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* FLOATING HEADER BADGE */}
      <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <View style={styles.headerBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.headerBadgeText}>Solo Direct Dispatch</Text>
          </View>
          <Text style={styles.requestIdText}>REF: #{standardRequestId || "---"}</Text>
        </View>
      </SafeAreaView>

      {/* BOTTOM STATUS & DETAILS CARD */}
      <View style={styles.bottomCardContainer}>
        <View style={styles.statusCard}>
          
          {/* TITLE & SUBTITLE */}
          <View style={styles.cardHeaderSection}>
            <Text style={styles.statusTitle}>
              {status === "searching" ? "Searching for a Driver" : "Driver Found!"}
            </Text>
            <Text style={styles.statusSubtitle}>
              {status === "searching" 
                ? "Broadcasting your direct trip to verified drivers nearby."
                : "Connecting you with your assigned captain."}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* TRIP SUMMARY INFO */}
          <View style={styles.summaryBox}>
            
            {/* Destination Row */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="location-sharp" size={18} color="#2563EB" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.summaryLabel}>DESTINATION</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {ride?.corridor || "Direct Route"}
                </Text>
              </View>
            </View>

            {/* Fare & Distance Row */}
            <View style={[styles.summaryRow, { marginTop: 12 }]}>
              <View style={[styles.summaryIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="wallet" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.summaryLabel}>ESTIMATED FARE & TIME</Text>
                <Text style={styles.summaryValue}>
                  {ride?.price || "ETB 0"} • {ride?.time || "---"}
                </Text>
              </View>
            </View>

          </View>

          {/* SEARCHING LOADER */}
          {status === "searching" && (
            <View style={styles.searchingLoaderRow}>
              <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 10 }} />
              <Text style={styles.searchingLoaderText}>Matching with closest available vehicle...</Text>
            </View>
          )}

          {/* CANCEL BUTTON */}
          <TouchableOpacity 
            style={[styles.cancelButton, cancelling && { opacity: 0.6 }]}
            onPress={handleCancelRequest}
            disabled={cancelling}
            activeOpacity={0.75}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel Request</Text>
            )}
          </TouchableOpacity>

        </View>
      </SafeAreaView>

    </View>
  );
}

// Clean professional map styling
const mapStyleJson = [
  {
    featureType: "poi",
    elementType: "labels",
    stylers: [{ visibility: "off" }]
  }
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#2563EB",
    marginRight: 6,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
    letterSpacing: 0.2,
  },
  requestIdText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: Platform?.OS === 'ios' ? 'Courier' : 'monospace',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
  },
  radarRing: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.25)",
    borderWidth: 1.5,
    borderColor: "rgba(37, 99, 235, 0.6)",
  },
  userPinCore: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  carMarkerBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bottomCardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  cardHeaderSection: {
    alignItems: "center",
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  statusSubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
    paddingHorizontal: 10,
  },
  divider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 14,
  },
  summaryBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 2,
  },
  searchingLoaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  searchingLoaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
  },
  cancelButton: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FEE2E2",
    marginTop: 14,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#DC2626",
  },
});