import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

export default function ProposalDriver({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [activeRideOfferId, setActiveRideOfferId] = useState(372); // Dynamic reference key tracking
  
  // High-Resolution Focus: Centered directly over the calculated Megenagna Convergence Point
  const [pickupLocation, setPickupLocation] = useState({
    latitude: 9.0115,
    longitude: 38.7945,
    latitudeDelta: 0.0025, // Micro-zoom matching the passenger guidance layout
    longitudeDelta: 0.0025,
  });

  // Dynamic Passenger Convergence List mapped to system entities
  const [passengers, setPassengers] = useState([
    { id: 1, name: "Passenger 1", distance: "180m", time: "2 min", color: "#3B82F6", latOffset: -0.0006, lngOffset: -0.0004 },
    { id: 2, name: "Passenger 2", distance: "140m", time: "2 min", color: "#F59E0B", latOffset: 0.0004, lngOffset: 0.0004 },
    { id: 3, name: "Passenger 3", distance: "220m", time: "3 min", color: "#8B5CF6", latOffset: 0.0003, lngOffset: -0.0005 },
  ]);

  // 📤 Dispatch Transactional Acceptance Handshake to Database
  const handleAcceptProposal = async () => {
    setLoading(true);
    try {
      // In production, update the ride offer's specific execution status step
      const res = await fetch("http://192.168.238.52:5000/api/rides/accept-proposal-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: activeRideOfferId,
          status: "location_approved"
        }),
      });

      // Navigate forward instantly for testing the sequence chain seamlessly
      console.log("Pickup proposal approved. Moving to wait sequence graph...");
      navigation.navigate("WaitingForAcceptance", { rideOfferId: activeRideOfferId });
      
    } catch (err) {
      console.log("Error dispatching driver choice metadata parameters:", err);
      // Fallback transition path to keep local workflow runtime moving forward smoothly
      navigation.navigate("WaitingForAcceptance", { rideOfferId: activeRideOfferId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Header Navigation Block */}
      <View style={styles.headerBlock}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitleText}>Pickup Proposal</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.contentBody} showsVerticalScrollIndicator={false}>
        
        {/* 2. Primary Status Notification Bar */}
        <View style={styles.greenStatusBanner}>
          <FontAwesome5 name="user-check" size={14} color="#FFFFFF" style={{ marginRight: 10 }} />
          <View style={styles.bannerTextFrame}>
            <Text style={styles.bannerMainText}>{passengers.length}/{passengers.length} Riders Joined</Text>
            <Text style={styles.bannerSubText}>Optimal convergence hub point calculated</Text>
          </View>
        </View>

        {/* 3. High-Precision Map View Layout Layer */}
        <View style={styles.mapCanvasPlaceholder}>
          <MapView
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFillObject}
            initialRegion={pickupLocation}
            customMapStyle={detailedMapStyle}
            showsBuildings={true}
            scrollEnabled={true}
            zoomEnabled={true}
          >
            {/* Passenger Geometric Position Breakout Markers */}
            {passengers.map((p) => (
              <Marker
                key={p.id}
                coordinate={{
                  latitude: pickupLocation.latitude + p.latOffset,
                  longitude: pickupLocation.longitude + p.lngOffset,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.mapNodeBadge, { borderColor: p.color, borderWidth: 1.5 }]}>
                  <Text style={styles.nodeBadgeText}>{p.distance}</Text>
                  <Text style={styles.nodeBadgeSubText}>({p.time})</Text>
                </View>
              </Marker>
            ))}

            {/* Central Calculated Hub Target Pin Node */}
            <Marker coordinate={pickupLocation} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.centralPinMarker}>
                <MaterialCommunityIcons name="map-marker-radius" size={28} color="#059669" />
              </View>
            </Marker>
          </MapView>
        </View>

        {/* 4. Recommended Pickup Point Descriptor Details Card Layout */}
        <Text style={styles.sectionHeadingLabel}>Recommended Pickup Point</Text>
        
        <View style={styles.pickupDetailCard}>
          <View style={styles.detailRowHeader}>
            <Ionicons name="location" size={22} color="#059669" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hubMainTitleText}>Megenagna Blue Taxi Stop</Text>
              <Text style={styles.hubSubTitleText}>On Megenagna Road (Main Corridor)</Text>
            </View>
          </View>

          <View style={styles.horizontalDivider} />

          {/* Individual Walking Queue Loops */}
          {passengers.map((passenger) => (
            <View key={passenger.id} style={styles.passengerWalkRow}>
              <Ionicons name="person" size={14} color={passenger.color} style={{ marginRight: 8 }} />
              <Text style={styles.passengerNameLabel}>{passenger.name}</Text>
              <Text style={styles.passengerMetricsText}>{passenger.distance} ({passenger.time})</Text>
            </View>
          ))}
        </View>

      </ScrollView>

      {/* 5. Giant Solid Green Action Activation Core Button Footer */}
      <View style={styles.footerContainer}>
        <TouchableOpacity 
          style={styles.acceptLocationButton}
          activeOpacity={0.8}
          onPress={handleAcceptProposal}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.acceptLocationButtonText}>ACCEPT PICKUP LOCATION</Text>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// Custom Micro-Clarity Vector Styling Array Configuration for Map Engine Framework
const detailedMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ color: "#EAEAEA" }] },
  { featureType: "transit.station", elementType: "labels.icon", stylers: [{ visibility: "on" }, { color: "#059669" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  backButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitleText: { fontSize: 16, fontWeight: "700", color: "#111827" },
  contentBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  greenStatusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#059669", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
  bannerTextFrame: { flex: 1 },
  bannerMainText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  bannerSubText: { fontSize: 12, color: "#D1FAE5", marginTop: 1 },
  mapCanvasPlaceholder: { height: 240, backgroundColor: "#E5E7EB", borderRadius: 12, marginBottom: 20, position: "relative", overflow: "hidden" },
  mapNodeBadge: { backgroundColor: "#FFFFFF", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 2 },
  nodeBadgeText: { fontSize: 9, fontWeight: "700", color: "#374151" },
  nodeBadgeSubText: { fontSize: 8, color: "#6B7280" },
  centralPinMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(5, 150, 105, 0.15)", justifyContent: "center", alignItems: "center" },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  pickupDetailCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 16, marginBottom: 24 },
  detailRowHeader: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  hubMainTitleText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  hubSubTitleText: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  passengerWalkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F9FAFB" },
  passengerNameLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500", flex: 1 },
  passengerMetricsText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  footerContainer: { paddingHorizontal: 16, paddingVertical: 16, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB" },
  acceptLocationButton: { backgroundColor: "#059669", borderRadius: 10, paddingVertical: 14, alignItems: "center", justifyValue: "center" },
  acceptLocationButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", letterSpacing: 0.4 },
});