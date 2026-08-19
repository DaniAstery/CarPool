import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from "react-native-maps";
import io from "socket.io-client";

const API_URL = "http://100.108.52.79:5000/api";
const socket = io("http://100.108.52.79:5000");

const { width, height } = Dimensions.get('window');

export default function StandardScreen({ route, navigation }) {
  const { userId, standardRequestId, resolvedHubId, bookingType, ride } = route.params || {};

  const [status, setStatus] = useState("searching");
  const [cancelling, setCancelling] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  
  // ⚡ Dynamic snapshot flag prevents initial 0x0 empty marker renders
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  // Extract pickup coordinates from ride params or default to Addis Ababa center
  const pickupLat = ride?.pickup_lat ? parseFloat(ride.pickup_lat) : 9.0421008;
  const pickupLng = ride?.pickup_lng ? parseFloat(ride.pickup_lng) : 38.874166;

  const mapRef = useRef(null);

  // Stop snapshot tracking after markers layout to keep performance smooth
  useEffect(() => {
    const timer = setTimeout(() => {
      setTracksViewChanges(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [nearbyDrivers]);

  /* 🚗 FETCH NEARBY LIVE DRIVERS */
  useEffect(() => {
    let isMounted = true;

    const fetchNearbyDrivers = async () => {
      try {
        const res = await fetch(`${API_URL}/drivers/nearby?lat=${pickupLat}&lng=${pickupLng}&radius_km=15`);
        const rawText = await res.text();
        
        let data;
        try {
          data = JSON.parse(rawText);
        } catch (parseErr) {
          console.log("❌ Endpoint returned HTML/Text instead of JSON:", rawText);
          return;
        }

        if (isMounted && res.ok && data.success) {
          setNearbyDrivers(data.drivers || []);
          // Re-enable view changes briefly when driver positions update
          setTracksViewChanges(true);
        }
      } catch (err) {
        console.log("❌ Network connection error:", err);
      }
    };

    fetchNearbyDrivers();
    const driverInterval = setInterval(fetchNearbyDrivers, 5000);

    return () => {
      isMounted = false;
      clearInterval(driverInterval);
    };
  }, [pickupLat, pickupLng]);

  /* ⚡ SOCKET STATUS SYNC ONLY */
  useEffect(() => {
    if (!standardRequestId || !userId) return;

    socket.emit("join_ride_room", { rideId: standardRequestId, userId: userId });

    const handleRideUpdate = (data) => {
      if (data && (data.rideId === standardRequestId || data.id === standardRequestId)) {
        const newStatus = data.status;
        setStatus(newStatus);

        if (["matched", "accepted", "arrived", "in_trip"].includes(newStatus)) {
          navigation.replace("LiveTracking", {
            rideId: standardRequestId,
            userId: userId,
            driverId: data.driver_id || data.driverId
          });
        }
      }
    };

    socket.on("solo_ride_status_updated", handleRideUpdate);

    return () => {
      socket.off("solo_ride_status_updated", handleRideUpdate);
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
      
      {/* 🗺️ INTERACTIVE MAP */}
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
        customMapStyle={professionalMapStyle}
      >
        {/* PASSENGER RADAR ZONE */}
        <Circle
          center={{ latitude: pickupLat, longitude: pickupLng }}
          radius={120}
          strokeColor="rgba(37, 99, 235, 0.6)"
          fillColor="rgba(37, 99, 235, 0.12)"
          strokeWidth={2}
        />

        {/* PASSENGER PICKUP PIN */}
        <Marker 
          coordinate={{ latitude: pickupLat, longitude: pickupLng }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={50}
        >
          <View style={styles.passengerPinCore}>
            <View style={styles.passengerInnerDot} />
          </View>
        </Marker>

        {/* 🚗 GUARANTEED VISIBLE DRIVER MARKERS */}
        {/* 🚗 DISTINCT EMERALD GREEN DRIVER CAR MARKERS */}
        {nearbyDrivers.map((driver, index) => {
          const dLat = parseFloat(driver.lat || driver.latitude);
          const dLng = parseFloat(driver.lng || driver.longitude);
          const heading = parseFloat(driver.heading) || 0;
          
          if (isNaN(dLat) || isNaN(dLng)) return null;

          const driverKey = `driver_${driver.user_id || driver.id || index}`;

          return (
            <Marker
              key={driverKey}
              coordinate={{ latitude: dLat, longitude: dLng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={tracksViewChanges}
              zIndex={100}
            >
              <View style={styles.driverMarkerWrapper}>
                <View style={[styles.driverCarBadge, { transform: [{ rotate: `${heading}deg` }] }]}>
                  <Ionicons name="car" size={16} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          );
        })}
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
          
          <View style={styles.cardHeaderSection}>
            <Text style={styles.statusTitle}>
              {status === "searching" ? "Finding Your Captain" : "Captain Assigned!"}
            </Text>
            <Text style={styles.statusSubtitle}>
              {status === "searching" 
                ? `Broadcasting to ${nearbyDrivers.length} verified drivers in your zone.`
                : "Establishing secure connection with your driver."}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIconBox, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="location-sharp" size={18} color="#2563EB" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.summaryLabel}>ROUTE CORRIDOR</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {ride?.corridor || "Direct City Route"}
                </Text>
              </View>
            </View>

            <View style={[styles.summaryRow, { marginTop: 12 }]}>
              <View style={[styles.summaryIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="wallet" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.summaryLabel}>FARE & ESTIMATED TIME</Text>
                <Text style={styles.summaryValue}>
                  {ride?.price || "ETB 0"} • {ride?.time || "---"}
                </Text>
              </View>
            </View>
          </View>

          {status === "searching" && (
            <View style={styles.searchingLoaderRow}>
              <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 10 }} />
              <Text style={styles.searchingLoaderText}>
                {nearbyDrivers.length > 0 ? `${nearbyDrivers.length} active units locked in radar` : "Scanning transit corridors..."}
              </Text>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.cancelButton, cancelling && { opacity: 0.6 }]}
            onPress={handleCancelRequest}
            disabled={cancelling}
            activeOpacity={0.75}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <Text style={styles.cancelButtonText}>Cancel Dispatch Request</Text>
            )}
          </TouchableOpacity>

        </View>
      </View>

    </View>
  );
}

const professionalMapStyle = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] }
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
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
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
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  passengerPinCore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 8,
  },
  passengerInnerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
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
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
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
    justifycontent: "center",
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
  driverPulseBadgeOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(37, 99, 235, 0.25)",
    borderWidth: 2,
    borderColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  driverPulseBadgeCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  driverMarkerWrapper: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 8,
  },
  driverCarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#059669", // Emerald green to contrast passenger's blue pin (#2563EB)
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
});