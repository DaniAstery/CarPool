import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from '../AuthContext'; 

const { width, height } = Dimensions.get("window");
const API_URL = "http://192.168.1.3:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (Feres-Style GPS UI)
// ------------------------------------------------------------------
const MemoizedMap = memo(({ currentLocation, meetupLocation, mapRef }) => {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={currentLocation || DEFAULT_LOCATION}
      showsUserLocation={false} 
      showsMyLocationButton={false}
      showsCompass={false}
      customMapStyle={cleanMinimalMapStyle}
    >
      {/* 🔵 Feres-Style Live GPS Passenger Marker */}
      {currentLocation && (
        <Marker 
          coordinate={currentLocation} 
          title="Your Location" 
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <View style={styles.userLocationHalo}>
            <View style={styles.userLocationDot} />
          </View>
        </Marker>
      )}

      {/* 📍 Meetup Hub Marker */}
      {meetupLocation && meetupLocation.latitude && (
        <Marker 
          coordinate={{ latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }} 
          title={meetupLocation.name || "Pickup Hub"} 
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.pickupMarkerContainer}>
            <View style={styles.pickupPinBubble}>
              <MaterialCommunityIcons name="map-marker-radius" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.pickupPinTip} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Route Line connecting Passenger to Hub */}
      {currentLocation && meetupLocation && meetupLocation.latitude && (
        <Polyline
          coordinates={[
            currentLocation, 
            { latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }
          ]}
          strokeColor="#059669"
          strokeWidth={4}
          geodesic={true}
          lineDashPattern={[6, 6]}
        />
      )}
    </MapView>
  );
});

export default function PickupProposalScreen({ navigation }) {
  const { user } = useAuth();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);

  // States
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [userAccepted, setUserAccepted] = useState(false);
  const [myDbStatus, setMyDbStatus] = useState("searching");
  const [coRiders, setCoRiders] = useState([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [driverState, setDriverState] = useState("pending");
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  
  const [meetupHub, setMeetupHub] = useState({
    name: "Resolving Hub...",
    latitude: null,
    longitude: null
  });

  const mapRef = useRef(null);
  const hasFramedMap = useRef(false);

  // 1. DISABLE ANDROID BACK BUTTON
  useEffect(() => {
    const backAction = () => true; 
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  const navigateToTracking = useCallback((rideOfferId) => {
    navigation.replace("LiveTracking", { rideOfferId });
  }, [navigation]);

  // 2. FETCH LIVE LOCATION
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const locationPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1500));
          const location = await Promise.race([locationPromise, timeoutPromise]);

          if (location && isMounted) {
            setCurrentLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.015,
              longitudeDelta: 0.015,
            });
          }
        }
      } catch (err) {}
    })();
    return () => { isMounted = false; };
  }, []);

  // 3. AUTO-FRAME MAP TO FIT BOTH USER AND HUB
  useEffect(() => {
    if (mapRef.current && currentLocation?.latitude && meetupHub?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      
      mapRef.current.fitToCoordinates(
        [
          { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          { latitude: meetupHub.latitude, longitude: meetupHub.longitude }
        ],
        {
          edgePadding: { top: 80, right: 50, bottom: bottomPadding, left: 50 },
          animated: true,
        }
      );
      hasFramedMap.current = true;
    }
  }, [currentLocation, meetupHub, isDrawerExpanded]);

  // 4. TIMER
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // 5. DATA POLLING LOOP
  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function checkProposalStatus() {
      if (!isSubscribed || !currentUserId) return;

      try {
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 2500);

        const res = await fetch(`${API_URL}/api/rides/proposal-manifest/${currentUserId}`, {
          signal: controller.signal,
        });
        clearTimeout(abortTimeout);

        if (res.status === 404 || !res.ok) {
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.replace("Home");
          return;
        }

        if (isSubscribed) {
          const data = await res.json();
          const passengers = data.passengers || [];

          if (data.hub && data.hub.latitude) {
            setMeetupHub(data.hub);
          }

          const normalizedAcceptedIds = (data.accepted_passengers || []).map(id => parseInt(id, 10));
          const isUserAcceptedInOffer = normalizedAcceptedIds.includes(currentUserId);
          
          const myRow = passengers.find(p => parseInt(p.user_id, 10) === currentUserId);
          const myRoutePoolStatus = myRow ? (myRow.status || "searching").toLowerCase().trim() : "searching";
          const rawMyStatus = (userAccepted || isUserAcceptedInOffer) ? "accepted" : myRoutePoolStatus;

          setMyDbStatus(rawMyStatus);
          if (rawMyStatus === "accepted") setUserAccepted(true);

          const currentDriverStatus = (data.driver_status || "pending").toLowerCase().trim();
          setDriverState(currentDriverStatus);

          const activeRideOfferId = data.ride_offer_id || data.rideOfferId || data.matched_ride_offer_id || data.id;
          if (currentDriverStatus === "accepted" && activeRideOfferId) {
            navigateToTracking(activeRideOfferId);
            return; 
          }

          if (Array.isArray(passengers)) {
            const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
            const parsedCoRiders = passengers
              .filter(p => parseInt(p.user_id, 10) !== currentUserId)
              .map((p, idx) => {
                const pId = parseInt(p.user_id, 10);
                const isCoRiderAccepted = normalizedAcceptedIds.includes(pId);
                const pRoutePoolStatus = (p.status || "searching").toLowerCase().trim();

                return {
                  id: pId,
                  name: p.full_name || p.name || `Rider ${pId}`,
                  status: isCoRiderAccepted ? "ACCEPTED" : pRoutePoolStatus.toUpperCase(),
                  color: colorPalette[idx % colorPalette.length],
                };
              });
            setCoRiders(parsedCoRiders);
          }
        }
      } catch (err) {} 
      finally {
        if (isSubscribed) {
          setInitialCheckDone(true);
          timerId = setTimeout(checkProposalStatus, 3000);
        }
      }
    }

    checkProposalStatus();
    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [currentUserId, navigateToTracking, navigation, userAccepted]);

  const handleAcceptProposal = async () => {
    setUserAccepted(true);
    setMyDbStatus("accepted");

    try {
      const response = await fetch(`${API_URL}/api/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ride_offer_id && driverState === "accepted") {
          navigateToTracking(data.ride_offer_id);
        }
      } else {
        setUserAccepted(false);
        setMyDbStatus("searching");
      }
    } catch (err) {
      setUserAccepted(false);
      setMyDbStatus("searching");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. TOP BANNER STATUS BAR */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <View style={styles.statusCenterCoreDot}>
            <FontAwesome5 name="car-side" size={11} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>Pickup Proposal Active</Text>
          <Text style={styles.statusSecondaryText}>Review meeting hub & confirm participation</Text>
        </View>
      </View>

      {/* 2. MAP CONTAINER */}
      <View style={styles.mapContainer}>
        {initialCheckDone ? (
          <MemoizedMap currentLocation={currentLocation} meetupLocation={meetupHub} mapRef={mapRef} />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="small" color="#059669" />
          </View>
        )}
      </View>

      {/* 3. COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        
        {/* Toggle Expansion Handle */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Corridor Match</Text>
              <Text style={styles.subtitle}>
                Meet at <Text style={styles.boldText}>{meetupHub.name}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={styles.timerBadge}>
                <Ionicons name="time-outline" size={14} color="#059669" />
                <Text style={styles.timerText}>{timeLeft}s</Text>
              </View>
              <View style={styles.expandToggleBadge}>
                <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
                <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Scrollable Roster Body */}
        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          <View style={styles.rosterContainer}>
            <Text style={styles.sectionHeader}>Matching Corridor Pool</Text>
            
            <View style={styles.riderRow}>
              <View style={[styles.avatar, { backgroundColor: "#059669" }]}>
                <Text style={styles.avatarText}>YOU</Text>
              </View>
              <Text style={styles.riderName}>
                You ({user?.full_name || user?.name || `User ${currentUserId}`})
              </Text>
              <Text style={[
                styles.statusTag, 
                myDbStatus === "accepted" ? styles.statusAccepted : 
                (myDbStatus === "matched" || myDbStatus === "searching") ? styles.statusMatched : 
                styles.statusPending
              ]}>
                {myDbStatus.toUpperCase()}
              </Text>
            </View>

            {coRiders.map((rider) => (
              <View key={rider.id} style={styles.riderRow}>
                <View style={[styles.avatar, { backgroundColor: rider.color }]}>
                  <Text style={styles.avatarText}>
                    {rider.name !== `Rider ${rider.id}` ? rider.name.charAt(0).toUpperCase() : rider.id}
                  </Text>
                </View>
                <Text style={styles.riderName}>{rider.name}</Text>
                <Text style={[
                  styles.statusTag, 
                  rider.status === "ACCEPTED" ? styles.statusAccepted : 
                  (rider.status === "MATCHED" || rider.status === "SEARCHING") ? styles.statusMatched : 
                  styles.statusPending
                ]}>
                  {rider.status}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.driverCard}>
            <FontAwesome5 name="user-shield" size={16} color="#059669" />
            <Text style={styles.driverText}>
              Driver Status: <Text style={styles.boldText}>{driverState.toUpperCase()}</Text>
            </Text>
          </View>
        </ScrollView>

        {/* Sticky Action Button inside Drawer (Hidden if collapsed) */}
        {isDrawerExpanded && (
          <View style={styles.drawerFooterSticky}>
            <TouchableOpacity
              style={[styles.actionButton, userAccepted && styles.actionButtonDisabled]}
              disabled={userAccepted}
              activeOpacity={0.85}
              onPress={handleAcceptProposal}
            >
              <View style={styles.buttonInternalGroup}>
                {userAccepted ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.actionButtonText}>
                  {userAccepted ? "Waiting for driver..." : "Accept Pickup Spot"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F9FAFB" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#FEF3C7" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#E0F2FE" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  
  // Status Bar Banner
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#A7F3D0" },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },
  
  // Map Elements
  mapContainer: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  
  // Feres-Style GPS User Marker
  userLocationHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(5, 150, 105, 0.2)", justifyContent: "center", alignItems: "center" },
  userLocationDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#059669", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  
  // Pickup Pin
  pickupMarkerContainer: { alignItems: "center" },
  pickupPinBubble: { backgroundColor: "#111827", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: "#FFFFFF", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  pickupPinTip: { width: 0, height: 0, backgroundColor: "transparent", borderStyle: "solid", borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#111827", marginTop: -1 },

  // Collapsible Sliding Panel
  slidingPanelDrawer: { 
    position: "absolute", 
    bottom: 0, 
    width: width, 
    backgroundColor: "#F9FAFB", 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingTop: 8, 
    paddingHorizontal: 16, 
    borderWidth: 1, 
    borderColor: "#E5E7EB", 
    elevation: 15,
    zIndex: 30 
  },
  drawerCollapsed: { height: 120 },
  drawerExpanded: { maxHeight: height * 0.65 },
  
  dragHandleContainer: { paddingBottom: 10, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#111111" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#111111" },
  
  timerBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: "#A7F3D0", marginBottom: 6 },
  timerText: { fontSize: 12, fontWeight: "700", color: "#059669", marginLeft: 4 },
  
  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 4 },
  
  // Drawer Body
  drawerScrollBody: { flexGrow: 0 },
  rosterContainer: { marginVertical: 6, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 12 },
  sectionHeader: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  riderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  riderName: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: "500", color: "#374151" },
  statusTag: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  statusAccepted: { backgroundColor: "#ECFDF5", color: "#059669" },
  statusMatched: { backgroundColor: "#EFF6FF", color: "#1D4ED8" },
  statusPending: { backgroundColor: "#FEF3C7", color: "#D97706" },
  
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", marginVertical: 8 },
  driverText: { marginLeft: 10, fontSize: 13, color: "#4B5563" },
  
  // Footer
  drawerFooterSticky: { 
    paddingVertical: 10, 
    paddingBottom: Platform.OS === 'android' ? 24 : 12, // Clears Android bottom nav
    borderTopWidth: 1, 
    borderTopColor: "#E5E7EB", 
    backgroundColor: "#F9FAFB" 
  },
  actionButton: { backgroundColor: "#059669", paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionButtonDisabled: { backgroundColor: "#9CA3AF" },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
});