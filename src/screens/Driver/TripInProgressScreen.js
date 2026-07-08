import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

// Project API routing baseline configuration
const API_BASE_URL = "http://192.168.253.52:5000/api";

export default function TripEarningsSummaryScreen({ navigation, route }) {
  // Inherit context strings or fallback parameters from previous screen closure trigger
  const routeId = route?.params?.routeId || "1";
  const rideOfferId = route?.params?.rideOfferId || 1;

  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState(null);

  // 📡 Single Handshake Execution: Fetch final locked database state on screen mount
  useEffect(() => {
    console.log(`📊 Requesting ledger settlement vectors for Ride Offer ID: [${rideOfferId}]`);
    
    async function fetchTripSummaryMetrics() {
      try {
        // Query the live-track endpoint to get finalized stats
        const res = await fetch(`${API_BASE_URL}/rides/track-live/offer/${rideOfferId}`);
        
        if (res.ok) {
          const data = await res.json();
          setSummaryData(data);
        } else {
          Alert.alert("Ledger Read Error", "Could not fetch operational summary state from backend matrix.");
        }
      } catch (err) {
        console.error("Summary query tracking break:", err);
        Alert.alert("Connection Failure", "Unable to pull finalized calculation arrays from server.");
      } finally {
        setLoading(false);
      }
    }

    fetchTripSummaryMetrics();
  }, [rideOfferId]);

  if (loading) {
    return (
      <View style={styles.centeredLoadingScreen}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Compiling Corridor Payout Matrix...</Text>
      </View>
    );
  }

  // Fallback structural parsing calculations
  const parsedTotalRevenue = parseFloat(summaryData?.final_price) || 0.00;
  const parsedDistanceKms = parseFloat(summaryData?.total_trip_kms) || 4.8;
  const passengerCount = summaryData?.passengers ? summaryData.passengers.length : 0;
  const pricePerSeat = parseFloat(summaryData?.price_per_seat) || 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* Success Splash HUD Illustration Header */}
        <View style={styles.successAnimationBox}>
          <View style={styles.outerSuccessRing}>
            <View style={styles.innerSuccessCore}>
              <MaterialCommunityIcons name="currency-usd" size={32} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.mainSuccessGreetingText}>Corridor Trip Completed</Text>
          <Text style={styles.subTextConfirmation}>
            Revenue successfully updated and finalized in database ledger.
          </Text>
        </View>

        {/* Unified Absolute Gross Total Payout Frame */}
        <View style={styles.grossEarningHeroCard}>
          <Text style={styles.heroCardMetaLabel}>TOTAL TRIP PAYOUT</Text>
          <Text style={styles.heroGrandTotalText}>ETB {parsedTotalRevenue.toFixed(2)}</Text>
          <View style={styles.payoutStatusPill}>
            <Ionicons name="checkmark-circle-sharp" size={12} color="#10B981" style={{ marginRight: 4 }} />
            <Text style={styles.payoutStatusPillText}>SETTLED TO WALLET</Text>
          </View>
        </View>

        {/* Functional Telemetry Analytics Grid */}
        <Text style={styles.sectionHeadingLabel}>Performance Metrics</Text>
        <View style={styles.metricsGridContainer}>
          <View style={styles.metricGridBox}>
            <FontAwesome5 name="route" size={16} color="#4B5563" style={{ marginBottom: 6 }} />
            <Text style={styles.gridValueNumber}>{parsedDistanceKms.toFixed(1)} km</Text>
            <Text style={styles.gridLabelSubText}>Total Distance</Text>
          </View>
          
          <View style={styles.gridVerticalDivider} />
          
          <View style={styles.metricGridBox}>
            <Ionicons name="people" size={16} color="#4B5563" style={{ marginBottom: 6 }} />
            <Text style={styles.gridValueNumber}>{passengerCount} Riders</Text>
            <Text style={styles.gridLabelSubText}>Seats Shared</Text>
          </View>
        </View>

        {/* Granular Audit Breakdown Ledger Item Card */}
        <Text style={styles.sectionHeadingLabel}>Receipt Audit Trail</Text>
        <View style={styles.auditLedgerCard}>
          <View style={styles.ledgerRowItem}>
            <Text style={styles.ledgerItemLabel}>Corridor Execution Code</Text>
            <Text style={styles.ledgerItemValueText}>#CR-{routeId}</Text>
          </View>
          
          <View style={styles.horizontalDividerLine} />

          <View style={styles.ledgerRowItem}>
            <Text style={styles.ledgerItemLabel}>Base Seat Rate Calculation</Text>
            <Text style={styles.ledgerItemValueText}>ETB {pricePerSeat} × {passengerCount}</Text>
          </View>

          <View style={styles.horizontalDividerLine} />

          <View style={styles.ledgerRowItem}>
            <Text style={styles.ledgerItemLabel}>Platform Service Deductions</Text>
            <Text style={[styles.ledgerItemValueText, { color: "#DC2626" }]}>ETB 0.00</Text>
          </View>

          <View style={styles.horizontalDividerLine} />

          <View style={[styles.ledgerRowItem, { paddingTop: 6 }]}>
            <Text style={[styles.ledgerItemLabel, { fontWeight: "700", color: "#111827" }]}>Net Transacted Balance</Text>
            <Text style={styles.ledgerNetValueHighlight}>ETB {parsedTotalRevenue.toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Persistent Bottom Control Return Action Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.primaryDashboardReturnButton}
          activeOpacity={0.85}
          onPress={() => {
            console.log("Returning driver profile context back to principal online dashboard stack map.");
            navigation.popToTop(); // Instantly returns back to primary tracking gateway root screen
          }}
        >
          <Ionicons name="home-sharp" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.dashboardButtonText}>RETURN TO DASHBOARD</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContainer: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },

  // Splash HUD Styles
  successAnimationBox: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
  outerSuccessRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(16, 185, 129, 0.15)", alignItems: "center", justifyContent: "center" },
  innerSuccessCore: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  mainSuccessGreetingText: { fontSize: 18, fontWeight: "800", color: "#111827", marginTop: 14, letterSpacing: -0.2 },
  subTextConfirmation: { fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 4, paddingHorizontal: 20, lineHeight: 18 },

  // Payout Hero Display Card
  grossEarningHeroCard: { backgroundColor: "#111827", borderRadius: 16, paddingVertical: 22, alignItems: "center", justifyContent: "center", marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  heroCardMetaLabel: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 4 },
  heroGrandTotalText: { fontSize: 28, fontWeight: "900", color: "#FFFFFF", letterSpacing: -0.5 },
  payoutStatusPill: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.08)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  payoutStatusPillText: { color: "#10B981", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },

  // Metrics Display Grid Setup
  metricsGridContainer: { flexDirection: "row", backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 14, marginBottom: 24 },
  metricGridBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  gridValueNumber: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 2 },
  gridLabelSubText: { fontSize: 11, color: "#6B7280", fontWeight: "500" },
  gridVerticalDivider: { width: 1, backgroundColor: "#E5E7EB" },

  // Audit breakdown item layout 
  auditLedgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
  ledgerRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  ledgerItemLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerItemValueText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  ledgerNetValueHighlight: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  horizontalDividerLine: { height: 1, backgroundColor: "#F3F4F6" },

  // Fixed Bottom Control CTA Row
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  primaryDashboardReturnButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dashboardButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
});