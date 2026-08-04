import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  BackHandler,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  Image,
} from "react-native";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";

const { width } = Dimensions.get("window");

// 🌐 NETWORK HOST CONFIGURATION
const API_URL = "http://192.168.1.3:5000/api";

export default function TripEarningsSummaryScreen({ navigation, route }) {
  // 🔐 1. AUTH & SYSTEM PARAMETERS (Aligned with your project convention)
  const { user } = useAuth();
  const driverId = route?.params?.driverId || user?.id || user?.driver_id || 11;
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id || null;

  const [loading, setLoading] = useState(true);
  const [tripDetails, setTripDetails] = useState({});
  const [financials, setFinancials] = useState({});
  const [passengers, setPassengers] = useState([]);

  useEffect(() => {
    if (driverId || rideOfferId) {
      fetchTripSummary();
    }
  }, [driverId, rideOfferId]);

  const fetchTripSummary = async () => {
    try {
      setLoading(true);
      // Prioritize specific rideOfferId if available, otherwise fallback to driver_id to get the max/latest completed trip
      const queryParam = rideOfferId 
        ? `ride_offer_id=${rideOfferId}` 
        : `driver_id=${driverId}`;
        
      const response = await fetch(`${API_URL}/rides/TripSummary?${queryParam}`);
      const data = await response.json();

      if (response.ok && data.success) {
        setTripDetails(data.tripDetails);
        setFinancials(data.financials);
        setPassengers(data.passengers || []);
      } else {
        console.error("Failed to load trip summary:", data.error);
      }
    } catch (error) {
      console.error("Network error fetching trip summary:", error);
    } finally {
      setLoading(false);
    }
  };

  // Disable Android physical back button to keep driver focused on summary
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true
    );
    return () => backHandler.remove();
  }, []);

  const handleReturnToCorridor = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "createCorridorScreen" }],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loaderText}>Compiling trip earnings ledger...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header Banner */}
      <View style={styles.headerContainer}>
        <View style={styles.successBadgeCircle}>
          <MaterialCommunityIcons name="flag-checkered" size={22} color="#10B981" />
        </View>
        <Text style={styles.headerTitle}>Trip Completed Successfully</Text>
        <Text style={styles.headerSubtitle}>Corridor session finalized & logged</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Financial Earnings Card */}
        <View style={styles.cardContainer}>
          <Text style={styles.sectionHeadingLabel}>Financial Payout Ledger</Text>
          
          <View style={styles.payoutHighlightBox}>
            <Text style={styles.payoutLabel}>Net Driver Payout</Text>
            <Text style={styles.payoutValue}>
              ETB {financials.netPayout !== undefined ? financials.netPayout.toFixed(2) : "0.00"}
            </Text>
          </View>

          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerRowLabel}>Total Passengers</Text>
            <Text style={styles.ledgerRowValue}>{financials.totalPassengers || 0} Riders</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerRowLabel}>Price Per Seat</Text>
            <Text style={styles.ledgerRowValue}>ETB {financials.pricePerSeat ? financials.pricePerSeat.toFixed(2) : "0.00"}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerRowLabel}>Gross Earnings</Text>
            <Text style={styles.ledgerRowValue}>ETB {financials.grossEarnings !== undefined ? financials.grossEarnings.toFixed(2) : "0.00"}</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerRowLabel}>Platform Fee (10%)</Text>
            <Text style={styles.platformFeeValue}>- ETB {financials.platformFee !== undefined ? financials.platformFee.toFixed(2) : "0.00"}</Text>
          </View>
        </View>

        {/* Trip Summary Details Card */}
        <View style={styles.cardContainer}>
          <Text style={styles.sectionHeadingLabel}>Route & Transit Details</Text>

          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <Ionicons name="location" size={14} color="#2563EB" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.detailLabelText}>Start Hub</Text>
              <Text style={styles.detailValueText} numberOfLines={1}>{tripDetails.startHub || "Origin Terminal"}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <Ionicons name="flag" size={14} color="#10B981" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.detailLabelText}>Destination Hub</Text>
              <Text style={styles.detailValueText} numberOfLines={1}>{tripDetails.endHub || "Destination Terminal"}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <FontAwesome5 name="car" size={12} color="#6366F1" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.detailLabelText}>Assigned Vehicle</Text>
              <Text style={styles.detailValueText}>
                {tripDetails.vehicleInfo?.model || "Standard Fleet"} ({tripDetails.vehicleInfo?.plate || "N/A"})
              </Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIconWrapper}>
              <Ionicons name="time" size={14} color="#F59E0B" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.detailLabelText}>Completion Timestamp</Text>
              <Text style={styles.detailValueText}>
                {tripDetails.completedAt ? new Date(tripDetails.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now"}
              </Text>
            </View>
          </View>
        </View>

       {/* Passenger Manifest Summary */}
            {passengers.length > 0 && (
              <View style={styles.cardContainer}>
                <Text style={styles.sectionHeadingLabel}>On-Board Passengers ({passengers.length})</Text>
                {passengers.map((p, idx) => (
                  <View key={`summary-passenger-${idx}`} style={styles.passengerSummaryRow}>
                    
                    {/* Passenger Avatar / Fallback Initial */}
                    {p.profilePhotoUrl ? (
                      <Image source={{ uri: p.profilePhotoUrl }} style={styles.passengerAvatar} />
                    ) : (
                      <View style={styles.passengerAvatarFallback}>
                        <Text style={styles.fallbackInitialText}>
                          {p.fullName ? p.fullName.charAt(0).toUpperCase() : "R"}
                        </Text>
                      </View>
                    )}

                    {/* Name & Phone Number */}
                    <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
                      <Text style={styles.summaryPassengerName} numberOfLines={1}>{p.fullName}</Text>
                      <Text style={styles.summaryPhoneText}>{p.phoneNumber}</Text>
                    </View>

                    {/* Rating Badge */}
                    <View style={styles.ratingBadge}>
                      <FontAwesome name="star" size={11} color="#F59E0B" style={{ marginRight: 4 }} />
                      <Text style={styles.summaryRatingText}>{p.rating}</Text>
                    </View>
                  </View>
                ))}
              </View>
      )}

      </ScrollView>

      {/* Footer Action Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.doneButton}
          activeOpacity={0.85}
          onPress={handleReturnToCorridor}
        >
          <Text style={styles.doneButtonText}>RETURN TO CORRIDOR</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  loaderContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" },
  loaderText: { marginTop: 10, fontSize: 13, fontWeight: "600", color: "#64748B" },
  headerContainer: { alignItems: "center", paddingVertical: 20, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E2E8F0" },
  successBadgeCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginBottom: 8, borderWidth: 1, borderColor: "#A7F3D0" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  headerSubtitle: { fontSize: 12, fontWeight: "500", color: "#64748B", marginTop: 2 },
  
  scrollContent: { padding: 16, paddingBottom: 30 },
  
  cardContainer: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  
  payoutHighlightBox: { backgroundColor: "#EFF6FF", borderRadius: 10, padding: 14, alignItems: "center", marginBottom: 14, borderWidth: 1, borderColor: "#BFDBFE" },
  payoutLabel: { fontSize: 11, fontWeight: "700", color: "#1E40AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  payoutValue: { fontSize: 24, fontWeight: "900", color: "#1E3A8A" },
  
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  ledgerRowLabel: { fontSize: 13, color: "#475569", fontWeight: "500" },
  ledgerRowValue: { fontSize: 13, fontWeight: "700", color: "#1E293B" },
  platformFeeValue: { fontSize: 13, fontWeight: "700", color: "#EF4444" },
  divider: { height: 1, backgroundColor: "#F1F5F9" },
  
  detailRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  detailIconWrapper: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F1F5F9", justifyContent: "center", alignItems: "center" },
  detailLabelText: { fontSize: 11, color: "#64748B", fontWeight: "600" },
  detailValueText: { fontSize: 13, color: "#1E293B", fontWeight: "700", marginTop: 1 },
  
  passengerSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#F1F5F9" },
  summaryPassengerName: { fontSize: 13, fontWeight: "600", color: "#334155", flex: 1, marginRight: 8 },
  summarySeatLabel: { fontSize: 11, fontWeight: "700", color: "#2563EB", backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E2E8F0" },
  doneButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  doneButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.5 }
});