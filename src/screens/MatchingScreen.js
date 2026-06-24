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

export default function MatchingScreen({ navigation, route }) {
  const [matchedCount, setMatchedCount] = useState(1);
  const [displayedPrice, setDisplayedPrice] = useState(route?.params?.ride?.price || "ETB 80");
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, longitude: 38.7935, latitudeDelta: 0.015, longitudeDelta: 0.015,
  });

  const radarAnim = useRef(new Animated.Value(0)).current;
  const routeId = route?.params?.routeId || "3";
  const hubId = route?.params?.hubId || "1";
  const ride = route?.params?.ride || { corridor: "Megenagna → Bole", time: "25 min" };

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

  useEffect(() => {
    Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1, duration: 3000, easing: Easing.out(Easing.quad), useNativeDriver: true,
      })
    ).start();
  }, [radarAnim]);

  // Handle Poll Status & Core Power-of-2 Conditions
  useEffect(() => {
    let pollingInterval;

    const checkMatchPipeline = async () => {
      try {
        const response = await fetch("http://192.168.238.52:5000/api/rides/auto-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ route_id: routeId, hub_id: hubId })
        });
        const data = await response.json();

        if (response.ok) {
          const currentMatches = data.matchedCount || 1;
          setMatchedCount(currentMatches);

          // Update real-time price context if bonus passengers unlock discounts
          if (data.finalPrice) {
            setDisplayedPrice(`ETB ${parseInt(data.finalPrice)}`);
          }

          // 🏁 Minimum of 2 accepted! Ready to move to layout screen proposal
          if (currentMatches >= 2) {
            clearInterval(pollingInterval);
            setTimeout(() => {
              if (navigation) {
                navigation.replace("PickupProposalScreen", { 
                  routeId, 
                  rideId: data.ride_id,
                  ride: { ...ride, price: `ETB ${parseInt(data.finalPrice)}`, finalCount: currentMatches } 
                });
              }
            }, 2000);
          }
        }
      } catch (err) {
        console.log("Pipeline polling error:", err);
      }
    };

    checkMatchPipeline();
    pollingInterval = setInterval(checkMatchPipeline, 2500);

    return () => clearInterval(pollingInterval);
  }, [routeId, hubId]);

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
            {/* Cleaned up style configuration below */}
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
        <View style={styles.iconCircle}><Text style={styles.avatarIcon}>👥</Text></View>

        <Text style={styles.cardTitle}>{`Pooling Core Partners\non ${ride.corridor}`}</Text>

        <Text style={styles.matchCountText}>{`${matchedCount} / 2`}</Text>
        <Text style={styles.matchCountSubtitle}>Minimum of 2 required to launch run</Text>

        {matchedCount < 2 ? (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.waitText}>Waiting for secondary core matcher...</Text>
            <ActivityIndicator size="small" color="#111" style={{ marginLeft: 8 }} />
          </View>
        ) : (
          <Text style={styles.successRouteText}>🎉 Core matched! Catching bonus riders...</Text>
        )}
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>{`Corridor: ${ride.corridor}`}</Text>
        <View style={styles.divider} />

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Current Fare Rate</Text>
          <Text style={styles.rowValue}>{displayedPrice}</Text>
        </View>
        
        {matchedCount > 2 && (
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusBadgeText}>🎁 Bonus Joiners active! Discount locked in.</Text>
          </View>
        )}

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Est. travel time</Text>
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