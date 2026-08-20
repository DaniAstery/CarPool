import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Dimensions,
  Linking,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { io } from "socket.io-client";

const { width } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

export default function DriverEnRouteScreen({ route, navigation }) {
  const { rideId, ride } = route.params || {};

  // Status flow: 'accepted' (En Route) -> 'arrived' -> 'in_progress' -> 'completed'
  const [tripStatus, setTripStatus] = useState(ride?.status || "accepted");
  const [driverCoords, setDriverCoords] = useState(null);
  const [heading, setHeading] = useState(0);
  const [loadingAction, setLoadingAction] = useState(false);

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const pickupLocation = {
    latitude: parseFloat(ride?.pickup_lat || 9.0105),
    longitude: parseFloat(ride?.pickup_lng || 38.7613),
  };

  const destinationLocation = {
    latitude: parseFloat(ride?.destination_lat || 8.9806),
    longitude: parseFloat(ride?.destination_lng || 38.7915),
  };

  // Target coordinates for camera auto-fit based on current trip status
  const currentTargetCoords =
    tripStatus === "in_progress" ? destinationLocation : pickupLocation;

  // 1. LIVE GPS TRACKING & BACKEND PINGS
  useEffect(() => {
    let subscription;

    async function startLocationUpdates() {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          const coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setDriverCoords(coords);
          if (loc.coords.heading >= 0) setHeading(loc.coords.heading);

          // Ping backend driver position
          fetch(`${API_URL}/api/drivers/ping`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              driver_id: ride?.driver_id,
              lat: coords.latitude,
              lng: coords.longitude,
              heading: loc.coords.heading || 0,
              status: "online",
              operating_mode: "STANDARD",
            }),
          }).catch((err) => console.log("Ping err:", err));
        }
      );
    }

    startLocationUpdates();
    return () => subscription?.remove();
  }, [ride?.driver_id]);

  // 2. SOCKET LISTENERS (Listen for passenger cancellation)
  useEffect(() => {
    socketRef.current = io(API_URL);

    if (rideId) {
      socketRef.current.emit("join_ride_room", { rideId });

      socketRef.current.on("ride_cancelled_by_passenger", () => {
        Alert.alert("Trip Cancelled", "The passenger cancelled this request.", [
          { text: "OK", onPress: () => navigation.navigate("CreateCorridor") },
        ]);
      });
    }

    return () => socketRef.current?.disconnect();
  }, [rideId]);

  // 3. AUTO-FIT MAP BOUNDS
  useEffect(() => {
    if (mapRef.current && driverCoords) {
      mapRef.current.fitToCoordinates([driverCoords, currentTargetCoords], {
        edgePadding: { top: 100, right: 60, bottom: 260, left: 60 },
        animated: true,
      });
    }
  }, [driverCoords, tripStatus]);

  // 4. LAUNCH EXTERNAL GOOGLE MAPS / WAZE
  const openExternalNavigation = () => {
    const { latitude, longitude } = currentTargetCoords;
    const label = tripStatus === "in_progress" ? "Destination" : "Pickup Location";
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_name=${encodeURIComponent(label)}`;
    Linking.openURL(url).catch(() => Alert.alert("Error", "Unable to launch maps app."));
  };

  // 5. UPDATE TRIP STATUS (API CALL)
  const handleNextStatus = async () => {
    let nextStatus = "arrived";
    if (tripStatus === "arrived") nextStatus = "in_progress";
    if (tripStatus === "in_progress") nextStatus = "completed";

    setLoadingAction(true);
    try {
      const res = await fetch(`${API_URL}/api/rides/solo/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_id: rideId, status: nextStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTripStatus(nextStatus);

        if (nextStatus === "completed") {
          Alert.alert("Trip Completed!", `Collect ${ride?.fare || `ETB ${ride?.price}`} from passenger.`, [
            { text: "Done", onPress: () => navigation.navigate("CreateCorridor") },
          ]);
        }
      } else {
        Alert.alert("Error", data.message || "Failed to update trip status.");
      }
    } catch (err) {
      Alert.alert("Connection Error", "Could not update status on server.");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* MAP VIEW */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...pickupLocation,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {/* Driver Marker */}
        {driverCoords && (
          <Marker coordinate={driverCoords} rotation={heading} flat anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.driverMarker}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
            </View>
          </Marker>
        )}

        {/* Pickup Marker */}
        <Marker coordinate={pickupLocation} title="Pickup Point">
          <View style={styles.pickupMarker}>
            <Ionicons name="person" size={16} color="#FFFFFF" />
          </View>
        </Marker>

        {/* Destination Marker */}
        <Marker coordinate={destinationLocation} title="Destination">
          <View style={styles.destinationMarker}>
            <Ionicons name="flag" size={16} color="#FFFFFF" />
          </View>
        </Marker>

        {/* Route Line */}
        {driverCoords && (
          <Polyline
            coordinates={[driverCoords, currentTargetCoords]}
            strokeColor="#2563EB"
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* TOP FLOATING NAVIGATION BUTTON */}
      <TouchableOpacity style={styles.navButton} onPress={openExternalNavigation}>
        <Ionicons name="compass" size={20} color="#FFFFFF" />
        <Text style={styles.navButtonText}>Navigate (Maps)</Text>
      </TouchableOpacity>

      {/* BOTTOM ACTION SHEET */}
      <View style={styles.bottomCard}>
        <View style={styles.statusHeader}>
          <Text style={styles.statusTagText}>
            {tripStatus === "accepted" && "EN ROUTE TO PICKUP"}
            {tripStatus === "arrived" && "ARRIVED AT PICKUP"}
            {tripStatus === "in_progress" && "TRIP IN PROGRESS"}
          </Text>
          <Text style={styles.fareText}>{ride?.fare || `ETB ${ride?.price || 150}`}</Text>
        </View>

        <View style={styles.addressRow}>
          <Ionicons
            name={tripStatus === "in_progress" ? "flag" : "location"}
            size={20}
            color={tripStatus === "in_progress" ? "#EF4444" : "#059669"}
          />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.addressTitle}>
              {tripStatus === "in_progress" ? ride?.destination_name : "Pickup Passenger"}
            </Text>
            <Text style={styles.addressSub} numberOfLines={1}>
              {tripStatus === "in_progress" ? ride?.destination_address : "Tap navigate to open turn-by-turn"}
            </Text>
          </View>
        </View>

        {/* ACTION BUTTON */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            tripStatus === "arrived" && { backgroundColor: "#059669" },
            tripStatus === "in_progress" && { backgroundColor: "#DC2626" },
          ]}
          onPress={handleNextStatus}
          disabled={loadingAction}
        >
          {loadingAction ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.actionBtnText}>
              {tripStatus === "accepted" && "I'VE ARRIVED AT PICKUP"}
              {tripStatus === "arrived" && "START TRIP"}
              {tripStatus === "in_progress" && "COMPLETE TRIP"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  driverMarker: {
    backgroundColor: "#2563EB",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  pickupMarker: {
    backgroundColor: "#059669",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  destinationMarker: {
    backgroundColor: "#EF4444",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  navButton: {
    position: "absolute",
    top: 50,
    right: 20,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    elevation: 4,
  },
  navButtonText: { color: "#FFFFFF", fontWeight: "600", marginLeft: 6, fontSize: 13 },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    elevation: 10,
  },
  statusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  statusTagText: { color: "#2563EB", fontWeight: "700", fontSize: 13 },
  fareText: { fontSize: 20, fontWeight: "800", color: "#111827" },
  addressRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  addressTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  addressSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  actionBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  actionBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});