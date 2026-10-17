import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  BackHandler,
  Alert,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from '../../AuthContext';
import { playSound } from "../../utils/soundPlayer";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

export default function WaitingForRidersScreen({ route, navigation }) {
  const { user } = useAuth();
  const currentDriverId = route?.params?.driverId || user?.id || user?.user_id;

  const [loading, setLoading] = useState(true);
  const [seatsFilled, setSeatsFilled] = useState(
    Number(route?.params?.ride?.filled) || 0
  );
  const [totalSeats, setTotalSeats] = useState(
    Number(route?.params?.ride?.total_seats) || 3
  );
  const [statusText, setStatusText] = useState("Waiting for riders to join");
  const [activityLogs, setActivityLogs] = useState([]);

  const [hubNameDisplay, setHubNameDisplay] = useState("Loading Hub...");
  const [destinationDisplay, setDestinationDisplay] = useState("Loading Destination...");
  const [pricePerSeat, setPricePerSeat] = useState(150);
  const [routeId, setRouteId] = useState(null);
  const [currentPickupHubId, setCurrentPickupHubId] = useState(null);

  // Track previous matched count to detect increments for sound triggering
  const prevMatchedRef = useRef(0);
  const isInitialFetch = useRef(true);
  const isCheckingStatusRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const insets = useSafeAreaInsets();

  // 🚫 DISABLE ANDROID HARDWARE BACK BUTTON
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    if (!currentDriverId) {
      setLoading(false);
      return;
    }

    console.log(`Streaming waiting pool status for driver ${currentDriverId}`);

    async function checkWaitingPoolStatus() {
      if (isCheckingStatusRef.current || hasNavigatedRef.current) return;
      isCheckingStatusRef.current = true;

      try {
        const response = await fetch(
          `${API_URL}/api/rides/waiting-pool-status/${currentDriverId}`
        );
        
        if (!response.ok) {
          console.warn(`Waiting pool status request failed: HTTP ${response.status}`);
          setLoading(false);
          return;
        }

        const data = await response.json();
        const totalSearching = Number(data.totalSearching ?? data.searching_count) || 0;
        const riderList = data.matchedRiders || data.passengers || data.riders;
        const matchedRiders = Array.isArray(riderList) ? riderList : [];
        const reportedMatched = Number(data.totalMatched);
        const totalMatched = Math.max(
          Number.isFinite(reportedMatched) ? reportedMatched : 0,
          matchedRiders.length
        );
        const reportedCapacity = Number(data.totalSeats ?? data.total_seats);
        const capacity = Number.isFinite(reportedCapacity) && reportedCapacity > 0
          ? reportedCapacity
          : Number(route?.params?.ride?.total_seats) || 3;

        // 🎵 PLAY SOUND WHEN NEW RIDER MATCHES/JOINS INCREMENTS
        if (!isInitialFetch.current && totalMatched > prevMatchedRef.current) {
          playSound("2");
        }
        isInitialFetch.current = false;
        prevMatchedRef.current = totalMatched;

        // Update dynamic states from backend database record
        if (data.hubName) setHubNameDisplay(data.hubName);
        if (data.destinationName) setDestinationDisplay(data.destinationName);
        if (data.pricePerSeat) setPricePerSeat(data.pricePerSeat);
        if (data.routeId) setRouteId(data.routeId);
        if (data.hubId) setCurrentPickupHubId(data.hubId);
        if (capacity !== totalSeats) setTotalSeats(capacity);

        // Only riders assigned to this offer count toward the driver's seats.
        setSeatsFilled(Math.min(totalMatched, capacity));
        setLoading(false);

        // Populate recent activity logs dynamically
        if (matchedRiders.length > 0) {
          const formattedLogs = matchedRiders.map((rider, idx) => {
            const rId = rider.userId || rider.user_id || rider.id || idx + 1;
            return {
              id: String(rId),
              message: `Passenger ID ${rId} matched`,
              time: "Just now",
            };
          });
          setActivityLogs(formattedLogs);
          setStatusText(`${totalMatched} matched, ${totalSearching} searching...`);
        } else if (totalMatched > 0) {
          setStatusText(`${totalMatched} rider(s) joined, ${totalSearching} searching...`);
        } else if (totalSearching > 0) {
          setStatusText(`${totalSearching} rider(s) searching nearby...`);
        } else {
          setStatusText("Waiting for riders to join");
        }

        // A pending offer is created before any riders join; only assigned seats advance.
        if (totalMatched >= 2) {
          hasNavigatedRef.current = true;
          navigation.replace("WaitingForAcceptance", {
            routeId: data.routeId || routeId,
            rideOfferId: data.rideOfferId || data.ride_offer_id || data.id || route?.params?.rideOfferId,
            driverId: currentDriverId,
            hubId: data.hubId || currentPickupHubId,
            hubName: data.hubName || hubNameDisplay,
            destinationName: data.destinationName || destinationDisplay
          });
        }

      } catch (err) {
        console.error("Waiting pool status sync failed:", err);
        setLoading(false);
      } finally {
        isCheckingStatusRef.current = false;
      }
    }

    checkWaitingPoolStatus();
    const syncInterval = setInterval(checkWaitingPoolStatus, 2500);

    return () => clearInterval(syncInterval);
  }, [currentDriverId, navigation, routeId]);

  // 📴 GO OFFLINE HANDLER WITH BACKEND CLEANUP
  const executeGoOffline = async () => {
    try {
      const response = await fetch(`${API_URL}/api/rides/go-offline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_id: currentDriverId }),
      });

      const textResponse = await response.text();
      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (parseErr) {
        console.log("❌ Server returned non-JSON HTML response:", textResponse);
        Alert.alert("Server Error", "Received an invalid response from the server.");
        return;
      }

      if (!response.ok) {
        Alert.alert("Error", data.error || "Could not go offline.");
        return;
      }

      navigation.replace("CreateCorridor");
    } catch (err) {
      console.log("❌ Network exception during go offline:", err);
      Alert.alert("Network Error", "Failed to connect to server. Please try again.");
    }
  };

  const handleGoOfflinePress = () => {
    if (seatsFilled > 0) {
      Alert.alert(
        "Active Riders in Pool",
        "Are you sure you want to go offline? You have passengers in your corridor pool. Going offline will unassign them and return them to the open search queue.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Go Offline", style: "destructive", onPress: executeGoOffline }
        ]
      );
    } else {
      Alert.alert(
        "Go Offline",
        "Are you sure you want to close this corridor session?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Go Offline", onPress: executeGoOffline }
        ]
      );
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerElements]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Connecting to corridor matrix...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBlock}>
        <TouchableOpacity style={styles.menuButton} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Corridor Online</Text>
        <TouchableOpacity style={styles.notificationButton} activeOpacity={0.7}>
          <Ionicons name="notifications-outline" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        <View style={styles.statusBannerCard}>
          <View style={[styles.greenPulseIndicator, seatsFilled > 0 && styles.orangePulseIndicator]} />
          <View style={styles.statusTextFrame}>
            <Text style={styles.statusMainText}>You are Online</Text>
            <Text style={styles.statusSubText}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.manifestCard}>
          <Text style={styles.routeHeaderLabel}>{hubNameDisplay} ➔ {destinationDisplay}</Text>
          <Text style={styles.routeSubLabelText}>via Corridor Express Blueprint</Text>

          <View style={styles.progressCircleWrapper}>
            <View style={[styles.outerProgressCircle, seatsFilled > 0 && styles.outerProgressCircleActive]}>
              <Text style={styles.circleCounterMetricsText}>{seatsFilled}/{totalSeats}</Text>
              <Text style={styles.circleSubLabelMetricsText}>seats filled</Text>
            </View>
          </View>

          <View style={styles.priceSummaryRow}>
            <Text style={styles.priceLabelText}>Price per seat</Text>
            <Text style={styles.priceValueText}>ETB {pricePerSeat}</Text>
          </View>
        </View>

        {activityLogs.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.activityHeadingText}>Recent Activity</Text>
            <View style={styles.activityCard}>
              {activityLogs.map((log, idx) => (
                <View key={log.id}>
                  <View style={styles.activityItemRow}>
                    <View style={styles.userIconFrame}>
                      <FontAwesome5 name="user" size={11} color="#10B981" />
                    </View>
                    <Text style={styles.activityLogText}>{log.message}</Text>
                    <Text style={styles.activityTimeText}>{log.time}</Text>
                  </View>
                  {idx < activityLogs.length - 1 && <View style={styles.horizontalDivider} />}
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomControlContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity 
          style={styles.goOfflineOutlinedButton}
          activeOpacity={0.7}
          onPress={handleGoOfflinePress}
        >
          <Text style={styles.goOfflineOutlinedButtonText}>GO OFFLINE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centerElements: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "500" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  menuButton: { padding: 4 },
  notificationButton: { padding: 4 },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  statusBannerCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16 },
  greenPulseIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981", marginRight: 12 },
  orangePulseIndicator: { backgroundColor: "#F59E0B" },
  statusTextFrame: { flex: 1 },
  statusMainText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  statusSubText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  manifestCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", padding: 20, alignItems: "center", marginBottom: 12 },
  routeHeaderLabel: { fontSize: 18, fontWeight: "700", color: "#111827" },
  routeSubLabelText: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  progressCircleWrapper: { marginVertical: 28, alignItems: "center", justifyContent: "center" },
  outerProgressCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 6, borderColor: "#E5E7EB", alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  outerProgressCircleActive: { borderColor: "#10B981" },
  circleCounterMetricsText: { fontSize: 28, fontWeight: "800", color: "#111827" },
  circleSubLabelMetricsText: { fontSize: 12, color: "#6B7280", fontWeight: "500", marginTop: 2 },
  priceSummaryRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", borderTopWidth: 1, borderColor: "#F3F4F6", paddingTop: 16 },
  priceLabelText: { fontSize: 13, color: "#6B7280", fontWeight: "500" },
  priceValueText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  activityHeadingText: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  activityCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 20 },
  activityItemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  userIconFrame: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#E6F4EA", alignItems: "center", justifyContent: "center", marginRight: 12 },
  activityLogText: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  activityTimeText: { fontSize: 12, color: "#9CA3AF" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  bottomControlContainer: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: "#F9FAFB" },
  goOfflineOutlinedButton: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#D1D5DB", paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  goOfflineOutlinedButtonText: { color: "#DC2626", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});