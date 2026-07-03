import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");
// 📡 Ensure this matches your target active backend server IP address
const API_URL = "http://192.168.106.52:5000"; 

export default function PickupProposalScreen({ navigation, route }) {
  const [userAccepted, setUserAccepted] = useState(false);
  const [coRiders, setCoRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45); 

  const currentUserId = route?.params?.userId ? parseInt(route?.params?.userId, 10) : 1;
  const routeId = route?.params?.routeId || "1";
  const activeRideOfferIdRef = useRef(null);

  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105, 
    longitude: 38.7935,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });

  const totalAcceptedCount = (userAccepted ? 1 : 0) + coRiders.filter(r => r.status === "Accepted" || r.status === "Arrived").length;
  const isBaselinePairReady = totalAcceptedCount >= 2;

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
        console.log("Location permissions exception:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isBaselinePairReady) return; 

    if (timeLeft <= 0) {
      handleWindowExpiry();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, isBaselinePairReady]);

 

  useEffect(() => {
    async function checkProposalStatus() {
      try {
        const res = await fetch(`${API_URL}/api/rides/active-proposal/${currentUserId}`);
        if (!res.ok) return;
        
        const data = await res.json();

        if (data.currentUserPoolStatus === "arrived") {
          clearInterval(pollInterval);
          navigation.replace("LiveTrackingScreen", { 
            routeId: data.routeId || routeId, 
            rideOfferId: data.rideOfferId || 1, 
            userId: currentUserId,
            initialUserArrived: true 
          });
          return;
        }

        const rideOfferId = data.rideOfferId || data.ride_offer_id;
        activeRideOfferIdRef.current = rideOfferId;

        const rawAccepted = data.acceptedPassengers || [];
        const cleanAcceptedIds = rawAccepted.map(id => typeof id === 'object' ? parseInt(id.user_id || id.id, 10) : parseInt(id, 10));
        const fullRosterIds = data.manifestPassengers || [1, 2, 3, 4];

        if (cleanAcceptedIds.includes(currentUserId)) {
          setUserAccepted(true);
        }

        const parsedCoRiders = fullRosterIds
          .filter((id) => id !== currentUserId)
          .map((id, index) => {
            const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
            const serverPassengerRecord = data.passengers?.find(p => parseInt(p.userId, 10) === id);
            let mappedStatus = cleanAcceptedIds.includes(id) ? "Accepted" : "Pending";
            
            if (serverPassengerRecord?.status === "arrived" || serverPassengerRecord?.status === "Arrived") {
              mappedStatus = "Arrived";
            }

            return {
              id: id,
              name: `Rider ${id}`,
              status: mappedStatus, 
              color: colorPalette[index % colorPalette.length]
            };
          });

        setCoRiders(parsedCoRiders);

        const allRosterAccepted = fullRosterIds.every(id => {
          if (id === currentUserId) return userAccepted;
          const riderRecord = parsedCoRiders.find(r => r.id === id);
          return riderRecord?.status === "Accepted" || riderRecord?.status === "Arrived";
        });

        const corePairAccepted = (currentUserId === 1 ? userAccepted : (cleanAcceptedIds.includes(1) || parsedCoRiders.find(r => r.id === 1)?.status === "Arrived")) && 
                                 (currentUserId === 2 ? userAccepted : (cleanAcceptedIds.includes(2) || parsedCoRiders.find(r => r.id === 2)?.status === "Arrived"));

        if (allRosterAccepted) {
          clearInterval(pollInterval);
          navigation.replace("LiveTrackingScreen", { routeId, rideOfferId, userId: currentUserId });
        }
        
        if (corePairAccepted && timeLeft === 0 && (currentUserId === 1 || currentUserId === 2)) {
          clearInterval(pollInterval);
          navigation.replace("LiveTrackingScreen", { routeId, rideOfferId, userId: currentUserId });
        }

      } catch (err) {
        console.log("Sync pooling error:", err);
      }
    }

    checkProposalStatus();
    const pollInterval = setInterval(checkProposalStatus, 2500);
    return () => clearInterval(pollInterval);
  }, [navigation, currentUserId, userAccepted, timeLeft]);

  const handleAccept = async () => {
    setUserAccepted(true);
    try {
      await fetch(`${API_URL}/api/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ride_offer_id: activeRideOfferIdRef.current || 1, user_id: currentUserId }),
      });
    } catch (err) {
      console.log("Handshake error:", err);
    }
  };

  const handleDecline = async () => {
    Alert.alert(
      "Decline Corridor Pool?",
      "Are you sure you want to reject this proposal? You will return to the hub station queue line.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/routes/decline-proposal`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: currentUserId, ride_offer_id: activeRideOfferIdRef.current || 1 }),
              });
            } catch (err) {
              console.log("Decline processing failure:", err);
            }
            
            navigation.reset({
              index: 0,
              routes: [{ name: "HubDashboardScreen", params: { userId: currentUserId } }],
            });
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Request</Text>
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
              <View style={styles.hubMarkerPin}><Ionicons name="location" size={18} color="#FFFFFF" /></View>
              <View style={styles.hubMarkerPulse} />
            </View>
          </Marker>
        </MapView>
      </View>

      <View style={styles.proposalCard}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.priceTierCard}>
            <Text style={styles.priceTierHeading}>ESTIMATED SEAT CORRIDOR FARE</Text>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>
                {totalAcceptedCount >= 3 ? "ETB 80" : totalAcceptedCount === 2 && timeLeft === 0 ? "ETB 120" : "ETB 80 - 120"}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>Dynamic Tier</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>• 2 Passengers Accepted (Forced Run): <Text style={{fontWeight:'700'}}>ETB 120</Text></Text>
              <Text style={styles.breakdownText}>• 3+ Passengers Accepted (Full Discount): <Text style={{color:'#10B981', fontWeight:'700'}}>ETB 80</Text></Text>
            </View>
          </View>

          <View style={[styles.timerBanner, !isBaselinePairReady ? styles.timerWaiting : timeLeft < 15 ? styles.timerUrgent : null]}>
            <MaterialCommunityIcons 
              name={isBaselinePairReady ? "clock-fast" : "clock-alert-outline"} 
              size={18} 
              color={!isBaselinePairReady ? "#6B7280" : timeLeft < 15 ? "#EF4444" : "#1C75BC"} 
            />
            <Text style={[styles.timerText, !isBaselinePairReady ? {color: "#6B7280"} : timeLeft < 15 ? {color: "#EF4444"} : null]}>
              {!isBaselinePairReady 
                ? "Awaiting baseline pair to open cluster window..." 
                : `Discount Window Remaining: ${timeLeft}s`}
            </Text>
          </View>

          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}><Ionicons name="location-sharp" size={20} color="#1C75BC" /></View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.locationSubtitle}>Main Corridor pickup target point</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>Co-Rider Matrix Check</Text>
          
          <View style={styles.statusTable}>
            <View style={styles.tableRow}>
              <View style={styles.tableUserLabelGroup}>
                <Ionicons name="person" size={14} color="#3A82F6" />
                <Text style={styles.tableUserText}>You (Rider {currentUserId})</Text>
              </View>
              <View style={[styles.badge, userAccepted ? styles.badgeAccepted : styles.badgePending]}>
                <Text style={[styles.badgeText, userAccepted ? styles.textAccepted : styles.textPending]}>
                  {userAccepted ? "Accepted" : "Pending"}
                </Text>
              </View>
            </View>

            {coRiders.map((rider) => (
              <View key={`rider-row-${rider.id}`} style={styles.tableRow}>
                <View style={styles.tableUserLabelGroup}>
                  <Ionicons name="person" size={14} color={rider.color} />
                  {/* 🔍 FIXED: Safe nesting of conditional component layout blocks to avoid compilation crashes */}
                  <Text style={styles.tableUserText}>
                    {rider.name}
                    {rider.id > 2 && (
                      <Text style={{fontSize: 11, color: '#6B7280'}}> (Window Controlled)</Text>
                    )}
                  </Text>
                </View>
                <View style={[styles.badge, rider.status === "Accepted" || rider.status === "Arrived" ? styles.badgeAccepted : styles.badgePending]}>
                  <Text style={[styles.badgeText, rider.status === "Accepted" || rider.status === "Arrived" ? styles.textAccepted : styles.textPending]}>
                    {rider.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>

         <View style={styles.actionButtonContainer}>
  <View style={styles.buttonButtonGroup}>
    <TouchableOpacity style={styles.declineButton} onPress={handleDecline} activeOpacity={0.7}>
      <Text style={styles.declineButtonText}>DECLINE</Text>
    </TouchableOpacity>
    
    <TouchableOpacity 
      style={[
        styles.acceptButton, 
        !isBaselinePairReady ? { backgroundColor: "#9CA3AF" } : null
      ]} 
      onPress={handleAccept} 
      activeOpacity={0.8}
      disabled={!isBaselinePairReady}
    >
      <Text style={styles.acceptButtonText}>
        {!isBaselinePairReady 
          ? (totalAcceptedCount === 1 ? "WAITING FOR PASSENGERS [ETB 80]" : "WAITING FOR PASSENGERS")
          : (totalAcceptedCount === 2 ? "ACCEPT PROPOSAL [ETB 120]" : `ACCEPT PROPOSAL [ETB ${totalAcceptedCount * 80}]`)
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
  backButton: { fontSize: 24, fontWeight: "600" },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  mapContainer: { flex: 1 },
  hubMarkerContainer: { alignItems: "center", justifyContent: "center" },
  hubMarkerPin: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  hubMarkerPulse: { position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(16, 185, 129, 0.2)" },
  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "75%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 24, elevation: 10 },
  priceTierCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  priceTierHeading: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: { backgroundColor: "#EBF5FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tierBadgeText: { fontSize: 11, color: "#1C75BC", fontWeight: "700" },
  priceBreakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  timerBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EBF5FF", paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  timerWaiting: { backgroundColor: "#F3F4F6", borderWidth: 0.5, borderColor: "#D1D5DB" },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: { fontSize: 13, color: "#1C75BC", marginLeft: 6, fontWeight: "600" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EBF5FF", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusTable: { marginBottom: 16 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500" },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 80, alignItems: "center" },
  badgePending: { backgroundColor: "#EFF6FF" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textPending: { color: "#3B82F6" },
  textAccepted: { color: "#10B981" },
  actionButtonContainer: { marginTop: 4 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  declineButton: { width: "30%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: { width: "66%", backgroundColor: "#1C75BC", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" },
  waitingBanner: { width: "66%", flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#F9FAFB", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB" },
  waitingBannerText: { color: "#4B5563", fontSize: 13, fontWeight: "600" },
});