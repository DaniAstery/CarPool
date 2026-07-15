import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

const { width } = Dimensions.get("window");
const API_URL = "http://192.168.173.52:5000/api"; // 🚀 Match your PassengerScreen IP configuration!

export default function MatchingScreen({ navigation, route }) {
  const [matchedCount, setMatchedCount] = useState(1);
  const [displayedPrice, setDisplayedPrice] = useState(route?.params?.ride?.price || "ETB 150");
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, longitude: 38.7935, latitudeDelta: 0.015, longitudeDelta: 0.015,
  });

  const radarAnim = useRef(new Animated.Value(0)).current;
  
  // Destructure routing parameter sets safely
  const routeId = route?.params?.routeId || "1";
  const hubId = route?.params?.hubId || "1";
  const userId = route?.params?.userId || "1"; 
  const currentUserId = parseInt(userId, 10);
  const ride = route?.params?.ride || { corridor: "Evaluating Corridor...", time: "Calculating..." };

  // Track user hardware location
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      let location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude, longitude: location.coords.longitude,
        latitudeDelta: 0.012, longitudeDelta: 0.012,
      });
    })();
  }, []);

  // Radar structural loop trigger
  useEffect(() => {
    Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1, duration: 3000, easing: Easing.out(Easing.quad), useNativeDriver: true,
      })
    ).start();
  }, [radarAnim]);


  // 🔄 Real-Time Matching Status Polling & Session Recovery Loop
  useEffect(() => {
    let pollingInterval;
    let isMounted = true;

    const checkMyPoolStatus = async () => {
      try {
        console.log(`📡 Polling status for User ID: ${currentUserId} on ${API_URL}/routes/status/${currentUserId}`);
        const response = await fetch(`${API_URL}/routes/status/${currentUserId}`);
        
        if (!response.ok) {
          const errorHtml = await response.text();
          console.log("⚠️ Diagnostic Router Error Response:", errorHtml.slice(0, 100));
          return;
        }

        const data = await response.json();
        if (!isMounted) return;

        console.log("📥 [Match Sync Received]:", JSON.stringify(data, null, 2));

        // 🎯 1. Extract status parameters safely from the payload structure
        const currentPoolStatus = (data.status || data.pool?.status || data.match_pipeline?.status || "searching").toLowerCase().trim();
        const targetRideOfferId = data.matched_ride_offer_id || data.pool?.matched_ride_offer_id || data.match_pipeline?.ride_offer_id || null;
        const currentCount = data.currentPoolCount || data.pool?.currentPoolCount || 1;
        const finalPriceValue = data.finalPrice || data.pool?.finalPrice || data.pool?.base_price || 150;

        setMatchedCount(currentCount);
        setDisplayedPrice(`ETB ${parseInt(finalPriceValue, 10)}`);

        // 🎯 2. check if the ride has departed or started
        const rideStatus = (data.rideStatus || data.pool?.rideStatus || "").toLowerCase();
        if (["departed", "started", "inprogress", "in_trip"].includes(rideStatus)) {
          console.log("🏁 Active ride departed. Fast-tracking to TripInProgressScreen.");
          if (pollingInterval) clearInterval(pollingInterval);
          navigation.replace("TripInProgressScreen", {
            routeId,
            rideOfferId: targetRideOfferId,
            ride: { ...ride, price: `ETB ${parseInt(finalPriceValue, 10)}` },
            userId: currentUserId
          });
          return;
        }

        // 🎯 3. IF A DRIVER HAS ACCEPTED (matched_ride_offer_id is not null) -> ROUTE TO PROPOSAL
        if (targetRideOfferId !== null) {
          console.log(`🚗 [Driver Assigned] Ride Offer Detected: ${targetRideOfferId}. Forwarding to Proposal.`);
          if (pollingInterval) clearInterval(pollingInterval);

          const passengersList = data.passengers || data.pool?.passengers || [];
          const myRow = passengersList.find(p => parseInt(p.userId || p.user_id || p.id, 10) === currentUserId);
          const alreadyArrived = currentPoolStatus === "arrived" || data.pool?.status === "arrived" || myRow?.status?.toLowerCase() === "arrived";

          setTimeout(() => {
            if (isMounted) {
              if (alreadyArrived) {
                console.log("🎯 User already at hub. Forwarding directly to LiveTracking.");
                navigation.replace("LiveTrackingScreen", {
                  routeId,
                  rideOfferId: targetRideOfferId,
                  ride: { ...ride, price: `ETB ${parseInt(finalPriceValue, 10)}`, finalCount: currentCount },
                  userId: currentUserId,
                  initialUserArrived: true
                });
              } else {
                console.log("🚶 Moving to PickupProposalScreen to meet driver.");
                navigation.replace("PickupProposal", { 
                  routeId, 
                  rideOfferId: targetRideOfferId, 
                  ride: { ...ride, price: `ETB ${parseInt(finalPriceValue, 10)}`, finalCount: currentCount },
                  userId: currentUserId
                });
              }
            }
          }, 1000);
          return;
        }

        // 🎯 4. passenger-to-passenger matched state (2/2 threshold reached, waiting on driver)
        if (currentPoolStatus === "matched" || currentCount >= 2) {
          console.log("👥 Core match threshold reached! (2/2). Still waiting on a driver offer assignment.");
          setMatchedCount(2); // Ensure UI displays 2/2 visually
        }

      } catch (err) {
        console.log("Status lookup connection failure:", err);
      }
    };

    checkMyPoolStatus();
    pollingInterval = setInterval(checkMyPoolStatus, 2500);

    return () => {
      isMounted = false;
      clearInterval(pollingInterval);
    };
  }, [routeId, hubId, userId, navigation]);

  const ringScaleOut = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] });
  const ringOpacityIn = radarAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.4, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.backButton} onPress={() => navigation?.goBack()}>←</Text>
        <Text style={styles.headerTitle}>Corridor Smart Matching</Text>
        <View style={{ width: 24 }} />
      </View>
      
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={true}
          customMapStyle={cleanMinimalMapStyle}
        />

        <View style={styles.radarWrapper}>
          <Animated.View 
            style={[
              styles.radarPulseRing, 
              { 
                transform: [{ scale: ringScaleOut }], 
                opacity: ringOpacityIn 
              }
            ]} 
          />
          <View style={styles.radarInnerRing}>
            <View style={styles.userBeaconDot} />
          </View>
          <Text style={styles.youTextTag}>You</Text>
        </View>
      </View>

      <View style={styles.matchCard}>
        <View style={styles.iconCircle}>
          <Text style={styles.avatarIcon}>👥</Text>
        </View>

        <Text style={styles.cardTitle}>
          <Text>{`Pooling Core Partners\non `}</Text>
          <Text style={{ color: "#10B981" }}>{ride.corridor}</Text>
        </Text>

        <Text style={styles.matchCountText}>{`${matchedCount} / 2`}</Text>
        <Text style={styles.matchCountSubtitle}>Minimum of 2 required to launch run</Text>

        {matchedCount < 2 ? (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.waitText}>Waiting for secondary core matcher...</Text>
            <ActivityIndicator size="small" color="#111" style={{ marginLeft: 8 }} />
          </View>
        ) : (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.successRouteText}>🎉 Core matched! Waiting for driver...</Text>
            <ActivityIndicator size="small" color="#10B981" style={{ marginLeft: 8 }} />
          </View>
        )}
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>{`Corridor: ${ride.corridor}`}</Text>
        <View style={styles.divider} />

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Current Fare Rate</Text>
          <Text style={styles.rowValue}>{displayedPrice}</Text>
        </View>
        
        {matchedCount >= 2 && (
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusBadgeText}>🎁 Core Threshold Met! Base discount locked in.</Text>
          </View>
        )}

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Est. Travel Time</Text>
          <Text style={styles.rowValue}>{ride.time}</Text>
        </View>
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
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF", zIndex: 10 },
  backButton: { fontSize: 24, color: "#000000", fontWeight: "600" },
  headerTitle: { fontSize: 14, fontWeight: "700", color: "#111111" },
  mapContainer: { flex: 1, position: "relative" },
  radarWrapper: { position: "absolute", top: "14%", alignSelf: "center", alignItems: "center", justifyContent: "center", width: 160, height: 160 },
  radarPulseRing: { position: "absolute", width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: "#111", backgroundColor: "rgba(0, 0, 0, 0.05)" },
  radarInnerRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, borderColor: "#111", borderStyle: "dashed", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.4)" },
  userBeaconDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#111", borderWidth: 3, borderColor: "#FFFFFF", elevation: 4 },
  youTextTag: { fontWeight: "700", fontSize: 12, color: "#111111", marginTop: 6, backgroundColor: "rgba(255, 255, 255, 0.9)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: "#E5E7EB" },
  matchCard: { position: "absolute", top: "32%", alignSelf: "center", width: width * 0.9, backgroundColor: "#FFFFFF", borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: "center", elevation: 6 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarIcon: { fontSize: 20 },
  cardTitle: { fontSize: 14, fontWeight: "700", textAlign: "center", color: "#1F2937", lineHeight: 20 },
  matchCountText: { fontSize: 36, fontWeight: "800", color: "#111111", marginTop: 12 },
  matchCountSubtitle: { fontSize: 12, color: "#6B7280", marginBottom: 16 },
  loaderInlineRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  waitText: { fontSize: 13, color: "#9CA3AF" },
  successRouteText: { fontSize: 14, fontWeight: "700", color: "#10B981" },
  bottomSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, elevation: 4 },
  sheetTitle: { fontSize: 14, fontWeight: "800", color: "#111111", marginBottom: 12 },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 16 },
  sheetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  rowLabel: { fontSize: 14, color: "#4B5563" },
  rowValue: { fontSize: 14, fontWeight: "700", color: "#111111" },
  bonusBadge: { backgroundColor: "#ECFDF5", padding: 8, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#A7F3D0" },
  bonusBadgeText: { color: "#065F46", fontSize: 12, fontWeight: "700", textAlign: "center" }
});