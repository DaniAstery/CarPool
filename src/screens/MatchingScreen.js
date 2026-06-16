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

const { width, height } = Dimensions.get("window");

export default function MatchingScreen({ navigation, route }) {
  // 1. Core State Handlers
  const [matchedCount, setMatchedCount] = useState(2);
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105,   // Fallback Default: Megenagna Lat
    longitude: 38.7935,  // Fallback Default: Megenagna Lng
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });
  const [errorMsg, setErrorMsg] = useState(null);

  // 2. Animated Reference for Scanner Radar Rings
  const radarAnim = useRef(new Animated.Value(0)).current;

  // 3. Fallback Parameters Extraction
  const routeId = route?.params?.routeId || "1";
  const ride = route?.params?.ride || {
    corridor: "Megenagna → Bole",
    price: "ETB 80",
    time: "25 min",
  };

  // 4. Hook: Request Core Device GPS Coordinates
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Permission to access location was denied");
        return;
      }

      // Fetch precise positioning coordinate metrics
      let location = await Location.getCurrentPositionAsync({});
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      });
    })();
  }, []);

  // 5. Hook: Continuous Infinite Loop Radar Scanner Animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    ).start();
  }, [radarAnim]);

  // 6. Hook: Simulating Match Cycles & Subsequent Routing Triggers
  useEffect(() => {
    const matchTimer = setTimeout(() => {
      setMatchedCount(3);
    }, 5000);

    return () => clearTimeout(matchTimer);
  }, []);

  useEffect(() => {
    if (matchedCount === 3) {
      const navigationTimer = setTimeout(() => {
        if (navigation) {
          navigation.replace("PickupProposalScreen", { routeId, ride });
        } else {
          console.log("Navigating to PickupProposalScreen...");
        }
      }, 2500);
      return () => clearTimeout(navigationTimer);
    }
  }, [matchedCount, navigation]);

  // Interpolation variables mapped directly to scanner cycles
  const ringScaleOut = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1.4],
  });

  const ringOpacityIn = radarAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.8, 0.4, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Layout Component */}
      <View style={styles.header}>
        <Text style={styles.backButton}>←</Text>
        <Text style={styles.headerTitle}>Finding Riders...</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Map Content Container Layer */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={true}
          followsUserLocation={true}
          showsMyLocationButton={false}
          customMapStyle={cleanMinimalMapStyle}
        />

        {/* Floating Active Scanner Radar */}
        <View style={styles.radarWrapper}>
          {/* Animated Outward Radar Ring */}
          <Animated.View
            style={[
              styles.radarPulseRing,
              {
                transform: [{ scale: ringScaleOut }],
                opacity: ringOpacityIn,
              },
            ]}
          />
          {/* Static Concentric Inner Base Frame Ring */}
          <View style={styles.radarInnerRing}>
            <View style={styles.userBeaconDot} />
          </View>
          <Text style={styles.youTextTag}>You</Text>
        </View>
      </View>

      {/* Dynamic Status Tracking Core Card */}
      <View style={styles.matchCard}>
        <View style={styles.iconCircle}>
          <Text style={styles.avatarIcon}>👥</Text>
        </View>

        <Text style={styles.cardTitle}>
          {`Finding compatible riders\non ${ride.corridor}`}
        </Text>

        <Text style={styles.matchCountText}>
          {`${matchedCount} / 3`}
        </Text>
        <Text style={styles.matchCountSubtitle}>passengers matched</Text>

        {matchedCount < 3 ? (
          <View style={styles.loaderInlineRow}>
            <Text style={styles.waitText}>Please wait a moment...</Text>
            <ActivityIndicator size="small" color="#666666" style={{ marginLeft: 8 }} />
          </View>
        ) : (
          <Text style={styles.successRouteText}>🎉 Finalizing Match Details...</Text>
        )}
      </View>

      {/* Persistent Bottom Summary Structural Drawer */}
      <View style={styles.bottomSheet}>
        <Text style={styles.sheetTitle}>{`Corridor: ${ride.corridor}`}</Text>
        <View style={styles.divider} />

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Estimated price</Text>
          <Text style={styles.rowValue}>{ride.price}</Text>
        </View>

        <View style={styles.sheetRow}>
          <Text style={styles.rowLabel}>Est. travel time</Text>
          <Text style={styles.rowValue}>{ride.time}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Custom Silver-Muted Canvas Map Style Object (Hides POI business clutter)
const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#E8F0E8" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#F3E5D8" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D2E4F9" }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    zIndex: 10,
  },
  backButton: {
    fontSize: 24,
    color: "#000000",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111111",
  },
  mapContainer: {
    flex: 1,
    position: "relative",
  },
  radarWrapper: {
    position: "absolute",
    top: "14%",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    width: 160,
    height: 160,
  },
  radarPulseRing: {
    position: "absolute",
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: "#3A82F6",
    backgroundColor: "rgba(58, 130, 246, 0.15)",
  },
  radarInnerRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    borderColor: "#3A82F6",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },
  userBeaconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#1C75BC",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  youTextTag: {
    fontWeight: "700",
    fontSize: 12,
    color: "#111111",
    marginTop: 6,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  matchCard: {
    position: "absolute",
    top: "32%",
    alignSelf: "center",
    width: width * 0.9,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    color: "#1F2937",
    lineHeight: 22,
  },
  matchCountText: {
    fontSize: 36,
    fontWeight: "800",
    color: "#111111",
    marginTop: 12,
  },
  matchCountSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 16,
  },
  loaderInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  waitText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  successRouteText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
  },
  bottomSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  rowLabel: {
    fontSize: 14,
    color: "#4B5563",
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
});