import React from "react";
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function TripEarningsSummaryScreen({ navigation }) {
  // Balanced pricing metrics matching our 3-passenger corridor outcome
  const pricePerPerson = 80; 
  const totalPassengers = 3;
  const grossEarnings = pricePerPerson * totalPassengers; // 240
  const platformFee = 24;    // 10% platform commission cut
  const netPayout = grossEarnings - platformFee; // 216

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Header Navigation Row */}
      <View style={styles.headerBlock}>
        <View style={{ width: 22 }} />
        <Text style={styles.headerTitleText}>Trip Completed</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Home")} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* MASSIVE PASSENGER SHOWCASE CARD (Designed specifically for outward visibility) */}
        <View style={styles.passengerShowcaseCard}>
          <Text style={styles.showcaseLabelText}>FARE PER PASSENGER</Text>
          <Text style={styles.showcasePriceText}>ETB {pricePerPerson}</Text>
          <View style={styles.showcaseBadgeRow}>
            <MaterialCommunityIcons name="wallet-membership" size={14} color="#065F46" />
            <Text style={styles.showcaseBadgeText}>Fixed Corridor Pool Rate Locked</Text>
          </View>
        </View>

        {/* Performance Quick Stats Grid */}
        <Text style={styles.sectionHeadingLabel}>Corridor Metrics</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <FontAwesome5 name="users" size={13} color="#4B5563" style={{ marginBottom: 4 }} />
            <Text style={styles.statValueText}>{totalPassengers} Riders</Text>
            <Text style={styles.statLabelText}>Capacity Met</Text>
          </View>
          <View style={styles.statBox}>
            <MaterialCommunityIcons name="clock-outline" size={15} color="#4B5563" style={{ marginBottom: 2 }} />
            <Text style={styles.statValueText}>14 mins</Text>
            <Text style={styles.statLabelText}>Transit Duration</Text>
          </View>
        </View>

        {/* Private Driver Ledger Section Breakdown */}
        <Text style={styles.sectionHeadingLabel}>Driver Financial Ledger</Text>
        <View style={styles.ledgerCard}>
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabelText}>Gross Collected (3 seats)</Text>
            <Text style={styles.ledgerValueText}>ETB {grossEarnings.toFixed(2)}</Text>
          </View>
          <View style={styles.horizontalDivider} />
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabelText}>Platform Commission (10%)</Text>
            <Text style={[styles.ledgerValueText, { color: "#DC2626" }]}>-ETB {platformFee.toFixed(2)}</Text>
          </View>
          <View style={styles.horizontalDivider} />
          <View style={[styles.ledgerRow, { paddingTop: 14 }]}>
            <Text style={[styles.ledgerLabelText, { fontWeight: "700", color: "#111827" }]}>Net Wallet Deposit</Text>
            <Text style={styles.finalNetYieldText}>ETB {netPayout.toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Done Return Button Footer */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={styles.doneReturnButton}
          activeOpacity={0.8}
          onPress={() => {
            alert("Session closed. Syncing wallet databases.");
          }}
        >
          <Text style={styles.doneReturnButtonText}>DONE & RETURN TO MAP</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  
  // High-visibility outward passenger showcase layout
  passengerShowcaseCard: { backgroundColor: "#111827", borderRadius: 16, paddingVertical: 28, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  showcaseLabelText: { color: "#9CA3AF", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 4 },
  showcasePriceText: { color: "#10B981", fontSize: 44, fontWeight: "900", letterSpacing: -0.5 },
  showcaseBadgeRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#065F46", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, marginTop: 10 },
  showcaseBadgeText: { color: "#A7F3D0", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  
  // Performance Quick Grid styles
  statsGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  statBox: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, width: "48%", paddingVertical: 12, alignItems: "center" },
  statValueText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  statLabelText: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "500" },
  
  // Internal driver financial breakdown layout card
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, paddingVertical: 2, marginBottom: 24 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabelText: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValueText: { fontSize: 13, fontWeight: "600", color: "#111827" },
  finalNetYieldText: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  doneReturnButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  doneReturnButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
});