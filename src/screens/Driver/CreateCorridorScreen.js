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
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, Circle } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import CorridorDrawer from "../Corridor_Drawer";
import { useAuth } from "../../AuthContext";
import { io } from "socket.io-client";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

const FALLBACK_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

// Helper function to calculate distance in km between two GPS coordinates
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Calculate exact bearing/heading between coordinates if compass is unavailable
const calculateBearing = (startLat, startLng, destLat, destLng) => {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const destLatRad = (destLat * Math.PI) / 180;
  const destLngRad = (destLng * Math.PI) / 180;

  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(destLatRad) -
    Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  let computedHeading = (Math.atan2(y, x) * 180) / Math.PI;
  return (computedHeading + 360) % 360;
};

// ------------------------------------------------------------------
// MEMOIZED DISPATCH MAP VIEW
// ------------------------------------------------------------------
const DispatchMap = memo(({ driverCoords, heading, targetHubForLine, topHubs, currentHub, nearestHub, mapRef, isDrawerExpanded, onSelectHub, showRadiusCircle, onToggleRadius, currentDriverDistance }) => {
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
        initialRegion={driverCoords || FALLBACK_LOCATION}
        customMapStyle={cleanMinimalMapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
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
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[styles.royalBlueDestinationHalo, (isSelectedActive || isNearest) && { backgroundColor: "rgba(5, 150, 105, 0.3)" }]}>
                  {isSelectedActive && (
                    <View style={styles.glowingTargetBadge}>
                      <Text style={styles.glowingTargetText}>TARGET HUB</Text>
                    </View>
                  )}
                  <View style={[styles.royalBlueDestinationBadge, (isSelectedActive || isNearest) && { backgroundColor: "#059669" }]} />
                </View>
              </Marker>

              {isSelectedActive && showRadiusCircle && (
                <Circle
                  center={{ latitude: hub.latitude, longitude: hub.longitude }}
                  radius={2000} 
                  strokeColor="#059669"
                  fillColor="rgba(5, 150, 105, 0.12)"
                  strokeWidth={2}
                />
              )}
            </React.Fragment>
          );
        })}

        {driverCoords && driverCoords.latitude && (
          <Marker
            coordinate={driverCoords}
            title="Your Vehicle Location"
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading || 0}
            flat={true}
            tracksViewChanges={true}
          >
            <View style={styles.emeraldCarWrapper}>
              <View style={styles.emeraldCarInnerBubble}>
                <Ionicons name="navigate" size={17} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}

        {driverCoords && targetHubForLine && targetHubForLine.latitude && (
          <Polyline
            coordinates={[
              driverCoords,
              { latitude: targetHubForLine.latitude, longitude: targetHubForLine.longitude }
            ]}
            strokeColor="#059669"
            strokeWidth={5}
            geodesic={true}
          />
        )}
      </MapView>

      {targetHubForLine && typeof currentDriverDistance === "number" && (
        <View style={styles.persistentDistanceBanner}>
          <Ionicons name="navigate" size={14} color="#059669" style={{ marginRight: 6 }} />
          <Text style={styles.persistentDistanceText}>
            Distance to <Text style={styles.boldText}>{targetHubForLine.name || "Hub"}</Text>:{" "}
            <Text style={[styles.boldText, { color: currentDriverDistance <= 2.0 ? "#059669" : "#EF4444" }]}>
              {currentDriverDistance.toFixed(2)} km
            </Text>
          </Text>
        </View>
      )}

      <TouchableOpacity 
        style={styles.radarToggleFloatingButton} 
        onPress={onToggleRadius}
        activeOpacity={0.8}
      >
        <Ionicons name={showRadiusCircle ? "radio" : "radio-outline"} size={16} color={showRadiusCircle ? "#059669" : "#6B7280"} />
        <Text style={[styles.radarToggleText, showRadiusCircle && { color: "#059669", fontWeight: "700" }]}>
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

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const userRole = user?.role || "driver";
  const userName = user?.name || user?.full_name || "Abebe Kebede";

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [capacity, setCapacity] = useState(4);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [currentHub, setCurrentHub] = useState(null);
  const [nearestHub, setNearestHub] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [heading, setHeading] = useState(0);

  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [allHubs, setAllHubs] = useState([]);
  const [predefinedCorridors, setPredefinedCorridors] = useState([]);
  const [passengerRequests, setPassengerRequests] = useState([]);
  const [showRadiusCircle, setShowRadiusCircle] = useState(true);

  const mapRef = useRef(null);
  const prevLocRef = useRef(null);

  const [currentRegion, setCurrentRegion] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);

  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  // 🌍 GPS LOCATION TRACKING WITH GUARANTEED DELTAS
  useEffect(() => {
    let isMounted = true;
    let locationSubscription;
    let headingSubscription;

    async function setupLocationTracking() {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
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
          prevLocRef.current = coords;
        }

        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 4 },
          (newLoc) => {
            if (isMounted && newLoc) {
              const newCoord = {
                latitude: newLoc.coords.latitude,
                longitude: newLoc.coords.longitude,
                latitudeDelta: 0.03, // Prevent missing delta crash
                longitudeDelta: 0.03,
              };

              if (prevLocRef.current) {
                const computedHeading = calculateBearing(
                  prevLocRef.current.latitude,
                  prevLocRef.current.longitude,
                  newCoord.latitude,
                  newCoord.longitude
                );
                if (computedHeading > 0 && !headingSubscription) {
                  setHeading(computedHeading);
                }
              }
              prevLocRef.current = newCoord;
              setDriverCoords(newCoord);
            }
          }
        );

        headingSubscription = await Location.watchHeadingAsync((headingObj) => {
          if (isMounted && headingObj) {
            const compassHeading = headingObj.trueHeading >= 0 ? headingObj.trueHeading : headingObj.magHeading;
            if (compassHeading >= 0) {
              setHeading(compassHeading);
            }
          }
        });

      } catch (error) {
        if (isMounted) {
          setCurrentRegion(FALLBACK_LOCATION);
        }
      } finally {
        if (isMounted) {
          setLoadingLocation(false);
        }
      }
    }

    setupLocationTracking();

    return () => {
      isMounted = false;
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, []);

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

  useEffect(() => {
    if (topHubs.length > 0 && !currentHub) {
      handleHubSelection(topHubs[0]);
    }
  }, [topHubs]);

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

  useEffect(() => {
    if (!currentHub || !currentHub.name) return;

    const socket = io(API_URL);

    socket.on("connect", () => {
      socket.emit("join_hub", { hub_name: currentHub.name });
    });

    socket.on("queue_update", (updatedCorridors) => {
      if (Array.isArray(updatedCorridors)) {
        setPredefinedCorridors(updatedCorridors);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentHub]);

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
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Detecting your location & profiles...</Text>
      </SafeAreaView>
    );
  }

  const targetHubForLine = currentHub || nearestHub;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mapContainer}>
        <DispatchMap 
          driverCoords={driverCoords}
          heading={heading}
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

      <View style={styles.topFloatingHeader}>
        <View style={styles.headerLeftCluster}>
          <TouchableOpacity 
            style={styles.hamburgerButton} 
            onPress={() => setIsDrawerOpen(true)}
          >
            <Ionicons name="menu" size={22} color="#111111" />
          </TouchableOpacity>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.headerTitleText}>Dispatch Center</Text>
            <Text style={styles.headerSubtext}>Vehicle #{activeVehicleId}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutIconButton} onPress={logoutSession} activeOpacity={0.7}>
          <Ionicons name="power" size={16} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
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

        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 25 }}
          keyboardShouldPersistTaps="handled"
        >
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

          <Text style={styles.sectionHeadingLabel}>Corridors & Driver Queues</Text>
          {loadingCorridors ? (
            <View style={styles.skeletonContainer}>
              <ActivityIndicator size="small" color="#059669" />
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
                          color={isSelected ? "#059669" : "#4B5563"}
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
                      <Ionicons name="people" size={13} color={queueCount > 0 ? "#059669" : "#6B7280"} />
                      <Text style={styles.queueInfoText}>
                        Driver Queue:{" "}
                        <Text style={[styles.boldText, { color: queueCount > 0 ? "#059669" : "#1F2937" }]}>
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

          <Text style={[styles.sectionHeadingLabel, { marginTop: 15 }]}>Driver Recommendations & Tips</Text>
          <View style={styles.recommendationsCard}>
            <View style={styles.recommendationItem}>
              <Ionicons name="trending-up" size={16} color="#059669" />
              <Text style={styles.recommendationText}>Peak rush hour expected between 5:00 PM - 7:00 PM.</Text>
            </View>
            <View style={styles.recommendationItem}>
              <Ionicons name="shield-checkmark" size={16} color="#059669" />
              <Text style={styles.recommendationText}>Ensure all passenger seatlocks are verified before departure.</Text>
            </View>
          </View>

          <View style={styles.actionButtonContainer}>
            <TouchableOpacity
              style={[
                styles.goOnlineButton,
                (!selectedRoute || isPublishing || !isInRangeOfSelected) && styles.disabledButton,
              ]}
              onPress={handleGoOnline}
              disabled={!selectedRoute || isPublishing || !isInRangeOfSelected}
              activeOpacity={0.8}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.goOnlineButtonText}>
                  {!isInRangeOfSelected
                    ? "OUT OF HUB RANGE ( > 2 KM )"
                    : !selectedRoute
                    ? "SELECT A ROUTE TO LAUNCH"
                    : "GO ONLINE & LAUNCH POOL"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <CorridorDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        role={userRole}
        userName={userName}
        onNavigate={(routeName) => {
          navigation.navigate(routeName);
        }}
      />
    </SafeAreaView>
  );
}

const cleanMinimalMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F5F5F5" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#E5E7EB" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#E0F2FE" }] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 13, color: "#6B7280", fontWeight: "600" },
  mapContainer: { flex: 1, width: width, height: height },

  topFloatingHeader: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  headerLeftCluster: { flexDirection: "row", alignItems: "center" },
  hamburgerButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleText: { fontSize: 14, fontWeight: "800", color: "#111111" },
  headerSubtext: { fontSize: 11, color: "#059669", fontWeight: "700" },
  logoutIconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FCA5A5" },

  emeraldCarWrapper: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(5, 150, 105, 0.25)", justifyContent: "center", alignItems: "center" },
  emeraldCarInnerBubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  
  royalBlueDestinationHalo: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(59, 130, 246, 0.25)", justifyContent: "center", alignItems: "center" },
  royalBlueDestinationBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#3B82F6", borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 6 },

  glowingTargetBadge: { position: "absolute", top: -22, backgroundColor: "#059669", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3 },
  glowingTargetText: { fontSize: 8, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },

  persistentDistanceBanner: {
    position: "absolute",
    top: 115,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  persistentDistanceText: { fontSize: 12, color: "#1E293B", fontWeight: "600" },
  boldText: { fontWeight: "800" },

  radarToggleFloatingButton: {
    position: "absolute",
    bottom: 310,
    right: 16,
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  radarToggleText: { fontSize: 11, color: "#6B7280", fontWeight: "600", marginLeft: 4 },

  slidingPanelDrawer: {
    position: "absolute",
    bottom: 0,
    width: width,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 12,
  },
  drawerExpanded: { maxHeight: height * 0.52 },
  drawerCollapsed: { maxHeight: 110, overflow: "hidden" },

  dragHandleContainer: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewLeftCluster: { flex: 1, marginRight: 10 },
  title: { fontSize: 15, fontWeight: "800", color: "#111111" },
  subtitle: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 4, alignItems: "center" },
  badgeArrived: { backgroundColor: "#ECFDF5" },
  badgeOutOfRange: { backgroundColor: "#FEE2E2" },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#059669" },
  expandToggleBadge: { flexDirection: "row", alignItems: "center" },
  expandToggleText: { fontSize: 11, fontWeight: "700", color: "#6B7280", marginRight: 2 },

  drawerScrollBody: { paddingTop: 12 },
  sectionHeadingLabel: { fontSize: 11, fontWeight: "800", color: "#6B7280", letterSpacing: 0.5, marginBottom: 8 },

  hubChipsScroll: { marginBottom: 14 },
  hubChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  hubChipSelected: { backgroundColor: "#059669", borderColor: "#059669" },
  hubChipText: { fontSize: 12, fontWeight: "700", color: "#1F2937", marginLeft: 6 },
  hubChipTextSelected: { color: "#FFFFFF" },
  hubChipSubText: { fontSize: 10, color: "#6B7280", marginLeft: 6, marginTop: 1 },

  demandIndicatorBadge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FEF3C7", padding: 10, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: "#FDE68A" },
  badgeLeftRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  demandIndicatorText: { fontSize: 12, fontWeight: "700", color: "#92400E", marginLeft: 6 },
  highDemandPill: { backgroundColor: "#D97706", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  highDemandText: { fontSize: 9, fontWeight: "800", color: "#FFFFFF" },

  routeCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginBottom: 10 },
  selectedItemBorder: { borderColor: "#059669", backgroundColor: "#ECFDF5" },
  routeCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  routeCardLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  routeIconFrame: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center", marginRight: 10 },
  selectedIconFrame: { backgroundColor: "#D1FAE5" },
  routeDetails: { flex: 1 },
  routeText: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  selectedRouteText: { color: "#065F46" },
  routeSubPrice: { fontSize: 11, fontWeight: "600", color: "#059669", marginTop: 2 },
  selectedCheckCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },

  queueStatsFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  queueInfoBadge: { flexDirection: "row", alignItems: "center" },
  queueInfoText: { fontSize: 11, color: "#4B5563", marginLeft: 4 },

  recommendationsCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 12, marginBottom: 10 },
  recommendationItem: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  recommendationText: { fontSize: 11, color: "#4B5563", marginLeft: 8, flex: 1, fontWeight: "500" },

  actionButtonContainer: { marginTop: 10, marginBottom: 10 },
  goOnlineButton: { width: "100%", backgroundColor: "#059669", borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", shadowColor: "#059669", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6 },
  disabledButton: { backgroundColor: "#9CA3AF", shadowOpacity: 0 },
  goOnlineButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});