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
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import io from "socket.io-client";

const API_URL = process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://100.108.52.79:5000/api";

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://100.108.52.79:5000";
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const { width } = Dimensions.get("window");

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

export default function TrackingDriverScreen({ route, navigation }) {
  const { rideId, userId, initialStatus } = route.params || {};

  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const [tripStatus, setTripStatus] = useState(initialStatus || "accepted");
  const [driverLocation, setDriverLocation] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [pickupCoords, setPickupCoords] = useState({ latitude: 9.0105, longitude: 38.7935 });
  const [destinationCoords, setDestinationCoords] = useState(null);
  
  const [tripMetrics, setTripMetrics] = useState({
    destinationName: "Destination",
    price: 0,
    distanceKm: 0,
  });

  const [driverInfo, setDriverInfo] = useState({
    name: "Captain",
    phone: "",
    plateNumber: "3-45678",
    vehicleModel: "Toyota Corolla",
    vehicleColor: "White",
    rating: "5.00",
    bankName: "Commercial Bank of Ethiopia (CBE)",
    bankAccount: "1000847291024",
    telebirrNumber: "251998476704",
  });

  const tripStatusRef = useRef(tripStatus);
  useEffect(() => {
    tripStatusRef.current = tripStatus;
  }, [tripStatus]);

  useEffect(() => {
    let locationSubscriber = null;

    async function startPassengerTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        locationSubscriber = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 3 },
          (loc) => {
            setPassengerLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          }
        );
      } catch (err) {
        console.error("Error watching passenger location:", err);
      }
    }

    startPassengerTracking();
    return () => {
      if (locationSubscriber) locationSubscriber.remove();
    };
  }, []);

  useEffect(() => {
    async function fetchRideDetails() {
      try {
        const res = await fetch(`${API_URL}/rides/${rideId}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if (data?.pickup_lat && data?.pickup_lng) {
          setPickupCoords({ latitude: parseFloat(data.pickup_lat), longitude: parseFloat(data.pickup_lng) });
        }
        if (data?.destination_lat && data?.destination_lng) {
          setDestinationCoords({ latitude: parseFloat(data.destination_lat), longitude: parseFloat(data.destination_lng) });
        }
        if (data?.status) {
          setTripStatus(data.status);
        }
        setTripMetrics({
          destinationName: data.destination_name || "Destination Arrival",
          price: data.price || 0,
          distanceKm: data.distance_km || 0,
        });
        if (data?.driver) {
          setDriverInfo({
            name: data.driver.name || "Captain",
            phone: data.driver.phone_number || "",
            plateNumber: data.driver.plate_number || "3-45678",
            vehicleModel: data.driver.vehicle_model || "Toyota Corolla",
            vehicleColor: data.driver.vehicle_color || "White",
            rating: data.driver.rating || "5.00",
            bankName: data.driver.bank_name || "Commercial Bank of Ethiopia (CBE)",
            bankAccount: data.driver.bank_account_number || "1000847291024",
            telebirrNumber: data.driver.telebirr_number || data.driver.phone_number || "251998476704",
          });
        }
      } catch (err) {
        console.error("Error loading ride details:", err);
      }
    }

    if (rideId) fetchRideDetails();
  }, [rideId]);

  useEffect(() => {
    socketRef.current = io(SOCKET_URL, { transports: ["websocket"], reconnection: true });
    const socket = socketRef.current;

    socket.on("connect", () => {
      if (userId) socket.emit("register_user_channel", { userId });
      if (rideId) socket.emit("join_ride_room", { rideId, userId });
    });

    socket.on("driver_location_update", (data) => {
      if (data?.latitude && data?.longitude) {
        setDriverLocation({
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          heading: data.heading || 0,
        });
      }
    });

    socket.on("ride_status_changed", (data) => {
      if (data?.status && data.status !== tripStatusRef.current) {
        setTripStatus(data.status);
        if (data?.price) setTripMetrics(prev => ({ ...prev, price: data.price }));
      }
    });

    socket.on("solo_ride_status_updated", (data) => {
      if (data?.status && data.status !== tripStatusRef.current) {
        setTripStatus(data.status);
        if (data?.price) setTripMetrics(prev => ({ ...prev, price: data.price }));
      }
    });

    socket.on("trip_completed", (data) => {
      if (tripStatusRef.current !== "completed") {
        setTripStatus("completed");
        if (data?.price) setTripMetrics(prev => ({ ...prev, price: data.price }));
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [rideId, userId]);

  const isArrivedOrInTrip = tripStatus === "arrived" || tripStatus === "in_trip";
  const activeRouteOrigin = isArrivedOrInTrip ? (passengerLocation || pickupCoords) : driverLocation;
  const activeRouteDestination = isArrivedOrInTrip ? (destinationCoords || pickupCoords) : (passengerLocation || pickupCoords);

  useEffect(() => {
    if (mapRef.current && activeRouteOrigin && activeRouteDestination && tripStatus !== "completed") {
      mapRef.current.fitToCoordinates([activeRouteOrigin, activeRouteDestination], {
        edgePadding: { top: 120, right: 60, bottom: 320, left: 60 },
        animated: true,
      });
    }
  }, [activeRouteOrigin?.latitude, activeRouteDestination?.latitude, tripStatus]);

  const handleCallDriver = () => {
    if (driverInfo.phone) {
      Linking.openURL(`tel:${driverInfo.phone}`);
    } else {
      Alert.alert("Notice", "Driver phone number unavailable.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 🔝 HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate("Passenger")}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {tripStatus === "completed"
            ? "Trip Receipt & Payment"
            : tripStatus === "arrived"
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
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: pickupCoords.latitude,
            longitude: pickupCoords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          customMapStyle={cleanMinimalMapStyle}
          showsUserLocation={true}
          showsMyLocationButton={true}
          showsCompass={false}
        >
          {driverLocation && tripStatus !== "completed" && (
            <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }} rotation={driverLocation.heading || 0} flat={true}>
              <View style={styles.emeraldCarWrapper}>
                <View style={styles.emeraldCarInnerBubble}>
                  <Ionicons name="navigate" size={17} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}

          <Marker coordinate={pickupCoords} anchor={{ x: 0.5, y: 0.5 }} title="Pickup">
            <View style={styles.royalBlueDestinationHalo}>
              <View style={styles.royalBlueDestinationBadge} />
            </View>
          </Marker>

          {destinationCoords && (
            <Marker coordinate={destinationCoords} anchor={{ x: 0.5, y: 0.5 }} title="Destination">
              <View style={[styles.royalBlueDestinationHalo, { backgroundColor: "rgba(239, 68, 68, 0.2)" }]}>
                <View style={[styles.royalBlueDestinationBadge, { backgroundColor: "#EF4444" }]} />
              </View>
            </Marker>
          )}

          {activeRouteOrigin && activeRouteDestination && tripStatus !== "completed" && (
            <MapViewDirections
              origin={activeRouteOrigin}
              destination={activeRouteDestination}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={5}
              strokeColor="#111827"
              geodesic={true}
            />
          )}
        </MapView>

        {tripStatus !== "completed" && (
          <View style={styles.persistentBanner}>
            <MaterialCommunityIcons name="car-connected" size={16} color="#059669" style={{ marginRight: 6 }} />
            <Text style={styles.persistentBannerText}>
              {tripStatus === "arrived" ? "Your driver has arrived!" : tripStatus === "in_trip" ? "Trip in progress" : "Driver on the way"}
            </Text>
          </View>
        )}
      </View>

      {/* 📄 BOTTOM SHEET CARD */}
      <View style={styles.proposalCard}>
        <View style={styles.dragHandleBarArea}>
          <View style={styles.dragHandleIndicator} />
        </View>

        {tripStatus === "completed" ? (
          /* ✨ UNIFIED TRIP RECEIPT & DRIVER PAYMENT DETAILS */
          <View style={styles.completionContainer}>
            <View style={styles.successCheckCircle}>
              <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.completionTitle}>Trip Completed Successfully</Text>
            <Text style={styles.completionSubText}>{tripMetrics.destinationName}</Text>

            {/* FARE & VEHICLE SUMMARY BOX */}
            <View style={styles.receiptCardBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Vehicle</Text>
                <Text style={styles.receiptValue}>{driverInfo.vehicleModel} ({driverInfo.vehicleColor})</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Plate Number</Text>
                <Text style={styles.receiptValue}>{driverInfo.plateNumber}</Text>
              </View>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Total Distance</Text>
                <Text style={styles.receiptValue}>{tripMetrics.distanceKm} km</Text>
              </View>
              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Total Fare Due</Text>
                <Text style={styles.receiptPriceHighlight}>{tripMetrics.price} ETB</Text>
              </View>
            </View>

            {/* 💳 DRIVER PAYMENT ACCOUNTS SECTION */}
            <View style={styles.paymentBox}>
              <Text style={styles.paymentBoxTitle}>Pay Driver Via</Text>
              
              <View style={styles.paymentRow}>
                <View style={styles.paymentMethodInfo}>
                  <MaterialCommunityIcons name="cellphone-wireless" size={16} color="#059669" />
                  <Text style={styles.paymentMethodLabel}>Telebirr</Text>
                </View>
                <Text style={styles.paymentMethodValue}>{driverInfo.telebirrNumber}</Text>
              </View>

              <View style={styles.paymentDivider} />

              <View style={styles.paymentRow}>
                <View style={styles.paymentMethodInfo}>
                  <Ionicons name="business-outline" size={16} color="#3B82F6" />
                  <Text style={styles.paymentMethodLabel}>Bank Transfer</Text>
                </View>
                <Text style={styles.paymentMethodValue}>{driverInfo.bankAccount}</Text>
              </View>
              <Text style={styles.bankNameSubText}>{driverInfo.bankName}</Text>
            </View>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => navigation.navigate("Passenger")}
              activeOpacity={0.85}
            >
              <Text style={styles.doneButtonText}>Done / Return to Map</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ACTIVE DRIVER & STATUS ROW */
          <>
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

            <View style={styles.statusBadgeRow}>
              <View style={[styles.statusStep, tripStatus === "accepted" && styles.statusStepActive]}>
                <Text style={[styles.statusStepText, tripStatus === "accepted" && styles.statusStepTextActive]}>En Route</Text>
              </View>
              <View style={[styles.statusStep, tripStatus === "arrived" && styles.statusStepActive]}>
                <Text style={[styles.statusStepText, tripStatus === "arrived" && styles.statusStepTextActive]}>Arrived</Text>
              </View>
              <View style={[styles.statusStep, tripStatus === "in_trip" && styles.statusStepActive]}>
                <Text style={[styles.statusStepText, tripStatus === "in_trip" && styles.statusStepTextActive]}>In Trip</Text>
              </View>
            </View>
          </>
        )}
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
    justifyContent: "space-between",
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
    justifyContent: "center",
    alignItems: "center",
  },
  emeraldCarInnerBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
  },
  royalBlueDestinationHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    justifyContent: "center",
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
  dragHandleBarArea: { paddingVertical: 8, alignItems: "center" },
  dragHandleIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1" },

  driverProfileRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
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
    justifyContent: "center",
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

  // Completion Receipt & Payment Styling
  completionContainer: { alignItems: "center", paddingBottom: 10 },
  successCheckCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  completionTitle: { fontSize: 15, fontWeight: "800", color: "#111111", marginBottom: 2 },
  completionSubText: { fontSize: 11, color: "#64748B", textAlign: "center", marginBottom: 10 },
  
  receiptCardBox: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
  },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  receiptDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 6 },
  receiptLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  receiptValue: { fontSize: 12, color: "#1E293B", fontWeight: "700" },
  receiptPriceHighlight: { fontSize: 15, color: "#059669", fontWeight: "800" },

  // Payment Options Box
  paymentBox: {
    width: "100%",
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 12,
  },
  paymentBoxTitle: { fontSize: 11, fontWeight: "700", color: "#047857", marginBottom: 6 },
  paymentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 2 },
  paymentMethodInfo: { flexDirection: "row", alignItems: "center" },
  paymentMethodLabel: { fontSize: 12, fontWeight: "600", color: "#1E293B", marginLeft: 6 },
  paymentMethodValue: { fontSize: 12, fontWeight: "700", color: "#0F172A" },
  paymentDivider: { height: 1, backgroundColor: "#DCFCE7", marginVertical: 4 },
  bankNameSubText: { fontSize: 10, color: "#64748B", marginTop: 2, textAlign: "right", fontStyle: "italic" },

  doneButton: {
    width: "100%",
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    elevation: 2,
  },
  doneButtonText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});