import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext"; 
import { playSound } from "../../utils/soundPlayer";
import UserAvatar from "../../components/UserAvatar";

const { width } = Dimensions.get("window");
// Automatically use your production URL if set, otherwise fallback to local/Tailscale for development
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

export default function ProposalDriver({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS (Standardized to match NavigateToPickup)
  const { user } = useAuth();
  const currentDriverId =
    route?.params?.driverId || user?.id || user?.driver_id;
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id || null;
  const routeId = route?.params?.routeId || route?.params?.route_id || "1";

  const [driverAccepted, setDriverAccepted] = useState(false);
  const [offerDetails, setOfferDetails] = useState(null);
  const [mapCoordinates, setMapCoordinates] = useState(null);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [strictlyAcceptedCount, setStrictlyAcceptedCount] = useState(0);
  const [manifestSyncIssue, setManifestSyncIssue] = useState(false);
  const [lastManifestSync, setLastManifestSync] = useState(null);
  const [timeLeft, setTimeLeft] = useState(45); 

  const activeRideOfferIdRef = useRef(null);
  const isSyncingManifestRef = useRef(false);
  const hasNavigatedToPickupRef = useRef(false);

  // 🎵 Ref tracking to detect count increments for sound effects ("2" for matched, "4" for accepted)
  const prevMatchedCountRef = useRef(0);
  const prevAcceptedCountRef = useRef(0);
  const isInitialManifestLoad = useRef(true);

  const pricePerSeat = offerDetails?.price_per_seat ? parseFloat(offerDetails.price_per_seat) : 80.00;
  const currentDriverPayout = strictlyAcceptedCount * pricePerSeat;

  const hasMinimumTwoPassengersAccepted = strictlyAcceptedCount >= 2;
  const isDriverButtonUnlocked = hasMinimumTwoPassengersAccepted;
  const offerStatus = String(offerDetails?.status || "").toLowerCase().trim();
  const isOfferLockedIn =
    driverAccepted ||
    ["accepted", "arrived", "in_trip", "inprogress"].includes(offerStatus);

  // Timer Controller
  useEffect(() => {
    if (!hasMinimumTwoPassengersAccepted || isOfferLockedIn) return;

    if (timeLeft <= 0 && !driverAccepted) {
      Alert.alert("Offer Expired", "The dispatch window for this cluster has run out.", [
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
  }, [timeLeft, hasMinimumTwoPassengersAccepted, driverAccepted, isOfferLockedIn, currentDriverId]);

  // Live Sync Polling & Manifest State Pipeline
  useEffect(() => {
    if (!currentDriverId) {
      return;
    }

    async function syncDatabaseManifestState() {
      if (isSyncingManifestRef.current || hasNavigatedToPickupRef.current) return;
      isSyncingManifestRef.current = true;

      try {
        const proposalUrl = `${API_URL}/api/rides/driver-proposal/${currentDriverId}`;
        const res = await fetch(proposalUrl);
        if (res.ok) {
          const data = await res.json();
          if (data && (data.hasActiveProposal || data.id)) {
            setOfferDetails(data);
            activeRideOfferIdRef.current = data.ride_offer_id || data.id;
            setManifestSyncIssue(false);
            setLastManifestSync(new Date());

            let acceptedIds = [];
            if (data.accepted_passengers) {
              if (Array.isArray(data.accepted_passengers)) {
                acceptedIds = data.accepted_passengers
                  .map(id => parseInt(id, 10))
                  .filter(id => !isNaN(id));
              } else if (typeof data.accepted_passengers === "string") {
                acceptedIds = data.accepted_passengers
                  .replace(/{|}/g, "")
                  .replace(/\[|\]/g, "")
                  .split(",")
                  .map(id => parseInt(id.trim(), 10))
                  .filter(id => !isNaN(id));
              }
            }

            let rawPoolArray = data.passengers;
            if (!rawPoolArray || (Array.isArray(rawPoolArray) && rawPoolArray.length === 0)) {
              rawPoolArray = data.route_pool_passengers || [];
            }
            if (typeof rawPoolArray === "string") {
              try {
                rawPoolArray = JSON.parse(rawPoolArray);
              } catch (err) {
                console.warn("Could not parse passenger manifest from driver proposal:", err);
                rawPoolArray = [];
              }
            }

            const cleanPoolArray = Array.isArray(rawPoolArray) 
              ? rawPoolArray.filter(p => p && !isNaN(parseInt(p.user_id ?? p.userId ?? p.id, 10)))
              : [];

            const rosterByUserId = new Map(cleanPoolArray.map(passenger => {
              const uId = parseInt(passenger.user_id ?? passenger.userId ?? passenger.id, 10);
              const passengerStatus = String(passenger.status || "").toLowerCase().trim();
              const isExplicitlyAccepted =
                acceptedIds.includes(uId) ||
                ["accepted", "arrived", "in_trip", "inprogress", "completed"].includes(passengerStatus);
              const pPhoto = passenger.profile_photo_url || passenger.profile_photo || passenger.profilePhoto || passenger.avatar || passenger.photo_url || null;
              return [uId, {
                user_id: uId,
                name: passenger.passenger_name || passenger.full_name || passenger.name || `Passenger Slot ${uId}`,
                status: isExplicitlyAccepted ? "accepted" : "matched",
                profile_photo_url: pPhoto,
              }];
            }));
            const visibleRoster = Array.from(rosterByUserId.values());

            const visibleIds = new Set(visibleRoster.map(passenger => passenger.user_id));
            new Set(acceptedIds).forEach(userId => {
              if (!visibleIds.has(userId)) {
                visibleRoster.push({
                  user_id: userId,
                  name: `Passenger ${userId}`,
                  status: "accepted",
                  profile_photo_url: null,
                });
              }
            });

            const finalAcceptedCount = visibleRoster.filter(p => p.status === "accepted").length;
            const currentTotalMatched = visibleRoster.length;

            // 🎵 AUDIO TRIGGER LOGIC: Play sound 2 if total matched count increments, play sound 4 if accepted count increments
            if (!isInitialManifestLoad.current) {
              if (currentTotalMatched > prevMatchedCountRef.current) {
                playSound("2");
              }
              if (finalAcceptedCount > prevAcceptedCountRef.current) {
                playSound("4");
              }
            }
            isInitialManifestLoad.current = false;
            prevMatchedCountRef.current = currentTotalMatched;
            prevAcceptedCountRef.current = finalAcceptedCount;

            setStrictlyAcceptedCount(finalAcceptedCount);
            setPoolPassengers(visibleRoster);

            const offerStatus = String(data.status || "").toLowerCase().trim();
            if (["accepted", "arrived", "in_trip", "inprogress"].includes(offerStatus)) {
              hasNavigatedToPickupRef.current = true;
              setDriverAccepted(true);
              const payloadId = parseInt(data.ride_offer_id || data.id, 10);
              navigation.replace("NavigateToPickup", { 
                routeId: data.route_id || routeId, 
                rideOfferId: payloadId,
                driverId: currentDriverId 
              });
            }
          }
        } else {
          console.warn(`Driver proposal request failed: HTTP ${res.status}`);
          setManifestSyncIssue(true);
        }

        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const coordsUrl = `${API_URL}/api/rides/map_coordinates?${queryParam}`;
        const coordsRes = await fetch(coordsUrl);
        if (coordsRes.ok) {
          const coordsData = await coordsRes.json();
          if (coordsData && coordsData.coordinates) {
            setMapCoordinates(coordsData.coordinates);
          }
        }
      } catch (err) {
        console.error("Manifest & Map Coordinates Sync Error:", err);
        setManifestSyncIssue(true);
      } finally {
        isSyncingManifestRef.current = false;
      }
    }

    syncDatabaseManifestState();
    const pollInterval = setInterval(syncDatabaseManifestState, 2000); 
    return () => clearInterval(pollInterval);
  }, [currentDriverId, rideOfferId, routeId, navigation]);

  const handleDriverAccept = async () => {
    if (!isDriverButtonUnlocked || isOfferLockedIn || timeLeft <= 0) return;
    const activeRideOfferId = activeRideOfferIdRef.current || rideOfferId;
    if (!activeRideOfferId) {
      Alert.alert("Offer Unavailable", "The active ride offer could not be identified. Please retry shortly.");
      return;
    }

    setDriverAccepted(true); 
    
    try {
      const res = await fetch(`${API_URL}/api/rides/driver-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ride_offer_id: activeRideOfferId,
          driver_id: currentDriverId 
        }),
      });

      const responseData = await res.json();
      if (res.ok && responseData.success) {
        const finalId = parseInt(responseData.rideOfferId || activeRideOfferId, 10);
        navigation.replace("NavigateToPickup", { 
          routeId: routeId, 
          rideOfferId: finalId,
          driverId: currentDriverId 
        });
      } else {
        setDriverAccepted(false);
        Alert.alert("Dispatch Rejection", responseData.error || "Manifest cluster locked or changed.");
      }
    } catch (err) {
      setDriverAccepted(false);
      Alert.alert("Connection Failure", `Could not reach Corridor routing hub: ${err.message}`);
    }
  };

  const handleDriverDecline = async () => {
    const activeRideOfferId = activeRideOfferIdRef.current || rideOfferId;
    if (!activeRideOfferId) {
      Alert.alert("Offer Unavailable", "The active ride offer could not be identified. Please retry shortly.");
      return;
    }

    Alert.alert("Decline Dispatch?", "Rejecting removes you from queue line logs.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline Run",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/rides/driver-decline`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                driver_id: currentDriverId,
                ride_offer_id: activeRideOfferId
              }),
            });
          } catch (e) {}
          navigation.reset({
            index: 0,
            routes: [{ name: "DriverDashboardScreen", params: { driverId: currentDriverId } }],
          });
        }
      }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "bottom", "left"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Run Offer</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.contentContainer}>
        <ScrollView
          style={styles.manifestScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Driver Profile Header Card */}
          <View style={styles.driverProfileHeaderCard}>
            <UserAvatar
              photoUrl={user?.profile_photo_url || offerDetails?.driver_photo || offerDetails?.driver?.profile_photo_url}
              name={user?.full_name || "Captain Driver"}
              size={46}
              fallbackBgColor="#059669"
              textColor="#FFFFFF"
              showStatusDot={true}
              statusColor="#10B981"
            />
            <View style={styles.driverProfileTextGroup}>
              <Text style={styles.driverProfileName}>{user?.full_name || "Captain Driver"}</Text>
              <Text style={styles.driverProfileSub}>Corridor Captain • Route #{routeId}</Text>
            </View>
            <View style={styles.driverStatusBadge}>
              <Text style={styles.driverStatusBadgeText}>ONLINE</Text>
            </View>
          </View>
          
          <View style={styles.priceTierCard}>
            <Text style={styles.priceTierHeading}>CURRENT RUN DISPATCH PAYOUT</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>{`ETB ${currentDriverPayout}.00`}</Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>{`${strictlyAcceptedCount} Accepted`}</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>• Base Rate: <Text style={{fontWeight:'700', color: '#059669'}}>{`ETB ${pricePerSeat}`}</Text> per accepted seat.</Text>
            </View>
          </View>

          <View style={styles.syncStatusCard}>
            <View style={[styles.syncStatusDot, manifestSyncIssue && styles.syncStatusDotError]} />
            <View style={styles.syncStatusCopy}>
              <Text style={styles.syncStatusTitle}>Passenger manifest</Text>
              <Text style={styles.syncStatusMessage}>
                {manifestSyncIssue
                  ? "Connection issue — retrying live updates"
                  : lastManifestSync
                    ? `Live • Updated ${lastManifestSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Connecting to live passenger updates..."}
              </Text>
            </View>
            <Ionicons
              name={manifestSyncIssue ? "warning-outline" : "sync-outline"}
              size={18}
              color={manifestSyncIssue ? "#B45309" : "#059669"}
            />
          </View>

          <View style={[styles.timerBanner, !hasMinimumTwoPassengersAccepted ? styles.timerWaiting : timeLeft < 15 ? styles.timerUrgent : null]}>
            <MaterialCommunityIcons 
              name={hasMinimumTwoPassengersAccepted ? "clock-fast" : "account-clock-outline"} 
              size={18} 
              color={!hasMinimumTwoPassengersAccepted ? "#6B7280" : timeLeft < 15 ? "#EF4444" : "#059669"} 
            />
            <Text style={[styles.timerText, !hasMinimumTwoPassengersAccepted ? {color: "#6B7280"} : timeLeft < 15 ? {color: "#EF4444"} : {color: "#059669"}]}>
              {!hasMinimumTwoPassengersAccepted 
                ? `Awaiting Passenger Thresholds (Need 2 accepted, got ${strictlyAcceptedCount})...` 
                : driverAccepted 
                  ? "Locking Run..."
                  : `Remaining Window to Accept: ${timeLeft}s`}
            </Text>
          </View>

          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}><Ionicons name="git-commit-sharp" size={20} color="#059669" /></View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>{mapCoordinates?.start_hub_name || offerDetails?.start_hub_name || "Resolving pickup hub..."}</Text>
              <Text style={styles.locationSubtitle}>{`Destination: ${mapCoordinates?.end_hub_name || offerDetails?.end_hub_name || "Resolving destination..."}`}</Text>
            </View>
          </View>

          <View style={styles.manifestHeadingRow}>
            <View>
              <Text style={styles.sectionHeading}>Passenger manifest</Text>
              <Text style={styles.manifestSubheading}>
                {`${poolPassengers.length} joined • ${strictlyAcceptedCount} accepted`}
              </Text>
            </View>
            <View style={styles.thresholdBadge}>
              <Text style={styles.thresholdBadgeText}>{`${Math.min(strictlyAcceptedCount, 2)}/2 confirmed`}</Text>
            </View>
          </View>
          <View style={styles.statusTable}>
            {poolPassengers.length === 0 ? (
              <View style={styles.emptyManifest}>
                <Ionicons name="people-outline" size={24} color="#9CA3AF" />
                <Text style={styles.emptyManifestTitle}>Waiting for passengers</Text>
                <Text style={styles.emptyManifestText}>
                  Riders will appear here as they join this corridor.
                </Text>
              </View>
            ) : (
              poolPassengers.map((passenger) => {
                const pId = parseInt(passenger.user_id || passenger.id, 10);
                const isAccepted = passenger.status === "accepted";
                return (
                  <View key={`manifest-rider-row-${pId}`} style={styles.tableRow}>
                    <View style={styles.tableUserLabelGroup}>
                      <UserAvatar
                        photoUrl={passenger.profile_photo_url}
                        name={passenger.name}
                        id={pId}
                        size={36}
                        fallbackBgColor={isAccepted ? "#059669" : "#0284C7"}
                        textColor="#FFFFFF"
                        showStatusDot={true}
                        statusColor={isAccepted ? "#10B981" : "#38BDF8"}
                      />
                      <View style={{ marginLeft: 10, flex: 1 }}>
                        <Text style={[styles.tableUserText, isAccepted && { color: "#059669", fontWeight: "700" }]}>
                          {passenger.name || `Passenger ${pId}`}
                        </Text>
                        <Text style={styles.tableUserSubText}>
                          {isAccepted ? "Accepted • Ready for dispatch" : "Matched in pool"}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.badge, isAccepted ? styles.badgeAccepted : styles.badgeMatched]}>
                      <Text style={[styles.badgeText, isAccepted ? styles.textAccepted : styles.textMatched]}>
                        {isAccepted ? "Accepted" : "Matched"}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

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
                      ? { backgroundColor: "#047857" } 
                      : { backgroundColor: "#059669" }
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
                        ? `AWAITING ACCEPTANCES (${strictlyAcceptedCount}/2)`
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF", zIndex: 10 },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  
  contentContainer: { flex: 1, backgroundColor: "#FFFFFF" },
  manifestScrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },

  priceTierCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  syncStatusCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#DCFCE7", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  syncStatusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#059669", marginRight: 10 },
  syncStatusDotError: { backgroundColor: "#D97706" },
  syncStatusCopy: { flex: 1 },
  syncStatusTitle: { fontSize: 12, fontWeight: "700", color: "#111827" },
  syncStatusMessage: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  priceTierHeading: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tierBadgeText: { fontSize: 11, color: "#065F46", fontWeight: "700" },
  priceBreakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  timerBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  timerWaiting: { backgroundColor: "#F3F4F6", borderWidth: 0.5, borderColor: "#D1D5DB" },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: { fontSize: 13, color: "#059669", marginLeft: 6, fontWeight: "600" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  manifestHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionHeading: { fontSize: 14, fontWeight: "700", color: "#111827" },
  manifestSubheading: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  thresholdBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  thresholdBadgeText: { color: "#047857", fontSize: 11, fontWeight: "700" },
  statusTable: { marginBottom: 16 },
  emptyManifest: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 16, backgroundColor: "#F9FAFB", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB" },
  emptyManifestTitle: { color: "#374151", fontSize: 13, fontWeight: "700", marginTop: 7 },
  emptyManifestText: { color: "#6B7280", fontSize: 11, textAlign: "center", marginTop: 3 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 },
  tableUserText: { fontSize: 13, fontWeight: "600", color: "#111827" },
  tableUserSubText: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  driverProfileHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 12,
  },
  driverProfileTextGroup: { flex: 1, marginLeft: 12 },
  driverProfileName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  driverProfileSub: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  driverStatusBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  driverStatusBadgeText: { color: "#059669", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 95, alignItems: "center" },
  badgeMatched: { backgroundColor: "#E0F2FE" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textMatched: { color: "#0284C7" },
  textAccepted: { color: "#059669" },
  actionButtonContainer: { marginTop: "auto", paddingTop: 12, paddingBottom: 8 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  declineButton: { width: "30%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: { width: "66%", backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" }
});