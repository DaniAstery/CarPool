import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const API_BASE_URL = "http://192.168.1.3:5000/api";
const { height } = Dimensions.get("window");

export default function TripInProgressScreen({ navigation, route }) {
  const mapRef = useRef(null);

  // Inherit route properties from the stack context parameters
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";
  const rideOfferId = route?.params?.rideOfferId || route?.params?.rideId || 1;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);

  // Default coordinate path markers (Staging Megenagna -> Piassa Transit)
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0115, longitude: 38.7945 });
  const destinationLocation = { latitude: 9.0125, longitude: 38.7535 }; 

  // 📡 Telemetry Loop: Poll the live manifest endpoint to update location and rider statuses
  useEffect(() => {
    let isMounted = true;
    console.log(`🚗 Transit tracking telemetry initialized for Corridor Offer ID: [${rideOfferId}]`);

    async function pollLiveTransitData() {
      try {
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${rideOfferId}`);
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);

        // Map live moving driver coordinates from backend tracking
        if (data.driverLocation) {
          const newDriverLoc = {
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          };
          setDriverLocation(newDriverLoc);

          if (mapRef.current) {
            mapRef.current.fitToCoordinates([newDriverLoc, destinationLocation], {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: true,
            });
          }
        }

        // Map active users on-board
        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p) => ({
            id: parseInt(p.userId || p.user_id || p.id, 10),
            name: p.name || `Rider #${p.userId || p.id}`,
            status: (p.status || "in-progress").toLowerCase()
          }));
          setPassengerStates(parsedPassengers);
        }
        
        setLoading(false);
      } catch (err) {
        console.log("Transit system tracking reading error:", err);
        if (isMounted) setLoading(false);
      }
    }

    pollLiveTransitData();
    const transitInterval = setInterval(pollLiveTransitData, 3000);

    return () => {
      isMounted = false;
      clearInterval(transitInterval);
    };
  }, [rideOfferId]);

  // 🏁 Core Action Function: Hits app.post("/api/rides/complete")
  const handleFinishTrip = async () => {
    setSubmitting(true);
    try {
      console.log(`📡 Sending transaction closeout matrix for Driver ID: [${driverId}]`);

      const response = await fetch(`${API_BASE_URL}/rides/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: driverId }), // Switched from ride_offer_id to driver_id
      });

      // Safely grab text payload to verify if we hit HTML or valid JSON data signatures
      const rawText = await response.text();

      if (response.ok) {
        const result = JSON.parse(rawText);
        console.log("🏁 Ledger entry processed successfully on server engine layer.");
        
        // Extract the resolved ride offer ID from backend response safely
        const resolvedRideOfferId = result.rideOffer?.id || rideOfferId;

        // Push driver smoothly onto the earnings breakdown view screen card
        navigation.replace("TripEarningsSummary", {
          rideOfferId: resolvedRideOfferId,
          routeId: routeId,
          finalPrice: result.finalPrice,
          ridersCount: result.updatedRidersCount
        });
      } else {
        let errorMessage = "Could not finalize transition parameters.";
        if (rawText.startsWith("<")) {
          console.error("🛑 HTML Crash layout caught:", rawText.slice(0, 300));
          errorMessage = `Server processing fault [Status ${response.status}]. Check backend logs.`;
        } else {
          try {
            const errObj = JSON.parse(rawText);
            errorMessage = errObj.error || errorMessage;
          } catch (e) {}
        }
        Alert.alert("Execution Error", errorMessage);
      }
    } catch (err) {
      Alert.alert("Network Failure", "Unable to establish communication with the backend gateway matrix.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing Live Transit Matrix HUD...</Text>
      </View>
    );
  }

  const activeCount = passengerStates.length;
  const pricePerSeat = parseFloat(rideMetrics?.price_per_seat) || 100;
  const totalEarnings = activeCount * pricePerSeat;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      
      {/* HUD Header Status Block */}
      <View style={styles.headerBlock}>
        <View style={styles.statusBarIndicator}>
          <View style={styles.pulseLiveDot} />
          <Text style={styles.headerTitleText}>Trip In Progress</Text>
        </View>
        <Text style={styles.routeCodeText}>Corridor #CR-{routeId}</Text>
      </View>

      {/* Live Map Canvas Component */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            ...driverLocation,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          customMapStyle={transitMapStyle}
        >
          {/* Destination Dropoff Station Terminal Pin */}
          <Marker coordinate={destinationLocation}>
            <View style={styles.destinationMarkerPin}>
              <Ionicons name="flag-sharp" size={12} color="#FFFFFF" />
            </View>
          </Marker>

          {/* Active Driver Moving Car Pin */}
          <Marker coordinate={driverLocation}>
            <View style={styles.movingCarMarkerPin}>
              <FontAwesome5 name="car-side" size={12} color="#FFFFFF" />
            </View>
          </Marker>

          {/* Live Path Directional Vector Polyline Line */}
          <Polyline
            coordinates={[driverLocation, destinationLocation]}
            strokeColor="#3B82F6"
            strokeWidth={5}
            geodesic={true}
          />
        </MapView>
      </View>

      {/* Passenger Operations Drawer Dashboard Sheet */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.transitStatusBanner}>
            <MaterialCommunityIcons name="bus-clock" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.transitStatusBannerText}>
              En-route to drop-off station hub terminals
            </Text>
          </View>

          {/* Active Passengers Manifest Grid List */}
          <Text style={styles.sectionHeadingLabel}>On-Board Manifest Registry</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>No active passengers signed into transit registry layout arrays.</Text>
            ) : (
              passengerStates.map((passenger, index) => (
                <View key={`transit-rider-${passenger.id}-${index}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentityRow}>
                    <View style={styles.avatarWrapperCircle}>
                      <FontAwesome5 name="user-friends" size={11} color="#2563EB" />
                    </View>
                    <Text style={styles.passengerNameText}>{passenger.name}</Text>
                  </View>
                  
                  <View style={styles.transitBadgePill}>
                    <Text style={styles.transitBadgePillText}>TRANSIT</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Realtime Ledger Ledger Block Balance */}
          <Text style={styles.sectionHeadingLabel}>Live Corridor Balance Ledger</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Active Seats Occupied</Text>
              <Text style={styles.ledgerValue}>{activeCount} / 4 seats</Text>
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Est. Payout Value</Text>
              <Text style={styles.driverGainValue}>ETB {totalEarnings.toFixed(2)}</Text>
            </View>
          </View>

        </ScrollView>
      </View>

      {/* Persistent Bottom Finish Action Trigger Call Button Block */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={[styles.actionCTAButton, submitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={submitting}
          onPress={handleFinishTrip}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.actionCTAButtonText}>FINISH CORRIDOR TRIP</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const transitMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },
  
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", zIndex: 10 },
  statusBarIndicator: { flexDirection: "row", alignItems: "center" },
  pulseLiveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 8 },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  routeCodeText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  
  mapContainer: { height: height * 0.28, backgroundColor: "#E5E7EB" },
  destinationMarkerPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  movingCarMarkerPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#3B82F6", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  
  slidingPanelDrawer: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, borderWidth: 1, borderColor: "#E5E7EB", marginTop: -12 },
  transitStatusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#3B82F6", borderRadius: 10, padding: 12, marginBottom: 20 },
  transitStatusBannerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 },
  emptyManifestText: { paddingVertical: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentityRow: { flexDirection: "row", alignItems: "center" },
  avatarWrapperCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 10 },
  passengerNameText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  transitBadgePill: { backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE" },
  transitBadgePillText: { color: "#2563EB", fontSize: 10, fontWeight: "700" },
  
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 20 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  driverGainValue: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  actionCTAButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionCTAButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 }
});