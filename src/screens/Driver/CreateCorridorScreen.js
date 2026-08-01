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

const { width, height } = Dimensions.get("window");
const API_URL = "http://192.168.1.3:5000";

const DEFAULT_LOCATION = {
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
const DispatchMap = memo(({ driverCoords, targetHubForLine, topHubs, currentHub, nearestHub, mapRef, isDrawerExpanded, onSelectHub }) => {
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
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={driverCoords || DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 1. Render ONLY the Top 4 Nearest System Hubs */}
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
                <View style={styles.hubWaypointDot} />
              </View>
            </Marker>

            {isSelectedActive && (
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

      {/* 2. Driver Device GPS Location Car Avatar Marker */}
      {driverCoords && (
        <Marker coordinate={driverCoords} title="Your Vehicle Location" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.driverMarkerHalo}>
            <View style={styles.driverMarkerBubble}>
              <MaterialCommunityIcons name="car-side" size={16} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 3. Route Approach Polyline */}
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

  const mapRef = useRef(null);

  // 🚫 DISABLE ANDROID HARDWARE BACK BUTTON
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
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

  // 🌍 DEDICATED DRIVER GPS AUTO-LOCATION & VALIDATION
  useEffect(() => {
    if (!currentDriverId) return;

    const autoLocateDriver = async () => {
      setIsLocating(true);
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setIsLocating(false);
          setGpsWarningText("Location permission denied. Enable GPS.");
          return;
        }

        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        const coords = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        };
        setDriverCoords(coords);

        const response = await fetch(`${API_URL}/api/driver/validate-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_lat: coords.latitude,
            user_lng: coords.longitude,
            user_id: currentDriverId,
          }),
        });

        const data = await response.json();
        
        if (response.ok && data.nearestHub) {
          setNearestHub(data.nearestHub);
          setDistanceToHubKm(data.distanceKm || null);
          if (data.inRange) {
            handleHubSelection(data.nearestHub);
          } else {
            setGpsWarningText(`Out of range (~${data.distanceKm || "?"} km from ${data.closestHubName || data.nearestHub.name}). Must be within 2km.`);
          }
        }
      } catch (err) {
        setGpsWarningText("Failed to retrieve GPS location.");
      } finally {
        setIsLocating(false);
      }
    };

    autoLocateDriver();
  }, [currentDriverId]);

  // 📍 HUB SELECTION ENGINE
  const handleHubSelection = useCallback(async (hub) => {
    setCurrentHub(hub);
    setSelectedRoute(null);
    setLoadingCorridors(true);
    
    try {
      const [corridorRes, requestsRes] = await Promise.all([
        fetch(`${API_URL}/api/routes/from/${encodeURIComponent(hub.name)}`),
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

    // 🔒 STRICT ALLOWABLE RANGE RULE ENFORCEMENT
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
      selectedRoute.destination_hub_id || 
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

  if (isAuthLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.loadingText}>Synchronizing profiles...</Text>
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
              const isSelected = 
                selectedRoute?.route_id === route.route_id && 
                selectedRoute?.end_hub_id === route.end_hub_id;

              const uniqueKey = `${route.route_id}-${route.start_hub_id}-${route.end_hub_id}-${index}`;
              const queueCount = route.driver_queue_count || Math.floor(Math.random() * 4);

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
                        <MaterialCommunityIcons name="bus-side" size={20} color={isSelected ? "#10B981" : "#4B5563"} />
                      </View>
                      <View style={styles.routeDetails}>
                       <Text style={[styles.routeText, isSelected && styles.selectedRouteText]} numberOfLines={1}>
                          {route.pass_through_name 
                            ? `${route.pickup_hub_name} ➔ ${route.pass_through_name} ➔ ${route.destination_name}`
                            : `${route.pickup_hub_name} ➔ ${route.destination_name}`}
                        </Text>
                      <Text style={styles.routeSubPrice}>Estimated Fare: {route.current_price || route.recommended_base_price} ETB</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedCheckCircle}>
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  {/* Driver Queue & Stats Footer inside Corridor Card */}
                  <View style={styles.queueStatsFooter}>
                    <View style={styles.queueInfoBadge}>
                      <Ionicons name="people" size={13} color="#6B7280" />
                      <Text style={styles.queueInfoText}>Driver Queue: <Text style={styles.boldText}>{queueCount} online</Text></Text>
                    </View>
                    <View style={styles.queueInfoBadge}>
                      <Ionicons name="time" size={13} color="#6B7280" />
                      <Text style={styles.queueInfoText}>Avg Wait: <Text style={styles.boldText}>{queueCount === 0 ? "Instant" : "~3 mins"}</Text></Text>
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
              <Text style={styles.recommendationText}>
                {isInRangeOfSelected 
                  ? `You are within range (${currentDriverDistance?.toFixed(1)} km) to go online.` 
                  : `Selected hub is out of range (~${currentDriverDistance?.toFixed(1)} km). Move within 2.0 km.`}
              </Text>
            </View>
          </View>

          {/* 👥 CAPACITY CONTROLLER */}
          <Text style={[styles.sectionHeadingLabel, { marginTop: 15 }]}>Vehicle Pool Limits</Text>
          <View style={styles.detailsContainerCard}>
            <View style={styles.detailRowItem}>
              <View style={styles.labelGroup}>
                <Text style={styles.detailRowLabel}>Seats Available</Text>
                <Text style={styles.detailRowSubtitle}>Maximum passenger threshold</Text>
              </View>
              <View style={styles.counterControlWrapper}>
                <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => Math.max(1, p - 1))} activeOpacity={0.7}>
                  <Ionicons name="remove" size={16} color="#1F2937" />
                </TouchableOpacity>
                <Text style={styles.counterValueText}>{capacity}</Text>
                <TouchableOpacity style={styles.counterButton} onPress={() => setCapacity(p => p + 1)} activeOpacity={0.7}>
                  <Ionicons name="add" size={16} color="#1F2937" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Action Button */}
        {isDrawerExpanded && (
          <TouchableOpacity 
            style={[styles.actionButton, (!selectedRoute || !currentHub || !isInRangeOfSelected || isPublishing) && styles.actionButtonDisabled]}
            onPress={handleGoOnline}
            disabled={isPublishing || !selectedRoute || !currentHub || !isInRangeOfSelected}
            activeOpacity={0.9}
          >
            {isPublishing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.btnContentRow}>
                <Ionicons name="radio" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.actionButtonText}>
                  {isInRangeOfSelected ? "GO ONLINE" : "OUT OF HUB RANGE"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  centered: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#4B5563", fontSize: 13, fontWeight: "600" },
  mapContainer: { flex: 1 },

  // Top Floating Header
  topFloatingHeader: {
    position: "absolute",
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 20,
  },
  headerLeftCluster: { flexDirection: "column" },
  headerTitleText: { fontSize: 14, fontWeight: "800", color: "#111827" },
  headerSubtext: { fontSize: 11, color: "#6B7280", fontWeight: "500" },
  logoutIconButton: { backgroundColor: "#FEF2F2", padding: 8, borderRadius: 8 },

  // Driver Car Avatar Marker
  driverMarkerHalo: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(16, 185, 129, 0.25)", justifyContent: "center", alignItems: "center" },
  driverMarkerBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },

  // Hub Waypoint Marker
  hubWaypointMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(107, 114, 128, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeHubWaypointMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(16, 185, 129, 0.35)",
  },
  hubWaypointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  // Sliding Panel Drawer
  slidingPanelDrawer: { 
    position: "absolute", 
    bottom: 0, 
    width: width, 
    backgroundColor: "#FFF", 
    borderTopLeftRadius: 24, 
    borderTopRightRadius: 24, 
    paddingTop: 8, 
    paddingHorizontal: 20, 
    elevation: 15,
    shadowColor: "#000", 
    shadowOffset: { width: 0, height: -3 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 6,
    zIndex: 30 
  },
  drawerCollapsed: { height: 125 },
  drawerExpanded: { maxHeight: height * 0.70 },

  dragHandleContainer: { paddingBottom: 8, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#111827" },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  badgeArrived: { backgroundColor: "#E8F5E9" },
  badgeOutOfRange: { backgroundColor: "#FEF2F2" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#10B981" },

  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 2 },

  drawerScrollBody: { flexGrow: 0 },

  hubChipsScroll: { marginBottom: 15 },
  hubChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  hubChipSelected: {
    backgroundColor: "#10B981",
    borderColor: "#059669",
  },
  hubChipText: { fontSize: 12, fontWeight: "700", color: "#4B5563" },
  hubChipSubText: { fontSize: 10, fontWeight: "500", color: "#6B7280", marginTop: 1 },
  hubChipTextSelected: { color: "#FFFFFF" },

  demandIndicatorBadge: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#FFFBEB", 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 15, 
    borderWidth: 1, 
    borderColor: "#FDE68A" 
  },
  badgeLeftRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  demandIndicatorText: { color: "#B45309", fontSize: 12, fontWeight: "700" },
  highDemandPill: { backgroundColor: "#D97706", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  highDemandText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },

  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  
  skeletonContainer: { paddingVertical: 20, alignItems: "center", gap: 10 },
  skeletonText: { color: "#6B7280", fontSize: 12, fontWeight: "500" },
  fallbackContainer: { paddingVertical: 20, alignItems: "center", gap: 8 },
  fallbackText: { color: "#9CA3AF", fontSize: 12, fontWeight: "500", textAlign: "center", paddingHorizontal: 20 },

  routeCard: { 
    backgroundColor: "#FFFFFF", 
    padding: 14, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: "#E5E7EB" 
  },
  routeCardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  routeCardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  routeIconFrame: { backgroundColor: "#F3F4F6", padding: 8, borderRadius: 10, marginRight: 12 },
  selectedIconFrame: { backgroundColor: "#ECFDF5" },
  routeDetails: { flex: 1 },
  routeText: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  selectedRouteText: { color: "#065F46" },
  routeSubPrice: { fontSize: 11, color: "#6B7280", marginTop: 3, fontWeight: "500" },
  selectedItemBorder: { borderColor: "#10B981", borderWidth: 2, backgroundColor: "#F0FDF4" },
  selectedCheckCircle: { backgroundColor: "#10B981", width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  queueStatsFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  queueInfoBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  queueInfoText: { fontSize: 11, color: "#4B5563" },

  recommendationsCard: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 12,
    gap: 8,
  },
  recommendationItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  recommendationText: { fontSize: 12, color: "#166534", fontWeight: "500", flex: 1 },

  detailsContainerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 15 },
  detailRowItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14 },
  labelGroup: { flexDirection: "column" },
  detailRowLabel: { fontSize: 13, color: "#111827", fontWeight: "700" },
  detailRowSubtitle: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "400" },
  counterControlWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", padding: 3, borderRadius: 10 },
  counterButton: { width: 32, height: 32, backgroundColor: "#FFFFFF", borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  counterValueText: { fontSize: 14, fontWeight: "800", paddingHorizontal: 16 },

  actionButton: { backgroundColor: "#10B981", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 10, marginBottom: Platform.OS === 'android' ? 20 : 10, marginHorizontal: 20 },
  actionButtonDisabled: { backgroundColor: "#A0B2B2" },
  btnContentRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  actionButtonText: { color: "#FFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
});