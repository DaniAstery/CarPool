import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function LiveTrackingScreen({ navigation, route }) {
  const routeId = route?.params?.routeId || "1";
  const rideData = route?.params?.ride || { corridor: "Megenagna → Piassa", price: "ETB 80", time: "25 min" };
  
  const rideOfferIdFromParam = route?.params?.rideOfferId || route?.params?.ride_offer_id || 1;
  const currentUserId = route?.params?.userId ? parseInt(route?.params?.userId, 10) : 1;
  
  const [userArrived, setUserArrived] = useState(route?.params?.initialUserArrived || false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0045, longitude: 38.7865 });

  const activeRideOfferIdRef = useRef(rideOfferIdFromParam);
  const [pulseAnim] = useState(new Animated.Value(0));
  
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };

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

  // 🔄 Real-Time Database Tracking Evaluation Loop
  useEffect(() => {
    console.log(`📡 Streaming relational data pipeline for Ride Offer ID: [${activeRideOfferIdRef.current}]`);

    async function streamLiveTrackingData() {
      try {
        // 🎯 FIX: Query by rideOfferId instead of userId to pulling the holistic status cluster matrix for ALL riders
        const res = await fetch(`http://192.168.106.52:5000/api/rides/track-live/offer/${activeRideOfferIdRef.current}`);
        
        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || !data.passengers) {
          setLoading(false);
          return;
        }

        const { rideOfferId, driverLocation: incomingDriverLoc, rideStatus } = data;

        if (rideOfferId) activeRideOfferIdRef.current = rideOfferId;

        if (incomingDriverLoc) {
          setDriverLocation({
            latitude: parseFloat(incomingDriverLoc.latitude),
            longitude: parseFloat(incomingDriverLoc.longitude)
          });
        }

        // Parse exactly what is returned from route_pool query rows
        const parsedPassengers = data.passengers.map((p, index) => {
          const targetPassengerId = parseInt(p.userId || p.user_id || p.id, 10);
          const isMe = targetPassengerId === currentUserId;
          
          // Color choices for clear tracking differentiation
          const mapColor = isMe ? "#1C75BC" : "#E28743";
          
          // Determine status state string straight from the db backend rows
          let currentStatus = "Pending";
          if (p.status === "Arrived" || p.status === "arrived") {
            currentStatus = "Arrived";
          } else if (p.status === "Accepted" || p.status === "accepted" || p.status === "matched" || p.status === "matched_walking") {
            currentStatus = "Accepted";
          }

          // Safe algorithm scattering pins slightly to keep them clean on map interface
          const scatterLat = pickupLocation.latitude + (index * 0.0004 - 0.0002);
          const scatterLng = pickupLocation.longitude + (index * 0.0004 - 0.0002);

          return {
            id: targetPassengerId,
            name: isMe ? `You (Rider ${targetPassengerId})` : `Rider ${targetPassengerId}`,
            latitude: scatterLat, 
            longitude: scatterLng,
            color: mapColor,
            status: currentStatus
          };
        });

        setPassengerStates(parsedPassengers);
        setLoading(false);

        // If your own backend payload status says you arrived, keep local state sync matched
        const meOnBackend = parsedPassengers.find(p => p.id === currentUserId);
        if (meOnBackend && meOnBackend.status === "Arrived") {
          setUserArrived(true);
        }

        if (rideStatus === "departed" || rideStatus === "started" || rideStatus === "inprogress") {
          clearInterval(trackingInterval);
          navigation.replace("TripInProgressScreen", { 
            routeId, 
            rideOfferId: activeRideOfferIdRef.current, 
            ride: rideData,
            userId: currentUserId 
          });
        }

      } catch (err) {
        console.log("Telemetry relational parsing failure:", err);
        setLoading(false);
      }
    }

    streamLiveTrackingData();
    const trackingInterval = setInterval(streamLiveTrackingData, 2500);

    return () => clearInterval(trackingInterval);
  }, [navigation, currentUserId, routeId]);

  const handleUserArrival = async () => {
    const resolvedRideOfferId = activeRideOfferIdRef.current;
    if (!resolvedRideOfferId) return;

    setUserArrived(true); 

    try {
      await fetch("http://192.168.106.52:5000/api/rides/signal-arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: resolvedRideOfferId,
          user_id: currentUserId
        }),
      });
    } catch (err) {
      setUserArrived(false);
      console.log("Arrival status sync failure:", err);
    }
  };

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.3, 0] });

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }]}>
        <ActivityIndicator size="large" color="#1C75BC" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <Animated.View style={[styles.statusPulseWave, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
          <View style={styles.statusCenterCoreDot}>
            <MaterialCommunityIcons name="routes" size={14} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>Corridor Manifest Telemetry</Text>
          <Text style={styles.statusSecondaryText}>Syncing acceptance matrices with ride network blocks</Text>
        </View>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: 9.0115,       
            longitude: 38.7945,
            latitudeDelta: 0.0035,  
            longitudeDelta: 0.0035,
          }}
          customMapStyle={detailedMapStyle} 
        >
          {/* Pickup Station Hub */}
          <Marker coordinate={pickupLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.hubStationWrapper}>
              <View style={styles.hubStationPin}>
                <Ionicons name="flag" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.hubStationPulseRing} />
            </View>
          </Marker>

          {/* Real-Time Driver Car Marker */}
          <Marker coordinate={driverLocation}>
            <View style={styles.driverCarPin}>
              <FontAwesome5 name="car-side" size={13} color="#FFFFFF" />
            </View>
          </Marker>

          {/* Dynamic Passenger Pins Only */}
          {passengerStates.map((passenger, idx) => (
            <Marker key={`marker-${passenger.id}-${idx}`} coordinate={{ latitude: passenger.latitude, longitude: passenger.longitude }}>
              <View style={[styles.passengerTrackingPin, { backgroundColor: passenger.color }]}>
                <MaterialCommunityIcons 
                  name={passenger.status === "Arrived" ? "account-check" : "account-clock"} 
                  size={12} 
                  color="#FFFFFF" 
                />
              </View>
            </Marker>
          ))}
        </MapView>
      </View>

      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.etaSummaryCard}>
            <View style={styles.etaIconContainer}>
              <FontAwesome5 name="clock" size={16} color="#1C75BC" />
            </View>
            <View style={styles.etaTextFrame}>
              <Text style={styles.etaPrimaryLabel}>Driver Routing Active</Text>
              <Text style={styles.etaSecondaryLabel}>Toyota Probox • Code 3 - A02319</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Co-Rider Acceptance Matrix</Text>

          <View style={styles.manifestContainer}>
            {passengerStates.map((passenger, index) => (
              <View key={`rider-${passenger.id}-${index}`} style={styles.passengerRow}>
                <View style={styles.passengerIdentity}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person-outline" size={14} color="#4B5563" />
                  </View>
                  <Text style={[styles.passengerName, passenger.id === currentUserId && styles.boldName]}>
                    {passenger.name}
                  </Text>
                </View>

                {/* 🎯 Exact Clean State Evaluator */}
                {passenger.status === "Arrived" ? (
                  <View style={styles.statusArrivedBadge}>
                    <Ionicons name="checkmark-circle" size={15} color="#10B981" />
                    <Text style={styles.statusArrivedText}>ARRIVED</Text>
                  </View>
                ) : passenger.status === "Accepted" ? (
                  <View style={[styles.statusWalkingBadge, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="account-check" size={14} color="#D97706" />
                    <Text style={[styles.statusWalkingText, { color: '#D97706' }]}>ACCEPTED</Text>
                  </View>
                ) : (
                  <View style={styles.statusWalkingBadge}>
                    <MaterialCommunityIcons name="clock-outline" size={14} color="#3B82F6" />
                    <Text style={styles.statusWalkingText}>PENDING</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {!userArrived ? (
            <TouchableOpacity 
              style={styles.arrivedCallToActionButton}
              onPress={handleUserArrival}
              activeOpacity={0.8}
            >
              <Text style={styles.arrivedCallToActionText}>CONFIRM HUB STATION PRESENCE</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.successStateBanner}>
              <ActivityIndicator size="small" color="#10B981" style={{ marginRight: 10 }} />
              <Text style={styles.successBannerText}>Awaiting pipeline operational completion runs...</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const detailedMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  statusBarBanner: { backgroundColor: "#1F2937", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusPulseWave: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: "#1C75BC" },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#1C75BC", justifyContent: "center", alignItems: "center", zIndex: 2 },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#9CA3AF", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  hubStationWrapper: { justifyContent: "center", alignItems: "center" },
  hubStationPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", zIndex: 5 },
  hubStationPulseRing: { position: "absolute", width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  driverCarPin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  passengerTrackingPin: { width: 22, height: 22, borderRadius: 11, justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#FFFFFF" },
  slidingPanelDrawer: { position: "absolute", bottom: 0, width: width, maxHeight: "50%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24, borderWidth: 1, borderColor: "#E5E7EB", elevation: 8 },
  etaSummaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 18 },
  etaIconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EBF5FF", justifyContent: "center", alignItems: "center", marginRight: 12 },
  etaTextFrame: { flex: 1 },
  etaPrimaryLabel: { fontSize: 14, fontWeight: "700", color: "#111111" },
  etaSecondaryLabel: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, paddingVertical: 4, paddingHorizontal: 16, marginBottom: 20 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentity: { flexDirection: "row", alignItems: "center" },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginRight: 12 },
  passengerName: { fontSize: 14, color: "#374151", fontWeight: "500" },
  boldName: { fontWeight: "800", color: "#111111" },
  statusArrivedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statusArrivedText: { color: "#10B981", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  statusWalkingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#EFF6FF", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statusWalkingText: { color: "#3B82F6", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  arrivedCallToActionButton: { backgroundColor: "#1C75BC", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  arrivedCallToActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  successStateBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", width: "100%", height: 50, borderRadius: 14, borderWidth: 1, borderColor: "#A7F3D0" },
  successBannerText: { color: "#10B981", fontSize: 13, fontWeight: "700" }
});