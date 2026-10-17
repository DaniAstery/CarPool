import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { toMapCoordinate } from "../utils/mapCoordinates";

const { width } = Dimensions.get("window");
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

export default function TripCompletionScreen({ navigation, route }) {
  const rideOfferId = route?.params?.rideOfferId || route?.params?.ride_offer_id;
  const [destinationLocation, setDestinationLocation] = useState(() =>
    toMapCoordinate(route?.params?.destination_lat, route?.params?.destination_lng)
  );
  const [destinationName, setDestinationName] = useState(route?.params?.destinationName || "Destination hub");

  useEffect(() => {
    if (!rideOfferId) return;
    let isMounted = true;

    async function fetchDestinationHub() {
      try {
        const response = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
        const data = await response.json();
        if (!response.ok || !data.success || !data.coordinates) {
          throw new Error(data.error || `Destination lookup failed (${response.status}).`);
        }
        const coordinate = toMapCoordinate(data.coordinates.end_latitude, data.coordinates.end_longitude);
        if (!coordinate) throw new Error("The route has no valid destination hub coordinates.");
        if (isMounted) {
          setDestinationLocation(coordinate);
          setDestinationName(data.coordinates.end_hub_name || "Destination hub");
        }
      } catch (error) {
        console.error("Failed to resolve completed-trip destination:", error);
      }
    }

    fetchDestinationHub();
    return () => {
      isMounted = false;
    };
  }, [rideOfferId]);

  // Local interactive rating states
  const [driverRating, setDriverRating] = useState(0);
  const [likedRiders, setLikedRiders] = useState({ Rider2: false, Rider3: false });
  const [paymentSettled, setPaymentSettled] = useState(true);

  const toggleRiderLike = (riderKey) => {
    setLikedRiders((prev) => ({ ...prev, [riderKey]: !prev[riderKey] }));
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Completion Context Header Banner */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusSuccessBadge}>
          <Ionicons name="checkmark-done-circle" size={22} color="#10B981" />
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>Arrived at Destination</Text>
          <Text style={styles.statusSecondaryText}>Thank you for choosing Corridor Pooling</Text>
        </View>
      </View>

      {/* 2. Static Post-Trip Summary Map Canvas */}
      <View style={styles.mapContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: destinationLocation?.latitude ?? 9.0235,
            longitude: destinationLocation?.longitude ?? 38.8275,
            latitudeDelta: 0.006,
            longitudeDelta: 0.006,
          }}
          customMapStyle={cleanMinimalMapStyle}
          scrollEnabled={false}
          zoomEnabled={false}
        >
          {/* Static Destination Pin */}
          {destinationLocation && <Marker coordinate={destinationLocation} title={destinationName}>
            <View style={styles.destinationMarkerPin}>
              <Ionicons name="location" size={16} color="#FFFFFF" />
            </View>
          </Marker>}
        </MapView>
      </View>

      {/* 3. Sliding Payment Details & Rating Drawer */}
      <View style={styles.slidingPanelDrawer}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Main Financial Split-Fare Breakdown Receipt Card */}
          <View style={styles.receiptContainerCard}>
            <View style={styles.receiptHeaderRow}>
              <View style={styles.paymentMethodGroup}>
                <FontAwesome5 name="wallet" size={14} color="#3A82F6" />
                <Text style={styles.paymentMethodText}>Paid via Digital Wallet</Text>
              </View>
              {paymentSettled && (
                <View style={styles.settledBadge}>
                  <Text style={styles.settledBadgeText}>SETTLED</Text>
                </View>
              )}
            </View>

            <View style={styles.horizontalLineDivider} />

            {/* Financial Math Ledger */}
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Standard Solo Fare</Text>
              <Text style={styles.ledgerValueCrossed}>ETB 240</Text>
            </View>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Corridor Pool Split Discount</Text>
              <Text style={styles.ledgerValueDiscount}>- ETB 160</Text>
            </View>

            <View style={[styles.horizontalLineDivider, { marginVertical: 8 }]} />

            <View style={styles.ledgerRow}>
              <Text style={styles.totalFareLabel}>Your Final Shared Fare</Text>
              <Text style={styles.totalFareValue}>ETB 80</Text>
            </View>
          </View>

          {/* Interactive Rating Matrix Modules */}
          <Text style={styles.sectionHeaderLabel}>Rate Your Driver</Text>
          <View style={styles.ratingCard}>
            <View style={styles.driverMetaRow}>
              <View style={styles.avatarHolder}>
                <FontAwesome5 name="user-check" size={14} color="#059669" />
              </View>
              <Text style={styles.driverNameText}>Dawit Mengistu</Text>
            </View>
            
            {/* Interactive Star Row */}
            <View style={styles.starsRowGroup}>
              {[1, 2, 3, 4, 5].map((starValue) => (
                <TouchableOpacity
                  key={starValue}
                  onPress={() => setDriverRating(starValue)}
                  activeOpacity={0.7}
                  style={styles.starTouchTarget}
                >
                  <Ionicons
                    name={starValue <= driverRating ? "star" : "star-outline"}
                    size={28}
                    color={starValue <= driverRating ? "#F59E0B" : "#D1D5DB"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.sectionHeaderLabel}>Endorse Corridor Co-Riders</Text>
          <View style={styles.coRidersCard}>
            {/* Rider 2 endorsement block */}
            <View style={styles.riderEndorseRow}>
              <View style={styles.riderIdentityBlock}>
                <View style={[styles.riderIconBadge, { backgroundColor: "rgba(226, 135, 67, 0.15)" }]}>
                  <MaterialCommunityIcons name="account" size={16} color="#E28743" />
                </View>
                <Text style={styles.riderNameLabel}>Rider 2</Text>
              </View>
              <TouchableOpacity
                style={[styles.thumbsButton, likedRiders.Rider2 && styles.thumbsButtonActive]}
                onPress={() => toggleRiderLike("Rider2")}
              >
                <Ionicons
                  name={likedRiders.Rider2 ? "thumbs-up" : "thumbs-up-outline"}
                  size={16}
                  color={likedRiders.Rider2 ? "#FFFFFF" : "#4B5563"}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.horizontalLineDivider} />

            {/* Rider 3 endorsement block */}
            <View style={styles.riderEndorseRow}>
              <View style={styles.riderIdentityBlock}>
                <View style={[styles.riderIconBadge, { backgroundColor: "rgba(118, 74, 188, 0.15)" }]}>
                  <MaterialCommunityIcons name="account" size={16} color="#764ABC" />
                </View>
                <Text style={styles.riderNameLabel}>Rider 3</Text>
              </View>
              <TouchableOpacity
                style={[styles.thumbsButton, likedRiders.Rider3 && styles.thumbsButtonActive]}
                onPress={() => toggleRiderLike("Rider3")}
              >
                <Ionicons
                  name={likedRiders.Rider3 ? "thumbs-up" : "thumbs-up-outline"}
                  size={16}
                  color={likedRiders.Rider3 ? "#FFFFFF" : "#4B5563"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Close Loop Navigation Action Flow Button */}
          <TouchableOpacity 
            style={styles.doneActionButton}
            activeOpacity={0.8}
            onPress={() => {
              if (navigation) {
                navigation.popToTop(); // Back to main dashboard state safely
              }
            }}
          >
            <Text style={styles.doneActionButtonText}>DONE</Text>
          </TouchableOpacity>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  statusBarBanner: {
    backgroundColor: "#111827", // Smooth Dark Slate tone element
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    zIndex: 20,
  },
  statusSuccessBadge: {
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  statusTextContainer: {
    flex: 1,
  },
  statusPrimaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  statusSecondaryText: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
    maxHeight: "22%",
  },
  destinationMarkerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  slidingPanelDrawer: {
    position: "absolute",
    bottom: 0,
    width: width,
    maxHeight: "72%",
    backgroundColor: "#F9FAFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  receiptContainerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 16,
  },
  receiptHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
  },
  paymentMethodGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  paymentMethodText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginLeft: 8,
  },
  settledBadge: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "#A7F3D0",
  },
  settledBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#10B981",
  },
  ledgerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  ledgerLabel: {
    fontSize: 13,
    color: "#4B5563",
  },
  ledgerValueCrossed: {
    fontSize: 13,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  ledgerValueDiscount: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "600",
  },
  totalFareLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  totalFareValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111111",
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 2,
  },
  ratingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    alignItems: "center",
    marginBottom: 16,
  },
  driverMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  avatarHolder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  driverNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111111",
  },
  starsRowGroup: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 4,
  },
  starTouchTarget: {
    paddingHorizontal: 8,
  },
  coRidersCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  riderEndorseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  riderIdentityBlock: {
    flexDirection: "row",
    alignItems: "center",
  },
  riderIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  riderNameLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111111",
  },
  thumbsButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  thumbsButtonActive: {
    backgroundColor: "#3A82F6",
    borderColor: "#3A82F6",
  },
  doneActionButton: {
    backgroundColor: "#111111",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  doneActionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  horizontalLineDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 10,
  },
});