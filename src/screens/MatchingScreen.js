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
  TouchableOpacity,
} from "react-native";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";

const { width } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000/api"; 

export default function MatchingScreen({ navigation, route }) {
  const [matchedCount, setMatchedCount] = useState(1);
  const [displayedPrice, setDisplayedPrice] = useState(route?.params?.ride?.price || "ETB 150");
  const [isCancelling, setIsCancelling] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, 
    longitude: 38.7935, 
    latitudeDelta: 0.012, 
    longitudeDelta: 0.012,
  });

  const mapRef = useRef(null);
  const radarAnim = useRef(new Animated.Value(0)).current;
  
  // 🛡️ SAFE CONFIGURATION UNPACKING MATRIX
  const routeId = route?.params?.routeId || route?.params?.route_id || null;
  const hubId = route?.params?.hubId || route?.params?.hub_id || null;
  const userId = route?.params?.userId || route?.params?.user_id || "1"; 
  const currentUserId = parseInt(userId, 10) || 1;
  const ride = route?.params?.ride || { corridor: "Evaluating Corridor...", time: "Calculating..." };

  // 1. ELAPSED SEARCH TIMER
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatSearchTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // 2. REAL-TIME GPS RESOLUTION & MAP CENTERING
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2500));

        const location = await Promise.race([locationPromise, timeoutPromise]);

        if (location && isMounted) {
          const newRegion = {
            latitude: location.coords.latitude, 
            longitude: location.coords.longitude,
            latitudeDelta: 0.010, 
            longitudeDelta: 0.010,
          };
          setCurrentLocation(newRegion);
          mapRef.current?.animateToRegion(newRegion, 1000);
        }
      } catch (err) {
        console.log("📍 Hardware location fallback applied:", err.message);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // 3. RADAR PULSE ANIMATION
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1, 
        duration: 3000, 
        easing: Easing.out(Easing.quad), 
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [radarAnim]);

  // 4. NON-OVERLAPPING FAST POLLING LOOP
  useEffect(() => {
    let isMounted = true;
    let timerId;

    const checkMyPoolStatus = async () => {
      if (!isMounted || isCancelling) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(`${API_URL}/routes/status/${currentUserId}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return;

        const data = await response.json();
        if (!isMounted) return;

        const currentPoolStatus = (data.status || data.pool?.status || data.match_pipeline?.status || "searching").toLowerCase().trim();
        const targetRideOfferId = data.matched_ride_offer_id || data.pool?.matched_ride_offer_id || data.match_pipeline?.ride_offer_id || null;
        const currentCount = data.currentPoolCount || data.pool?.currentPoolCount || 1;
        const finalPriceValue = data.finalPrice || data.pool?.finalPrice || data.pool?.base_price || 150;

        setMatchedCount(currentCount);
        setDisplayedPrice(`ETB ${parseInt(finalPriceValue, 10)}`);

        const rideStatus = (data.rideStatus || data.pool?.rideStatus || "").toLowerCase();
        if (["departed", "started", "inprogress", "in_trip"].includes(rideStatus)) {
          navigation.replace("LiveTrackingScreen", {
            id: targetRideOfferId,
            rideOfferId: targetRideOfferId,
            ride_offer_id: targetRideOfferId,
            routeId: routeId || data.routeId || data.pool?.route_id,
            route_id: routeId || data.routeId || data.pool?.route_id,
            ride: { ...ride, price: `ETB ${parseInt(finalPriceValue, 10)}` },
            userId: currentUserId,
            user_id: currentUserId,
          });
          return;
        }

        if (targetRideOfferId !== null) {
          const navigationPayload = {
            id: targetRideOfferId,
            rideOfferId: targetRideOfferId,
            ride_offer_id: targetRideOfferId,
            ride_id: targetRideOfferId,
            routeId: routeId || data.routeId || data.pool?.route_id,
            route_id: routeId || data.routeId || data.pool?.route_id,
            userId: currentUserId,
            user_id: currentUserId,
            ride: { ...ride, price: `ETB ${parseInt(finalPriceValue, 10)}`, finalCount: currentCount },
          };

          navigation.replace("PickupProposal", navigationPayload);
          return;
        }

        if (currentPoolStatus === "matched" || currentCount >= 2) {
          setMatchedCount(2); 
        }

      } catch (err) {
        // Suppress temporary network drops during polling
      } finally {
        if (isMounted && !isCancelling) {
          timerId = setTimeout(checkMyPoolStatus, 2500);
        }
      }
    };

    checkMyPoolStatus();

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [routeId, hubId, userId, navigation, isCancelling]);

  // 🛡️ HANDLE CANCELLATION VIA BACK ARROW (PATCH status to 'cancelled')
  const handleCancelPoolRequest = async () => {
    setIsCancelling(true);
    try {
      console.log(`[Matching] Passenger ${currentUserId} cancelling pool request...`);
      await fetch(`${API_URL}/routes/pool/${currentUserId}`, {
        method: "PATCH",
      });
    } catch (err) {
      console.log("⚠️ Network note during cancellation cleanup:", err.message);
    } finally {
      setIsCancelling(false);
      navigation.replace("Passenger");
    }
  };

  const ringScaleOut = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] });
  const ringOpacityIn = radarAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 0.4, 0] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancelPoolRequest} disabled={isCancelling}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Smart Matching</Text>
        <Text style={styles.timerBadge}>{formatSearchTime(elapsedSeconds)}</Text>
      </View>
      
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={currentLocation}
          showsCompass={false}
          showsMyLocationButton={false}
          toolbarEnabled={false}
          customMapStyle={cleanMinimalMapStyle}
        />

        {/* 📍 Centered Map Radar Overlay */}
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
          <Text style={styles.youTextTag}>You (Passenger)</Text>
        </View>
      </View>

      <View style={styles.matchCard}>
        <View style={styles.iconCircle}>
          <Text style={styles.avatarIcon}>👥</Text>
        </View>

        <Text style={styles.cardTitle}>
          <Text>{`Pooling Core Partners\non `}</Text>
          <Text style={{ color: "#059669" }}>{ride.corridor}</Text>
        </Text>

        <Text style={styles.matchCountText}>{`${matchedCount} / 2`}</Text>
        <Text style={styles.matchCountSubtitle}>Minimum of 2 required to launch run</Text>

        {matchedCount < 2 ? (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.waitText}>Waiting for secondary core matcher...</Text>
            <ActivityIndicator size="small" color="#059669" style={{ marginLeft: 8 }} />
          </View>
        ) : (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.successRouteText}>🎉 Core matched! Waiting for driver...</Text>
            <ActivityIndicator size="small" color="#059669" style={{ marginLeft: 8 }} />
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
  { elementType: "geometry", stylers: [{ color: "#F8FAFC" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#F1F5F9" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#E0F2FE" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF", zIndex: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  backButton: { fontSize: 24, color: "#111111", fontWeight: "600", padding: 4 },
  headerTitle: { fontSize: 13, fontWeight: "700", color: "#111111" },
  timerBadge: { fontSize: 12, fontWeight: "800", color: "#059669", backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" },
  mapContainer: { flex: 1, position: "relative" },
  radarWrapper: { position: "absolute", top: "14%", alignSelf: "center", alignItems: "center", justifyContent: "center", width: 160, height: 160 },
  radarPulseRing: { position: "absolute", width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: "#059669", backgroundColor: "rgba(5, 150, 105, 0.06)" },
  radarInnerRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.5, borderColor: "#059669", borderStyle: "dashed", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.7)" },
  userBeaconDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#059669", borderWidth: 3, borderColor: "#FFFFFF", elevation: 4 },
  youTextTag: { fontWeight: "700", fontSize: 12, color: "#065F46", marginTop: 6, backgroundColor: "rgba(255, 255, 255, 0.95)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 0.5, borderColor: "#A7F3D0" },
  matchCard: { position: "absolute", top: "32%", alignSelf: "center", width: width * 0.9, backgroundColor: "#FFFFFF", borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginBottom: 12 },
  avatarIcon: { fontSize: 20 },
  cardTitle: { fontSize: 14, fontWeight: "700", textAlign: "center", color: "#1F2937", lineHeight: 20 },
  matchCountText: { fontSize: 36, fontWeight: "800", color: "#111111", marginTop: 12 },
  matchCountSubtitle: { fontSize: 12, color: "#6B7280", marginBottom: 16 },
  loaderInlineRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  waitText: { fontSize: 13, color: "#9CA3AF" },
  successRouteText: { fontSize: 14, fontWeight: "700", color: "#059669" },
  bottomSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 4 },
  sheetTitle: { fontSize: 14, fontWeight: "800", color: "#111111", marginBottom: 12 },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginBottom: 16 },
  sheetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  rowLabel: { fontSize: 14, color: "#4B5563" },
  rowValue: { fontSize: 14, fontWeight: "700", color: "#111111" },
  bonusBadge: { backgroundColor: "#ECFDF5", padding: 8, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#A7F3D0" },
  bonusBadgeText: { color: "#065F46", fontSize: 12, fontWeight: "700", textAlign: "center" }
});