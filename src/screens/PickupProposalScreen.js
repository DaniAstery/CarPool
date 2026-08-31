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
import { playSound } from "../utils/soundPlayer";

const { width, height } = Dimensions.get("window");
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://100.108.52.79:5000/api";

const DEFAULT_LOCATION = {
  latitude: 9.0220,
  longitude: 38.8450,
  heading: 0,
  latitudeDelta: 0.015,
  longitudeDelta: 0.015,
};

const fetchWalkingRoute = async (userLoc, hubLoc) => {
  if (!userLoc || !hubLoc || !hubLoc.latitude || !userLoc.latitude) {
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

const MemoizedMap = memo(({ currentLocation, meetupLocation, driverLocation, walkingRouteCoordinates, mapRef }) => {
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
      {currentLocation && currentLocation.latitude && (
        <Marker 
          coordinate={currentLocation} 
          title="Your Current Location" 
          description="Passenger"
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

      {driverLocation && driverLocation.latitude && (
        <Marker 
          coordinate={driverLocation} 
          title="Assigned Driver" 
          description="En route to pickup hub"
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
          tracksViewChanges={false}
        >
          <View style={styles.driverOuterHalo}>
            <View style={styles.driverPinContainer}>
              <FontAwesome5 name="car-side" size={12} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {meetupLocation && meetupLocation.latitude && (
        <Marker 
          coordinate={{ latitude: meetupLocation.latitude, longitude: meetupLocation.longitude }} 
          title={meetupLocation.name || "Pickup Hub"} 
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.pickupPinContainer}>
            <View style={styles.pickupPinDot} />
            <View style={styles.pickupPinBubble}>
              <MaterialCommunityIcons name="map-marker-radius" size={13} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.pickupBubbleText} numberOfLines={1}>
                {meetupLocation.name || "Pickup Hub"}
              </Text>
            </View>
            <View style={styles.pickupPinTail} />
          </View>
        </Marker>
      )}

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
  const currentUserId = parseInt(user?.id || user?.user_id, 10);

  const routeParams = route?.params || {};
  const initialRideOfferId = routeParams.rideOfferId || routeParams.id || routeParams.ride_offer_id || null;

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [userAccepted, setUserAccepted] = useState(false);
  const [myDbStatus, setMyDbStatus] = useState("searching");
  const [coRiders, setCoRiders] = useState([]);
  const [driverState, setDriverState] = useState("pending");
  const [rideOfferStatus, setRideOfferStatus] = useState("pending");

  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [driverLocation, setDriverLocation] = useState(null);
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
    navigation.replace("TrackingDriver", { rideOfferId });
  }, [navigation]);

  useEffect(() => {
    let locationSubscription = null;
    let headingSubscription = null;
    let isMounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 2000, distanceInterval: 1 },
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
              setCurrentLocation((prev) => ({ ...prev, heading: compassHeading || 0 }));
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
      const res = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
      const data = await res.json();
      if (data.success && data.coordinates) {
        const coords = data.coordinates;
        setMeetupHub({
          name: coords.start_hub_name || "Pickup Hub",
          latitude: parseFloat(coords.start_latitude),
          longitude: parseFloat(coords.start_longitude),
        });
      }
    } catch (err) {
      console.log("❌ Error fetching map coordinates:", err);
    }
  }, []);

  useEffect(() => {
    if (initialRideOfferId) {
      fetchMapCoordinatesData(initialRideOfferId);
    }
  }, [initialRideOfferId, fetchMapCoordinatesData]);

  useEffect(() => {
    let isMounted = true;
    async function loadWalkingRoute() {
      if (currentLocation?.latitude && meetupHub?.latitude) {
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

  useEffect(() => {
    if (mapRef.current && currentLocation?.latitude && meetupHub?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      const coordsToFit = [
        { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        { latitude: meetupHub.latitude, longitude: meetupHub.longitude },
        ...(driverLocation?.latitude ? [{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }] : []),
        ...walkingCoordinates
      ];

      mapRef.current.fitToCoordinates(coordsToFit, {
        edgePadding: { top: 90, right: 60, bottom: bottomPadding, left: 60 },
        animated: true,
      });
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, meetupHub?.latitude, meetupHub?.longitude, driverLocation?.latitude, walkingCoordinates, isDrawerExpanded]);

  useEffect(() => {
    let isSubscribed = true;
    let timerId;

    async function checkProposalStatus() {
      if (!isSubscribed || !currentUserId) return;

      try {
        const controller = new AbortController();
        const abortTimeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${API_URL}/api/rides/proposal-manifest/${currentUserId}`, {
          signal: controller.signal,
        });
        clearTimeout(abortTimeout);

        if (res.status === 404 || !res.ok) {
          console.log("⚠️ Proposal manifest temporarily unavailable, retaining view for retry...");
          return;
        }

        if (isSubscribed) {
          const data = await res.json();
          const passengers = data.passengers || [];

          const activeRideOfferId = data.ride_offer_id || data.rideOfferId || data.matched_ride_offer_id || data.id || initialRideOfferId;
          if (activeRideOfferId) {
            fetchMapCoordinatesData(activeRideOfferId);
          } else if (data.hub && data.hub.latitude) {
            setMeetupHub(data.hub);
          }

          if (data.driver_location && data.driver_location.latitude) {
            setDriverLocation({
              latitude: parseFloat(data.driver_location.latitude),
              longitude: parseFloat(data.driver_location.longitude)
            });
          }

          const currentOfferStatus = (data.ride_offer_status || data.status || "pending").toLowerCase().trim();
          setRideOfferStatus(currentOfferStatus);

          const normalizedAcceptedIds = (data.accepted_passengers || []).map(id => parseInt(id, 10));
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
            .filter(p => parseInt(p.user_id, 10) !== currentUserId)
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
        }
      } catch (err) {
        console.log("⚠️ Proposal status polling network skip:", err.message);
      } 
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
  }, [currentUserId, navigation, userAccepted, fetchMapCoordinatesData, initialRideOfferId]);

  const handleAcceptProposal = async () => {
    const rawId = user?.id || user?.user_id || user?.uid || user?.sub || user?.user?.id || user?.user?.user_id;
    const validUserId = parseInt(rawId, 10);

    if (!validUserId || isNaN(validUserId)) {
      console.error("❌ [ERROR] Aborting accept proposal: Invalid or missing user ID in auth context.");
      return;
    }

    setUserAccepted(true);
    setMyDbStatus("accepted");
    playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));

    try {
      const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
      const endpoint = `${baseUrl}/api/rides/accept-proposal`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: validUserId, userId: validUserId }),
      });

      if (!response.ok) {
        setUserAccepted(false);
        setMyDbStatus("matched");
      }
    } catch (err) {
      setUserAccepted(false);
      setMyDbStatus("matched");
    }
  };

  const handleSignalArrival = async () => {
    const validUserId = currentUserId || parseInt(user?.id || user?.user_id || user?.uid || user?.sub, 10);
    if (!validUserId || isNaN(validUserId)) return;

    playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));

    try {
      const baseUrl = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL;
      const endpoint = `${baseUrl}/api/rides/signal-arrival`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: validUserId }),
      });

      const responseText = await response.text();
      let data = {};
      try { data = JSON.parse(responseText); } catch (e) {}

      if (response.ok) {
        setMyDbStatus("arrived");
        const activeOfferId = data.ride_offer_id || initialRideOfferId;
        navigateToTracking(activeOfferId);
      }
    } catch (err) {
      console.log("❌ Network error signaling arrival:", err);
    }
  };

  const handleDeclineProposal = async () => {
    playSound("4").catch((err) => console.log("⚠️ Sound playback suppressed:", err.message));

    try {
      const validUserId = currentUserId || parseInt(user?.id || user?.user_id, 10);
      const response = await fetch(`${API_URL}/api/routes/decline-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: validUserId }),
      });

      if (response.ok) {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.replace("Passenger");
      }
    } catch (err) {
      console.log("❌ Error declining proposal:", err);
    }
  };

  const isDriverAcceptedOrActive = driverState === "accepted" || rideOfferStatus === "accepted";
  const isArrivalButtonActive = userAccepted && isDriverAcceptedOrActive;

  return (
    <SafeAreaView style={styles.container}>
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

      <View style={styles.mapContainer}>
        {initialCheckDone || initialRideOfferId ? (
          <MemoizedMap 
            currentLocation={currentLocation} 
            meetupLocation={meetupHub} 
            driverLocation={driverLocation}
            walkingRouteCoordinates={walkingCoordinates}
            mapRef={mapRef} 
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="small" color="#059669" />
          </View>
        )}
      </View>

      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
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
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
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

        {isDrawerExpanded && (
         <View style={styles.drawerFooterSticky}>
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

            {!userAccepted ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                activeOpacity={0.85}
                onPress={handleAcceptProposal}
              >
                <View style={styles.buttonInternalGroup}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.acceptButtonText}>Accept Hub</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.actionButton, 
                  styles.acceptButton, 
                  !isArrivalButtonActive && { backgroundColor: "#9CA3AF", opacity: 0.7 }
                ]}
                activeOpacity={0.85}
                disabled={!isArrivalButtonActive}
                onPress={handleSignalArrival}
              >
                <View style={styles.buttonInternalGroup}>
                  <Ionicons name="location" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.acceptButtonText}>
                    {isArrivalButtonActive ? "I've Arrived at Hub" : "Waiting for Driver..."}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
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
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#A7F3D0" },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },
  mapContainer: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  userArrowOuterHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(14, 165, 233, 0.25)", justifyContent: "center", alignItems: "center" },
  userArrowContainer: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#0EA5E9", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  driverOuterHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(16, 185, 129, 0.25)", justifyContent: "center", alignItems: "center" },
  driverPinContainer: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },
  pickupPinContainer: { alignItems: "center" },
  pickupPinDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#059669", borderWidth: 2, borderColor: "#FFFFFF", position: "absolute", bottom: -4, zIndex: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 4 },
  pickupPinBubble: { backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3 },
  pickupBubbleText: { color: "#111827", fontSize: 11, fontWeight: "700", maxWidth: 140 },
  pickupPinTail: { width: 0, height: 0, backgroundColor: "transparent", borderStyle: "solid", borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 6, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#E5E7EB", marginBottom: -1 },
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#111111" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#111111" },
  walkingInfoPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", marginTop: 4, borderWidth: 1, borderColor: "#A7F3D0" },
  walkingInfoText: { fontSize: 11, fontWeight: "600", color: "#059669", marginLeft: 4 },
  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 4 },
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
  drawerFooterSticky: { 
    paddingVertical: 10, 
    paddingBottom: Platform.OS === 'android' ? 24 : 12,
    borderTopWidth: 1, 
    borderTopColor: "#E5E7EB", 
    backgroundColor: "#F9FAFB" 
  },
  actionButtonsRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  actionButton: { paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  declineButton: { flex: 1, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5" },
  declineButtonText: { color: "#EF4444", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  acceptButton: { flex: 2, backgroundColor: "#059669" },
  acceptButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.5 },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center" },
});