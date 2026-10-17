import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  BackHandler,
  Pressable,
  Alert,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from '../AuthContext'; 
import { playSound } from "../utils/soundPlayer";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { isValidMapCoordinate, toMapCoordinate } from "../utils/mapCoordinates";
import io from "socket.io-client";

const { width, height } = Dimensions.get("window");
const API_URL = `${(
  process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://3.223.192.195:5000"
).replace(/\/api\/?$/, "").replace(/\/$/, "")}/api`;
const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL || API_URL)
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const DEFAULT_MAP_REGION = {
  latitude: 9.0235,
  longitude: 38.8275,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

// Fetch real street-level walking path from OSRM public walking router with urban grid fallback
const fetchWalkingRoute = async (userLoc, hubLoc) => {
  if (!isValidMapCoordinate(userLoc) || !isValidMapCoordinate(hubLoc)) {
    return { distance: null, duration: null, coordinates: [] };
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${userLoc.longitude},${userLoc.latitude};${hubLoc.longitude},${hubLoc.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      const route = data.routes[0];
      const coordinates = route.geometry.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));

      const distanceMeters = route.distance;
      const distanceStr = distanceMeters >= 1000 
        ? `${(distanceMeters / 1000).toFixed(1)} km` 
        : `${Math.round(distanceMeters)}m`;

      const durationMinutes = Math.max(1, Math.round(route.duration / 60));
      const durationStr = `${durationMinutes} min${durationMinutes > 1 ? 's' : ''}`;

      return { distance: distanceStr, duration: durationStr, coordinates };
    }
  } catch (err) {
    console.log("⚠️ OSRM routing request failed, utilizing urban grid fallback");
  }

  const midLat = (userLoc.latitude + hubLoc.latitude) / 2;
  const gridCoordinates = [
    userLoc,
    { latitude: midLat, longitude: userLoc.longitude },
    { latitude: midLat, longitude: hubLoc.longitude },
    { latitude: hubLoc.latitude, longitude: hubLoc.longitude }
  ];

  const toRad = (val) => (val * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(hubLoc.latitude - userLoc.latitude);
  const dLon = toRad(hubLoc.longitude - userLoc.longitude);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(userLoc.latitude)) * Math.cos(toRad(hubLoc.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const distanceKm = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const distanceMeters = Math.round(distanceKm * 1000);
  const distanceStr = distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} km` : `${distanceMeters}m`;
  const durationMinutes = Math.max(1, Math.round((distanceKm / 4.8) * 60));
  const durationStr = `${durationMinutes} min${durationMinutes > 1 ? 's' : ''}`;

  return { distance: distanceStr, duration: durationStr, coordinates: gridCoordinates };
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (Circular Glowing Compass Arrow & Clean Pickup Hub Pin)
// ------------------------------------------------------------------
const MemoizedMap = memo(({ currentLocation, meetupLocation, walkingRouteCoordinates, mapRef }) => {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude: currentLocation?.latitude ?? DEFAULT_MAP_REGION.latitude,
        longitude: currentLocation?.longitude ?? DEFAULT_MAP_REGION.longitude,
        latitudeDelta: DEFAULT_MAP_REGION.latitudeDelta,
        longitudeDelta: DEFAULT_MAP_REGION.longitudeDelta,
      }}
      showsUserLocation={false} 
      showsMyLocationButton={false}
      showsCompass={false}
      customMapStyle={cleanMinimalMapStyle}
    >
      {/* 🧭 Circular Glowing Compass Arrow Passenger Marker */}
      {isValidMapCoordinate(currentLocation) && (
        <Marker 
          coordinate={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }}
          title="Your Current Location" 
          description="Passenger (Compass Heading Active)"
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
          tracksViewChanges={false}
        >
          <View style={styles.userArrowOuterHalo}>
            <View style={[styles.userArrowContainer, { transform: [{ rotate: `${currentLocation.heading || 0}deg` }] }]}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 📍 Clean Pickup Hub Marker */}
      {isValidMapCoordinate(meetupLocation) && (
        <Marker 
          coordinate={{ latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }} 
          title={meetupLocation.name || "Pickup Hub"} 
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.pickupMarkerContainer}>
            <View style={styles.pickupPinBubble}>
              <MaterialCommunityIcons name="map-marker-radius" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.pickupBubbleText} numberOfLines={1}>
                {meetupLocation.name || "Pickup Hub"}
              </Text>
            </View>
            <View style={styles.pickupPinTip} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Real Street-Level Walking Route Polyline (Current Device to Pickup Hub) */}
      {walkingRouteCoordinates && walkingRouteCoordinates.length > 0 && (
        <Polyline
          coordinates={walkingRouteCoordinates}
          strokeColor="#059669"
          strokeWidth={4}
          geodesic={true}
          lineDashPattern={[6, 6]}
        />
      )}
    </MapView>
  );
});

export default function PickupProposalScreen({ navigation, route }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);
  const routeId = route?.params?.routeId || route?.params?.route_id || null;

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [userAccepted, setUserAccepted] = useState(false);
  const [isAcceptingProposal, setIsAcceptingProposal] = useState(false);
  const [myDbStatus, setMyDbStatus] = useState("searching");
  const [coRiders, setCoRiders] = useState([]);
  const [timeLeft, setTimeLeft] = useState(45);
  const [driverState, setDriverState] = useState("pending");
  
  const [currentLocation, setCurrentLocation] = useState(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  
  const [walkingDistance, setWalkingDistance] = useState(null);
  const [walkingDuration, setWalkingDuration] = useState(null);
  const [walkingCoordinates, setWalkingCoordinates] = useState([]);

  const [meetupHub, setMeetupHub] = useState({
    name: "Resolving Hub...",
    latitude: null,
    longitude: null
  });

  const mapRef = useRef(null);
  const prevMyStatusRef = useRef("searching"); 
  const prevCoRiderStatusesRef = useRef({});      
  const prevDriverStateRef = useRef("pending");

  useEffect(() => {
    const backAction = () => true; 
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  const navigateToTracking = useCallback((rideOfferId) => {
    navigation.replace("LiveTracking", { rideOfferId });
  }, [navigation]);

  // Real-time GPS location watch + compass heading watch
  useEffect(() => {
    let locationSubscription = null;
    let headingSubscription = null;
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          locationSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              timeInterval: 2000,
              distanceInterval: 1,
            },
            (loc) => {
              if (loc && loc.coords && isMounted) {
                setCurrentLocation((prev) => ({
                  ...prev,
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                }));
              }
            }
          );

          headingSubscription = await Location.watchHeadingAsync((headingObj) => {
            if (headingObj && isMounted) {
              const compassHeading = headingObj.trueHeading >= 0 ? headingObj.trueHeading : headingObj.magneticHeading;
              setCurrentLocation((prev) => ({
                ...prev,
                heading: compassHeading || 0,
              }));
            }
          });
        }
      } catch (err) {
        console.log("📍 Location/Heading subscription skip:", err.message);
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubscription) locationSubscription.remove();
      if (headingSubscription) headingSubscription.remove();
    };
  }, []);

  const fetchMapCoordinatesData = useCallback(async (rideOfferId) => {
    if (!rideOfferId) return;
    try {
      const res = await fetch(`${API_URL}/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
      const data = await res.json();
      if (data.success && data.coordinates) {
        const coords = data.coordinates;
        const pickup = toMapCoordinate(coords.start_latitude, coords.start_longitude);
        if (!pickup) throw new Error("The route has no valid pickup hub coordinates.");
        setMeetupHub({
          name: coords.start_hub_name || "Pickup Hub",
          latitude: pickup.latitude,
          longitude: pickup.longitude,
        });
      } else {
        throw new Error(data.error || "Could not resolve the route pickup hub.");
      }
    } catch (err) {
      console.error("❌ Error fetching map coordinates:", err);
    }
  }, []);

  // Fetch walking route whenever user coordinates or meetup hub changes
  useEffect(() => {
    let isMounted = true;
    async function loadWalkingRoute() {
      if (isValidMapCoordinate(currentLocation) && isValidMapCoordinate(meetupHub)) {
        const routeData = await fetchWalkingRoute(currentLocation, meetupHub);
        if (isMounted) {
          setWalkingDistance(routeData.distance);
          setWalkingDuration(routeData.duration);
          setWalkingCoordinates(routeData.coordinates);
        }
      }
    }
    loadWalkingRoute();
    return () => { isMounted = false; };
  }, [currentLocation?.latitude, currentLocation?.longitude, meetupHub?.latitude, meetupHub?.longitude]);

  // Explicitly fit map bounds to keep BOTH the compass arrow and pickup hub pin framed
  useEffect(() => {
    if (mapRef.current && isValidMapCoordinate(currentLocation) && isValidMapCoordinate(meetupHub)) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      
      const coordsToFit = [
        { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        { latitude: meetupHub.latitude, longitude: meetupHub.longitude },
        ...walkingCoordinates
      ];

      mapRef.current.fitToCoordinates(coordsToFit, {
        edgePadding: { top: 90, right: 60, bottom: bottomPadding, left: 60 },
        animated: true,
      });
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, meetupHub?.latitude, meetupHub?.longitude, walkingCoordinates, isDrawerExpanded]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    let isSubscribed = true;
    let statusRequestInFlight = false;
    let timerId;
    let socketRefreshTimer;

    async function checkProposalStatus() {
      if (!isSubscribed || !currentUserId || statusRequestInFlight) return;
      statusRequestInFlight = true;

      try {
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 2500);
        let res;
        try {
          res = await fetch(`${API_URL}/rides/proposal-manifest/${currentUserId}`, {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(abortTimeout);
        }

        if (res.status === 404) {
          let poolStatus = "";
          try {
            const statusController = new AbortController();
            const statusTimeout = setTimeout(() => statusController.abort(), 2500);
            let statusResponse;
            try {
              statusResponse = await fetch(`${API_URL}/routes/status/${currentUserId}`, {
                signal: statusController.signal,
              });
            } finally {
              clearTimeout(statusTimeout);
            }
            if (statusResponse.ok) {
              const poolSession = await statusResponse.json();
              poolStatus = String(poolSession.status || "").toLowerCase().trim();
            }
          } catch (statusError) {
            console.warn("Could not resolve pool state after proposal manifest 404:", statusError.message);
          }

          if (isSubscribed) {
            const recoveryParams = {
              ...route.params,
              userId: currentUserId,
              user_id: currentUserId,
              routeId: routeId || route?.params?.route_id,
              hubId: route?.params?.hubId || route?.params?.hub_id,
            };
            if (["searching", "pending", "active", "joined"].includes(poolStatus) || !poolStatus) {
              navigation.replace("MatchingScreen", {
                ...recoveryParams,
                proposalManifestUnavailable: true,
              });
            } else if (["idle", "cancelled", "expired", "completed"].includes(poolStatus)) {
              navigation.replace("Passenger");
            }
          }
          return;
        }
        if (!res.ok) throw new Error(`Proposal status request failed (HTTP ${res.status}).`);

        if (isSubscribed) {
          const data = await res.json();
          const passengerRows = Array.isArray(data.passengers) ? data.passengers : [];
          const passengersById = new Map();
          const statusPriority = {
            searching: 0,
            matched: 1,
            assigned: 1,
            accepted: 2,
            arrived: 3,
            in_trip: 4,
          };
          for (const passenger of passengerRows) {
            const passengerId = parseInt(passenger?.user_id ?? passenger?.userId, 10);
            if (!Number.isInteger(passengerId) || passengerId <= 0) continue;
            const previousPassenger = passengersById.get(passengerId);
            const passengerStatus = String(passenger.status || "searching").toLowerCase().trim();
            const previousStatus = String(previousPassenger?.status || "searching").toLowerCase().trim();
            if (
              !previousPassenger ||
              (statusPriority[passengerStatus] ?? 0) >= (statusPriority[previousStatus] ?? 0)
            ) {
              passengersById.set(passengerId, { ...passenger, user_id: passengerId });
            }
          }
          const passengers = [...passengersById.values()];

          const activeRideOfferId = data.ride_offer_id || data.rideOfferId || data.matched_ride_offer_id || data.id;
          if (activeRideOfferId) {
            fetchMapCoordinatesData(activeRideOfferId);
          } else if (data.hub && data.hub.latitude) {
            setMeetupHub(data.hub);
          }

          const acceptedPassengers = Array.isArray(data.accepted_passengers)
            ? data.accepted_passengers
            : typeof data.accepted_passengers === "string"
              ? data.accepted_passengers.replace(/[{}[\]]/g, "").split(",").filter(Boolean)
              : [];
          const normalizedAcceptedIds = acceptedPassengers
            .map((id) => parseInt(id, 10))
            .filter(Number.isInteger);
          const isUserAcceptedInOffer = normalizedAcceptedIds.includes(currentUserId);
          
          const myRow = passengers.find(p => parseInt(p.user_id, 10) === currentUserId);
          const myRoutePoolStatus = myRow ? (myRow.status || "searching").toLowerCase().trim() : "searching";
          const rawMyStatus = (userAccepted || isUserAcceptedInOffer || myRoutePoolStatus === "accepted") ? "accepted" : myRoutePoolStatus;

          if (rawMyStatus === "accepted" && prevMyStatusRef.current !== "accepted") {
            playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));
          }
          prevMyStatusRef.current = rawMyStatus;
          setMyDbStatus(rawMyStatus);
          if (rawMyStatus === "accepted") setUserAccepted(true);

          const newCoRiderStatuses = {};
          let coRiderStatusChangedToAccepted = false;

          const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
          const parsedCoRiders = passengers
            .filter(p => p && parseInt(p.user_id, 10) !== currentUserId)
            .map((p, idx) => {
              const pId = parseInt(p.user_id, 10);
              const isCoRiderAccepted = normalizedAcceptedIds.includes(pId);
              const pRoutePoolStatus = (p.status || "searching").toLowerCase().trim();
              const effectivePStatus = (isCoRiderAccepted || pRoutePoolStatus === "accepted") ? "accepted" : pRoutePoolStatus;

              newCoRiderStatuses[pId] = effectivePStatus;

              const previousStatus = prevCoRiderStatusesRef.current[pId];
              if (effectivePStatus === "accepted" && previousStatus && previousStatus !== "accepted") {
                coRiderStatusChangedToAccepted = true;
              }

              return {
                id: pId,
                name: p.full_name || p.name || `Rider ${pId}`,
                status: effectivePStatus.toUpperCase(),
                color: colorPalette[idx % colorPalette.length],
              };
            });

          if (coRiderStatusChangedToAccepted) {
            playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));
          }

          prevCoRiderStatusesRef.current = newCoRiderStatuses;
          setCoRiders(parsedCoRiders);

          const currentDriverStatus = (data.driver_status || "pending").toLowerCase().trim();
          
          if (currentDriverStatus === "accepted" && prevDriverStateRef.current !== "accepted") {
            playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));
          }
          prevDriverStateRef.current = currentDriverStatus;

          setDriverState(currentDriverStatus);

          const passengerAccepted = rawMyStatus === "accepted";
          const driverAccepted = ["accepted", "arrived"].includes(currentDriverStatus);
          if (passengerAccepted && driverAccepted && activeRideOfferId) {
            navigateToTracking(activeRideOfferId);
            return; 
          }
        }
      } catch (err) {
        console.warn("Passenger proposal status refresh failed:", err.message);
      }
      finally {
        statusRequestInFlight = false;
        if (isSubscribed) {
          setInitialCheckDone(true);
          timerId = setTimeout(checkProposalStatus, 3000);
        }
      }
    }

    const socket = io(SOCKET_URL, {
      reconnection: true,
    });
    const refreshForRoute = (update) => {
      if (!routeId || String(update?.route_id) === String(routeId)) {
        if (socketRefreshTimer) clearTimeout(socketRefreshTimer);
        socketRefreshTimer = setTimeout(checkProposalStatus, 100);
      }
    };
    socket.on("connect", checkProposalStatus);
    socket.on("route_pool_updated", refreshForRoute);
    socket.on("corridor_offer_updated", refreshForRoute);

    checkProposalStatus();
    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
      if (socketRefreshTimer) clearTimeout(socketRefreshTimer);
      socket.off("connect", checkProposalStatus);
      socket.off("route_pool_updated", refreshForRoute);
      socket.off("corridor_offer_updated", refreshForRoute);
      socket.disconnect();
    };
  }, [currentUserId, navigateToTracking, navigation, routeId, userAccepted, fetchMapCoordinatesData]);

  const handleAcceptProposal = async () => {
    if (isAcceptingProposal || userAccepted) return;
    setIsAcceptingProposal(true);
    try {
      const response = await fetch(`${API_URL}/rides/accept-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success === false) throw new Error(data.error || "Could not accept this pickup proposal.");
        setUserAccepted(true);
        setMyDbStatus("accepted");
        playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));
        if (data.ride_offer_id && ["accepted", "arrived"].includes(driverState)) {
          navigateToTracking(data.ride_offer_id);
        }
      } else {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status}).`);
      }
    } catch (err) {
      Alert.alert("Could not accept pickup", err.message || "Check your connection and try again.");
    } finally {
      setIsAcceptingProposal(false);
    }
  };

  const handleDeclineProposal = async () => {
    playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));

    try {
      const response = await fetch(`${API_URL}/routes/decline-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: currentUserId }),
      });

      if (response.ok) {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.replace("Passenger");
      }
    } catch (err) {
      console.log("❌ Error declining proposal:", err);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* 1. TOP BANNER STATUS BAR */}
      <View style={styles.statusBarBanner}>
        <View style={styles.statusIndicatorWrapper}>
          <View style={styles.statusCenterCoreDot}>
            <FontAwesome5 name="car-side" size={11} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.statusTextContainer}>
          <Text style={styles.statusPrimaryText}>Pickup Proposal Active</Text>
          <Text style={styles.statusSecondaryText}>
            {walkingDistance && walkingDuration 
              ? `Walk ${walkingDistance} (~${walkingDuration}) to pickup hub` 
              : "Review meeting hub & confirm participation"}
          </Text>
        </View>
      </View>

      {/* 2. MAP CONTAINER */}
      <View style={styles.mapContainer}>
        {initialCheckDone ? (
          <MemoizedMap 
            currentLocation={currentLocation} 
            meetupLocation={meetupHub} 
            walkingRouteCoordinates={walkingCoordinates}
            mapRef={mapRef} 
          />
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
              {walkingDistance && walkingDuration && (
                <View style={styles.walkingInfoPill}>
                  <MaterialCommunityIcons name="walk" size={12} color="#059669" />
                  <Text style={styles.walkingInfoText}>
                    Walk {walkingDistance} • ~{walkingDuration} away
                  </Text>
                </View>
              )}
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

        {/* Sticky Action Buttons inside Drawer (Hidden if collapsed) */}
        {isDrawerExpanded && (
          <View style={[styles.drawerFooterSticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                activeOpacity={0.85}
                onPress={handleDeclineProposal}
              >
                <View style={styles.buttonInternalGroup}>
                  <Ionicons name="close-circle" size={18} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.declineButtonText}>Decline</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton, userAccepted && styles.actionButtonDisabled]}
                disabled={userAccepted || isAcceptingProposal}
                activeOpacity={0.85}
                onPress={handleAcceptProposal}
              >
                <View style={styles.buttonInternalGroup}>
                  {userAccepted || isAcceptingProposal ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  ) : (
                    <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  )}
                  <Text style={styles.acceptButtonText}>
                    {userAccepted ? "Waiting for driver..." : isAcceptingProposal ? "Accepting..." : "Accept Hub"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
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
  
  // Circular Glowing Compass Arrow Passenger Marker
  userArrowOuterHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(14, 165, 233, 0.25)", justifyContent: "center", alignItems: "center" },
  userArrowContainer: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#0EA5E9", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  
  // Clean Pickup Hub Marker Group
  pickupMarkerContainer: { alignItems: "center" },
  pickupPinBubble: { backgroundColor: "#111827", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 2, borderColor: "#FFFFFF", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3 },
  pickupBubbleText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", maxWidth: 140 },
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
  drawerCollapsed: { height: 130 },
  drawerExpanded: { maxHeight: height * 0.65 },
  
  dragHandleContainer: { paddingBottom: 10, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#111111" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#111111" },
  
  walkingInfoPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", marginTop: 4, borderWidth: 1, borderColor: "#A7F3D0" },
  walkingInfoText: { fontSize: 11, fontWeight: "600", color: "#059669", marginLeft: 4 },

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
  
  // Footer & Action Buttons
  drawerFooterSticky: { 
    paddingVertical: 10, 
    borderTopWidth: 1, 
    borderTopColor: "#E5E7EB", 
    backgroundColor: "#F9FAFB" 
  },
  actionButtonsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  actionButton: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionButtonDisabled: { backgroundColor: "#9CA3AF" },
  declineButton: { flex: 1, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5" },
  declineButtonText: { color: "#EF4444", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  acceptButton: { flex: 2, backgroundColor: "#059669" },
  acceptButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center" },
});