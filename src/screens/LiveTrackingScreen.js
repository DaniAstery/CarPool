import React, { useEffect, useState } from "react";
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
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function LiveTrackingScreen({ navigation, route }) {
  // Core Reference Coordinates (Megenagna Hub Area)
  const pickupLocation = { latitude: 9.0115, longitude: 38.7945 };
  
  // Animation states
  const [pulseAnim] = useState(new Animated.Value(0));
  const [userArrived, setUserArrived] = useState(false);
  
  // Real-time state simulation values for passengers
  const [passengerStates, setPassengerStates] = useState([
    {
      id: "You",
      name: "You",
      latitude: 9.0098,
      longitude: 38.7932,
      distance: "180m",
      time: "2 min left",
      color: "#3A82F6",
      status: "Walking",
    },
    {
      id: "Rider2",
      name: "Rider 2",
      latitude: 9.0115,
      longitude: 38.7945, // Already positioned at convergence point
      distance: "0m",
      time: "Arrived",
      color: "#E28743",
      status: "Arrived",
    },
    {
      id: "Rider3",
      name: "Rider 3",
      latitude: 9.0128,
      longitude: 38.7931,
      distance: "90m",
      time: "1 min left",
      color: "#764ABC",
      status: "Walking",
    },
  ]);

  // Driver Initial Coordinates
  const [driverLocation, setDriverLocation] = useState({
    latitude: 9.0045,
    longitude: 38.7865,
  });

  // Infinite Pulse Tracker Animation loop for the status bar header icon
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

  // Simulating live progress updates and arrival triggers
  useEffect(() => {
    // Simulate Rider 3 arriving at the hub after 4 seconds
    const rider3Timer = setTimeout(() => {
      setPassengerStates((prev) =>
        prev.map((p) =>
          p.id === "Rider3"
            ? { ...p, distance: "0m", time: "Arrived", status: "Arrived" }
            : p
        )
      );
    }, 4000);

    // Smoothly draw driver vehicle closer to pickup node
    const driverInterval = setInterval(() => {
      setDriverLocation((prev) => {
        const latDelta = (pickupLocation.latitude - prev.latitude) * 0.08;
        const lngDelta = (pickupLocation.longitude - prev.longitude) * 0.08;
        return {
          latitude: prev.latitude + latDelta,
          longitude: prev.longitude + lngDelta,
        };
      });
    }, 3000);

    return () => {
      clearTimeout(rider3Timer);
      clearInterval(driverInterval);
    };
  }, []);

  const handleUserArrival = () => {
    setUserArrived(true);
    setPassengerStates((prev) =>
      prev.map((p) =>
        p.id === "You"
          ? { ...p, distance: "0m", time: "Arrived", status: "Arrived" }
          : p
      )
    );
    
    // Simulate trip starting shortly after everyone has arrived
    setTimeout(() => {
      console.log("All passengers gathered at pickup hub. Transitioning to Transit state...");
    }, 3000);
  };

  // Interpolation parameters for the top-bar status target pulse ring
  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.6, 0.3, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Precise Image Clone UI Component: Dynamic Context Header Banner */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <Animated.View 
            style={[
              styles.statusPulseWave, 
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity }
            ]} 
          />
          <View style={styles.statusCenterCoreDot}>
            <MaterialCommunityIcons name="walk" size={14} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>Walking to Pickup Point</Text>
          <Text style={styles.statusSecondaryText}>Please head over to the highlighted convergence station</Text>
        </View>
      </View>

      {/* 2. Interactive Map Layer Base */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: 9.0102,
            longitude: 38.7922,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          customMapStyle={cleanMinimalMapStyle}
        >
          {/* Active Walk Polyline routing tracks overlay */}
          {passengerStates.map((p, idx) => (
            p.status === "Walking" && (
              <Polyline
                key={`line-${idx}`}
                coordinates={[{ latitude: p.latitude, longitude: p.longitude }, pickupLocation]}
                strokeColor={p.color}
                strokeWidth={3}
                lineDashPattern={[5, 5]}
              />
            )
          ))}

          {/* Core Centralized Pickup Target Station Node */}
          <Marker coordinate={pickupLocation}>
            <View style={styles.hubStationWrapper}>
              <View style={styles.hubStationPin}>
                <Ionicons name="flag" size={14} color="#FFFFFF" />
              </View>
              <View style={styles.hubStationPulseRing} />
            </View>
          </Marker>

          {/* Incoming Shared Vehicle Pin */}
          <Marker coordinate={driverLocation}>
            <View style={styles.driverCarPin}>
              <FontAwesome5 name="car-side" size={13} color="#FFFFFF" />
            </View>
          </Marker>

          {/* Scattered Co-Riders Locations */}
          {passengerStates.map((p, idx) => (
            p.status === "Walking" && (
              <Marker key={`marker-${idx}`} coordinate={{ latitude: p.latitude, longitude: p.longitude }}>
                <View style={[styles.passengerTrackingPin, { backgroundColor: p.color }]}>
                  <MaterialCommunityIcons name={p.id === "You" ? "walk" : "account"} size={12} color="#FFFFFF" />
                </View>
              </Marker>
            )
          ))}
        </MapView>
      </View>

      {/* 3. Precise Image Clone UI Component: Dynamic Cards Sliding Panel */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Driver ETA Summary Header Area */}
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

          {/* Individual Passenger Arrival Progression Matrix Cards */}
          <View style={styles.passengerQueueStack}>
            {passengerStates.map((passenger, index) => (
              <View key={`card-${index}`} style={styles.passengerStateCard}>
                <View style={styles.cardLeftContent}>
                  <View style={[styles.passengerAvatarFrame, { backgroundColor: `${passenger.color}15` }]}>
                    <MaterialCommunityIcons name={passenger.icon} size={20} color={passenger.color} />
                  </View>
                  <View style={styles.passengerTextIdentity}>
                    <Text style={[styles.passengerNameTitle, passenger.id === "You" && { fontWeight: "800" }]}>
                      {passenger.name}
                    </Text>
                    <Text style={styles.passengerWalkRouteLabel}>
                      {passenger.status === "Arrived" ? "At meeting location" : `Distance: ${passenger.distance}`}
                    </Text>
                  </View>
                </View>

                {/* Conditional right action badge matching the design blueprint layout state */}
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

          {/* Dynamic Core Interaction Toggle */}
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

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D2E4F9" }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  statusBarBanner: {
    backgroundColor: "#1F2937", // Matching image theme configuration
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 20,
  },
  statusIndicatorWrapper: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  statusPulseWave: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
  },
  statusCenterCoreDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#3B82F6",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  statusTextContainer: {
    flex: 1,
  },
  statusPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  statusSecondaryText: {
    color: "#9CA3AF",
    fontSize: 11,
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
  },
  hubStationWrapper: {
    justifyContent: "center",
    alignItems: "center",
  },
  hubStationPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 5,
  },
  hubStationPulseRing: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  driverCarPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  passengerTrackingPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  slidingPanelDrawer: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "50%",
    backgroundColor: "#F9FAFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  etaSummaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  etaIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E6F4EA",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  etaTextFrame: {
    flex: 1,
  },
  etaPrimaryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  etaSecondaryLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 1,
  },
  sectionHeaderLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 2,
  },
  passengerQueueStack: {
    marginBottom: 16,
  },
  passengerStateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  cardLeftContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  passengerAvatarFrame: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  passengerTextIdentity: {
    flex: 1,
  },
  passengerNameTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111111",
  },
  passengerWalkRouteLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  badgeArrivedDone: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeTextArrivedDone: {
    fontSize: 11,
    fontWeight: "700",
    color: "#10B981",
    marginLeft: 4,
  },
  badgeWalkingCountdown: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeTextWalkingCountdown: {
    fontSize: 11,
    fontWeight: "700",
  },
  arrivedCallToActionButton: {
    backgroundColor: "#111111",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  arrivedCallToActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  globalSuccessBanner: {
    backgroundColor: "#ECFDF5",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  globalSuccessBannerText: {
    color: "#065F46",
    fontSize: 13,
    fontWeight: "700",
  },
});