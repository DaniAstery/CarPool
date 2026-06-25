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
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function LiveTrackingScreen({ navigation, route }) {
  const currentUserId = 1; // Device user profile identifier (You)
  
  // Extract route configs safely passed during the screen transition
  const routeId = route?.params?.routeId || "1";
  const rideData = route?.params?.ride || { corridor: "Megenagna → Bole" };
  
  // State variables synchronized against PostgreSQL
  const [userArrived, setUserArrived] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0045, longitude: 38.7865 });

  const activeRideOfferIdRef = useRef(null);
  const [pulseAnim] = useState(new Animated.Value(0));
  
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };

  // Top header status pulse animation loop
  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, []);

  // 🔄 Real-Time Database Tracking Synchronization Polling Engine Loop
  useEffect(() => {
    console.log(`📡 Initializing live synchronization engine telemetry stream for User ID: [${currentUserId}]`);

    async function streamLiveTrackingData() {
      try {
        const res = await fetch(`http://192.168.238.52:5000/api/rides/track-live/${currentUserId}`);
        if (!res.ok) return;

        const data = await res.json();
        const { rideOfferId, driverLocation: incomingDriverLoc, passengers, rideStatus } = data;

        // Keep the active ride index contextualized across interactions
        activeRideOfferIdRef.current = rideOfferId;

        // Update real-time driver coordinates on map backdrop
        if (incomingDriverLoc) {
          setDriverLocation({
            latitude: incomingDriverLoc.latitude,
            longitude: incomingDriverLoc.longitude
          });
        }

      // Process all co-rider array tracking parameters received from database state updates
        const parsedPassengers = (passengers || []).map((p, index) => {
        // Ensure we compare numbers accurately (casting just in case)
        const isMe = Number(p.userId) === Number(currentUserId);
        const mapColor = isMe ? "#3A82F6" : index === 1 ? "#E28743" : "#764ABC";
        const standsArrived = p.status === "arrived";

        // FIX: Force the frontend state to stay synchronized if the database confirms arrival
        if (isMe && standsArrived) {
          setUserArrived(true);
        }

        return {
          id: p.userId,
          name: isMe ? "You" : `Rider (ID: ${p.userId})`,
          latitude: isMe ? 9.0098 : index === 1 ? 9.0115 : 9.0128, 
          longitude: isMe ? 38.7932 : index === 1 ? 38.7945 : 38.7931,
          distance: standsArrived ? "0m" : isMe ? "180m" : "90m",
          time: standsArrived ? "Arrived" : isMe ? "2 min left" : "1 min left",
          color: mapColor,
          // FIX: Read directly from the incoming database status row rule
          status: standsArrived ? "Arrived" : "Walking"
        };
      });
        setPassengerStates(parsedPassengers);
        setLoading(false);

        // 🚀 LIVE TRIP DEPARTURE TRANSITION WATCHER: Advance when the driver departs or state changes
        if (rideStatus === "departed") {
          console.log("🚀 Trip status flagged as departed by driver node. Advancing view layer...");
          clearInterval(trackingInterval);
          navigation.replace("TripDepartureScreen", { routeId, rideOfferId, ride: rideData });
        }

      } catch (err) {
        console.log("Live stream telemetry pipeline lookup dropout:", err);
      }
    }

    streamLiveTrackingData();
    const trackingInterval = setInterval(streamLiveTrackingData, 2500);

    return () => clearInterval(trackingInterval);
  }, [navigation]);

  // 📤 Dispatch Terminal Arrival Transaction State to Backend
  // 📤 Dispatch Terminal Arrival Transaction State to Backend
  const handleUserArrival = async () => {
    const resolvedRideOfferId = activeRideOfferIdRef.current;
    if (!resolvedRideOfferId) return;

    // 1. ✨ OPTIMISTIC UI UPDATE: Instantly flip states locally before the network call resolves
    setUserArrived(true); 
    setPassengerStates((prevStates) =>
      prevStates.map((p) =>
        p.name === "You"
          ? { ...p, distance: "0m", time: "Arrived", status: "Arrived" }
          : p
      )
    );

    try {
      // 2. Fire backend transaction in the background
      const res = await fetch("http://192.168.238.52:5000/api/rides/signal-arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: resolvedRideOfferId,
          user_id: currentUserId // 1
        }),
      });

      if (!res.ok) {
        // Rollback states if server explicitly rejects handshake execution
        setUserArrived(false);
        console.log("Failed to process presence checkpoint sequence update.");
      }
    } catch (err) {
      setUserArrived(false);
      console.log("Error uploading confirmation checkpoint data maps:", err);
    }
  };

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.3, 0] });

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Status Bar Banner */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <Animated.View style={[styles.statusPulseWave, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }] || {}} />
          <View style={styles.statusCenterCoreDot}>
            <MaterialCommunityIcons name="walk" size={14} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>
            {!userArrived ? "Walking to Pickup Point" : "Arrived at Convergence Hub"}
          </Text>
          <Text style={styles.statusSecondaryText}>
            {!userArrived ? "Please head over to the highlighted convergence station" : "Waiting for remaining co-riders to gather"}
          </Text>
        </View>
      </View>

      {/* Map Content Layer View */}
      <View style={styles.mapContainer}>
              <MapView
              provider={PROVIDER_GOOGLE}
              style={StyleSheet.absoluteFillObject}
              
              // 🔍 ULTRA-ZOOM CONFIGURATION (Tightened from 0.012 down to 0.0025 for extreme detail)
              initialRegion={{
                latitude: 9.0115,       // Centered directly on the Megenagna convergence zone
                longitude: 38.7945,
                latitudeDelta: 0.0025,  
                longitudeDelta: 0.0025,
              }}
              
              // 🏗️ High-Fidelity Infrastructure Visuals
              showsBuildings={true}     // Forces 3D structural blocks to render for easy physical navigation
              showsIndoors={true}       // Displays subterranean/terminal walking platforms if mapped
              showsTraffic={false}      // Hides vehicular congestion lines to keep pedestrian corridors clean
              customMapStyle={detailedMapStyle} // Binds the high-precision clarity style sheet
            >

          {/* Core Target Meeting Hub Destination Station Pin */}
         <Marker 
              coordinate={pickupLocation}
              anchor={{ x: 0.5, y: 0.5 }} // Sets the absolute center of the layout block right over the coordinates
            >
              <View style={styles.hubStationWrapper}>
                <View style={styles.hubStationPin}>
                  <Ionicons name="flag" size={14} color="#FFFFFF" />
                </View>
                <View style={styles.hubStationPulseRing} />
              </View>
            </Marker>

          {/* Real-time moving Driver Marker Component Node */}
          <Marker coordinate={driverLocation}>
            <View style={styles.driverCarPin}>
              <FontAwesome5 name="car-side" size={13} color="#FFFFFF" />
            </View>
          </Marker>

          {passengerStates.map((p, idx) => (
            p.status === "Walking" && (
              <Marker key={`marker-${idx}`} coordinate={{ latitude: p.latitude, longitude: p.longitude }}>
                <View style={[styles.passengerTrackingPin, { backgroundColor: p.color }]}>
                  <MaterialCommunityIcons name={p.id === currentUserId ? "walk" : "account"} size={12} color="#FFFFFF" />
                </View>
              </Marker>
            )
          ))}
        </MapView>
      </View>

      {/* Slide-Up Interface Sheet Drawer */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.etaSummaryCard}>
            <View style={styles.etaIconContainer}>
              <FontAwesome5 name="clock" size={16} color="#10B981" />
            </View>
            <View style={styles.etaTextFrame}>
              <Text style={styles.etaPrimaryLabel}>Driver arriving in 4 mins</Text>
              <Text style={styles.etaSecondaryLabel}>Toyota Probox • Code 3 - A02319</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Passenger Convergence Queue</Text>

          <View style={styles.passengerQueueStack}>
            {passengerStates.map((passenger, index) => (
              <View key={`card-${index}`} style={styles.passengerStateCard}>
                <View style={styles.cardLeftContent}>
                  <View style={[styles.passengerAvatarFrame, { backgroundColor: `${passenger.color}15` }]}>
                    <MaterialCommunityIcons name={passenger.id === currentUserId ? "walk" : "account"} size={20} color={passenger.color} />
                  </View>
                  <View style={styles.passengerTextIdentity}>
                    <Text style={[styles.passengerNameTitle, passenger.id === currentUserId && { fontWeight: "800" }]}>
                      {passenger.name}
                    </Text>
                    <Text style={styles.passengerWalkRouteLabel}>
                      {passenger.status === "Arrived" ? "At meeting location" : `Distance: ${passenger.distance}`}
                    </Text>
                  </View>
                </View>

              {passenger.status === "Arrived" ? (
                    <View style={styles.badgeArrivedDone}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.badgeTextArrivedDone}>ARRIVED</Text>
                    </View>
                  ) : (
                    <View style={styles.badgeWalkingCountdown}>
                      <Text style={[styles.badgeTextWalkingCountdown, { color: passenger.color }]}>
                        {passenger.time}
                      </Text>
                    </View>
                  )}
              </View>
            ))}
          </View>

          {/* Interactive Trigger Elements Bar */}
          {!userArrived ? (
            <TouchableOpacity 
              style={styles.arrivedCallToActionButton}
              onPress={handleUserArrival}
              activeOpacity={0.8}
            >
              <Text style={styles.arrivedCallToActionText}>I'VE ARRIVED AT PICKUP POINT</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.globalSuccessBanner}>
              <Text style={styles.globalSuccessBannerText}>✓ Waiting for trip departure window to open</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const detailedMapStyle = [
  {
    elementType: "geometry",
    stylers: [{ color: "#F5F5F5" }]
  },
  {
    featureType: "poi.business",
    stylers: [{ visibility: "off" }] // Strips out commercial distractions (shops/cafes)
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#E5F5E5" }] // Soft green accentuation for open zones
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#FFFFFF" }] // Solid white background for secondary roads
  },
  {
    featureType: "road.local",
    elementType: "geometry",
    stylers: [{ color: "#EAEAEA" }] // Explicitly bakes local walking corridors onto the map view
  },
  {
    featureType: "transit.station",
    elementType: "labels.icon",
    stylers: [{ visibility: "on" }, { color: "#10B981" }] // Bright green tags for local transport hub nodes
  }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  statusBarBanner: { backgroundColor: "#1F2937", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusPulseWave: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: "#3B82F6" },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#3B82F6", justifyContent: "center", alignItems: "center", zIndex: 2 },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#9CA3AF", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  hubStationWrapper: { justifyContent: "center", alignItems: "center" },
  hubStationPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", zIndex: 5 },
  hubStationPulseRing: { position: "absolute", width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  driverCarPin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 4 },
  passengerTrackingPin: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  slidingPanelDrawer: { position: "absolute", bottom: 0, width: width, maxHeight: "50%", backgroundColor: "#F9FAFB", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 8 },
  etaSummaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 16 },
  etaIconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E6F4EA", justifyContent: "center", alignItems: "center", marginRight: 12 },
  etaTextFrame: { flex: 1 },
  etaPrimaryLabel: { fontSize: 14, fontWeight: "700", color: "#111111" },
  etaSecondaryLabel: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  passengerQueueStack: { marginBottom: 16 },
  passengerStateCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8 },
  cardLeftContent: { flexDirection: "row", alignItems: "center", flex: 1 },
  passengerAvatarFrame: { width: 38, height: 38, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  passengerTextIdentity: { flex: 1 },
  passengerNameTitle: { fontSize: 14, fontWeight: "600", color: "#111111" },
  passengerWalkRouteLabel: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  badgeArrivedDone: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeTextArrivedDone: { fontSize: 11, fontWeight: "700", color: "#10B981", marginLeft: 4 },
  badgeWalkingCountdown: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  badgeTextWalkingCountdown: { fontSize: 11, fontWeight: "700" },
  arrivedCallToActionButton: { backgroundColor: "#111111", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  arrivedCallToActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  globalSuccessBanner: { backgroundColor: "#ECFDF5", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#A7F3D0" },
  globalSuccessBannerText: { color: "#065F46", fontSize: 13, fontWeight: "700" },
});