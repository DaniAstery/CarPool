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
  const rideData = route?.params?.ride || { corridor: "Megenagna → Bole", price: "ETB 80", time: "25 min" };
  
  const rideOfferIdFromParam = 
    route?.params?.rideOfferId || 
    route?.params?.ride_offer_id || 
    route?.params?.rideId || 
    1;
    
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

  // 🔄 Real-Time Telemetry & Sync Loop
  useEffect(() => {
    console.log(`📡 Synchronization engine streaming convergence states for User ID: [${currentUserId}]`);

    async function streamLiveTrackingData() {
      try {
        const res = await fetch(`http://192.168.51.52:5000/api/rides/track-live/${currentUserId}`);
        
        if (!res.ok) {
          console.log(`⚠️ Telemetry lookup endpoint returned status code: [${res.status}]. Forcing UI layout render.`);
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || Object.keys(data).length === 0) {
          setLoading(false);
          return;
        }

        const { rideOfferId, driverLocation: incomingDriverLoc, rideStatus } = data;

        if (rideOfferId) {
          activeRideOfferIdRef.current = rideOfferId;
        }

        if (incomingDriverLoc) {
          setDriverLocation({
            latitude: parseFloat(incomingDriverLoc.latitude),
            longitude: parseFloat(incomingDriverLoc.longitude)
          });
        }

        // 🌟 DEEP PROFILE MATRIX EXTRACTOR: Scan nested structures to map active pool partner records
        const rawPassengersList = 
          data.passengers || 
          data.pool?.passengers || 
          data.match_pipeline?.passengers || 
          [];

        console.log(`📊 Syncing manifest queue. Found [${rawPassengersList.length}] backend passenger records.`);

        const parsedPassengers = rawPassengersList.map((p, index) => {
          const targetPassengerId = parseInt(p.userId || p.user_id || p.id, 10);
          const isMe = targetPassengerId === currentUserId;
          const mapColor = isMe ? "#111111" : index === 1 ? "#4B5563" : "#6B7280";
          
          // Read true status dynamically from database snapshot
          const standsArrived = p.status === "arrived" || p.status === "Arrived";

          if (isMe && standsArrived) {
            setUserArrived(true);
          }

          return {
            id: targetPassengerId,
            name: isMe ? "You" : `Rider (ID: ${targetPassengerId})`,
            latitude: standsArrived ? pickupLocation.latitude : (isMe ? 9.0098 : index === 1 ? 9.0115 : 9.0128), 
            longitude: standsArrived ? pickupLocation.longitude : (isMe ? 38.7932 : index === 1 ? 38.7945 : 38.7931),
            color: mapColor,
            status: standsArrived ? "Arrived" : "Walking"
          };
        });

        // Fallback generator if network payload is flat
        if (parsedPassengers.length === 0) {
          parsedPassengers.push({
            id: currentUserId,
            name: "You",
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
            color: "#111111",
            status: userArrived ? "Arrived" : "Walking"
          });
        }

        setPassengerStates(parsedPassengers);
        setLoading(false);

        // 🚀 TRIP LIFECYCLE DEPARTURE GATE: Progress screen instantly when driver executes route run
        if (rideStatus === "departed" || rideStatus === "started" || rideStatus === "inprogress") {
          console.log(`🚀 Trip status flagged as [${rideStatus}]. Moving to TripInProgressScreen.`);
          clearInterval(trackingInterval);
          navigation.replace("TripInProgressScreen", { 
            routeId, 
            rideOfferId: activeRideOfferIdRef.current, 
            ride: rideData,
            userId: currentUserId 
          });
        }

      } catch (err) {
        console.log("Telemetry pipeline parsing failure:", err);
        setLoading(false);
      }
    }

    streamLiveTrackingData();
    const trackingInterval = setInterval(streamLiveTrackingData, 2500);

    return () => clearInterval(trackingInterval);
  }, [navigation, currentUserId, routeId, userArrived]);

  // 📤 Push Terminal Presence Handshake Sequence to Database
  const handleUserArrival = async () => {
    const resolvedRideOfferId = activeRideOfferIdRef.current;
    if (!resolvedRideOfferId) return;

    setUserArrived(true); 
    setPassengerStates((prevStates) =>
      prevStates.map((p) =>
        p.id === currentUserId
          ? { ...p, status: "Arrived", latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }
          : p
      )
    );

    try {
      const res = await fetch("http://192.168.51.52:5000/api/rides/signal-arrival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: resolvedRideOfferId,
          user_id: currentUserId
        }),
      });

      if (!res.ok) {
        setUserArrived(false);
        console.log("Handshake request rejected by server execution blocks.");
      }
    } catch (err) {
      setUserArrived(false);
      console.log("Error running presence execution networks:", err);
    }
  };

  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const pulseOpacity = pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 0.3, 0] });

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }]}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      {/* Top Banner Track Alert */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <Animated.View style={[styles.statusPulseWave, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
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
          initialRegion={{
            latitude: 9.0115,       
            longitude: 38.7945,
            latitudeDelta: 0.0035,  
            longitudeDelta: 0.0035,
          }}
          showsBuildings={true}     
          showsIndoors={true}       
          showsTraffic={false}      
          customMapStyle={detailedMapStyle} 
        >
          {/* Core Target Meeting Hub Destination Station Pin */}
          <Marker coordinate={pickupLocation} anchor={{ x: 0.5, y: 0.5 }}>
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

          {/* Pedestrian Pins */}
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

      {/* Slide-Up Interface Drawer Sheet */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.etaSummaryCard}>
            <View style={styles.etaIconContainer}>
              <FontAwesome5 name="clock" size={16} color="#111111" />
            </View>
            <View style={styles.etaTextFrame}>
              <Text style={styles.etaPrimaryLabel}>Driver arriving in 4 mins</Text>
              <Text style={styles.etaSecondaryLabel}>Toyota Probox • Code 3 - A02319</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Co-Riders Verification Queue</Text>

          {/* 🌟 MATCHES PICKUPPROPOSAL STYLE: Clean List Container Box */}
          <View style={styles.manifestContainer}>
            {passengerStates.map((passenger, index) => (
              <View key={`rider-${index}`} style={styles.passengerRow}>
                <View style={styles.passengerIdentity}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>👤</Text>
                  </View>
                  <Text style={[styles.passengerName, passenger.id === currentUserId && styles.boldName]}>
                    {passenger.name}
                  </Text>
                </View>

                {passenger.status === "Arrived" ? (
                  <View style={styles.statusArrivedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#065F46" />
                    <Text style={styles.statusArrivedText}>ARRIVED</Text>
                  </View>
                ) : (
                  <View style={styles.statusWalkingBadge}>
                    <MaterialCommunityIcons name="walk" size={14} color="#374151" />
                    <Text style={styles.statusWalkingText}>WALKING</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Interactive Action Control Elements Bar */}
          {!userArrived ? (
            <TouchableOpacity 
              style={styles.arrivedCallToActionButton}
              onPress={handleUserArrival}
              activeOpacity={0.8}
            >
              <Text style={styles.arrivedCallToActionText}>I'VE ARRIVED AT PICKUP POINT</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.successStateBanner}>
              <ActivityIndicator size="small" color="#065F46" style={{ marginRight: 10 }} />
              <Text style={styles.successBannerText}>Waiting for remaining co-riders to arrive...</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const detailedMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#E5F5E5" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#EAEAEA" }] },
  { featureType: "transit.station", elementType: "labels.icon", stylers: [{ visibility: "on" }, { color: "#10B981" }] }
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
  
  // Slide-up UI Sheet
  slidingPanelDrawer: { position: "absolute", bottom: 0, width: width, maxHeight: "50%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingHorizontal: 20, paddingBottom: 24, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 8 },
  etaSummaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 18 },
  etaIconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E5E7EB", justifyContent: "center", alignItems: "center", marginRight: 12 },
  etaTextFrame: { flex: 1 },
  etaPrimaryLabel: { fontSize: 14, fontWeight: "700", color: "#111111" },
  etaSecondaryLabel: { fontSize: 11, color: "#6B7280", marginTop: 1 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, marginLeft: 2 },

  // Clean Proposal Style Stack Rendering
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, paddingVertical: 4, paddingHorizontal: 16, marginBottom: 20 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentity: { flexDirection: "row", alignItems: "center" },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 14 },
  passengerName: { fontSize: 14, color: "#374151", fontWeight: "500" },
  boldName: { fontWeight: "800", color: "#111111" },
  statusArrivedBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#D1FAE5", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statusArrivedText: { color: "#065F46", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  statusWalkingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  statusWalkingText: { color: "#374151", fontSize: 11, fontWeight: "700", marginLeft: 4 },

  // Actions
  arrivedCallToActionButton: { backgroundColor: "#111111", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  arrivedCallToActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  successStateBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#D1FAE5", width: "100%", height: 50, borderRadius: 14, borderWidth: 1, borderColor: "#A7F3D0" },
  successBannerText: { color: "#065F46", fontSize: 13, fontWeight: "700" }
});