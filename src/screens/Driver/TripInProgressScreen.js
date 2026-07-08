import React, { useEffect, useState, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  Alert,
  Dimensions 
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const API_BASE_URL = "http://192.168.253.52:5000/api";
const { width, height } = Dimensions.get("window");

export default function TripInProgressScreen({ navigation, route }) {
  const mapRef = useRef(null);

  const routeId = route?.params?.routeId || "1";
  const rideOfferId = route?.params?.rideOfferId || 1;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [passengerStates, setPassengerStates] = useState([]);
  
  const [driverLocation, setDriverLocation] = useState({ latitude: 9.0015, longitude: 38.7815 });
  const [nextDropoffLocation, setNextDropoffLocation] = useState({ latitude: 8.9984, longitude: 38.7855 });

  useEffect(() => {
    let isMounted = true;

    async function pollTripTelemetry() {
      try {
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${rideOfferId}`);
        
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }

        const data = await res.json();
        if (!data || !isMounted) return;

        setRideMetrics(data);

        if (data.driverLocation) {
          const updatedDriverLoc = {
            latitude: parseFloat(data.driverLocation.latitude),
            longitude: parseFloat(data.driverLocation.longitude)
          };
          setDriverLocation(updatedDriverLoc);

          if (data.nextCheckpointLocation) {
            setNextDropoffLocation({
              latitude: parseFloat(data.nextCheckpointLocation.latitude),
              longitude: parseFloat(data.nextCheckpointLocation.longitude)
            });
          }

          if (mapRef.current) {
            mapRef.current.fitToCoordinates(
              [updatedDriverLoc, nextDropoffLocation],
              {
                edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
                animated: true,
              }
            );
          }
        }

        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedManifest = data.passengers.map((p) => ({
            id: p.userId || p.id,
            name: p.name || `Rider ${p.userId || p.id}`,
            dropoff: p.dropoff_name || p.dropoff || "Bole Station Hub",
            fare: parseFloat(data.price_per_seat) || 80
          }));
          setPassengerStates(parsedManifest);
        }

        setLoading(false);
      } catch (err) {
        console.log("Telemetry Sync Error:", err);
        if (isMounted) setLoading(false);
      }
    }

    pollTripTelemetry();
    const intervalId = setInterval(pollTripTelemetry, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [rideOfferId, nextDropoffLocation]);

  const handleFinishTrip = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rides/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: rideOfferId }),
      });

      if (response.ok) {
        navigation.replace("TripEarningsSummary", {
          rideOfferId: rideOfferId,
          routeId: routeId
        });
      } else {
        const errorResult = await response.json();
        Alert.alert("Trip Completion Error", errorResult.error || "Could not complete trip step.");
      }
    } catch (err) {
      Alert.alert("Connection Failure", "Server synchronization path interrupted.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Connecting live tracking matrix...</Text>
      </View>
    );
  }

  const totalRiders = passengerStates.length;
  const seatRate = parseFloat(rideMetrics?.price_per_seat) || 80;
  const totalGrossEarnings = totalRiders * seatRate;
  
  const distanceRemaining = parseFloat(rideMetrics?.distance_remaining) || 1.2;
  const totalTripKms = parseFloat(rideMetrics?.total_trip_kms) || 4.8;

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Premium Integrated Header HUD */}
      <View style={styles.headerBlock}>
        <View style={styles.liveIndicatorContainer}>
          <View style={styles.livePulseDot} />
          <Text style={styles.headerTitleText}>EN ROUTE</Text>
        </View>
        <View style={styles.routePillBadge}>
          <Text style={styles.routeCodeText}>CR-{routeId}</Text>
        </View>
      </View>

      {/* Advanced Map Engine Container */}
      <View style={styles.mapViewportWrapper}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: 9.0015,
            longitude: 38.7815,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          }}
          customMapStyle={premiumMinimalMapStyle}
        >
          <Marker coordinate={driverLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.proDriverCarPin}>
              <FontAwesome5 name="navigation" size={12} color="#FFFFFF" />
            </View>
          </Marker>

          <Marker coordinate={nextDropoffLocation}>
            <View style={styles.proDropoffPin}>
              <View style={styles.innerDropoffCore} />
            </View>
          </Marker>

          <Polyline
            coordinates={[driverLocation, nextDropoffLocation]}
            strokeColor="#111827"
            strokeWidth={4}
          />
        </MapView>

        {/* Floating Context Guideline Card Overlay */}
        <View style={styles.mapFloatingHUDCard}>
          <Ionicons name="speedometer-outline" size={16} color="#4B5563" style={{ marginRight: 8 }} />
          <Text style={styles.mapCardText}>
            Odometer tracking active: <Text style={{ fontWeight: "700" }}>{totalTripKms.toFixed(1)} km</Text>
          </Text>
        </View>
      </View>

      {/* Sliding Dashboard Drawer */}
      <View style={styles.slidingDrawerSheet}>
        <View style={styles.drawerPullIndicatorBar} />
        
        <ScrollView style={styles.drawerContentBody} showsVerticalScrollIndicator={false}>
          
          {/* Executive Multi-Grid Data Panel */}
          <View style={styles.executiveTelemetryStrip}>
            <View style={styles.executiveDataColumn}>
              <Text style={styles.executiveMetaLabel}>EST. EARNINGS</Text>
              <Text style={styles.executiveMetricHighlight}>ETB {totalGrossEarnings.toFixed(2)}</Text>
            </View>
            <View style={styles.executiveDividerLine} />
            <View style={styles.executiveDataColumn}>
              <Text style={styles.executiveMetaLabel}>UTILIZATION</Text>
              <Text style={styles.executiveMetricHighlight}>{totalRiders} / 4 seats</Text>
            </View>
          </View>

          {/* Clean Next Target Checkpoint Panel */}
          <Text style={styles.sectionHeadingLabel}>Up Next</Text>
          <View style={styles.premiumCheckpointCard}>
            <View style={styles.checkpointStatusPulseWrapper}>
              <Ionicons name="location" size={16} color="#059669" />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.checkpointMainText}>
                {passengerStates[0]?.dropoff || "Bole Medhanialem Station"}
              </Text>
              <Text style={styles.checkpointSubText}>Approaching sequence terminal node</Text>
            </View>
            <View style={styles.checkpointDistanceBadge}>
              <Text style={styles.checkpointDistanceText}>{distanceRemaining.toFixed(1)} km</Text>
            </View>
          </View>

          {/* Roster Manifest List */}
          <Text style={styles.sectionHeadingLabel}>Corridor Manifest Pool</Text>
          <View style={styles.premiumManifestCard}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>Awaiting passenger dispatch checks...</Text>
            ) : (
              passengerStates.map((passenger, index) => (
                <View key={`passenger-${passenger.id}`}>
                  <View style={styles.passengerRow}>
                    <View style={styles.proAvatarWrapper}>
                      <Text style={styles.proAvatarInitial}>{passenger.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerMainName}>{passenger.name}</Text>
                      <Text style={styles.passengerRouteDropoff}>To: {passenger.dropoff}</Text>
                    </View>
                    <Text style={styles.passengerCorporateFare}>ETB {passenger.fare}</Text>
                  </View>
                  {index < passengerStates.length - 1 && <View style={styles.proHorizontalDivider} />}
                </View>
              ))
            )}
          </View>

        </ScrollView>
      </View>

      {/* Premium Fixed Button Footer Block */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={[styles.premiumActionCTAButton, submitting && { opacity: 0.7 }]}
          activeOpacity={0.8}
          disabled={submitting}
          onPress={handleFinishTrip}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.premiumActionCTAButtonText}>CONCLUDE CORRIDOR TRIP</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// Minimal Map Styling Engine Layout
const premiumMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F3F4F6" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#E5E7EB" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#6B7280", fontWeight: "600", letterSpacing: 0.2 },
  
  // Executive HUD Headers
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#F3F4F6" },
  liveIndicatorContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF2F2", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  livePulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  headerTitleText: { fontSize: 11, fontWeight: "800", color: "#EF4444", letterSpacing: 0.8 },
  routePillBadge: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  routeCodeText: { fontSize: 11, fontWeight: "700", color: "#1F2937", letterSpacing: 0.4 },
  
  // Map Wrappers & Viewport Anchors
  mapViewportWrapper: { height: height * 0.28, backgroundColor: "#E5E7EB", position: "relative" },
  mapFloatingHUDCard: { position: "absolute", bottom: 14, left: 16, right: 16, flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3 },
  mapCardText: { fontSize: 12, color: "#374151", fontWeight: "500" },
  proDriverCarPin: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#111827", justifyContent: "center", alignItems: "center", borderWidth: 3, borderColor: "#FFFFFF", transform: [{ rotate: "45deg" }] },
  proDropoffPin: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
  innerDropoffCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981" },
  
  // Premium Layout Drawer Sheets
  slidingDrawerSheet: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -14, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 5 },
  drawerPullIndicatorBar: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginTop: 10 },
  drawerContentBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, marginLeft: 2 },
  
  // Executive Grid Panels
  executiveTelemetryStrip: { flexDirection: "row", backgroundColor: "#F9FAFB", borderRadius: 16, borderWidth: 1, borderColor: "#F3F4F6", paddingVertical: 16, marginBottom: 20 },
  executiveDataColumn: { flex: 1, alignItems: "center", justifyContent: "center" },
  executiveMetaLabel: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.6, marginBottom: 4 },
  executiveMetricHighlight: { fontSize: 15, fontWeight: "800", color: "#111827", letterSpacing: -0.2 },
  executiveDividerLine: { width: 1, backgroundColor: "#E5E7EB" },

  // Checkpoint Modules
  premiumCheckpointCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 14, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 2 },
  checkpointStatusPulseWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  checkpointMainText: { fontSize: 14, fontWeight: "700", color: "#111827", letterSpacing: -0.1 },
  checkpointSubText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  checkpointDistanceBadge: { backgroundColor: "#F3F4F6", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  checkpointDistanceText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  
  // Manifest Module Layouts
  premiumManifestCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 24 },
  emptyManifestText: { paddingVertical: 18, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  proAvatarWrapper: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  proAvatarInitial: { fontSize: 12, fontWeight: "700", color: "#374151" },
  passengerMainName: { fontSize: 13, fontWeight: "700", color: "#111827" },
  passengerRouteDropoff: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  passengerCorporateFare: { fontSize: 13, fontWeight: "700", color: "#10B981" },
  proHorizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  // Footer Elements
  footerContainer: { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#F3F4F6" },
  premiumActionCTAButton: { backgroundColor: "#111827", borderRadius: 12, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  premiumActionCTAButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.6 },
});