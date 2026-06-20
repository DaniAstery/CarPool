import React from "react";
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function TripInProgressScreen({ navigation }) {
  // Array tracking passengers currently on-board for drop-off sequencing
  const activePassengers = [
    { id: "p1", name: "Passenger 1", dropoff: "Bole Medhanialem", fare: "ETB 80" },
    { id: "p2", name: "Passenger 2", dropoff: "Bole Atlas", fare: "ETB 80" },
    { id: "p3", name: "Passenger 3", dropoff: "Bole Edna Mall", fare: "ETB 80" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Top Header Block */}
      <View style={styles.headerBlock}>
        <View style={styles.liveIndicatorRow}>
          <View style={styles.liveDot} />
          <Text style={styles.headerTitleText}>Trip In Progress</Text>
        </View>
        <Text style={styles.routeCodeText}>Corridor #MGB-04</Text>
      </View>

      {/* Simulated Map / Route Progress Canvas Area */}
      <View style={styles.mapSimulationCanvas}>
        <View style={styles.mapFloatingCard}>
          <Ionicons name="navigation" size={16} color="#2563EB" style={{ marginRight: 8 }} />
          <Text style={styles.mapCardText}>Heading South along Bole Road</Text>
        </View>
      </View>

      {/* Trip Information Sheet */}
      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* Next Drop-off Point Card */}
        <Text style={styles.sectionHeadingLabel}>Next Checkpoint Target</Text>
        <View style={styles.nextStopCard}>
          <View style={styles.stopIconCircle}>
            <FontAwesome5 name="map-marker-alt" size={14} color="#EA580C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.stopLocationName}>Bole Medhanialem</Text>
            <Text style={styles.stopMetaText}>First drop-off point • ~4 min away</Text>
          </View>
          <Text style={styles.stopDistanceText}>1.2 km</Text>
        </View>

        {/* On-Board Transit Manifest List */}
        <Text style={styles.sectionHeadingLabel}>Passengers On-Board</Text>
        <View style={styles.manifestCard}>
          {activePassengers.map((passenger, index) => (
            <View key={passenger.id}>
              <View style={styles.passengerRow}>
                <View style={styles.avatarCircle}>
                  <FontAwesome5 name="user" size={11} color="#4B5563" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passengerNameText}>{passenger.name}</Text>
                  <Text style={styles.passengerDropoffText}>Drop-off: {passenger.dropoff}</Text>
                </View>
                <Text style={styles.passengerFareLabel}>{passenger.fare}</Text>
              </View>
              {index < activePassengers.length - 1 && <View style={styles.horizontalDivider} />}
            </View>
          ))}
        </View>

      </ScrollView>

      {/* Bottom Control Action Footer */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={styles.arriveCheckpointButton}
          activeOpacity={0.8}
          onPress={() => {
            // Placeholder link forward to dropoff clearing workflows later
            alert("Trip completed.");
          }}
        >
          <MaterialCommunityIcons name="map-marker-check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.arriveCheckpointButtonText}>FINISH</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  liveIndicatorRow: { flexDirection: "row", alignItems: "center" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", marginRight: 8 },
  headerTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  routeCodeText: { fontSize: 12, fontWeight: "600", color: "#6B7280" },
  
  // Simulated Map Viewport Frame
  mapSimulationCanvas: { height: 200, backgroundColor: "#E5E7EB", justifyContent: "flex-end", padding: 12 },
  mapFloatingCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: "#D1D5DB", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  mapCardText: { fontSize: 12, fontWeight: "600", color: "#111827" },
  
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  
  // Next Stop Module Style
  nextStopCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FFEDD5", borderRadius: 12, padding: 14, marginBottom: 18 },
  stopIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFEDD5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  stopLocationName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  stopMetaText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  stopDistanceText: { fontSize: 13, fontWeight: "700", color: "#EA580C" },
  
  // Roster manifest layout
  manifestCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 20 },
  passengerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  avatarCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginRight: 12 },
  passengerNameText: { fontSize: 13, fontWeight: "600", color: "#111827" },
  passengerDropoffText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  passengerFareLabel: { fontSize: 13, fontWeight: "700", color: "#10B981" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  arriveCheckpointButton: { backgroundColor: "#111827", borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  arriveCheckpointButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 0.4 },
});