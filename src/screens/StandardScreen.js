import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  Alert,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import io from "socket.io-client";

const API_URL = "http://100.108.52.79:5000/api";
const socket = io("http://100.108.52.79:5000");

const { width } = Dimensions.get('window');

export default function StandardScreen({ route, navigation }) {
  const { userId, standardRequestId, resolvedHubId, bookingType, ride } = route.params || {};

  const [status, setStatus] = useState("searching"); // 'searching' | 'matched' | 'driver_assigned' | 'cancelled'
  const [driverDetails, setDriverDetails] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  // Pulse animation for searching state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start pulsing radar animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  /* ⚡ SOCKET & POLLING STATUS SYNC */
  useEffect(() => {
    if (!standardRequestId) return;

    // Join room or listen to solo ride updates
    socket.emit("join_ride_room", { rideId: standardRequestId });

    const handleRideUpdate = (data) => {
      if (data && data.rideId === standardRequestId || data.id === standardRequestId) {
        const newStatus = data.status;
        setStatus(newStatus);

        if (newStatus === "matched" || newStatus === "accepted") {
          setDriverDetails(data.driver || data.driverInfo || null);
          
          // Navigate to Live Tracking or Pickup Proposal once driver accepts
          setTimeout(() => {
            navigation.replace("LiveTracking", {
              rideId: standardRequestId,
              userId: userId,
              driverId: data.driver_id || data.driverId
            });
          }, 1500);
        }
      }
    };

    socket.on("solo_ride_status_updated", handleRideUpdate);

    // Polling fallback every 5 seconds to check ride status
    const statusInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/rides/solo/status/${standardRequestId}`);
        const data = await res.json();
        
        if (res.ok && data.success && data.ride) {
          const currentRideStatus = data.ride.status;
          setStatus(currentRideStatus);

          if (["matched", "accepted", "arrived", "in_trip"].includes(currentRideStatus)) {
            clearInterval(statusInterval);
            navigation.replace("LiveTracking", {
              rideId: standardRequestId,
              userId: userId,
              driverId: data.ride.driver_id
            });
          }
        }
      } catch (err) {
        console.log("❌ Error polling solo ride status:", err);
      }
    }, 5000);

    return () => {
      socket.off("solo_ride_status_updated", handleRideUpdate);
      clearInterval(statusInterval);
    };
  }, [standardRequestId, userId, navigation]);

  /* 🛑 CANCEL SOLO RIDE REQUEST */
  const handleCancelRequest = () => {
    Alert.alert(
      "Cancel Solo Ride",
      "Are you sure you want to cancel your direct ride request?",
      [
        { text: "Keep Waiting", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await fetch(`${API_URL}/rides/solo/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId: standardRequestId, user_id: userId })
              });

              const data = await res.json();
              if (res.ok && data.success) {
                navigation.replace("Passenger");
              } else {
                Alert.alert("Error", data.message || "Failed to cancel request.");
                setCancelling(false);
              }
            } catch (err) {
              console.error("❌ Cancellation error:", err);
              Alert.alert("Connection Error", "Could not reach server to cancel.");
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* HEADER */}
      <View style={styles.headerRow}>
        <View style={styles.headerBadge}>
          <Ionicons name="car-sport" size={16} color="#2563EB" />
          <Text style={styles.headerBadgeText}>Solo Direct Dispatch</Text>
        </View>
        <Text style={styles.requestIdText}>ID: #{standardRequestId || "---"}</Text>
      </View>

      {/* RADAR ANIMATION CONTAINER */}
      <View style={styles.radarContainer}>
        <Animated.View style={[styles.radarRing, { transform: [{ scale: pulseAnim }] }]} />
        <View style={styles.radarCenterCircle}>
          <FontAwesome5 name="car" size={32} color="#2563EB" />
        </View>
      </View>

      {/* STATUS & DETAILS CARD */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>
          {status === "searching" ? "Finding Nearest Driver..." : "Driver Matched!"}
        </Text>
        <Text style={styles.statusSubtitle}>
          {status === "searching" 
            ? "Broadcasting your request to available solo drivers nearby."
            : "Your driver is preparing to pick you up."}
        </Text>

        <View style={styles.divider} />

        {/* RIDE SUMMARY */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="location" size={18} color="#2563EB" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.summaryLabel}>DESTINATION</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {ride?.corridor || "Direct Route"}
            </Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryIconBox}>
            <Ionicons name="wallet" size={18} color="#059669" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.summaryLabel}>ESTIMATED FARE & DISTANCE</Text>
            <Text style={styles.summaryValue}>
              {ride?.price || "ETB 0"} • {ride?.time || "---"}
            </Text>
          </View>
        </View>

        {/* LOADING INDICATOR / ACTION */}
        {status === "searching" && (
          <View style={styles.searchingLoaderRow}>
            <ActivityIndicator size="small" color="#2563EB" style={{ marginRight: 8 }} />
            <Text style={styles.searchingLoaderText}>Waiting for driver response...</Text>
          </View>
        )}

        {/* CANCEL BUTTON */}
        <TouchableOpacity 
          style={[styles.cancelButton, cancelling && { opacity: 0.6 }]}
          onPress={handleCancelRequest}
          disabled={cancelling}
          activeOpacity={0.8}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Text style={styles.cancelButtonText}>Cancel Request</Text>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 20,
    justifyContent: "space-between",
    paddingVertical: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
    marginLeft: 6,
  },
  requestIdText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  radarContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 40,
    height: 180,
  },
  radarRing: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.3)",
  },
  radarCenterCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  statusSubtitle: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  summaryIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
    marginTop: 2,
  },
  searchingLoaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    marginVertical: 12,
  },
  searchingLoaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  cancelButton: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FEE2E2",
    marginTop: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EF4444",
  },
});