import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";

const { width } = Dimensions.get("window");

// 🌐 NETWORK HOST CONFIGURATION
const API_URL = "http://192.168.112.52:5000/api";

export default function ProposalDriver({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS
  const { user } = useAuth();
  const currentDriverId =
    user?.id ||
    user?.driver_id ||
    (route?.params?.driverId ? parseInt(route?.params?.driverId, 10) : 10);
  const routeId = route?.params?.routeId || "1";
  const activeRideOfferIdRef = useRef(null);

  // 📍 2. STATE MATRIX
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105,
    longitude: 38.7935,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });

  const [driverAccepted, setDriverAccepted] = useState(false);
  const [offerDetails, setOfferDetails] = useState(null);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [strictlyAcceptedCount, setStrictlyAcceptedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45);
  const [networkError, setNetworkError] = useState(null);

  // 💸 COMPUTED PRICING & SEAT COUNTS
  const pricePerSeat = offerDetails?.price_per_seat
    ? parseFloat(offerDetails.price_per_seat)
    : 80.0;
  const currentDriverPayout = strictlyAcceptedCount * pricePerSeat;
  const totalSeats = offerDetails?.total_seats
    ? parseInt(offerDetails.total_seats, 10)
    : 4;
  const availableSeats = Math.max(0, totalSeats - strictlyAcceptedCount);

  // 🔐 VALIDATION & UNLOCK THRESHOLDS
  // STRICT: Requires at least 2 passengers with 'accepted' status
  const hasMinimumRequiredPassengers = strictlyAcceptedCount >= 2;
  const isDriverButtonUnlocked = hasMinimumRequiredPassengers;
  const isOfferLockedIn =
    driverAccepted ||
    offerDetails?.status === "accepted" ||
    offerDetails?.status === "inprogress";

  // 📡 3. GPS INITIALIZATION
  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let location = await Location.getCurrentPositionAsync({});
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          });
        }
      } catch (err) {
        console.log("GPS Location initialization failed:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 🕒 4. DISPATCH TIMER CONTROLLER
  useEffect(() => {
    if (!hasMinimumRequiredPassengers || isOfferLockedIn) return;

    if (timeLeft <= 0 && !driverAccepted) {
      Alert.alert(
        "Offer Expired",
        "The dispatch acceptance window for this cluster has run out.",
        [
          {
            text: "Return to Queue",
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: "DriverDashboardScreen",
                    params: { driverId: currentDriverId },
                  },
                ],
              });
            },
          },
        ]
      );
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [
    timeLeft,
    hasMinimumRequiredPassengers,
    driverAccepted,
    isOfferLockedIn,
    currentDriverId,
  ]);

  // 🔄 5. DEDICATED CLUSTER POLLING PIPELINE
  useEffect(() => {
    if (!currentDriverId) return;

    async function syncClusterProposalState() {
      try {
        // 🎯 Calls the dedicated cluster offer endpoint
        const url = `${API_URL}/rides/driver-cluster-offer/${currentDriverId}`;
        const res = await fetch(url);

        if (!res.ok) {
          console.warn(`⚠️ [Cluster Sync] Non-OK response: ${res.status}`);
          return;
        }

        const data = await res.json();
        setNetworkError(null);

        if (!data || !data.hasActiveProposal) {
          return;
        }

        setOfferDetails(data);
        activeRideOfferIdRef.current = data.ride_offer_id || data.id;

        // Parse passenger manifest list
        const rawPassengers = data.passengers || [];

        // ✅ FIXED CLEAN MAPPING
        const unifiedRoster = rawPassengers.map((rider) => {
          const userId = parseInt(rider.user_id || rider.id, 10);
          return {
            user_id: userId,
            status: rider.status, // The backend guarantees this is now 100% accurate
            name: rider.name || `Passenger ${userId}`,
            phone_number: rider.phone_number,
          };
        });

        const acceptedCount = unifiedRoster.filter(
          (p) => p.status === "accepted"
        ).length;

        setStrictlyAcceptedCount(acceptedCount);
        setPoolPassengers(unifiedRoster);

        // Auto-navigate to Pickup if offer moves to active state
        const currentOfferStatus = data.status
          ? data.status.toString().trim().toLowerCase()
          : "";

        if (
          ["accepted", "inprogress", "arrived"].includes(currentOfferStatus)
        ) {
          setDriverAccepted(true);
          const payloadId = parseInt(data.ride_offer_id || data.id, 10);
          navigation.replace("NavigateToPickup", {
            routeId: data.route_id || routeId,
            route_id: data.route_id || routeId,
            rideOfferId: payloadId,
            ride_offer_id: payloadId,
            rideId: payloadId,
            driverId: currentDriverId,
          });
        }
      } catch (err) {
        console.error("❌ [Cluster Sync] Connection Error:", err.message);
        setNetworkError(`Cannot connect to host: ${API_URL}`);
      }
    }

    syncClusterProposalState();
    const pollInterval = setInterval(syncClusterProposalState, 3000);
    return () => clearInterval(pollInterval);
  }, [currentDriverId, routeId, navigation]);

  // 🎯 6. ACTION HANDLERS
  const handleDriverAccept = async () => {
    if (!isDriverButtonUnlocked || isOfferLockedIn || timeLeft <= 0) return;

    setDriverAccepted(true);

    try {
      const res = await fetch(`${API_URL}/rides/driver-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: activeRideOfferIdRef.current || 1,
          driver_id: currentDriverId,
        }),
      });

      const responseData = await res.json();

      if (res.ok && responseData.success) {
        const finalId = parseInt(
          responseData.rideOfferId || activeRideOfferIdRef.current || 1,
          10
        );

        navigation.replace("NavigateToPickup", {
          routeId: routeId,
          route_id: routeId,
          rideOfferId: finalId,
          ride_offer_id: finalId,
          rideId: finalId,
          driverId: currentDriverId,
        });
      } else {
        setDriverAccepted(false);
        Alert.alert(
          "Dispatch Rejection",
          responseData.error || "Manifest cluster state lock failed."
        );
      }
    } catch (err) {
      setDriverAccepted(false);
      console.log("Accept execution error:", err);
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
              await fetch(`${API_URL}/rides/driver-decline`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  driver_id: currentDriverId,
                  ride_offer_id: activeRideOfferIdRef.current || 1,
                }),
              });
            } catch (err) {
              console.log("Decline error:", err);
            }
            navigation.reset({
              index: 0,
              routes: [
                {
                  name: "DriverDashboardScreen",
                  params: { driverId: currentDriverId },
                },
              ],
            });
          },
        },
      ]
    );
  };

  // Helper for status badge rendering
  const renderStatusBadge = (status) => {
    const normStatus = (status || "matched").toLowerCase();

    if (normStatus === "accepted" || normStatus === "confirmed") {
      return (
        <View style={[styles.badge, styles.badgeAccepted]}>
          <Text style={[styles.badgeText, styles.textAccepted]}>Accepted</Text>
        </View>
      );
    }
    if (normStatus === "arrived") {
      return (
        <View style={[styles.badge, styles.badgeArrived]}>
          <Text style={[styles.badgeText, styles.textArrived]}>Arrived</Text>
        </View>
      );
    }
    if (normStatus === "searching") {
      return (
        <View style={[styles.badge, styles.badgeSearching]}>
          <Text style={[styles.badgeText, styles.textSearching]}>Searching</Text>
        </View>
      );
    }
    return (
      <View style={[styles.badge, styles.badgeMatched]}>
        <Text style={[styles.badgeText, styles.textMatched]}>Matched</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Run Offer</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ERROR BANNER */}
      {networkError && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color="#FFFFFF" />
          <Text style={styles.errorBannerText}>{networkError}</Text>
        </View>
      )}

      {/* MAP AREA */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          region={currentLocation}
          showsUserLocation={true}
          customMapStyle={cleanMinimalMapStyle}
        >
          <Marker
            coordinate={{
              latitude: currentLocation.latitude + 0.0004,
              longitude: currentLocation.longitude + 0.0004,
            }}
          >
            <View style={styles.hubMarkerContainer}>
              <View style={styles.hubMarkerPin}>
                <Ionicons name="car" size={18} color="#FFFFFF" />
              </View>
              <View style={styles.hubMarkerPulse} />
            </View>
          </Marker>
        </MapView>
      </View>

      {/* PROPOSAL CARD */}
      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* PAYOUT BREAKDOWN */}
          <View style={styles.priceTierCard}>
            <Text style={styles.priceTierHeading}>CURRENT RUN DISPATCH PAYOUT</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>
                {`ETB ${currentDriverPayout}.00`}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>{`${availableSeats} Seats Available`}</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>
                • Base Rate:{" "}
                <Text style={{ fontWeight: "700", color: "#10B981" }}>
                  {`ETB ${pricePerSeat}`}
                </Text>{" "}
                per accepted seat ({strictlyAcceptedCount} accepted).
              </Text>
            </View>
          </View>

          {/* COUNTDOWN TIMER BANNER */}
          <View
            style={[
              styles.timerBanner,
              !hasMinimumRequiredPassengers
                ? styles.timerWaiting
                : timeLeft < 15
                ? styles.timerUrgent
                : null,
            ]}
          >
            <MaterialCommunityIcons
              name={
                hasMinimumRequiredPassengers
                  ? "clock-fast"
                  : "account-clock-outline"
              }
              size={18}
              color={
                !hasMinimumRequiredPassengers
                  ? "#6B7280"
                  : timeLeft < 15
                  ? "#EF4444"
                  : "#10B981"
              }
            />
            <Text
              style={[
                styles.timerText,
                !hasMinimumRequiredPassengers
                  ? { color: "#6B7280" }
                  : timeLeft < 15
                  ? { color: "#EF4444" }
                  : { color: "#10B981" },
              ]}
            >
              {!hasMinimumRequiredPassengers
                ? `Awaiting Passenger Thresholds (Need 2, got ${strictlyAcceptedCount})...`
                : driverAccepted
                ? "Locking Run..."
                : `Remaining Window to Accept: ${timeLeft}s`}
            </Text>
          </View>

          {/* LOCATION DETAILS */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons name="git-commit-sharp" size={20} color="#10B981" />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>
                {offerDetails?.start_location || "Megenagna Departure Hub"}
              </Text>
              <Text style={styles.locationSubtitle}>{`Destination: ${
                offerDetails?.end_location || "Piassa"
              }`}</Text>
            </View>
          </View>

          {/* ROSTER MANIFEST TABLE */}
          <Text style={styles.sectionHeading}>{`Manifest RoutePool Registry (${poolPassengers.length} Clustered)`}</Text>
          <View style={styles.statusTable}>
            {poolPassengers.length === 0 ? (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#6B7280", fontSize: 13 }}>
                  No passengers assigned to this run yet.
                </Text>
              </View>
            ) : (
              poolPassengers.map((passenger) => {
                const pId = parseInt(passenger.user_id || passenger.id, 10);
                const isAccepted = passenger.status === "accepted";

                return (
                  <View key={`manifest-rider-row-${pId}`} style={styles.tableRow}>
                    <View style={styles.tableUserLabelGroup}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={isAccepted ? "#10B981" : "#0284C7"}
                      />
                      <Text style={styles.tableUserText}>
                        {passenger.name || `Passenger ${pId}`}
                      </Text>
                    </View>

                    {renderStatusBadge(passenger.status)}
                  </View>
                );
              })
            )}
          </View>

          {/* ACTION BUTTON GROUP */}
          <View style={styles.actionButtonContainer}>
            <View style={styles.buttonButtonGroup}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDriverDecline}
                activeOpacity={0.7}
                disabled={isOfferLockedIn}
              >
                <Text style={styles.declineButtonText}>DECLINE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.acceptButton,
                  !isDriverButtonUnlocked ||
                  (hasMinimumRequiredPassengers && timeLeft <= 0)
                    ? { backgroundColor: "#9CA3AF" }
                    : driverAccepted
                    ? { backgroundColor: "#059669" }
                    : { backgroundColor: "#10B981" },
                ]}
                onPress={handleDriverAccept}
                activeOpacity={0.8}
                disabled={
                  !isDriverButtonUnlocked ||
                  (hasMinimumRequiredPassengers && timeLeft <= 0) ||
                  driverAccepted
                }
              >
                <Text style={styles.acceptButtonText}>
                  {driverAccepted
                    ? "LOCKING MANIFEST..."
                    : hasMinimumRequiredPassengers && timeLeft <= 0
                    ? "DISPATCH WINDOW ELAPSED"
                    : !isDriverButtonUnlocked
                    ? `AWAITING ACCEPTED (${strictlyAcceptedCount}/2)`
                    : `Accept [${currentDriverPayout} ETB]`}
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
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EF4444",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  errorBannerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 6,
    textAlign: "center",
  },
  mapContainer: { flex: 1 },
  hubMarkerContainer: { alignItems: "center", justifyContent: "center" },
  hubMarkerPin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  hubMarkerPulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  proposalCard: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
    elevation: 10,
  },
  priceTierCard: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  priceTierHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tierBadgeText: { fontSize: 11, color: "#065F46", fontWeight: "700" },
  priceBreakdownBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  timerBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F4EA",
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  timerWaiting: {
    backgroundColor: "#F3F4F6",
    borderWidth: 0.5,
    borderColor: "#D1D5DB",
  },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: {
    fontSize: 13,
    color: "#10B981",
    marginLeft: 6,
    fontWeight: "600",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  locationPinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E6F4EA",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusTable: { marginBottom: 16 },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F3F4F6",
  },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500" },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 95,
    alignItems: "center",
  },
  badgeMatched: { backgroundColor: "#E0F2FE" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeArrived: { backgroundColor: "#FEF3C7" },
  badgeSearching: { backgroundColor: "#F3F4F6" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textMatched: { color: "#0284C7" },
  textAccepted: { color: "#10B981" },
  textArrived: { color: "#D97706" },
  textSearching: { color: "#4B5563" },
  actionButtonContainer: { marginTop: 4 },
  buttonButtonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  declineButton: {
    width: "30%",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: {
    width: "66%",
    backgroundColor: "#10B981",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" },
});