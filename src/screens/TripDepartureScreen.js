import React, { useEffect, useState, useRef, memo } from "react";
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
  Pressable,
  BackHandler,
  Platform,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");
const API_URL = "http://192.168.1.3:5000/api";

const DEFAULT_COORDS = {
  latitude: 9.0115,
  longitude: 38.7945,
};

// ------------------------------------------------------------------
// MEMOIZED UBER-STYLE TRIP MAP
// ------------------------------------------------------------------
const MemoizedTripMap = memo(({ rideDetails, isTripFinished, mapRef }) => {
  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFillObject}
      initialRegion={{
        ...DEFAULT_COORDS,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
      customMapStyle={cleanMinimalMapStyle}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
    >
      {/* 🛣️ 1. Traveled Route Segment (Gray / Completed) */}
      {!isTripFinished && rideDetails.carLat && rideDetails.carLng && (
        <Polyline
          coordinates={[
            { latitude: rideDetails.pickupLat, longitude: rideDetails.pickupLng },
            { latitude: rideDetails.carLat, longitude: rideDetails.carLng },
          ]}
          strokeColor="#9CA3AF"
          strokeWidth={4}
          geodesic={true}
        />
      )}

      {/* 🛣️ 2. Remaining Route Segment (Emerald Green / Active Path) */}
      <Polyline
        coordinates={[
          isTripFinished || !rideDetails.carLat 
            ? { latitude: rideDetails.pickupLat, longitude: rideDetails.pickupLng } 
            : { latitude: rideDetails.carLat, longitude: rideDetails.carLng },
          { latitude: rideDetails.dropoffLat, longitude: rideDetails.dropoffLng },
        ]}
        strokeColor={isTripFinished ? "#9CA3AF" : "#059669"}
        strokeWidth={5}
        geodesic={true}
      />

      {/* 📍 Origin / Pickup Marker */}
      <Marker
        coordinate={{ latitude: rideDetails.pickupLat, longitude: rideDetails.pickupLng }}
        tracksViewChanges={false}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        <View style={styles.originMarkerPoint} />
      </Marker>

      {/* 🏁 Destination Marker */}
      <Marker
        coordinate={{ latitude: rideDetails.dropoffLat, longitude: rideDetails.dropoffLng }}
        tracksViewChanges={false}
        anchor={{ x: 0.5, y: 1 }}
      >
        <View style={styles.destinationMarkerContainer}>
          <View style={styles.destinationPinBubble}>
            <Ionicons name="flag" size={12} color="#FFFFFF" />
          </View>
          <View style={styles.destinationPinTip} />
        </View>
      </Marker>

      {/* 🚗 Active Moving Vehicle Marker */}
      {!isTripFinished && rideDetails.carLat && rideDetails.carLng && (
        <Marker
          coordinate={{ latitude: rideDetails.carLat, longitude: rideDetails.carLng }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={999}
          tracksViewChanges={false}
          rotation={rideDetails.carHeading || 0}
        >
          <View style={styles.activeCarWrapper}>
            <View style={styles.carInnerBubble}>
              <FontAwesome5 name="car-side" size={13} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}
    </MapView>
  );
});

export default function TripInProgressScreen({ navigation, route }) {
  const userId = route?.params?.userId || 1;
  const initialRideOfferId = route?.params?.rideOfferId;

  // Core States
  const [loading, setLoading] = useState(true);
  const [tripStatus, setTripStatus] = useState("in_trip");
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [rideDetails, setRideDetails] = useState({
    corridor: "Loading Corridor Axis...",
    driverName: "Assigning Driver...",
    vehicleInfo: "Syncing vehicle registration...",
    driverRating: "5.0",
    fixedPrice: 150,
    coRiders: [],
    carLat: DEFAULT_COORDS.latitude,
    carLng: DEFAULT_COORDS.longitude,
    carHeading: 0,
    pickupLat: DEFAULT_COORDS.latitude,
    pickupLng: DEFAULT_COORDS.longitude,
    dropoffLat: 8.9985,
    dropoffLng: 38.7855,
    etaMinutes: "--",
    distanceRemainingKm: "--",
  });

  const [pulseAnim] = useState(new Animated.Value(0));
  const mapRef = useRef(null);
  const hasInitializedCamera = useRef(false);

  const isTripFinished = tripStatus === "completed";

  // 1. DISABLE ANDROID BACK BUTTON COMPLETELY DURING TRIP/CHECKOUT
  useEffect(() => {
    const backAction = () => {
      // Returning true blocks the default back button action
      return true;
    };

    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  // 2. AUTO-EXPAND DRAWER WHEN TRIP FINISHES
  useEffect(() => {
    if (isTripFinished) {
      setIsDrawerExpanded(true);
    }
  }, [isTripFinished]);

  // 3. INFINITE BANNER PULSE ANIMATION
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim]);

  // 4. LIVE TELEMETRY & POLLING LOOP
  useEffect(() => {
    let isMounted = true;

    async function streamLiveTripMetrics() {
      try {
        const statusRes = await fetch(`${API_URL}/passenger-livetracking/status/${userId}`);
        if (!statusRes.ok) throw new Error("Status polling error.");
        const statusData = await statusRes.json();

        if (isMounted && statusData) {
          setTripStatus(statusData.status);
          const activeOfferId = statusData.matched_ride_offer_id || initialRideOfferId;

          if (activeOfferId) {
            const trackRes = await fetch(
              `${API_URL}/rides/passenger-track/${activeOfferId}/user/${userId}`
            );
            if (trackRes.ok) {
              const trackData = await trackRes.json();
              const rawPassengers = Array.isArray(trackData.passengers) ? trackData.passengers : [];
              
              const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
              const formattedCoRiders = rawPassengers.map((p, idx) => ({
                id: p.user_id || idx,
                name: p.full_name || p.name || `Rider ${p.user_id || idx}`,
                color: colorPalette[idx % colorPalette.length],
              }));

              const newCarLat = parseFloat(trackData.carLatitude) || DEFAULT_COORDS.latitude;
              const newCarLng = parseFloat(trackData.carLongitude) || DEFAULT_COORDS.longitude;
              const newDropoffLat = parseFloat(trackData.dropoffLatitude) || 8.9985;
              const newDropoffLng = parseFloat(trackData.dropoffLongitude) || 38.7855;

              setRideDetails({
                corridor: trackData.corridor || "Transit Axis Corridor",
                driverName: trackData.driverName || "Driver Assigned",
                vehicleInfo: trackData.vehicleInfo || "Vehicle Syncing...",
                driverRating: trackData.driverRating || "4.9",
                fixedPrice: trackData.finalPrice || statusData.finalPrice || 80,
                coRiders: formattedCoRiders,
                carLat: newCarLat,
                carLng: newCarLng,
                carHeading: trackData.heading || 0,
                pickupLat: parseFloat(trackData.pickupLatitude) || DEFAULT_COORDS.latitude,
                pickupLng: parseFloat(trackData.pickupLongitude) || DEFAULT_COORDS.longitude,
                dropoffLat: newDropoffLat,
                dropoffLng: newDropoffLng,
                etaMinutes: trackData.etaMinutes ?? "--",
                distanceRemainingKm: trackData.distanceRemainingKm ?? "--",
              });

              // 🎥 Dynamic Camera Tracking with Viewport Padding Offset
              if (mapRef.current) {
                const bottomPaddingOffset = isDrawerExpanded ? height * 0.45 : height * 0.22;
                if (!hasInitializedCamera.current) {
                  try {
                    mapRef.current.fitToCoordinates(
                      [
                        { latitude: newCarLat, longitude: newCarLng },
                        { latitude: newDropoffLat, longitude: newDropoffLng }
                      ],
                      {
                        edgePadding: { top: 80, right: 50, bottom: bottomPaddingOffset, left: 50 },
                        animated: true,
                      }
                    );
                    hasInitializedCamera.current = true;
                  } catch (e) {}
                } else {
                  try {
                    mapRef.current.animateCamera(
                      {
                        center: { latitude: newCarLat, longitude: newCarLng },
                        zoom: 15.5,
                        pitch: 25,
                      },
                      { duration: 1000 }
                    );
                  } catch (e) {}
                }
              }
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.log("⚠️ Error loading real-time telemetry stream:", err);
      }
    }

    streamLiveTripMetrics();
    const syncInterval = setInterval(streamLiveTripMetrics, 3500);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, [userId, initialRideOfferId, isDrawerExpanded]);

  // 5. CHECKOUT HANDLER
  const handlePaymentCheckout = async () => {
    try {
      navigation.replace("TripPayment", {
        userId: userId,
        fixedPrice: rideDetails.fixedPrice,
        corridor: rideDetails.corridor,
      });
    } catch (payError) {
      Alert.alert("Checkout Disconnect", "Unable to establish secure gateway navigation context.");
    }
  };

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.0] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.2, 0] });

  if (loading) {
    return (
      <View style={styles.fallbackLoadingBox}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.fallbackLoadingText}>Connecting live tracking telemetry...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. TOP BANNER STATUS BAR */}
      <View style={[styles.statusBarBanner, isTripFinished && styles.bannerFinishedBg]}>
        <View style={styles.statusIndicatorWrapper}>
          {!isTripFinished && (
            <Animated.View style={[styles.statusPulseWave, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
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
            {isTripFinished
              ? "Thank you for riding shared corridor loops."
              : `ETA: ${rideDetails.etaMinutes} mins • ${rideDetails.distanceRemainingKm} km remaining`}
          </Text>
        </View>
      </View>

      {/* 2. UBER-STYLE PRODUCTION MAP */}
      <View style={styles.mapContainer}>
        <MemoizedTripMap rideDetails={rideDetails} isTripFinished={isTripFinished} mapRef={mapRef} />
      </View>

      {/* 3. COLLAPSIBLE SLIDING INFORMATION DRAWER WITH SAFE ANDROID BOTTOM INSETS */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        {/* Drag Handle & Header Tap Area to Toggle Expansion */}
        <Pressable 
          style={styles.dragHandleContainer} 
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.drawerHeaderPreview}>
            <View style={styles.previewLeftCluster}>
              <FontAwesome5 name="car-side" size={14} color="#059669" />
              <Text style={styles.previewTitleText}>
                {isTripFinished ? "Trip Completed • Tap to Pay" : `${rideDetails.etaMinutes} mins to destination`}
              </Text>
            </View>
            <View style={styles.expandToggleBadge}>
              <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
              <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={14} color="#059669" />
            </View>
          </View>
        </Pressable>

        {/* Scrollable Body Content */}
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {/* Real-time Distance & Arrival Metrics Header */}
          <View style={styles.transitSummaryHeader}>
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>EST. TIME</Text>
              <Text style={[styles.metricValueHighlight, { color: "#059669" }]}>
                {isTripFinished ? "0 mins" : `${rideDetails.etaMinutes} mins`}
              </Text>
            </View>
            <View style={styles.verticalSplitter} />
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>DISTANCE</Text>
              <Text style={styles.metricValueHighlight}>
                {isTripFinished ? "0 km" : `${rideDetails.distanceRemainingKm} km`}
              </Text>
            </View>
            <View style={styles.verticalSplitter} />
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>FIXED COST</Text>
              <Text style={styles.metricValueHighlight}>ETB {rideDetails.fixedPrice}</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Driver Information</Text>

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

          {/* Corridor Manifest Card */}
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
                <Text style={styles.manifestRouteLabel}>Co-Riders on Board</Text>
              </View>
              <Text style={styles.manifestValueText}>{rideDetails.coRiders.length} Passengers</Text>
            </View>

            {/* Render Co-Rider Names if present */}
            {rideDetails.coRiders.length > 0 && (
              <View style={styles.coRidersListContainer}>
                {rideDetails.coRiders.map((rider) => (
                  <View key={rider.id} style={styles.coRiderRowItem}>
                    <View style={[styles.miniAvatar, { backgroundColor: rider.color }]}>
                      <Text style={styles.miniAvatarText}>{rider.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.coRiderNameText}>{rider.name}</Text>
                    <Text style={styles.coRiderStatusTag}>ON BOARD</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.horizontalLineDivider} />

            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="wallet-sharp" size={16} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Split Rate Billing</Text>
              </View>
              <Text style={[styles.manifestValueText, { color: "#059669", fontWeight: "700" }]}>
                ETB {rideDetails.fixedPrice} Fixed
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Sticky Action / Checkout Button Footer (Safely padded above Android Navigation Bar) */}
        {isDrawerExpanded && (
          <View style={styles.drawerFooterSticky}>
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
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F9FAFB" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FEF3C7" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#E0F2FE" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  fallbackLoadingBox: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  fallbackLoadingText: { marginTop: 12, color: "#4B5563", fontWeight: "600", fontSize: 14 },
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  bannerFinishedBg: { backgroundColor: "#1F2937" },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusPulseWave: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", zIndex: 2 },
  coreDotFinishedBg: { backgroundColor: "#10B981" },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  originMarkerPoint: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#9CA3AF", borderWidth: 2, borderColor: "#FFFFFF", elevation: 2 },
  destinationMarkerContainer: { alignItems: "center" },
  destinationPinBubble: { backgroundColor: "#EF4444", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: "#FFFFFF", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  destinationPinTip: { width: 0, height: 0, backgroundColor: "transparent", borderStyle: "solid", borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#EF4444", marginTop: -1 },
  activeCarWrapper: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(5, 150, 105, 0.2)", justifyContent: "center", alignItems: "center" },
  carInnerBubble: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  
  // Drawer States with Safe Bottom Inset Padding for Android Navigation Bars
  slidingPanelDrawer: { 
    position: "absolute", 
    bottom: 0, 
    width: width, 
    backgroundColor: "#F9FAFB", 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingTop: 8, 
    paddingHorizontal: 16, 
    borderWidth: 1, 
    borderColor: "#E5E7EB", 
    elevation: 15 
  },
  drawerCollapsed: { height: 130 },
  drawerExpanded: { height: height * 0.72 },
  
  dragHandleContainer: { paddingBottom: 10, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 8 },
  drawerHeaderPreview: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewLeftCluster: { flexDirection: "row", alignItems: "center" },
  previewTitleText: { marginLeft: 8, fontSize: 14, fontWeight: "700", color: "#111111" },
  expandToggleBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  expandToggleText: { fontSize: 12, fontWeight: "700", color: "#059669", marginRight: 4 },

  drawerScrollBody: { flex: 1 },
  drawerFooterSticky: { 
    paddingVertical: 12, 
    paddingBottom: Platform.OS === 'android' ? 24 : 12, // Extra padding to clear Android navigation buttons/gestures
    borderTopWidth: 1, 
    borderTopColor: "#E5E7EB", 
    backgroundColor: "#F9FAFB" 
  },

  transitSummaryHeader: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 12, marginBottom: 16, marginTop: 4 },
  metricColumn: { flex: 1, alignItems: "center", justifyContent: "center" },
  verticalSplitter: { width: 1, backgroundColor: "#E5E7EB" },
  metricLabel: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  metricValueHighlight: { fontSize: 15, fontWeight: "800", color: "#111111", marginTop: 2 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  driverProfileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 14 },
  avatarHolder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  driverIdentityMeta: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 14, fontWeight: "700", color: "#111111" },
  vehicleDetails: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#D97706", marginLeft: 4 },
  manifestContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 12 },
  manifestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  leftLabelCluster: { flexDirection: "row", alignItems: "center" },
  manifestRouteLabel: { fontSize: 13, color: "#4B5563", marginLeft: 10 },
  manifestValueText: { fontSize: 13, fontWeight: "600", color: "#111111" },
  horizontalLineDivider: { height: 1, backgroundColor: "#F3F4F6" },
  coRidersListContainer: { paddingBottom: 10, paddingLeft: 28 },
  coRiderRowItem: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  miniAvatarText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  coRiderNameText: { flex: 1, marginLeft: 8, fontSize: 13, color: "#374151", fontWeight: "500" },
  coRiderStatusTag: { fontSize: 10, fontWeight: "700", color: "#059669", backgroundColor: "#ECFDF5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  actionButton: { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  paymentButtonBg: { backgroundColor: "#059669" },
  disabledButtonBg: { backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#D1D5DB" },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", marginLeft: 8, letterSpacing: 0.5 },
});