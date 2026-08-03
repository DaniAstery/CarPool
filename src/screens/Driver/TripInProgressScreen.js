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
  Image,
  Linking,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";

const API_BASE_URL = "http://192.168.1.3:5000/api";
const { height } = Dimensions.get("window");

export default function TripInProgressScreen({ navigation, route }) {
  const mapRef = useRef(null);
  const { user } = useAuth();

  // 🔐 1. System Parameters
  const currentDriverId = route?.params?.driverId || user?.id || user?.driver_id || 10;
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";
  const rideOfferId = route?.params?.rideOfferId || route?.params?.rideId || 1;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [rideMetrics, setRideMetrics] = useState(null);

  // 📍 2. Dynamic Map Coordinates
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0115, longitude: 38.7945 });
  const [destinationLocation, setDestinationLocation] = useState({ latitude: 9.0125, longitude: 38.7535 }); 

  // 📡 3. Telemetry Polling Loop
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

        // Update Driver Location
        if (data.driverLocation) {
          setDriverLocation({
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          });
        }

        // Update Destination Dropoff Location
        if (data.destinationLocation) {
          setDestinationLocation({
            latitude: parseFloat(data.destinationLocation.latitude),
            longitude: parseFloat(data.destinationLocation.longitude)
          });
        }

        // Fit map bounds to show trajectory
        if (mapRef.current && data.driverLocation && data.destinationLocation) {
          mapRef.current.fitToCoordinates(
            [
              { latitude: parseFloat(data.driverLocation.latitude), longitude: parseFloat(data.driverLocation.longitude) },
              { latitude: parseFloat(data.destinationLocation.latitude), longitude: parseFloat(data.destinationLocation.longitude) }
            ],
            {
              edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
              animated: true,
            }
          );
        }

        // Parse fully enriched passenger roster
        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p) => ({
            id: parseInt(p.userId || p.user_id || p.id, 10),
            name: p.full_name || p.name || `Rider #${p.userId || p.id}`,
            phone: p.phone_number || "",
            rating: p.rating || "5.00",
            profilePhoto: p.profile_photo_url || "",
            status: (p.status || "in_trip").toLowerCase()
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

  // 📞 Phone Dialer Utility
  const handleCallPassenger = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert("Contact Unavailable", "Passenger has no registered phone number.");
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`);
  };

  // 🏁 Core Action Function: Hits app.post("/api/rides/complete")
  const handleFinishTrip = async () => {
    setSubmitting(true);
    try {
      console.log(`📡 Sending transaction closeout matrix for Driver ID: [${currentDriverId}]`);

      const response = await fetch(`${API_BASE_URL}/rides/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: currentDriverId }),
      });

      const rawText = await response.text();

      if (response.ok) {
        const result = JSON.parse(rawText);
        console.log("🏁 Ledger entry processed successfully on server engine layer.");
        
        const resolvedRideOfferId = result.rideOffer?.id || rideOfferId;

        navigation.replace("TripEarningsSummary", {
          rideOfferId: resolvedRideOfferId,
          routeId: routeId,
          finalPrice: result.finalPrice,
          ridersCount: result.updatedRidersCount
        });
      } else {
        let errorMessage = "Could not finalize transition parameters.";
        try {
          const errObj = JSON.parse(rawText);
          errorMessage = errObj.error || errorMessage;
        } catch (e) {}
        Alert.alert("Execution Error", errorMessage);
      }
    } catch (err) {
      Alert.alert("Network Failure", "Unable to establish communication with backend gateway matrix.");
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
  const totalSeats = rideMetrics?.total_seats || 4;
  const pricePerSeat = parseFloat(rideMetrics?.price_per_seat) || 80;
  const totalEarnings = activeCount * pricePerSeat;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      
      {/* HUD Header Status Block */}
      <View style={styles.headerBlock}>
        <View style={styles.statusBarIndicator}>
          <View style={styles.pulseLiveDot} />
          <Text style={styles.headerTitleText}>Trip In Progress</Text>
        </View>
        <Text style={styles.routeCodeText}>Corridor #{rideMetrics?.route_id || routeId}</Text>
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
          <Marker coordinate={destinationLocation} title={rideMetrics?.destinationName || "Destination Hub"}>
            <View style={styles.destinationMarkerPin}>
              <Ionicons name="flag-sharp" size={12} color="#FFFFFF" />
            </View>
          </Marker>

          {/* Active Driver Moving Car Pin */}
          <Marker coordinate={driverLocation} title="Driver Position">
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
            <MaterialCommunityIcons name="navigation-variant" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.transitStatusBannerText} numberOfLines={1}>
              En-route to: {rideMetrics?.destinationName || "Piassa Transit Terminal"}
            </Text>
          </View>

          {/* Active Passengers Manifest Grid List */}
          <Text style={styles.sectionHeadingLabel}>On-Board Manifest Registry ({activeCount})</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>No active passengers signed into transit registry.</Text>
            ) : (
              passengerStates.map((passenger, index) => (
                <View key={`transit-rider-${passenger.id}-${index}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentityRow}>
                    {passenger.profilePhoto ? (
                      <Image source={{ uri: passenger.profilePhoto }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarWrapperCircle}>
                        <FontAwesome5 name="user" size={11} color="#2563EB" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerNameText} numberOfLines={1}>{passenger.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Text style={styles.passengerRatingText}>{passenger.rating}</Text>
                        {passenger.phone ? (
                          <Text style={styles.passengerPhoneText}> • {passenger.phone}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.passengerRightCluster}>
                    <TouchableOpacity 
                      style={styles.callIconButton} 
                      onPress={() => handleCallPassenger(passenger.phone)}
                    >
                      <Ionicons name="call" size={14} color="#10B981" />
                    </TouchableOpacity>
                    <View style={styles.transitBadgePill}>
                      <Text style={styles.transitBadgePillText}>IN TRIP</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Realtime Ledger Block Balance with Accurate Occupied Seats */}
          <Text style={styles.sectionHeadingLabel}>Live Corridor Balance Ledger</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Active Seats Occupied</Text>
              <Text style={styles.ledgerValue}>{activeCount} / {totalSeats} seats</Text>
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
  transitStatusBannerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", flex: 1 },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 20 },
  emptyManifestText: { paddingVertical: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentityRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  avatarWrapperCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 10 },
  avatarImage: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: "#E5E7EB" },
  passengerNameText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  passengerRatingText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginLeft: 4 },
  passengerPhoneText: { fontSize: 11, color: "#9CA3AF" },
  
  passengerRightCluster: { flexDirection: "row", alignItems: "center" },
  callIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginRight: 8, borderWidth: 1, borderColor: "#A7F3D0" },
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