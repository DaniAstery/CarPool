import React, { useState, useEffect, useRef, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0235,
  longitude: 38.8275,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Fetch real street-level driving route from OSRM public driving router
const fetchDrivingRoute = async (origin, destination) => {
  if (!origin || !destination || !origin.latitude || !destination.latitude || !origin.longitude || !destination.longitude) {
    return [];
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
    }
  } catch (err) {
    console.log("⚠️ OSRM driving route request failed, utilizing direct path fallback");
  }

  return [origin, destination];
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW
// ------------------------------------------------------------------
const TripDepartureMap = memo(({ currentLocation, destinationLocation, routeCoordinates, heading, mapRef, isDrawerExpanded, isTripFinished }) => {
  useEffect(() => {
    if (mapRef.current && destinationLocation?.latitude && currentLocation?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      const coordsToFit = [
        { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
        ...routeCoordinates
      ];

      try {
        mapRef.current.fitToCoordinates(coordsToFit, {
          edgePadding: { top: 80, right: 60, bottom: bottomPadding, left: 60 },
          animated: true,
        });
      } catch (e) {}
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, destinationLocation?.latitude, destinationLocation?.longitude, routeCoordinates, mapRef, isDrawerExpanded]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🟢 Passenger In-Car Current Location Marker (Physical Phone Orientation) */}
      {!isTripFinished && currentLocation && currentLocation.latitude && (
        <Marker
          coordinate={currentLocation}
          title="Your Current Location (In Car)"
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading || 0}
          flat={true}
          tracksViewChanges={true}
        >
          <View style={styles.emeraldCarWrapper}>
            <View style={styles.emeraldCarInnerBubble}>
              <Ionicons name="navigate" size={17} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 🔵 Destination Hub Marker */}
      {destinationLocation && destinationLocation.latitude && destinationLocation.longitude && (
        <Marker 
          coordinate={{ latitude: Number(destinationLocation.latitude), longitude: Number(destinationLocation.longitude) }} 
          title={destinationLocation.title || "Destination Hub"} 
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.royalBlueDestinationHalo}>
            <View style={styles.royalBlueDestinationBadge} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Real Street-Level Polyline Route Path */}
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor={isTripFinished ? "#9CA3AF" : "#059669"}
          strokeWidth={5}
          geodesic={true}
        />
      )}
    </MapView>
  );
});

export default function TripDepartureScreen({ route, navigation }) {
  const rideOfferId = route?.params?.rideOfferId || 0;
  const userId = route?.params?.userId || 1;

  const [loading, setLoading] = useState(true);
  const [tripStatus, setTripStatus] = useState("in_trip");
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [destinationLocation, setDestinationLocation] = useState({ latitude: null, longitude: null, title: "Destination Hub" });
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [heading, setHeading] = useState(0);

  const [rideDetails, setRideDetails] = useState({
    corridor: "Transit Corridor",
    driverName: "Assigned Driver",
    vehicleInfo: "Corridor Shuttle",
    driverRating: "5.0",
    fixedPrice: 100,
    coRiders: [],
    endHubName: "CMC",
    etaMinutes: "--",
    distanceRemainingKm: "--",
  });

  const mapRef = useRef(null);
  const [pulseAnim] = useState(new Animated.Value(0));

  const isTripFinished = tripStatus === "completed";

  // Disable Android Back Button during active trip departure
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  // Auto-expand drawer when trip finishes
  useEffect(() => {
    if (isTripFinished) {
      setIsDrawerExpanded(true);
    }
  }, [isTripFinished]);

  // Pulse animation for status banner
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

  // Track passenger's live GPS location & physical phone compass heading
  useEffect(() => {
    let isMounted = true;
    let locationSubscription = null;
    let headingSubscription = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          // 1. Get initial GPS position
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (loc && isMounted) {
            setCurrentLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            });
          }

          // 2. Watch live GPS coordinates
          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 4, timeInterval: 2500 },
            (newLoc) => {
              if (isMounted && newLoc) {
                setCurrentLocation({
                  latitude: newLoc.coords.latitude,
                  longitude: newLoc.coords.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                });
              }
            }
          );

          // 3. Watch physical device compass orientation for smooth arrow rotation
          headingSubscription = await Location.watchHeadingAsync((headingObj) => {
            if (isMounted && headingObj) {
              const compassHeading = headingObj.trueHeading >= 0 ? headingObj.trueHeading : headingObj.magHeading;
              if (compassHeading >= 0) {
                setHeading(compassHeading);
              }
            }
          });
        }
      } catch (err) {
        console.log("📍 Location/Heading tracking error:", err.message);
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, []);

  // Fetch destination coordinates from map_coordinates endpoint
  useEffect(() => {
    let isMounted = true;
    async function fetchMapCoordinatesEndpoint() {
      if (!rideOfferId) return;
      try {
        const res = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
        const data = await res.json();
        if (data.success && data.coordinates && isMounted) {
          const coords = data.coordinates;
          
          let destLat = parseFloat(coords.end_latitude);
          let destLng = parseFloat(coords.end_longitude);
          const startLat = parseFloat(coords.start_latitude);
          const startLng = parseFloat(coords.start_longitude);

          if (destLat > 9.10 && startLat < 9.08) {
            destLat = startLat;
            destLng = startLng;
          }

          if (destLat && destLng) {
            setDestinationLocation({
              latitude: destLat,
              longitude: destLng,
              title: coords.end_hub_name || "CMC"
            });
          }

          setRideDetails(prev => ({
            ...prev,
            endHubName: coords.end_hub_name || prev.endHubName,
            corridor: coords.corridor_name || prev.corridor,
            fixedPrice: coords.price_per_seat || prev.fixedPrice,
          }));
        }
      } catch (err) {
        console.log("⚠️ Error fetching map_coordinates endpoint:", err);
      }
    }

    fetchMapCoordinatesEndpoint();
    return () => { isMounted = false; };
  }, [rideOfferId]);

  // Generate street-level route polyline from Current Device GPS to Destination Hub
  useEffect(() => {
    let isMounted = true;
    async function updateStreetRoute() {
      if (currentLocation.latitude && destinationLocation.latitude) {
        const routePoints = await fetchDrivingRoute(currentLocation, destinationLocation);
        if (isMounted && routePoints.length > 0) {
          setRouteCoordinates(routePoints);
        }
      }
    }
    updateStreetRoute();
    return () => { isMounted = false; };
  }, [currentLocation, destinationLocation]);

  // Live Telemetry & Status Polling Loop
  useEffect(() => {
    let isMounted = true;

    async function streamLiveTripMetrics() {
      try {
        const statusRes = await fetch(`${API_URL}/api/passenger-livetracking/status/${userId}`);
        if (!statusRes.ok) throw new Error("Status polling error.");
        const statusData = await statusRes.json();

        if (isMounted && statusData) {
          setTripStatus(statusData.status);
          const activeOfferId = statusData.matched_ride_offer_id || rideOfferId;

          if (activeOfferId) {
            const trackRes = await fetch(`${API_URL}/api/rides/passenger-track/${activeOfferId}/user/${userId}`);
            if (trackRes.ok) {
              const trackData = await trackRes.json();
              const rawPassengers = Array.isArray(trackData.passengers) ? trackData.passengers : [];
              
              const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
              const formattedCoRiders = rawPassengers.map((p, idx) => ({
                id: p.user_id || idx,
                name: p.full_name || p.name || `Rider ${p.user_id || idx}`,
                color: colorPalette[idx % colorPalette.length],
              }));

              setRideDetails(prev => ({
                ...prev,
                corridor: trackData.corridor || prev.corridor,
                driverName: trackData.driverName || prev.driverName,
                vehicleInfo: trackData.vehicleInfo || prev.vehicleInfo,
                driverRating: trackData.driverRating || prev.driverRating,
                fixedPrice: trackData.finalPrice || statusData.finalPrice || prev.fixedPrice,
                coRiders: formattedCoRiders,
                etaMinutes: trackData.etaMinutes ?? "--",
                distanceRemainingKm: trackData.distanceRemainingKm ?? "--",
              }));
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.log("⚠️ Error loading real-time telemetry stream:", err);
        setLoading(false);
      }
    }

    streamLiveTripMetrics();
    const syncInterval = setInterval(streamLiveTripMetrics, 3500);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
    };
  }, [userId, rideOfferId]);

  // Payment Checkout Handler
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

      {/* MAP SECTION */}
      <View style={styles.mapContainer}>
        <TripDepartureMap 
          currentLocation={currentLocation} 
          destinationLocation={destinationLocation}
          routeCoordinates={routeCoordinates}
          heading={heading}
          mapRef={mapRef} 
          isDrawerExpanded={isDrawerExpanded}
          isTripFinished={isTripFinished}
        />
      </View>

      {/* COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        
        {/* Toggle Handle Header */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>{isTripFinished ? "Trip Completed" : "Trip in Departure"}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Heading to <Text style={styles.boldText}>{destinationLocation.title || rideDetails.endHubName}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, isTripFinished ? styles.badgeFinished : styles.badgeActive]}>
                <Text style={[styles.badgeText, isTripFinished && { color: "#1F2937" }]}>
                  {isTripFinished ? "ARRIVED" : "IN TRANSIT"}
                </Text>
              </View>
              <View style={styles.expandToggleBadge}>
                <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
                <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Scrollable Content */}
        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          {/* Transit Summary Metrics */}
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

          {/* Route Corridor Details */}
          <View style={styles.routeCard}>
            <View style={styles.routeItem}>
              <Ionicons name="navigate-sharp" size={18} color="#059669" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>CURRENT LOCATION (YOU IN CAR)</Text>
                <Text style={styles.routeValue} numberOfLines={1}>Live Device Compass Heading</Text>
              </View>
            </View>

            <View style={styles.routeDivider} />

            <View style={styles.routeItem}>
              <Ionicons name="flag-sharp" size={18} color="#3B82F6" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>DESTINATION HUB</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{destinationLocation.title || rideDetails.endHubName}</Text>
              </View>
            </View>
          </View>

          {/* Driver & Vehicle Card */}
          <View style={styles.driverCard}>
            <FontAwesome5 name="car-side" size={20} color="#2F4F4F" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.driverLabel}>{rideDetails.driverName} • {rideDetails.vehicleInfo}</Text>
              <Text style={styles.driverSub}>Corridor Axis: <Text style={styles.boldText}>{rideDetails.corridor}</Text></Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>{rideDetails.driverRating}</Text>
            </View>
          </View>

          {/* Co-Riders Manifest Section */}
          {rideDetails.coRiders.length > 0 && (
            <View style={styles.manifestContainerCard}>
              <View style={styles.manifestRow}>
                <View style={styles.leftLabelCluster}>
                  <Ionicons name="people-sharp" size={16} color="#9CA3AF" />
                  <Text style={styles.manifestRouteLabel}>Co-Riders on Board</Text>
                </View>
                <Text style={styles.manifestValueText}>{rideDetails.coRiders.length} Passengers</Text>
              </View>
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
            </View>
          )}
        </ScrollView>

        {/* Footer Action Button / Checkout Footer */}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
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
  
  emeraldCarWrapper: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(5, 150, 105, 0.25)", justifyContent: "center", alignItems: "center" },
  emeraldCarInnerBubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  
  royalBlueDestinationHalo: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(59, 130, 246, 0.3)", justifyContent: "center", alignItems: "center" },
  royalBlueDestinationBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#3B82F6", borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 6 },

  slidingPanelDrawer: { 
    position: "absolute", 
    bottom: 0, 
    width: width, 
    backgroundColor: "#FFF", 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingTop: 8, 
    paddingHorizontal: 20, 
    elevation: 15,
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: -3 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 6,
    zIndex: 30 
  },
  drawerCollapsed: { height: 135 },
  drawerExpanded: { maxHeight: height * 0.72 },

  dragHandleContainer: { paddingBottom: 8, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  badgeActive: { backgroundColor: "#ECFDF5" },
  badgeFinished: { backgroundColor: "#E5E7EB" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#059669" },

  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 2 },

  drawerScrollBody: { flexGrow: 0 },
  drawerFooterSticky: { 
    paddingVertical: 12, 
    paddingBottom: Platform.OS === 'android' ? 24 : 12, 
    borderTopWidth: 1, 
    borderTopColor: "#E5E7EB", 
    backgroundColor: "#FFFFFF" 
  },

  transitSummaryHeader: { flexDirection: "row", backgroundColor: "#F8F9FA", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 12, marginBottom: 12, marginTop: 4 },
  metricColumn: { flex: 1, alignItems: "center", justifyContent: "center" },
  verticalSplitter: { width: 1, backgroundColor: "#E5E7EB" },
  metricLabel: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  metricValueHighlight: { fontSize: 15, fontWeight: "800", color: "#111111", marginTop: 2 },

  routeCard: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: "#EAEAEA" },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#888", letterSpacing: 0.5 },
  routeValue: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 1 },
  routeDivider: { height: 1, backgroundColor: "#EAEAEA", marginVertical: 8 },
  
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4F4", padding: 12, borderRadius: 12, marginVertical: 6 },
  driverLabel: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  driverSub: { fontSize: 12, color: "#666" },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#D97706", marginLeft: 4 },

  manifestContainerCard: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: "#EAEAEA" },
  manifestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  leftLabelCluster: { flexDirection: "row", alignItems: "center" },
  manifestRouteLabel: { fontSize: 13, color: "#4B5563", marginLeft: 8, fontWeight: "600" },
  manifestValueText: { fontSize: 13, fontWeight: "600", color: "#111111" },
  coRidersListContainer: { marginTop: 8, paddingLeft: 24 },
  coRiderRowItem: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  miniAvatar: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center" },
  miniAvatarText: { color: "#FFFFFF", fontSize: 9, fontWeight: "700" },
  coRiderNameText: { flex: 1, marginLeft: 8, fontSize: 12, color: "#374151", fontWeight: "500" },
  coRiderStatusTag: { fontSize: 9, fontWeight: "700", color: "#059669", backgroundColor: "#ECFDF5", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },

  actionButton: { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  paymentButtonBg: { backgroundColor: "#059669" },
  disabledButtonBg: { backgroundColor: "#E5E7EB", borderWidth: 1, borderColor: "#D1D5DB" },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", marginLeft: 8, letterSpacing: 0.5 },
});