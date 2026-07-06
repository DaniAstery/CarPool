import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
const API_URL = "http://192.168.236.52:5000"; 

export default function ProposalDriver({ navigation, route }) {
  const [driverAccepted, setDriverAccepted] = useState(false);
  const [offerDetails, setOfferDetails] = useState(null);
  
  // 👥 Dynamic roster containing users assigned to this offer cluster
  const [poolPassengers, setPoolPassengers] = useState([]); 
  // ⚡ Fresh array tracking explicit passenger IDs that committed to the run
  const [acceptedPassengerIds, setAcceptedPassengerIds] = useState([]); 
  
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45); 

  const currentDriverId = route?.params?.driverId ? parseInt(route?.params?.driverId, 10) : 1;
  const routeId = route?.params?.routeId || "1";
  const activeRideOfferIdRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, longitude: 38.7935, latitudeDelta: 0.008, longitudeDelta: 0.008,
  });

  // 💸 FARE CALCULATIONS
  const pricePerSeat = offerDetails?.price_per_seat ? parseFloat(offerDetails.price_per_seat) : 80.00;
  const totalSeatsAllocated = offerDetails?.total_seats ? parseInt(offerDetails.total_seats, 10) : 4;
  
  const currentAcceptedCount = acceptedPassengerIds.length;
  const currentDriverPayout = currentAcceptedCount * pricePerSeat;

  // 🔐 CORE LOGIC CONDITIONS
  // Rule: Countdown timer starts ONLY after at least 2 passengers accept
  const hasMinimumTwoPassengersAccepted = currentAcceptedCount >= 2;
  
  // Enforce validation constraints for Core Passengers (User 1 and User 2)
  const isPassenger1Accepted = acceptedPassengerIds.includes(1);
  const isPassenger2Accepted = acceptedPassengerIds.includes(2);
  const isDriverButtonUnlocked = isPassenger1Accepted && isPassenger2Accepted && hasMinimumTwoPassengersAccepted;

  const isOfferLockedIn = driverAccepted || offerDetails?.status === "accepted" || offerDetails?.status === "inprogress";

  // Initialize Location Engine Frame
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let location = await Location.getCurrentPositionAsync({});
          setCurrentLocation({
            latitude: location.coords.latitude, longitude: location.coords.longitude,
            latitudeDelta: 0.008, longitudeDelta: 0.008,
          });
        }
      } catch (err) {
        console.log("GPS hardware connection failure:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 🕒 ELAPSED TIMER CONTROLLER
  useEffect(() => {
    // Keep timer completely frozen until at least two users change status to accepted
    if (!hasMinimumTwoPassengersAccepted || isOfferLockedIn) return;

    if (timeLeft <= 0 && !driverAccepted) {
      Alert.alert("Offer Expired", "The dispatch window for this cluster has run out. Reassigning run.", [
        {
          text: "Return to Queue",
          onPress: () => {
            navigation.reset({
              index: 0,
              routes: [{ name: "DriverDashboardScreen", params: { driverId: currentDriverId } }],
            });
          }
        }
      ]);
      return;
    }

    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, hasMinimumTwoPassengersAccepted, driverAccepted, isOfferLockedIn]);

  // 🔄 LIVE-SYNC POLLING PIPELINE
  useEffect(() => {
    async function syncDatabaseManifestState() {
      try {
        const res = await fetch(`${API_URL}/api/rides/driver-proposal/${currentDriverId}`);
        if (!res.ok) return;
        
        const data = await res.json(); 
        setOfferDetails(data);
        activeRideOfferIdRef.current = data.id;

        // SANITIZE POSTGRES ARRAY STRINGS AND CONVERT TO NATIVE INTEGERS
        let cleanIds = [];
        if (data.accepted_passengers) {
          if (Array.isArray(data.accepted_passengers)) {
            cleanIds = data.accepted_passengers.map(id => parseInt(id, 10));
          } else if (typeof data.accepted_passengers === "string") {
            cleanIds = data.accepted_passengers
              .replace(/{|}/g, "")
              .split(",")
              .map(id => parseInt(id.trim(), 10))
              .filter(id => !isNaN(id));
          }
        }

        setAcceptedPassengerIds(cleanIds);

        // 🎯 FIX: Smart Roster Parsing
        if (data.route_pool_passengers && Array.isArray(data.route_pool_passengers) && data.route_pool_passengers.length > 0) {
          setPoolPassengers(data.route_pool_passengers);
        } else {
          // If the nested array is missing, build it dynamically from the keys we DO have!
          // This makes sure User 1 and User 2 show up properly instead of ghost text.
          const activeIds = cleanIds.length > 0 ? cleanIds : [1, 2];
          
          // Ensure we display at least the seats that have interacted
          const uniqueRiders = [...new Set([...activeIds, 1, 2])]; 
          
          const structuredRoster = uniqueRiders.map(id => ({
            user_id: id,
            status: cleanIds.includes(id) ? "accepted" : "matched",
            name: `Passenger Slot ${id}`
          }));
          
          setPoolPassengers(structuredRoster);
        }

        // Handle auto-routing state migrations
        if (data.status === "accepted" || data.status === "inprogress") {
          setDriverAccepted(true);
          navigation.replace("NavigateToPickup", { 
            routeId: data.route_id || routeId, 
            rideOfferId: data.id, 
            driverId: currentDriverId 
          });
        }

      } catch (err) {
        console.log("Corridor Manifest Sync Failure:", err);
      }
    }

    syncDatabaseManifestState();
    const pollInterval = setInterval(syncDatabaseManifestState, 2000); 
    
    return () => clearInterval(pollInterval);
    
    // 🎯 FIX: Removed acceptedPassengerIds and poolPassengers from the dependency array 
    // to stop the state from constantly clearing out its own data variables.
  }, [currentDriverId]);

  // 🎯 SUBMIT HANDSHAKE TRANSITION TO DISPATCH PIPELINE
  const handleDriverAccept = async () => {
    if (!isDriverButtonUnlocked || isOfferLockedIn || timeLeft <= 0) return;
    
    setDriverAccepted(true); 
    
    try {
      const res = await fetch(`${API_URL}/api/rides/driver-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ride_offer_id: activeRideOfferIdRef.current || 1, 
          driver_id: currentDriverId 
        }),
      });

      const responseData = await res.json();

      if (res.ok && responseData.success) {
        // Redirect to pickup execution map view using exact App.js key string
        navigation.replace("NavigateToPickup", { 
          routeId, 
          rideOfferId: responseData.rideOfferId || activeRideOfferIdRef.current || 1, 
          driverId: currentDriverId 
        });
      } else {
        setDriverAccepted(false);
        Alert.alert("Dispatch Rejection", responseData.error || "Manifest cluster locked or changed.");
      }
    } catch (err) {
      setDriverAccepted(false);
      console.log("Accept network execution route error:", err);
      Alert.alert("Connection Failure", "Could not reach Corridor routing hub.");
    }
  };

  const handleDriverDecline = async () => {
    Alert.alert(
      "Decline Dispatch Manifest?",
      "Rejecting this cluster removes you from the immediate station queue line logs.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline Run",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/rides/driver-decline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ driver_id: currentDriverId, ride_offer_id: activeRideOfferIdRef.current || 1 }),
              });
            } catch (err) {
              console.log("Decline tracking crash:", err);
            }
            navigation.reset({
              index: 0,
              routes: [{ name: "DriverDashboardScreen", params: { driverId: currentDriverId } }],
            });
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Run Offer</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={true}
          customMapStyle={cleanMinimalMapStyle}
        >
          <Marker coordinate={{ latitude: currentLocation.latitude + 0.0004, longitude: currentLocation.longitude + 0.0004 }}>
            <View style={styles.hubMarkerContainer}>
              <View style={styles.hubMarkerPin}><Ionicons name="car" size={18} color="#FFFFFF" /></View>
              <View style={styles.hubMarkerPulse} />
            </View>
          </Marker>
        </MapView>
      </View>

      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Gross Payout Display Frame */}
          <View style={styles.priceTierCard}>
            <Text style={styles.priceTierHeading}>CURRENT RUN DISPATCH PAYOUT</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>
                {`ETB ${currentDriverPayout}.00`}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>{`${currentAcceptedCount} Seats Confirmed`}</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>• Base Rate: <Text style={{fontWeight:'700', color: '#10B981'}}>{`ETB ${pricePerSeat}`}</Text> per committed pool user seat.</Text>
            </View>
          </View>

          {/* TIMER BANNER STATE BLOCK */}
          <View style={[styles.timerBanner, !hasMinimumTwoPassengersAccepted ? styles.timerWaiting : timeLeft < 15 ? styles.timerUrgent : null]}>
            <MaterialCommunityIcons 
              name={hasMinimumTwoPassengersAccepted ? "clock-fast" : "account-clock-outline"} 
              size={18} 
              color={!hasMinimumTwoPassengersAccepted ? "#6B7280" : timeLeft < 15 ? "#EF4444" : "#10B981"} 
            />
            <Text style={[styles.timerText, !hasMinimumTwoPassengersAccepted ? {color: "#6B7280"} : timeLeft < 15 ? {color: "#EF4444"} : {color: "#10B981"}]}>
              {!hasMinimumTwoPassengersAccepted 
                ? `Awaiting core thresholds (Need 2, got ${currentAcceptedCount})...` 
                : driverAccepted 
                  ? "Locking Run..."
                  : `Remaining Window for Leftover Seats: ${timeLeft}s`}
            </Text>
          </View>

          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}><Ionicons name="git-commit-sharp" size={20} color="#10B981" /></View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>{offerDetails?.start_location || "Megenagna Departure Hub"}</Text>
              <Text style={styles.locationSubtitle}>{`Destination: ${offerDetails?.end_location || "Piassa"}`}</Text>
            </View>
          </View>

          {/* DYNAMIC MANIFEST ROSTER RENDERING SECTION */}
          <Text style={styles.sectionHeading}>{`Manifest RoutePool Registry (${currentAcceptedCount}/${totalSeatsAllocated} Filled)`}</Text>
          <View style={styles.statusTable}>
         {poolPassengers.map((passenger) => {
  // Force clean integer parsing to prevent string-vs-number mismatches
  const pId = parseInt(passenger.user_id || passenger.id, 10);
  
  // Cross-verify acceptance status from both sources
  const isPassengerAccepted = 
    acceptedPassengerIds.includes(pId) || 
    passenger.status === 'accepted' || 
    offerDetails?.accepted_passengers?.map(Number).includes(pId);

  const isCoreRequirement = pId === 1 || pId === 2;
  
  return (
    <View key={`manifest-rider-row-${pId}`} style={styles.tableRow}>
      <View style={styles.tableUserLabelGroup}>
        <Ionicons 
          name="person-outline" 
          size={14} 
          color={isPassengerAccepted ? "#10B981" : "#6B7280"} 
        />
        <Text style={styles.tableUserText}>
          {passenger.name || `Passenger ${pId}`}
          {isCoreRequirement && <Text style={{fontSize: 11, color: '#EF4444', fontWeight:'600'}}> *Core Lock</Text>}
        </Text>
      </View>
      <View style={[styles.badge, isPassengerAccepted ? styles.badgeAccepted : styles.badgePending]}>
        <Text style={[styles.badgeText, isPassengerAccepted ? styles.textAccepted : styles.textPending]}>
          {isPassengerAccepted ? "Accepted" : "Matched / Pending"}
        </Text>
      </View>
    </View>
  );
})}
          </View>

          {/* WORKFLOW DISPATCH SELECTION CONTROLS */}
          <View style={styles.actionButtonContainer}>
            <View style={styles.buttonButtonGroup}>
              <TouchableOpacity style={styles.declineButton} onPress={handleDriverDecline} activeOpacity={0.7} disabled={isOfferLockedIn}>
                <Text style={styles.declineButtonText}>DECLINE</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.acceptButton, 
                  (!isDriverButtonUnlocked || (hasMinimumTwoPassengersAccepted && timeLeft <= 0)) 
                    ? { backgroundColor: "#9CA3AF" } 
                    : driverAccepted 
                      ? { backgroundColor: "#059669" } 
                      : { backgroundColor: "#10B981" }
                ]} 
                onPress={handleDriverAccept} 
                activeOpacity={0.8}
                disabled={!isDriverButtonUnlocked || (hasMinimumTwoPassengersAccepted && timeLeft <= 0) || driverAccepted}
              >
                <Text style={styles.acceptButtonText}>
                  {driverAccepted 
                    ? "LOCKING MANIFEST..." 
                    : (hasMinimumTwoPassengersAccepted && timeLeft <= 0) 
                      ? "DISPATCH WINDOW ELAPSED"
                      : !isDriverButtonUnlocked
                        ? "AWAITING CORE PASSENGERS"
                        : `Accept [${currentDriverPayout} ETB]`
                  }
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF" },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  mapContainer: { flex: 1 },
  hubMarkerContainer: { alignItems: "center", justifyContent: "center" },
  hubMarkerPin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  hubMarkerPulse: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "75%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 24, elevation: 10 },
  priceTierCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  priceTierHeading: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tierBadgeText: { fontSize: 11, color: "#065F46", fontWeight: "700" },
  priceBreakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  timerBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#E6F4EA", paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  timerWaiting: { backgroundColor: "#F3F4F6", borderWidth: 0.5, borderColor: "#D1D5DB" },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: { fontSize: 13, color: "#10B981", marginLeft: 6, fontWeight: "600" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E6F4EA", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusTable: { marginBottom: 16 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500" },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 95, alignItems: "center" },
  badgePending: { backgroundColor: "#EFF6FF" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textPending: { color: "#3B82F6" },
  textAccepted: { color: "#10B981" },
  actionButtonContainer: { marginTop: 4 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  declineButton: { width: "30%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: { width: "66%", backgroundColor: "#10B981", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" }
});