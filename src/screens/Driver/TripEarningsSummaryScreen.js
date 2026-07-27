import React, { useState } from "react";
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function TripEarningsSummaryScreen({ navigation }) {
  // Hardcoded financial metrics matching our 3-passenger corridor simulation
  const pricePerPerson = 80; 
  const totalPassengers = 3;
  const grossEarnings = pricePerPerson * totalPassengers; 
  const platformFee = 24;    
  const netPayout = grossEarnings - platformFee; 

  // Track independent star ratings for each commuter row
  const [ratings, setRatings] = useState({
    p1: 5,
    p2: 5,
    p3: 5,
  });

  const handleSetRating = (passengerId, score) => {
    setRatings((prev) => ({ ...prev, [passengerId]: score }));
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Top Header Block */}
      <View style={styles.headerBlock}>
        <View style={{ width: 22 }} />
        <Text style={styles.headerTitleText}>Trip Completed</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Home")} activeOpacity={0.7}>
          <Ionicons name="close" size={22} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* OUTWARD HIGH-VISIBILITY PRICE SHOWCASE CARD */}
        <View style={styles.passengerShowcaseCard}>
          <Text style={styles.showcaseLabelText}>FARE PER PASSENGER</Text>
          <Text style={styles.showcasePriceText}>ETB {pricePerPerson}</Text>
          <View style={styles.showcaseBadgeRow}>
            <MaterialCommunityIcons name="wallet-membership" size={13} color="#065F46" />
            <Text style={styles.showcaseBadgeText}>Fixed Corridor Pool Rate Locked</Text>
          </View>
        </View>

        {/* PASSENGER RATINGS CARD MANIFEST */}
        <Text style={styles.sectionHeadingLabel}>Rate Your Commuters</Text>
        <View style={styles.ratingCard}>
          
          {/* Passenger 1 Rating Row */}
          <View style={styles.passengerRow}>
            <View style={styles.identityMetaColumn}>
              <Text style={styles.passengerNameText}>Passenger 1</Text>
              <Text style={styles.seatLabelText}>Front Seat</Text>
            </View>
            <View style={styles.starInteractiveRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} activeOpacity={0.7} onPress={() => handleSetRating("p1", star)}>
                  <Ionicons 
                    name={star <= ratings.p1 ? "star" : "star-outline"} 
                    size={20} 
                    color={star <= ratings.p1 ? "#F59E0B" : "#D1D5DB"} 
                    style={{ marginHorizontal: 2 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Passenger 2 Rating Row */}
          <View style={styles.passengerRow}>
            <View style={styles.identityMetaColumn}>
              <Text style={styles.passengerNameText}>Passenger 2</Text>
              <Text style={styles.seatLabelText}>Rear Left</Text>
            </View>
            <View style={styles.starInteractiveRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} activeOpacity={0.7} onPress={() => handleSetRating("p2", star)}>
                  <Ionicons 
                    name={star <= ratings.p2 ? "star" : "star-outline"} 
                    size={20} 
                    color={star <= ratings.p2 ? "#F59E0B" : "#D1D5DB"} 
                    style={{ marginHorizontal: 2 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Passenger 3 Rating Row */}
          <View style={styles.passengerRow}>
            <View style={styles.identityMetaColumn}>
              <Text style={styles.passengerNameText}>Passenger 3</Text>
              <Text style={styles.seatLabelText}>Rear Right</Text>
            </View>
            <View style={styles.starInteractiveRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} activeOpacity={0.7} onPress={() => handleSetRating("p3", star)}>
                  <Ionicons 
                    name={star <= ratings.p3 ? "star" : "star-outline"} 
                    size={20} 
                    color={star <= ratings.p3 ? "#F59E0B" : "#D1D5DB"} 
                    style={{ marginHorizontal: 2 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

        </View>

        {/* PRIVATE DRIVER FINANCIAL METRICS CARD */}
        <Text style={styles.sectionHeadingLabel}>Driver Statement Summary</Text>
        <View style={styles.ledgerCard}>
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabelText}>Gross Payout Collected</Text>
            <Text style={styles.ledgerValueText}>ETB {grossEarnings.toFixed(2)}</Text>
          </View>
          <View style={styles.horizontalDivider} />
          <View style={styles.ledgerRow}>
            <Text style={styles.ledgerLabelText}>Platform App Fee (10%)</Text>
            <Text style={[styles.ledgerValueText, { color: "#DC2626" }]}>-ETB {platformFee.toFixed(2)}</Text>
          </View>
          <View style={styles.horizontalDivider} />
          <View style={[styles.ledgerRow, { paddingTop: 14 }]}>
            <Text style={[styles.ledgerLabelText, { fontWeight: "700", color: "#111827" }]}>Net Deposited Earnings</Text>
            <Text style={styles.finalNetYieldText}>ETB {netPayout.toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Action Trigger Button Footer */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={styles.doneReturnButton}
          activeOpacity={0.8}
          onPress={() => {
             navigation.navigate("CreateCorridor");
          }}
        >
          <Text style={styles.doneReturnButtonText}>FINISH</Text>
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
  
  // Passenger Price Block Showcase Styles
  passengerShowcaseCard: { backgroundColor: "#111827", borderRadius: 16, paddingVertical: 24, paddingHorizontal: 20, alignItems: "center", justifyContent: "center", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  showcaseLabelText: { color: "#9CA3AF", fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 2 },
  showcasePriceText: { color: "#10B981", fontSize: 44, fontWeight: "900", letterSpacing: -0.5 },
  showcaseBadgeRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#065F46", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, marginTop: 8 },
  showcaseBadgeText: { color: "#A7F3D0", fontSize: 11, fontWeight: "700", marginLeft: 4 },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  
  // Clean Card-based Multi-Passenger Rating Rows Layout
  ratingCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 20 },
  passengerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  identityMetaColumn: { flex: 1 },
  passengerNameText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  seatLabelText: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "500" },
  starInteractiveRow: { flexDirection: "row", alignItems: "center" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  // Statement Ledger Styling components
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, paddingVertical: 2, marginBottom: 24 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabelText: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValueText: { fontSize: 13, fontWeight: "600", color: "#111827" },
  finalNetYieldText: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  doneReturnButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  doneReturnButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
});
