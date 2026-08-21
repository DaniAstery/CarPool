import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import io from "socket.io-client";

const API_URL = "http://100.108.52.79:5000/api";
const SOCKET_URL = "http://100.108.52.79:5000";
const GOOGLE_MAPS_API_KEY = "AIzaSyDZo26RtMEWndm5gPqMO9M2bcCZHOdpqao";

const { width } = Dimensions.get("window");

export default function TrackingDriverScreen({ route, navigation }) {
  const { rideId, userId, driverId, initialStatus } = route.params || {};

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const [tripStatus, setTripStatus] = useState(initialStatus || "accepted"); // accepted, arrived, in_trip, completed
  const [driverLocation, setDriverLocation] = useState(null);
  const [pickupCoords, setPickupCoords] = useState({ latitude: 9.0105, longitude: 38.7935 });
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [driverInfo, setDriverInfo] = useState({
    name: "Captain",
    phone: "",
    plateNumber: "---",
    vehicleModel: "Corridor Vehicle",
    rating: "4.9",
  });

  // 1. Fetch Initial Ride & Driver Details
  useEffect(() => {
    async function fetchRideDetails() {
      try {
        const res = await fetch(`${API_URL}/rides/${rideId}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data?.pickup) {
          setPickupCoords({
            latitude: parseFloat(data.pickup.lat || data.pickup.latitude),
            longitude: parseFloat(data.pickup.lng || data.pickup.longitude),
          });
        }
        if (data?.destination) {
          setDestinationCoords({
            latitude: parseFloat(data.destination.lat || data.destination.latitude),
            longitude: parseFloat(data.destination.lng || data.destination.longitude),
          });
        }
        if (data?.driver) {
          setDriverInfo({
            name: data.driver.full_name || data.driver.name || "Captain",
            phone: data.driver.phone_number || "",
            plateNumber: data.driver.plate_number || "A-12345",
            vehicleModel: data.driver.vehicle_model || "Toyota Vitz",
            rating: data.driver.rating || "4.9",
          });
        }
      } catch (err) {
        console.error("Error loading ride details:", err);
      }
    }

    if (rideId) fetchRideDetails();
  }, [rideId]);

  // 2. Socket Listeners for Driver Movement and Trip Lifecycle
  useEffect(() => {
    socketRef.current = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      socket.emit("register_user_channel", { userId });
      socket.emit("join_ride_room", { rideId, userId });
    });

    // Real-time Driver GPS updates
    socket.on("driver_location_update", (data) => {
      if (data?.latitude && data?.longitude) {
        setDriverLocation({
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          heading: data.heading || 0,
        });
      }
    });

    // Lifecycle Status Changes
    socket.on("driver_arrived", () => setTripStatus("arrived"));
    socket.on("solo_driver_arrived", () => setTripStatus("arrived"));
    socket.on("trip_started", () => setTripStatus("in_trip"));
    socket.on("solo_trip_started", () => setTripStatus("in_trip"));
    
    socket.on("trip_completed", () => {
      setTripStatus("completed");
      Alert.alert("Trip Completed", "You have arrived safely at your destination!", [
        { text: "OK", onPress: () => navigation.navigate("Passenger") }
      ]);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [rideId, userId, navigation]);

  const handleCallDriver = () => {
    if (driverInfo.phone) {
      Linking.openURL(`tel:${driverInfo.phone}`);
    } else {
      Alert.alert("Notice", "Driver phone number unavailable.");
    }
  };

  const activeTargetCoords = tripStatus === "in_trip" ? destinationCoords : pickupCoords;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 🔝 HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate("Passenger")}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {tripStatus === "arrived"
            ? "Captain Arrived"
            : tripStatus === "in_trip"
            ? "Trip In Progress"
            : "Captain En Route"}
        </Text>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>#{rideId || "---"}</Text>
        </View>
      </View>

      {/* 🗺️ MAP ENGINE */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: pickupCoords.latitude,
            longitude: pickupCoords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          showsUserLocation={false}
          showsCompass={false}
        >
          {/* DRIVER CAR MARKER (Emerald Palette) */}
          {driverLocation && (
            <Marker
              coordinate={driverLocation}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={driverLocation.heading || 0}
              flat={true}
            >
              <View style={styles.emeraldCarWrapper}>
                <View style={styles.emeraldCarInnerBubble}>
                  <Ionicons name="navigate" size={17} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}

          {/* PICKUP / TARGET HUB MARKER */}
          <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.royalBlueDestinationHalo}>
              <View style={styles.royalBlueDestinationBadge} />
            </View>
          </Marker>

          {/* DESTINATION MARKER */}
          {destinationCoords && (
            <Marker coordinate={destinationCoords} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.royalBlueDestinationHalo}>
                <View style={styles.royalBlueDestinationBadge} />
              </View>
            </Marker>
          )}

          {/* ROAD ROUTE */}
          {driverLocation && activeTargetCoords && (
            <MapViewDirections
              origin={driverLocation}
              destination={activeTargetCoords}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={4}
              strokeColor="#059669"
            />
          )}
        </MapView>

        {/* FLOATING STATUS BANNER */}
        <View style={styles.persistentBanner}>
          <MaterialCommunityIcons
            name={tripStatus === "arrived" ? "map-marker-check" : "car-connected"}
            size={16}
            color="#059669"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.persistentBannerText}>
            {tripStatus === "arrived"
              ? "Your driver is waiting at the pickup spot"
              : tripStatus === "in_trip"
              ? "Heading to destination"
              : "Driver is on the way to pick you up"}
          </Text>
        </View>
      </View>

      {/* 📄 BOTTOM SHEET DRIVER CARD */}
      <View style={styles.proposalCard}>
        <View style={styles.dragHandleBarArea}>
          <View style={styles.dragHandleIndicator} />
        </View>

        {/* DRIVER INFO ROW */}
        <View style={styles.driverProfileRow}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={22} color="#059669" />
          </View>

          <View style={styles.driverTextGroup}>
            <Text style={styles.driverName}>{driverInfo.name}</Text>
            <Text style={styles.vehicleText}>
              {driverInfo.vehicleModel} • <Text style={styles.plateText}>{driverInfo.plateNumber}</Text>
            </Text>
          </View>

          <TouchableOpacity style={styles.callButton} onPress={handleCallDriver} activeOpacity={0.8}>
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* TRIP PROGRESS BADGES */}
        <View style={styles.statusBadgeRow}>
          <View
            style={[
              styles.statusStep,
              tripStatus === "accepted" && styles.statusStepActive,
            ]}
          >
            <Text
              style={[
                styles.statusStepText,
                tripStatus === "accepted" && styles.statusStepTextActive,
              ]}
            >
              En Route
            </Text>
          </View>

          <View
            style={[
              styles.statusStep,
              tripStatus === "arrived" && styles.statusStepActive,
            ]}
          >
            <Text
              style={[
                styles.statusStepText,
                tripStatus === "arrived" && styles.statusStepTextActive,
              ]}
            >
              Arrived
            </Text>
          </View>

          <View
            style={[
              styles.statusStep,
              tripStatus === "in_trip" && styles.statusStepActive,
            ]}
          >
            <Text
              style={[
                styles.statusStepText,
                tripStatus === "in_trip" && styles.statusStepTextActive,
              ]}
            >
              In Trip
            </Text>
          </View>
        </View>
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
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  headerBadgeText: { fontSize: 11, fontWeight: "700", color: "#059669" },

  mapContainer: { flex: 1 },
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

  driverProfileRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justify: "center",
    marginRight: 12,
  },
  driverTextGroup: { flex: 1 },
  driverName: { fontSize: 16, fontWeight: "700", color: "#111111" },
  vehicleText: { fontSize: 12, color: "#64748B", marginTop: 2 },
  plateText: { fontWeight: "700", color: "#1E293B" },

  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#059669",
    alignItems: "center",
    justify: "center",
  },

  statusBadgeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  statusStep: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  statusStepActive: { backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" },
  statusStepText: { fontSize: 11, fontWeight: "600", color: "#94A3B8" },
  statusStepTextActive: { color: "#059669", fontWeight: "700" },
});