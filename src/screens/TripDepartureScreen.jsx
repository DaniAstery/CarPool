import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const API_URL = "http://192.168.163.52:5000/api";

export default function TripInProgressScreen({ navigation, route }) {
  // Extract parameters passed safely from our core routing gatekeeper layer
  const userId = route?.params?.userId || 1;
  const initialRideOfferId = route?.params?.rideOfferId;

  // Structural Core States
  const [loading, setLoading] = useState(true);
  const [tripStatus, setTripStatus] = useState("in_trip"); // Tracks live backend route_pool array indices
  const [rideDetails, setRideDetails] = useState({
    corridor: "Loading Corridor Axis...",
    driverName: "Assigning...",
    vehicleInfo: "Syncing asset registration...",
    driverRating: "5.0",
    fixedPrice: 150,
    coRidersCount: 0,
    carLat: 9.0115,
    carLng: 38.7945,
    pickupLat: 9.0115,
    pickupLng: 38.7945,
    dropoffLat: 8.9985,
    dropoffLng: 38.7855,
  });

  const [pulseAnim] = useState(new Animated.Value(0));
  const mapRef = useRef(null);

  // 1. INFINITE BANNER PULSE ANIMATION
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // 2. LIVE DATA STREAM SUBSCRIPTION (POLLING LOOP)
  useEffect(() => {
    let isMounted = true;

    async function streamLiveTripMetrics() {
      try {
        // Step A: Read pure passenger status to follow lifecycle synchronization closely
        const statusRes = await fetch(`${API_URL}/passenger/status/${userId}`);
        if (!statusRes.ok) throw new Error("Status polling error.");
        const statusData = await statusRes.json();

        if (isMounted && statusData) {
          setTripStatus(statusData.status); // Dynamically shifts from 'in_trip' -> 'completed'
          
          // Use the active matching offer reference returned dynamically by the passenger state
          const activeOfferId = statusData.matched_ride_offer_id || initialRideOfferId;
          
          if (activeOfferId) {
            // Step B: Query the deep passenger tracking stream layer for coordinates & asset values
            const trackRes = await fetch(`${API_URL}/rides/passenger-track/${activeOfferId}/user/${userId}`);
            if (trackRes.ok) {
              const trackData = await trackRes.json();
              
              setRideDetails({
                corridor: trackData.corridor || "Transit Axis Corridor",
                driverName: trackData.driverName || "Dawit Mengistu",
                vehicleInfo: trackData.vehicleInfo || "Toyota Probox • Code 3",
                driverRating: trackData.driverRating || "4.9",
                fixedPrice: trackData.finalPrice || statusData.finalPrice || 80,
                coRidersCount: Array.isArray(trackData.passengers) ? trackData.passengers.length : 1,
                carLat: parseFloat(trackData.carLatitude) || 9.0115,
                carLng: parseFloat(trackData.carLongitude) || 38.7945,
                pickupLat: parseFloat(trackData.pickupLatitude) || 9.0115,
                pickupLng: parseFloat(trackData.pickupLongitude) || 38.7945,
                dropoffLat: parseFloat(trackData.dropoffLatitude) || 8.9985,
                dropoffLng: parseFloat(trackData.dropoffLongitude) || 38.7855,
              });
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.log("⚠️ Error loading real-time data metrics stream:", err);
      }
    }

    streamLiveTripMetrics();
    const syncInterval = setInterval(streamLiveTripMetrics, 4000); // Poll live telemetry every 4 seconds

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, [userId, initialRideOfferId]);

  // 3. SECURE CHECKOUT HANDLER
 const handlePaymentCheckout = async () => {
  try {
    console.log(`🚀 Navigating to Payment Checkout screen for user ${userId}. Total: ETB ${rideDetails.fixedPrice}`);
    
    // Replace the current screen in the stack with the dedicated payment layout
    navigation.replace("TripPayment", { 
      userId: userId, 
      fixedPrice: rideDetails.fixedPrice, 
      corridor: rideDetails.corridor 
    });
    
  } catch (payError) {
    console.error("❌ Failed to hand off variables to TripPaymentScreen:", payError);
    Alert.alert("Checkout Disconnect", "Unable to establish secure gateway navigation context.");
  }
};

  // Interpolation variables for animations
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.0] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.2, 0] });

  if (loading) {
    return (
      <View style={styles.fallbackLoadingBox}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.fallbackLoadingText}>Connecting live tracking telemetry...</Text>
      </View>
    );
  }

  const isTripFinished = tripStatus === "completed";

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Top Banner Theme adapts based on Trip lifecycle */}
      <View style={[styles.statusBarBanner, isTripFinished && styles.bannerFinishedBg]}>
        <View style={styles.statusIndicatorWrapper}>
          {!isTripFinished && (
            <Animated.View style={[styles.statusPulseWave, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }] } />
          )}
          <View style={[styles.statusCenterCoreDot, isTripFinished && styles.coreDotFinishedBg]}>
            <FontAwesome5 name={isTripFinished ? "check-circle" : "car-side"} size={11} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>
            {isTripFinished ? "Arrived safely at Destination" : "Transit Active"}
          </Text>
          <Text style={styles.statusSecondaryText}>
            {isTripFinished ? "Thank you for riding shared corridor loops." : "En-route along optimized corridor transit path"}
          </Text>
        </View>
      </View>

      {/* Real Interactive Map Layout */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: rideDetails.carLat,
            longitude: rideDetails.carLng,
            latitudeDelta: 0.022,
            longitudeDelta: 0.022,
          }}
          customMapStyle={cleanMinimalMapStyle}
        >
          {/* Main Corridor Polyline Routing Node Array */}
          <Polyline
            coordinates={[
              { latitude: rideDetails.pickupLat, longitude: rideDetails.pickupLng },
              { latitude: rideDetails.dropoffLat, longitude: rideDetails.dropoffLng }
            ]}
            strokeColor={isTripFinished ? "#6B7280" : "#10B981"}
            strokeWidth={5}
          />

          {/* Pickup Hub Marker */}
          <Marker coordinate={{ latitude: rideDetails.pickupLat, longitude: rideDetails.pickupLng }}>
            <View style={styles.originMarkerPoint} />
          </Marker>

          {/* Target Drop-off Hub Terminal Marker */}
          <Marker coordinate={{ latitude: rideDetails.dropoffLat, longitude: rideDetails.dropoffLng }}>
            <View style={styles.destinationMarkerWrapper}>
              <View style={styles.destinationMarkerPin}>
                <Ionicons name="location-sharp" size={14} color="#FFFFFF" />
              </View>
            </View>
          </Marker>

          {/* Active Car position tracker rendered dynamically */}
          {!isTripFinished && (
            <Marker coordinate={{ latitude: rideDetails.carLat, longitude: rideDetails.carLng }}>
              <View style={styles.activeCarWrapper}>
                <FontAwesome5 name="car" size={14} color="#FFFFFF" />
              </View>
            </Marker>
          )}
        </MapView>
      </View>

      {/* Sliding Trip Context Information Sheet Drawer */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.transitSummaryHeader}>
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>STATUS INDEX</Text>
              <Text style={[styles.metricValueHighlight, isTripFinished && { color: "#10B981" }]}>
                {isTripFinished ? "COMPLETED" : "EN-ROUTE"}
              </Text>
            </View>
            <View style={styles.verticalSplitter} />
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>FIXED TRANSIT COST</Text>
              <Text style={styles.metricValueHighlight}>ETB {rideDetails.fixedPrice}</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Pool Information</Text>

          {/* Driver Identity Card */}
          <View style={styles.driverProfileCard}>
            <View style={styles.avatarHolder}>
              <FontAwesome5 name="user-check" size={16} color="#059669" />
            </View>
            <View style={styles.driverIdentityMeta}>
              <Text style={styles.driverName}>{rideDetails.driverName}</Text>
              <Text style={styles.vehicleDetails}>{rideDetails.vehicleInfo}</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>{rideDetails.driverRating}</Text>
            </View>
          </View>

          {/* Shared Corridor Real Data Manifest Block */}
          <View style={styles.manifestContainerCard}>
            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="git-commit-outline" size={18} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Corridor Axis</Text>
              </View>
              <Text style={styles.manifestValueText}>{rideDetails.corridor}</Text>
            </View>
            
            <View style={styles.horizontalLineDivider} />

            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="people-sharp" size={16} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Verified Manifest</Text>
              </View>
              <Text style={styles.manifestValueText}>{rideDetails.coRidersCount} Passengers on board</Text>
            </View>

            <View style={styles.horizontalLineDivider} />

            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="wallet-sharp" size={16} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Split Rate Billing</Text>
              </View>
              <Text style={[styles.manifestValueText, { color: "#10B981", fontWeight: "700" }]}>
                ETB {rideDetails.fixedPrice} Fixed
              </Text>
            </View>
          </View>

          {/* 🎯 PRODUCTION CONTEXT ACTION BUTTON */}
          {isTripFinished ? (
            <TouchableOpacity 
              style={[styles.actionButton, styles.paymentButtonBg]}
              activeOpacity={0.85}
              onPress={handlePaymentCheckout}
            >
              <View style={styles.buttonInternalGroup}>
                <Ionicons name="wallet" size={18} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>PAY ETB {rideDetails.fixedPrice}.00 NOW</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.actionButton, styles.disabledButtonBg]}>
              <View style={styles.buttonInternalGroup}>
                <ActivityIndicator size="small" color="#9CA3AF" style={{ marginRight: 8 }} />
                <Text style={[styles.actionButtonText, { color: "#9CA3AF" }]}>TRIP IN PROGRESS...</Text>
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D2E4F9" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  fallbackLoadingBox: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  fallbackLoadingText: { marginTop: 12, color: "#4B5563", fontWeight: "600", fontSize: 14 },
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  bannerFinishedBg: { backgroundColor: "#1F2937" },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusPulseWave: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", zIndex: 2 },
  coreDotFinishedBg: { backgroundColor: "#10B981" },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  originMarkerPoint: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#9CA3AF", borderWidth: 2, borderColor: "#FFFFFF" },
  destinationMarkerWrapper: { justifyContent: "center", alignItems: "center" },
  destinationMarkerPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  activeCarWrapper: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  slidingPanelDrawer: { position: "absolute", bottom: 0, width: width, maxHeight: "50%", backgroundColor: "#F9FAFB", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20, borderWidth: 1, borderColor: "#E5E7EB" },
  transitSummaryHeader: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 14, marginBottom: 16 },
  metricColumn: { flex: 1, alignItems: "center", justifyContent: "center" },
  verticalSplitter: { width: 1, backgroundColor: "#E5E7EB" },
  metricLabel: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  metricValueHighlight: { fontSize: 18, fontWeight: "800", color: "#111111", marginTop: 4 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  driverProfileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 10 },
  avatarHolder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  driverIdentityMeta: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 14, fontWeight: "700", color: "#111111" },
  vehicleDetails: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#D97706", marginLeft: 4 },
  manifestContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 18 },
  manifestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  leftLabelCluster: { flexDirection: "row", alignItems: "center" },
  manifestRouteLabel: { fontSize: 13, color: "#4B5563", marginLeft: 10 },
  manifestValueText: { fontSize: 13, fontWeight: "600", color: "#111111" },
  horizontalLineDivider: { height: 1, backgroundColor: "#F3F4F6" },
  actionButton: { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  paymentButtonBg: { backgroundColor: "#10B981" },
  disabledButtonBg: { backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#D1D5DB" },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", marginLeft: 8, letterSpacing: 0.5 },
});