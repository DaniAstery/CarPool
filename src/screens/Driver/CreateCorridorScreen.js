import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Circle } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";
import { io } from "socket.io-client";

const { width, height } = Dimensions.get("window");
const API_URL = "http://192.168.1.3:5000";

const FALLBACK_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

// Helper function to calculate distance in km between two GPS coordinates
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// ------------------------------------------------------------------
// MEMOIZED DISPATCH MAP VIEW (Full Screen Canvas with Car Avatar & Top Hubs)
// ------------------------------------------------------------------
const DispatchMap = memo(({ driverCoords, targetHubForLine, topHubs, currentHub, nearestHub, mapRef, isDrawerExpanded, onSelectHub, showRadiusCircle, onToggleRadius, currentDriverDistance }) => {
  useEffect(() => {
    if (mapRef.current && driverCoords?.latitude && targetHubForLine?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      mapRef.current.fitToCoordinates(
        [
          { latitude: driverCoords.latitude, longitude: driverCoords.longitude },
          { latitude: targetHubForLine.latitude, longitude: targetHubForLine.longitude }
        ],
        {
          edgePadding: { top: 70, right: 50, bottom: bottomPadding, left: 50 },
          animated: true,
        }
      );
    }
  }, [driverCoords, targetHubForLine, mapRef, isDrawerExpanded]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_DEFAULT}
        initialRegion={driverCoords || DEFAULT_LOCATION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* 1. Render Top Hubs */}
        {topHubs.map((hub) => {
          const isSelectedActive = currentHub && currentHub.id === hub.id;
          const isNearest = nearestHub && nearestHub.id === hub.id;
          return (
            <React.Fragment key={`hub-${hub.id}`}>
              <Marker
                coordinate={{ latitude: hub.latitude, longitude: hub.longitude }}
                title={hub.name}
                description={`${hub.distanceKm ? hub.distanceKm.toFixed(1) : "?"} km away`}
                onPress={() => onSelectHub(hub)}
                tracksViewChanges={false}
              >
                <View style={[styles.hubWaypointMarker, (isSelectedActive || isNearest) && styles.activeHubWaypointMarker]}>
                  {isSelectedActive && (
                    <View style={styles.glowingTargetBadge}>
                      <Text style={styles.glowingTargetText}>TARGET HUB</Text>
                    </View>
                  )}
                  <View style={styles.hubWaypointDot} />
                </View>
              </Marker>

              {/* Working Radius Circle Radar (Toggleable) */}
              {isSelectedActive && showRadiusCircle && (
                <Circle
                  center={{ latitude: hub.latitude, longitude: hub.longitude }}
                  radius={2000} 
                  strokeColor="#10B981"
                  fillColor="rgba(16, 185, 129, 0.12)"
                  strokeWidth={2}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* 2. Pinned Driver GPS Location Marker */}
        {driverCoords && (
          <Marker coordinate={driverCoords} title="Your Vehicle Location" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
            <View style={styles.driverPinnedContainer}>
              <View style={styles.driverPinBadge}>
                <Text style={styles.driverPinText}>YOU</Text>
              </View>
              <View style={styles.glowingDriverHalo}>
                <View style={styles.driverMarkerBubble}>
                  <MaterialCommunityIcons name="car-side" size={16} color="#FFFFFF" />
                </View>
              </View>
            </View>
          </Marker>
        )}

        {/* 3. Route Approach Polyline to Pickup */}
        {driverCoords && targetHubForLine && targetHubForLine.latitude && (
          <Polyline
            coordinates={[
              driverCoords,
              { latitude: targetHubForLine.latitude, longitude: targetHubForLine.longitude }
            ]}
            strokeColor="#10B981"
            strokeWidth={4}
            lineDashPattern={[8, 4]}
            geodesic={true}
          />
        )}
      </MapView>

      {/* 📏 Always-Visible Fixed Distance Banner */}
      {targetHubForLine && typeof currentDriverDistance === "number" && (
        <View style={styles.persistentDistanceBanner}>
          <Ionicons name="navigate" size={14} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.persistentDistanceText}>
            Distance to <Text style={styles.boldText}>{targetHubForLine.name || "Hub"}</Text>:{" "}
            <Text style={[styles.boldText, { color: currentDriverDistance <= 2.0 ? "#10B981" : "#EF4444" }]}>
              {currentDriverDistance.toFixed(2)} km
            </Text>
          </Text>
        </View>
      )}

      {/* Floating Map Radar Toggle Button */}
      <TouchableOpacity 
        style={styles.radarToggleFloatingButton} 
        onPress={onToggleRadius}
        activeOpacity={0.8}
      >
        <Ionicons name={showRadiusCircle ? "radio" : "radio-outline"} size={16} color={showRadiusCircle ? "#10B981" : "#6B7280"} />
        <Text style={[styles.radarToggleText, showRadiusCircle && { color: "#10B981", fontWeight: "700" }]}>
          {showRadiusCircle ? "Radar: ON" : "Radar: OFF"}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

export default function CreateCorridorScreen({ navigation }) {
  const { user, isLoading: isAuthLoading, logoutSession } = useAuth();
  const currentDriverId = user?.id || user?.user_id || null;   
  const activeVehicleId = 2; 

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [capacity, setCapacity] = useState(4);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [currentHub, setCurrentHub] = useState(null);
  const [nearestHub, setNearestHub] = useState(null);
  const [distanceToHubKm, setDistanceToHubKm] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);

  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLocating, setIsLocating] = useState(true);
  const [gpsWarningText, setGpsWarningText] = useState("Scanning GPS for nearest hub...");

  const [allHubs, setAllHubs] = useState([]);
  const [predefinedCorridors, setPredefinedCorridors] = useState([]);
  const [passengerRequests, setPassengerRequests] = useState([]);
  const [showRadiusCircle, setShowRadiusCircle] = useState(true);

  const mapRef = useRef(null);

  const [currentRegion, setCurrentRegion] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);

  // 🚫 DISABLE ANDROID HARDWARE BACK BUTTON
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  // 🌍 DEDICATED DRIVER GPS AUTO-LOCATION & VALIDATION
  useEffect(() => {
    let isMounted = true;

    async function fetchDeviceLocation() {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          console.warn('Location permission denied. Using fallback location.');
          if (isMounted) {
            setCurrentRegion(FALLBACK_LOCATION);
            setLoadingLocation(false);
          }
          return;
        }

        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isMounted && location) {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          };
          setCurrentRegion(coords);
          setDriverCoords(coords);
        }
      } catch (error) {
        console.error('Error fetching device location:', error);
        if (isMounted) {
          setCurrentRegion(FALLBACK_LOCATION);
        }
      } finally {
        if (isMounted) {
          setLoadingLocation(false);
        }
      }
    }

    fetchDeviceLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  // 🌍 FETCH SYSTEM HUBS ON MOUNT
  useEffect(() => {
    async function fetchAllHubs() {
      try {
        const res = await fetch(`${API_URL}/api/hubs`);
        if (res.ok) {
          const data = await res.json();
          setAllHubs(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.log("❌ Failed to fetch hubs:", err);
      }
    }
    fetchAllHubs();
  }, []);

  // 📍 CALCULATE TOP 4 NEAREST HUBS BASED ON DRIVER GPS
  const topHubs = useMemo(() => {
    if (!driverCoords || allHubs.length === 0) return allHubs.slice(0, 4);

    return allHubs
      .map(hub => ({
        ...hub,
        distanceKm: getDistanceFromLatLonInKm(
          driverCoords.latitude,
          driverCoords.longitude,
          hub.latitude,
          hub.longitude
        )
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 4);
  }, [allHubs, driverCoords]);

  // Default initial hub selection to the absolute nearest of the top 4
  useEffect(() => {
    if (topHubs.length > 0 && !currentHub) {
      handleHubSelection(topHubs[0]);
    }
  }, [topHubs]);

  // 🚦 ACTIVE DRIVER SESSION RECOVERY LOCK
  useEffect(() => {
    if (isAuthLoading || !currentDriverId) return;

    async function checkActiveDriverSession() {
      try {
        const res = await fetch(`${API_URL}/api/rides/driver-active-session/${currentDriverId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data && data.hasActiveSession) {
          const normalizedStatus = (data.status || "").toLowerCase().trim();
          const targetRouteId = data.routeId || data.route_id;
          const targetRideId = data.rideOfferId || data.ride_offer_id || data.id;
          const passengers = data.passengers || [];

          if (passengers.length > 0) {
            const hasAcceptedRider = passengers.some(p => (p.status || "").toLowerCase().trim() === "accepted");
            const hasSingleMatchedRider = passengers.length === 1 && passengers.some(p => (p.status || "").toLowerCase().trim() === "matched");
            const hasArrivedRider = passengers.some(p => (p.status || "").toLowerCase().trim() === "arrived");

            if (hasAcceptedRider) {
              navigation.replace("ProposalDriver", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
            if (hasSingleMatchedRider) {
              navigation.replace("WaitingForRiders", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
            if (hasArrivedRider) {
              navigation.replace("TripInProgress", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              return;
            }
          }

          switch (normalizedStatus) {
            case "pending":
              navigation.replace("WaitingForRiders", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "accepted":
            case "arrived":
              navigation.replace("NavigateToPickup", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "in_trip":
            case "inprogress":
            case "in_transit": 
              navigation.replace("TripInProgress", { routeId: targetRouteId, rideOfferId: targetRideId, driverId: currentDriverId });
              break;
            case "completed":
              navigation.replace("TripEarningsSummary", { rideOfferId: targetRideId, driverId: currentDriverId });
              break;
          }
        }
      } catch (err) {
        console.log("❌ Driver session verification failed:", err);
      }
    }

    checkActiveDriverSession();
  }, [currentDriverId, isAuthLoading, navigation]);

  // 🔌 Real-time Socket.io Sync for Live Queue & Wait Time Updates
  useEffect(() => {
    if (!currentHub || !currentHub.name) return;

    const socket = io(API_URL);

    socket.on("connect", () => {
      console.log("🟢 Connected to live dispatcher socket");
      socket.emit("join_hub", { hub_name: currentHub.name });
    });

    socket.on("queue_update", (updatedCorridors) => {
      if (Array.isArray(updatedCorridors)) {
        console.log("🔥 Received live queue update via socket");
        setPredefinedCorridors(updatedCorridors);
      }
    });

    return () => {
      socket.disconnect();
      console.log("🔴 Disconnected dispatcher socket");
    };
  }, [currentHub]);

  // 📍 HUB SELECTION ENGINE
  const handleHubSelection = useCallback(async (hub) => {
    setCurrentHub(hub);
    setSelectedRoute(null);
    setLoadingCorridors(true);
    
    try {
      const [corridorRes, requestsRes] = await Promise.all([
        fetch(`${API_URL}/api/routes/live-corridors/${encodeURIComponent(hub.name)}`),
        fetch(`${API_URL}/api/corridors/passenger-requests`)
      ]);

      const corridorsData = await corridorRes.json();
      const requestsData = await requestsRes.json();

      setPredefinedCorridors(Array.isArray(corridorsData) ? corridorsData : []);

      const localRequests = Array.isArray(requestsData)
        ? requestsData.filter(req => req.start_location && req.start_location.toLowerCase() === hub.name.toLowerCase())
        : [];
      setPassengerRequests(localRequests);

    } catch (err) {
      Alert.alert("Data Error", "Could not synchronize corridors for this hub.");
    } finally {
      setLoadingCorridors(false);
    }
  }, []);

  // Calculate current distance for the active hub selection
  let currentDriverDistance = null;
  if (driverCoords && currentHub?.latitude && currentHub?.longitude) {
    currentDriverDistance = getDistanceFromLatLonInKm(
      driverCoords.latitude,
      driverCoords.longitude,
      currentHub.latitude,
      currentHub.longitude
    );
  }
  const ALLOWED_RANGE_KM = 2.0;
  const isInRangeOfSelected = currentDriverDistance !== null && currentDriverDistance <= ALLOWED_RANGE_KM;

  // 🚀 LIVE DISPATCH / GO ONLINE TRIGGER WITH STRICT RANGE ENFORCEMENT
  const handleGoOnline = async () => {
    if (!currentDriverId) {
      Alert.alert("Session Error", "Authentication expired.");
      return;
    }

    if (!currentHub) {
      Alert.alert("Location Required", "Please select a hub.");
      return;
    }

    if (!selectedRoute) {
      Alert.alert("Selection Required", "Select a corridor route to launch.");
      return;
    }

    if (!isInRangeOfSelected) {
      Alert.alert(
        "Out of Allowable Range", 
        `You are currently ~${currentDriverDistance ? currentDriverDistance.toFixed(1) : "?"} km away from ${currentHub.name}. You must be within ${ALLOWED_RANGE_KM} km of the hub boundary to go online.`
      );
      return;
    }

    const startHubId = Number(currentHub.id);
    const endHubId = Number(
      selectedRoute.end_hub_id || 
      selectedRoute.drop_off_hub_id || 
      selectedRoute.end_hub?.id ||
      (Array.isArray(selectedRoute.hub_ids) ? selectedRoute.hub_ids[selectedRoute.hub_ids.length - 1] : null) ||
      (Array.isArray(selectedRoute.stop_ids) ? selectedRoute.stop_ids[selectedRoute.stop_ids.length - 1] : null) ||
      selectedRoute.destination_id
    );

    if (!endHubId || isNaN(endHubId) || endHubId === startHubId) {
      Alert.alert("Route Error", "Could not resolve destination hub ID.");
      return;
    }

    setIsPublishing(true);
    try {
      const response = await fetch(`${API_URL}/api/rides/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          vehicle_id: activeVehicleId, 
          route_id: selectedRoute.route_id,
          total_seats: capacity,
          start_location: startHubId, 
          end_location: endHubId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert("Launch Rejected", data.error || "Could not spin up pool session.");
        return;
      }

      navigation.navigate("WaitingForRiders", { 
        ride: {
          id: data.ride_id,
          start_location: data.start_location,
          end_location: data.end_location,
          total_seats: data.total_seats,
          filled: data.filled,
          price_per_seat: data.price_per_seat,
          driver_name: data.driver_name,
        }
      });

    } catch (err) {
      Alert.alert("Network Exception", "Connection timed out.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (isAuthLoading || loadingLocation || !currentRegion) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Detecting your location & profiles...</Text>
      </SafeAreaView>
    );
  }

  const targetHubForLine = currentHub || nearestHub;

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 🗺️ FULL SCREEN MAP CANVAS (Top 4 Hubs Only) */}
      <View style={styles.mapContainer}>
        <DispatchMap 
          driverCoords={driverCoords}
          targetHubForLine={targetHubForLine}
          topHubs={topHubs}
          currentHub={currentHub}
          nearestHub={nearestHub}
          mapRef={mapRef}
          isDrawerExpanded={isDrawerExpanded}
          onSelectHub={handleHubSelection}
          showRadiusCircle={showRadiusCircle}
          onToggleRadius={() => setShowRadiusCircle(!showRadiusCircle)}
          currentDriverDistance={currentDriverDistance}
        />
      </View>

      {/* 👑 TOP FLOATING POWER BUTTON HEADER */}
      <View style={styles.topFloatingHeader}>
        <View style={styles.headerLeftCluster}>
          <Text style={styles.headerTitleText}>Dispatch Center</Text>
          <Text style={styles.headerSubtext}>Vehicle #{activeVehicleId}</Text>
        </View>
        <TouchableOpacity style={styles.logoutIconButton} onPress={logoutSession} activeOpacity={0.7}>
          <Ionicons name="power" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* 📋 COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        
        {/* Toggle Handle Header */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Top 4 Nearest Hubs</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {currentHub ? `Active: ${currentHub.name}` : "Select a nearby hub"}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, isInRangeOfSelected ? styles.badgeArrived : styles.badgeOutOfRange]}>
                <Text style={[styles.badgeText, !isInRangeOfSelected && { color: "#EF4444" }]}>
                  {isInRangeOfSelected ? "IN RANGE" : "OUT OF RANGE"}
                </Text>
              </View>
              <View style={styles.expandToggleBadge}>
                <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
                <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Scrollable Content Body */}
        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 25 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 🌍 TOP 4 HUB SELECTOR HORIZONTAL CHIPS */}
          <Text style={styles.sectionHeadingLabel}>Nearest Hub Options (Max 4)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hubChipsScroll}>
            {topHubs.map((hub) => {
              const isSelected = currentHub?.id === hub.id;
              const dist = hub.distanceKm !== undefined ? hub.distanceKm.toFixed(1) : "?";
              const chipInRange = hub.distanceKm !== undefined && hub.distanceKm <= ALLOWED_RANGE_KM;

              return (
                <TouchableOpacity
                  key={`top-hub-${hub.id}`}
                  style={[styles.hubChip, isSelected && styles.hubChipSelected]}
                  onPress={() => handleHubSelection(hub)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="bus-outline" size={14} color={isSelected ? "#FFF" : "#4B5563"} />
                  <View style={{ flexDirection: 'column' }}>
                    <Text style={[styles.hubChipText, isSelected && styles.hubChipTextSelected]}>{hub.name}</Text>
                    <Text style={[styles.hubChipSubText, isSelected && { color: "#D1FAE5" }]}>
                      {dist} km • {chipInRange ? "In Range" : "Too Far"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 🔥 REALTIME DEMAND SURGE RADAR */}
          {passengerRequests.length > 0 && (
            <View style={styles.demandIndicatorBadge}>
              <View style={styles.badgeLeftRow}>
                <Ionicons name="flash" size={16} color="#D97706" />
                <Text style={styles.demandIndicatorText}>
                  {passengerRequests.length} passengers waiting at {currentHub?.name || 'this hub'}!
                </Text>
              </View>
              <View style={styles.highDemandPill}>
                <Text style={styles.highDemandText}>SURGE</Text>
              </View>
            </View>
          )}

          {/* 🛣️ CORRIDORS & DRIVER QUEUES */}
          <Text style={styles.sectionHeadingLabel}>Corridors & Driver Queues</Text>
          {loadingCorridors ? (
            <View style={styles.skeletonContainer}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.skeletonText}>Loading corridor blueprints & queues...</Text>
            </View>
          ) : predefinedCorridors.length === 0 ? (
            <View style={styles.fallbackContainer}>
              <Ionicons name="map-outline" size={32} color="#9CA3AF" />
              <Text style={styles.fallbackText}>No active corridors mapped out from {currentHub?.name || 'this hub'}.</Text>
            </View>
          ) : (
            predefinedCorridors.map((route, index) => {
              const dropOffName = route.drop_off_hub_name || route.destination_name || "Destination";
              const passThroughName = route.pass_through_hub_name || route.pass_through_name;
              const pickupName = route.pickup_hub_name || currentHub?.name || "Hub";
              const dropOffId = route.drop_off_hub_id || route.end_hub_id;

              const isSelected =
                selectedRoute?.route_id === route.route_id &&
                (selectedRoute?.drop_off_hub_id === dropOffId ||
                  selectedRoute?.end_hub_id === dropOffId);

              const uniqueKey = `${route.route_id}-${route.pickup_hub_id || "p"}-${dropOffId || "d"}-${index}`;
              const estimatedFare = route.recommended_base_price || 100;
              
              const queueCount = Number(route.driver_queue_count ?? 0);
              const avgWaitMins = Number(route.average_wait_mins ?? 0);
              const dynamicWaitTime = queueCount === 0 
                ? "Instant" 
                : avgWaitMins > 0 
                  ? `~${avgWaitMins} mins` 
                  : `~${Math.round(queueCount * 2.5)} mins`;

              return (
                <TouchableOpacity
                  key={uniqueKey}
                  style={[styles.routeCard, isSelected && styles.selectedItemBorder]}
                  onPress={() => setSelectedRoute(route)}
                  activeOpacity={0.8}
                >
                  <View style={styles.routeCardTopRow}>
                    <View style={styles.routeCardLeft}>
                      <View style={[styles.routeIconFrame, isSelected && styles.selectedIconFrame]}>
                        <MaterialCommunityIcons
                          name="bus-side"
                          size={20}
                          color={isSelected ? "#10B981" : "#4B5563"}
                        />
                      </View>
                      <View style={styles.routeDetails}>
                        <Text
                          style={[styles.routeText, isSelected && styles.selectedRouteText]}
                          numberOfLines={1}
                        >
                          {passThroughName
                            ? `${pickupName} ➔ ${passThroughName} ➔ ${dropOffName}`
                            : `${pickupName} ➔ ${dropOffName}`}
                        </Text>
                        <Text style={styles.routeSubPrice}>Estimated Fare: {estimatedFare} ETB</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedCheckCircle}>
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  <View style={styles.queueStatsFooter}>
                    <View style={styles.queueInfoBadge}>
                      <Ionicons name="people" size={13} color={queueCount > 0 ? "#10B981" : "#6B7280"} />
                      <Text style={styles.queueInfoText}>
                        Driver Queue:{" "}
                        <Text style={[styles.boldText, { color: queueCount > 0 ? "#10B981" : "#1F2937" }]}>
                          {queueCount} online
                        </Text>
                      </Text>
                    </View>
                    <View style={styles.queueInfoBadge}>
                      <Ionicons name="time" size={13} color="#6B7280" />
                      <Text style={styles.queueInfoText}>
                        Avg Wait:{" "}
                        <Text style={styles.boldText}>{dynamicWaitTime}</Text>
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {/* 💡 RECOMMENDED DRIVER DETAILS & INSIGHTS */}
          <Text style={[styles.sectionHeadingLabel, { marginTop: 15 }]}>Driver Recommendations & Tips</Text>
          <View style={styles.recommendationsCard}>
            <View style={styles.recommendationItem}>
              <Ionicons name="trending-up" size={16} color="#10B981" />
              <Text style={styles.recommendationText}>Peak rush hour expected between 5:00 PM - 7:00 PM.</Text>
            </View>
            <View style={styles.recommendationItem}>
              <Ionicons name="shield-checkmark" size={16} color="#3B82F6" />
              <Text style={styles.recommendationText}>Ensure passenger verification matches the digital badge before departure.</Text>
            </View>
          </View>
        </ScrollView>

        {/* 🚀 LAUNCH DISPATCH / GO ONLINE BUTTON FOOTER */}
        <View style={styles.drawerFooterBar}>
          <TouchableOpacity
            style={[
              styles.goOnlineButton,
              (!selectedRoute || !isInRangeOfSelected || isPublishing) && styles.disabledGoOnlineButton
            ]}
            onPress={handleGoOnline}
            activeOpacity={0.85}
            disabled={!selectedRoute || !isInRangeOfSelected || isPublishing}
          >
            {isPublishing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.goOnlineButtonText}>
                  {!isInRangeOfSelected ? "Move Closer to Hub" : "Go Online & Broadcast"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#4B5563",
    fontWeight: "500",
  },
  mapContainer: {
    flex: 1,
  },
  topFloatingHeader: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 25,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  headerLeftCluster: {
    flexDirection: "column",
  },
  headerTitleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtext: {
    fontSize: 12,
    color: "#6B7280",
  },
  logoutIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  slidingPanelDrawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 20,
  },
  drawerExpanded: {
    height: height * 0.58,
  },
  drawerCollapsed: {
    height: 110,
  },
  dragHandleContainer: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    alignSelf: "center",
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLeftCluster: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  badgeArrived: {
    backgroundColor: "#D1FAE5",
  },
  badgeOutOfRange: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#059669",
  },
  expandToggleBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  expandToggleText: {
    fontSize: 11,
    color: "#6B7280",
    marginRight: 2,
  },
  drawerScrollBody: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionHeadingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  hubChipsScroll: {
    marginBottom: 16,
  },
  hubChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  hubChipSelected: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  hubChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginLeft: 6,
  },
  hubChipTextSelected: {
    color: "#FFFFFF",
  },
  hubChipSubText: {
    fontSize: 10,
    color: "#6B7280",
    marginLeft: 6,
  },
  demandIndicatorBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  badgeLeftRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  demandIndicatorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
    marginLeft: 6,
  },
  highDemandPill: {
    backgroundColor: "#D97706",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  highDemandText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  skeletonContainer: {
    padding: 20,
    alignItems: "center",
  },
  skeletonText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  fallbackContainer: {
    padding: 20,
    alignItems: "center",
  },
  fallbackText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 6,
  },
  routeCard: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  selectedItemBorder: {
    borderColor: "#10B981",
    backgroundColor: "#ECFDF5",
  },
  routeCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  routeCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  routeIconFrame: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  selectedIconFrame: {
    backgroundColor: "#D1FAE5",
  },
  routeDetails: {
    flex: 1,
  },
  routeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1F2937",
  },
  selectedRouteText: {
    color: "#065F46",
    fontWeight: "700",
  },
  routeSubPrice: {
    fontSize: 11,
    color: "#4B5563",
    marginTop: 2,
  },
  selectedCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  queueStatsFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  queueInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  queueInfoText: {
    fontSize: 11,
    color: "#4B5563",
    marginLeft: 4,
  },
  boldText: {
    fontWeight: "700",
  },
  recommendationsCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  recommendationItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  recommendationText: {
    fontSize: 11,
    color: "#4B5563",
    marginLeft: 8,
    flex: 1,
  },
  drawerFooterBar: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  goOnlineButton: {
    backgroundColor: "#10B981",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  disabledGoOnlineButton: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
  },
  goOnlineButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  persistentDistanceBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 110 : 85,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  persistentDistanceText: {
    fontSize: 12,
    color: "#374151",
  },
  radarToggleFloatingButton: {
    position: "absolute",
    right: 16,
    top: Platform.OS === "ios" ? 110 : 85,
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  radarToggleText: {
    fontSize: 11,
    color: "#4B5563",
    marginLeft: 4,
  },
  hubWaypointMarker: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeHubWaypointMarker: {
    transform: [{ scale: 1.2 }],
  },
  glowingTargetBadge: {
    backgroundColor: "#059669",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  glowingTargetText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  hubWaypointDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  driverPinnedContainer: {
    alignItems: "center",
  },
  driverPinBadge: {
    backgroundColor: "#111827",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 2,
  },
  driverPinText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
  },
  glowingDriverHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  driverMarkerBubble: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});