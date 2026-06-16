import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  TouchableOpacity,
  Switch,
  Animated,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
// FIX: Added FontAwesome5 directly into the brackets below
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function TripDepartureScreen({ navigation, route }) {
  
  // 1. SAFE PARAMETERS EXTRACTION (Fixes the property doesn't exist error)
  const routeId = route?.params?.routeId || "1";
  const ride = route?.params?.ride || { corridor: "Megenagna → Bole" };

  // Coordinates Architecture (Megenagna Hub to Bole Terminal)
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };
  const destinationLocation = { latitude: 8.9985, longitude: 38.7855 };

  const [pulseAnim] = useState(new Animated.Value(0));
  const [currentDistanceLeft, setCurrentDistanceLeft] = useState("3.4 km");
  const [currentETA, setCurrentETA] = useState("12 min");

  // Dynamic state positioning track for the vehicle
  const [carLocation, setCarLocation] = useState(pickupLocation);

  // Infinite Pulse Animation loop for the green success banner marker
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

  // Simulate active vehicle movement progress along the transit polyline
  useEffect(() => {
    const movementInterval = setInterval(() => {
      setCarLocation((prev) => {
        const latDelta = (destinationLocation.latitude - prev.latitude) * 0.05;
        const lngDelta = (destinationLocation.longitude - prev.longitude) * 0.05;

        // Stop updates once the vehicle approaches destination bounds
        if (Math.abs(latDelta) < 0.0001 && Math.abs(lngDelta) < 0.0001) {
          clearInterval(movementInterval);
          setCurrentDistanceLeft("0 km");
          setCurrentETA("Arrived");
          return destinationLocation;
        }

        return {
          latitude: prev.latitude + latDelta,
          longitude: prev.longitude + lngDelta,
        };
      });
    }, 4000);

    return () => clearInterval(movementInterval);
  }, []);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.0],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.5, 0.2, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Dynamic Top Banner: Switched to Active Green En-Route theme */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <Animated.View 
            style={[
              styles.statusPulseWave, 
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity }
            ]} 
          />
          <View style={styles.statusCenterCoreDot}>
            <FontAwesome5 name="car-side" size={11} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>All Passengers Boarded</Text>
          <Text style={styles.statusSecondaryText}>En-route along optimized corridor transit path</Text>
        </View>
      </View>

      {/* Interactive Transit Map Layer */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: 9.0050,
            longitude: 38.7900,
            latitudeDelta: 0.022,
            longitudeDelta: 0.022,
          }}
          customMapStyle={cleanMinimalMapStyle}
        >
          {/* Main Solid Transit Polyline Routing Track */}
          <Polyline
            coordinates={[pickupLocation, destinationLocation]}
            strokeColor="#10B981"
            strokeWidth={5}
          />

          {/* Historical Starting Node Point (Origin Marker) */}
          <Marker coordinate={pickupLocation}>
            <View style={styles.originMarkerPoint} />
          </Marker>

          {/* Targeted Drop-off Station Node */}
          <Marker coordinate={destinationLocation}>
            <View style={styles.destinationMarkerWrapper}>
              <View style={styles.destinationMarkerPin}>
                <Ionicons name="location-sharp" size={14} color="#FFFFFF" />
              </View>
            </View>
          </Marker>

          {/* Active Moving Vehicle Marker */}
          <Marker coordinate={carLocation}>
            <View style={styles.activeCarWrapper}>
              <FontAwesome5 name="car" size={14} color="#FFFFFF" />
            </View>
          </Marker>
        </MapView>
      </View>

      {/* Sliding Active Trip Details Drawer */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Main Transit Summary Analytics Block */}
          <View style={styles.transitSummaryHeader}>
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>ETA DESTINATION</Text>
              <Text style={styles.metricValueHighlight}>{currentETA}</Text>
            </View>
            <View style={styles.verticalSplitter} />
            <View style={styles.metricColumn}>
              <Text style={styles.metricLabel}>DISTANCE LEFT</Text>
              <Text style={styles.metricValueHighlight}>{currentDistanceLeft}</Text>
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Active Pool Information</Text>

          {/* Driver Meta Identity Profile */}
          <View style={styles.driverProfileCard}>
            <View style={styles.avatarHolder}>
              <FontAwesome5 name="user-check" size={16} color="#059669" />
            </View>
            <View style={styles.driverIdentityMeta}>
              <Text style={styles.driverName}>Dawit Mengistu</Text>
              <Text style={styles.vehicleDetails}>Toyota Probox • Code 3 - A02319</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={12} color="#F59E0B" />
              <Text style={styles.ratingText}>4.9</Text>
            </View>
          </View>

          {/* Shared Corridor Manifest Breakdown List */}
          <View style={styles.manifestContainerCard}>
            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="git-commit-outline" size={18} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Corridor Axis</Text>
              </View>
              <Text style={styles.manifestValueText}>{ride.corridor}</Text>
            </View>
            
            <View style={styles.horizontalLineDivider} />

            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="people-sharp" size={16} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Active Co-Riders</Text>
              </View>
              <Text style={styles.manifestValueText}>3 Passengers Boarded</Text>
            </View>

            <View style={styles.horizontalLineDivider} />

            <View style={styles.manifestRow}>
              <View style={styles.leftLabelCluster}>
                <Ionicons name="wallet-sharp" size={16} color="#9CA3AF" />
                <Text style={styles.manifestRouteLabel}>Split Cost Savings</Text>
              </View>
              <Text style={[styles.manifestValueText, { color: "#10B981", fontWeight: "700" }]}>ETB 80 Fixed</Text>
            </View>
          </View>

          {/* 🛠️ SIMULATION TRIGGER BUTTON: Safely passes routeId and ride to completion screen */}
          <TouchableOpacity 
            style={styles.safetyActionButton}
            activeOpacity={0.8}
            onPress={() => navigation.replace("TripCompletionScreen", { routeId, ride })}
          >
            <View style={styles.safetyButtonInternalGroup}>
              <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
              <Text style={styles.safetyButtonText}>COMPLETE TRIP (SIMULATION)</Text>
            </View>
          </TouchableOpacity>

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
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusPulseWave: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: "#FFFFFF" },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", zIndex: 2 },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  originMarkerPoint: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#9CA3AF", borderWidth: 2, borderColor: "#FFFFFF" },
  destinationMarkerWrapper: { justifyContent: "center", alignItems: "center" },
  destinationMarkerPin: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  activeCarWrapper: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
  slidingPanelDrawer: { position: "absolute", bottom: 0, width: width, maxHeight: "50%", backgroundColor: "#F9FAFB", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 20, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8 },
  transitSummaryHeader: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 14, marginBottom: 16 },
  metricColumn: { flex: 1, alignItems: "center", justifyContent: "center" },
  verticalSplitter: { width: 1, backgroundColor: "#E5E7EB" },
  metricLabel: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  metricValueHighlight: { fontSize: 20, fontWeight: "800", color: "#111111", marginTop: 4 },
  sectionHeaderLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  driverProfileCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 10 },
  avatarHolder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  driverIdentityMeta: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 14, fontWeight: "700", color: "#111111" },
  vehicleDetails: { fontSize: 12, color: "#6B7280", marginTop: 1 },
  ratingBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#D97706", marginLeft: 4 },
  manifestContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 18 },
  manifestRow: { flexDirection: "row", justifyValue: "space-between", alignItems: "center", paddingVertical: 12 },
  leftLabelCluster: { flexDirection: "row", alignItems: "center" },
  manifestRouteLabel: { fontSize: 13, color: "#4B5563", marginLeft: 10 },
  manifestValueText: { fontSize: 13, fontWeight: "600", color: "#111111" },
  horizontalLineDivider: { height: 1, backgroundColor: "#F3F4F6" },
  safetyActionButton: { backgroundColor: "#111827", borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  safetyButtonInternalGroup: { flexDirection: "row", alignItems: "center" },
  safetyButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", marginLeft: 8, letterSpacing: 0.3 },
});