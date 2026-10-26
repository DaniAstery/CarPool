import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { io } from "socket.io-client";
import { useAuth } from "../AuthContext";
import { playSound } from "../utils/soundPlayer";
import { isValidMapCoordinate, toMapCoordinate } from "../utils/mapCoordinates";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const API_URL_PASSENGER = `${(
  process.env.EXPO_PUBLIC_API_URL_PASSENGER || API_URL
).replace(/\/api\/?$/, "").replace(/\/$/, "")}/api`;
const SOCKET_URL = (process.env.EXPO_PUBLIC_SOCKET_URL || API_URL)
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

const parsePassengerIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id));
  }
  if (typeof value === "string") {
    return value
      .replace(/[{}\[\]]/g, "")
      .split(",")
      .map(id => parseInt(id.trim(), 10))
      .filter(id => Number.isInteger(id));
  }
  return [];
};

const passengerStatusRank = {
  searching: 0,
  matched: 1,
  accepted: 2,
  arrived: 3,
  in_trip: 4,
  completed: 5,
};

const preservePassengerProgress = (previousStatus, nextStatus) => {
  const previous = String(previousStatus || "").toLowerCase().trim();
  const next = String(nextStatus || "").toLowerCase().trim();
  return (passengerStatusRank[previous] ?? -1) > (passengerStatusRank[next] ?? -1)
    ? previous
    : next;
};

const DEFAULT_LOCATION = {
  latitude: 9.0235,
  longitude: 38.8275,
  heading: 0,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Fetch a street-level walking path; omit the line if routing is unavailable.
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
    console.log("⚠️ OSRM walking route request failed, utilizing urban grid fallback");
  }

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

  return { distance: distanceStr, duration: durationStr, coordinates: [] };
};

// Fetch real street-level driving route from OSRM public driving router
const fetchDrivingRoute = async (origin, destination) => {
  if (!isValidMapCoordinate(origin) || !isValidMapCoordinate(destination)) {
    return [];
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      return data.routes[0].geometry.coordinates.map(coord => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
    }
  } catch (err) {
    console.warn("OSRM driving route request failed:", err.message);
  }

  return [];
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (Walking Polyline, Compass Arrow, Driver, Pickup, Destination)
// ------------------------------------------------------------------
const TrackingMap = memo(({ currentLocation, driverLocation, pickupLocation, destinationLocation, walkingRouteCoordinates, routeCoordinates, mapRef, isDrawerExpanded }) => {
  const hasFitted = useRef(false);
  const hasFittedPassengerLocation = useRef(false);
  const lastFittedDrawerState = useRef(isDrawerExpanded);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const hasPassengerLocation = isValidMapCoordinate(currentLocation);
    const drawerStateChanged = lastFittedDrawerState.current !== isDrawerExpanded;
    const shouldFit =
      !hasFitted.current ||
      (hasPassengerLocation && !hasFittedPassengerLocation.current) ||
      drawerStateChanged;
    if (mapReady && mapRef.current && isValidMapCoordinate(pickupLocation) && isValidMapCoordinate(destinationLocation) && shouldFit) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      const coordsToFit = [
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
        ...(hasPassengerLocation ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : []),
        ...(isValidMapCoordinate(driverLocation) ? [{ latitude: driverLocation.latitude, longitude: driverLocation.longitude }] : []),
        ...walkingRouteCoordinates,
        ...routeCoordinates
      ];

      try {
        mapRef.current.fitToCoordinates(coordsToFit, {
          edgePadding: { top: 90, right: 60, bottom: bottomPadding, left: 60 },
          animated: true,
        });
        hasFitted.current = true;
        if (hasPassengerLocation) hasFittedPassengerLocation.current = true;
        lastFittedDrawerState.current = isDrawerExpanded;
      } catch (err) {
        console.warn("Could not frame the pickup and trip route on the map:", err.message);
      }
    }
  }, [mapReady, currentLocation, driverLocation, pickupLocation, destinationLocation, walkingRouteCoordinates, routeCoordinates, mapRef, isDrawerExpanded]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={DEFAULT_LOCATION}
      onMapReady={() => setMapReady(true)}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🧭 1. Circular Glowing Compass Arrow Passenger Marker */}
      {isValidMapCoordinate(currentLocation) && (
        <Marker 
          coordinate={currentLocation} 
          title="Your Location" 
          description="Passenger (Compass Heading Active)"
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
        >
          <View style={styles.userArrowOuterHalo}>
            <View style={[styles.userArrowContainer, { transform: [{ rotate: `${currentLocation.heading || 0}deg` }] }]}>
              <Ionicons name="navigate" size={18} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 🚗 2. Live Assigned Driver Pin Marker */}
      {isValidMapCoordinate(driverLocation) && (
        <Marker 
          coordinate={driverLocation} 
          title={driverLocation.title || "Assigned Driver"} 
          description="Live Driver Location relative to passenger"
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
        >
          <View style={styles.driverMarkerOuterHalo}>
            <View style={styles.driverMarkerContainer}>
              <Ionicons name="car-sport" size={16} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 🟢 3. Pickup Hub Marker (Emerald Green Ride-App Dot) */}
      {isValidMapCoordinate(pickupLocation) && (
        <Marker 
          coordinate={{ latitude: Number(pickupLocation.latitude), longitude: Number(pickupLocation.longitude) }} 
          title={pickupLocation.title || "Pickup Hub"} 
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.pickupPinContainer}>
            <View style={styles.pickupPinLabel}>
              <Ionicons name="location-sharp" size={13} color="#FFFFFF" />
              <Text style={styles.pickupPinText} numberOfLines={1}>
                {pickupLocation.title || "PICKUP"}
              </Text>
            </View>
            <View style={styles.pickupPinTip} />
          </View>
        </Marker>
      )}

      {/* 🔵 4. Destination Hub Marker (Royal Blue Ride-App Dot) */}
      {isValidMapCoordinate(destinationLocation) && (
        <Marker 
          coordinate={{ latitude: Number(destinationLocation.latitude), longitude: Number(destinationLocation.longitude) }} 
          title={destinationLocation.title || "Destination Hub"} 
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.glowingDestinationOuterHalo}>
            <View style={styles.glowingDestinationBadge} />
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

      {/* 🛣️ Real Street-Level Driving Route Polyline (Pickup Hub to Destination Hub) */}
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#3B82F6"
          strokeWidth={4}
          geodesic={true}
        />
      )}
    </MapView>
  );
});

export default function LiveTrackingScreen({ route, navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const currentUserId = parseInt(
    user?.id || user?.user_id || user?.userId || route?.params?.userId || route?.params?.user_id,
    10
  );
  const rideOfferId =
    route?.params?.rideOfferId ||
    route?.params?.ride_offer_id ||
    route?.params?.ride_id ||
    route?.params?.id ||
    route?.params?.ride?.id ||
    0;

  const arrivedSoundPlayedRef = useRef(false);
  const prevCoRiderStatusesRef = useRef({});
  const prevDriverStateRef = useRef("accepted");
  const myStatusRef = useRef("accepted");

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [myStatus, setMyStatus] = useState("accepted");
  const [driverState, setDriverState] = useState("accepted");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [vehicleInfo, setVehicleInfo] = useState("Corridor Shuttle");
  const [coRiders, setCoRiders] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [driverLocation, setDriverLocation] = useState({ latitude: null, longitude: null, title: "Assigned Driver" });
  
  const [pickupLocation, setPickupLocation] = useState({ latitude: null, longitude: null, title: "Pickup Hub" });
  const [destinationLocation, setDestinationLocation] = useState({ latitude: null, longitude: null, title: "Destination Hub" });
  
  const [walkingDistance, setWalkingDistance] = useState(null);
  const [walkingDuration, setWalkingDuration] = useState(null);
  const [walkingCoordinates, setWalkingCoordinates] = useState([]);
  const [routeCoordinates, setRouteCoordinates] = useState([]);

  const [pickupHubName, setPickupHubName] = useState("Fetching Pickup Hub...");
  const [dropoffHubName, setDropoffHubName] = useState("Fetching Destination...");

  const mapRef = useRef(null);

  // 1. DISABLE ANDROID BACK BUTTON DURING ACTIVE HUB PRESENCE / TRACKING
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

 // Inside LiveTrackingScreen.js
const hasNavigatedRef = useRef(false);

const navigateToDeparture = useCallback(() => {
  if (hasNavigatedRef.current) return; // 👈 Prevent duplicate navigation triggers
  hasNavigatedRef.current = true;

  try {
    playSound("4");
    const rootNavigator = navigation.getParent() || navigation;
    
    if (rootNavigator.canGoBack()) {
      rootNavigator.navigate("TripDeparture", { rideOfferId, userId: currentUserId });
    } else {
      rootNavigator.replace("TripDeparture", { rideOfferId, userId: currentUserId });
    }
  } catch (err) {
    console.log("⚠️ Navigation dispatch error:", err);
  }
}, [navigation, rideOfferId, currentUserId]);

  // Real-time GPS location watch + device compass heading watch for smooth arrow rotation
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

  // 2. FETCH PRECISE AUTHORITATIVE PICKUP & DESTINATION COORDINATES FROM MAP_COORDINATES
  useEffect(() => {
    let isMounted = true;
    async function fetchMapCoordinatesEndpoint() {
      if (!rideOfferId) return;
      try {
        const res = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
        const data = await res.json();
        if (data.success && data.coordinates && isMounted) {
          const coords = data.coordinates;
          const pickup = toMapCoordinate(coords.start_latitude, coords.start_longitude);
          const destination = toMapCoordinate(coords.end_latitude, coords.end_longitude);

          if (pickup) {
            setPickupLocation({
              latitude: pickup.latitude,
              longitude: pickup.longitude,
              title: coords.start_hub_name || "Pickup Hub"
            });
          }

          if (destination) {
            setDestinationLocation({
              latitude: destination.latitude,
              longitude: destination.longitude,
              title: coords.end_hub_name || "Destination Hub"
            });
          }

          if (coords.start_hub_name) setPickupHubName(coords.start_hub_name);
          if (coords.end_hub_name) setDropoffHubName(coords.end_hub_name);
        }
      } catch (err) {
        console.log("⚠️ Error fetching map_coordinates endpoint:", err);
      }
    }

    fetchMapCoordinatesEndpoint();
    return () => { isMounted = false; };
  }, [rideOfferId]);

  // 3. GENERATE STREET-LEVEL WALKING ROUTE (Current Device to Pickup Hub)
  useEffect(() => {
    let isMounted = true;
    async function loadWalkingRoute() {
      if (isValidMapCoordinate(currentLocation) && isValidMapCoordinate(pickupLocation)) {
        const routeData = await fetchWalkingRoute(currentLocation, pickupLocation);
        if (isMounted) {
          setWalkingDistance(routeData.distance);
          setWalkingDuration(routeData.duration);
          setWalkingCoordinates(routeData.coordinates);
        }
      }
    }
    loadWalkingRoute();
    return () => { isMounted = false; };
  }, [currentLocation?.latitude, currentLocation?.longitude, pickupLocation?.latitude, pickupLocation?.longitude]);

  // 4. GENERATE STREET-LEVEL DRIVING ROUTE (Pickup Hub to Destination Hub)
  useEffect(() => {
    let isMounted = true;
    async function updateStreetRoute() {
      if (isValidMapCoordinate(pickupLocation) && isValidMapCoordinate(destinationLocation)) {
        const routePoints = await fetchDrivingRoute(pickupLocation, destinationLocation);
        if (isMounted && routePoints.length > 0) {
          setRouteCoordinates(routePoints);
        }
      }
    }
    updateStreetRoute();
    return () => { isMounted = false; };
  }, [pickupLocation, destinationLocation]);

  // 5. HYBRID ARCHITECTURE: Fallback Polling + Instant Socket.io Real-Time Listener
  useEffect(() => {
    let isSubscribed = true;
    let timerId;
    let socket = null;

    const resolvedUserId = parseInt(user?.id || user?.user_id || user?.userId || currentUserId, 10);
    const targetRideOfferId = parseInt(rideOfferId, 10);

    async function fetchHubPresenceStatus() {
      if (!isSubscribed || isNaN(resolvedUserId) || isNaN(targetRideOfferId)) return;

      try {
        const res = await fetch(`${API_URL_PASSENGER}/rides/presence-status/${targetRideOfferId}/${resolvedUserId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (isSubscribed && data.success) {
          if (data.pickup_hub) setPickupHubName(data.pickup_hub);
          if (data.dropoff_hub) setDropoffHubName(data.dropoff_hub);
          const dropoff = toMapCoordinate(data.dropoff_lat, data.dropoff_lng);
          if (dropoff) {
            setDestinationLocation(previous => {
              const title = data.dropoff_hub || "Destination Hub";
              if (
                previous.latitude === dropoff.latitude &&
                previous.longitude === dropoff.longitude &&
                previous.title === title
              ) return previous;
              return {
                latitude: dropoff.latitude,
                longitude: dropoff.longitude,
                title
              };
            });
          }
          if (data.driverName) setDriverName(data.driverName);
          if (data.vehicleInfo) setVehicleInfo(data.vehicleInfo);
          
          const dLat = parseFloat(data.driver_latitude || data.driver_lat);
          const dLng = parseFloat(data.driver_longitude || data.driver_lng);
          if (!isNaN(dLat) && !isNaN(dLng)) {
            setDriverLocation({
              latitude: dLat,
              longitude: dLng,
              title: data.driverName ? `${data.driverName}'s Vehicle` : "Assigned Driver"
            });
          }

          const newDriverStatus = (data.driver_status || "pending").toLowerCase().trim();
          const passengers = Array.isArray(data.passengers) ? data.passengers : [];
          const acceptedIds = parsePassengerIds(data.accepted_passengers);
          const passengersById = new Map(
            passengers
              .map(passenger => {
                const id = parseInt(passenger.user_id || passenger.userId || passenger.id, 10);
                return Number.isInteger(id) ? [id, passenger] : null;
              })
              .filter(Boolean)
          );
          acceptedIds.forEach(id => {
            if (!passengersById.has(id)) {
              passengersById.set(id, {
                user_id: id,
                userId: id,
                full_name: `Rider ${id}`,
                status: "accepted"
              });
            }
          });
          const manifestPassengers = Array.from(passengersById.values());
          const myRow = manifestPassengers.find(
            (p) => parseInt(p.user_id || p.userId || p.id, 10) === resolvedUserId
          );

          const rowMyStatus = String(myRow?.status || "").toLowerCase().trim();
          const serverMyStatus = ["arrived", "in_trip", "completed"].includes(rowMyStatus)
            ? rowMyStatus
            : acceptedIds.includes(resolvedUserId)
              ? "accepted"
              : rowMyStatus || "accepted";
          const rawMyStatus = preservePassengerProgress(myStatusRef.current, serverMyStatus);

          if (newDriverStatus === "in_trip" || rawMyStatus === "in_trip") {
            navigateToDeparture();
            return;
          }

          if (newDriverStatus === "arrived" && prevDriverStateRef.current !== "arrived") {
            playSound("5");
          }
          prevDriverStateRef.current = newDriverStatus;
          setDriverState(newDriverStatus);

          if (rawMyStatus === "arrived" && !arrivedSoundPlayedRef.current) {
            arrivedSoundPlayedRef.current = true;
            playSound("5");
          }

          setMyStatus(rawMyStatus);
          myStatusRef.current = rawMyStatus;

          const newCoRiderStatuses = {};
          let coRiderStatusChangedToArrived = false;

          const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
          const parsedCoRiders = manifestPassengers
            .filter((p) => parseInt(p.user_id || p.userId || p.id, 10) !== resolvedUserId)
            .map((p, idx) => {
              const pId = parseInt(p.user_id || p.userId || p.id, 10);
              const serverStatus = String(p.status || "").toLowerCase().trim();
              const acceptedStatus = acceptedIds.includes(pId) ? "accepted" : serverStatus || "accepted";
              const pStatus = preservePassengerProgress(
                prevCoRiderStatusesRef.current[pId],
                ["arrived", "in_trip", "completed"].includes(serverStatus) ? serverStatus : acceptedStatus
              );
              
              newCoRiderStatuses[pId] = pStatus;

              const previousStatus = prevCoRiderStatusesRef.current[pId];
              if (pStatus === "arrived" && previousStatus && previousStatus !== "arrived") {
                coRiderStatusChangedToArrived = true;
              }

              return {
                id: pId,
                name: p.full_name || `Rider ${pId}`,
                status: pStatus.toUpperCase(),
                color: colorPalette[idx % colorPalette.length],
              };
            });

          if (coRiderStatusChangedToArrived) {
            playSound("5");
          }

          prevCoRiderStatusesRef.current = newCoRiderStatuses;
          setCoRiders(parsedCoRiders);
        }
      } catch (err) {
        console.error("Live tracking presence sync failed:", err);
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(fetchHubPresenceStatus, 10000); // 10s fallback loop
        }
      }
    }

    // Initial load
    fetchHubPresenceStatus();

    // Setup Instant Socket.io Listener matching backend emission
    socket = io(SOCKET_URL, { reconnection: true });

    socket.on("connect", () => {
      console.log("⚡ Connected to real-time notification socket");
    });

    socket.on("route_pool_updated", (payload) => {
      console.log("⚡ Instant DB Event Broadcast Received via Socket:", payload);

      const matchesRide = parseInt(payload.ride_offer_id || payload.matched_ride_offer_id, 10) === targetRideOfferId;
      const matchesUser = parseInt(payload.user_id, 10) === resolvedUserId;
      const statusVal = (payload.status || payload.passenger_status || payload.driver_status || "").toLowerCase().trim();

      if (matchesRide && (statusVal === "in_trip" || (matchesUser && statusVal === "in_trip") || payload.driver_status === "in_trip")) {
        console.log("🚀 INSTANT TRIGGER: Navigating to TripDeparture!");
        navigateToDeparture();
        return;
      }

      // Instantly refresh state on any other status change
      fetchHubPresenceStatus();
    });

    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user, rideOfferId, navigateToDeparture]);

  const handleSignalArrival = async () => {
    const resolvedUserId = parseInt(user?.id || user?.user_id || user?.userId, 10);
    
    if (!resolvedUserId || isNaN(resolvedUserId)) {
      Alert.alert("Authentication Error", "User session not fully loaded. Please wait a moment and try again.");
      return;
    }
    const targetRideOfferId = parseInt(rideOfferId, 10);
    if (!Number.isInteger(targetRideOfferId) || targetRideOfferId <= 0) {
      Alert.alert("Ride Unavailable", "The active ride could not be identified. Please return to your ride and try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const arrivalUrl = `${API_URL_PASSENGER}/rides/signal-arrival`;
      const response = await fetch(arrivalUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: resolvedUserId,
          ride_offer_id: targetRideOfferId
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`The server returned an invalid response (${response.status}).`);
      }

      if (!response.ok || !data.success) {
        Alert.alert("Arrival Error", data.error || data.message || "Could not update arrival status.");
        return;
      }

      setMyStatus("arrived");
      myStatusRef.current = "arrived";
      arrivedSoundPlayedRef.current = true;
      playSound("5");  

      if (data.passengers && Array.isArray(data.passengers)) {
        const colorPalette = ["#E28743", "#764ABC", "#2F4F4F", "#D2691E"];
        const instantCoRiders = data.passengers
          .filter((p) => parseInt(p.userId || p.user_id, 10) !== resolvedUserId)
          .map((p, idx) => ({
            id: parseInt(p.userId || p.user_id, 10),
            name: p.full_name || `Rider ${p.userId || p.user_id}`,
            status: (p.status || "arrived").toUpperCase(),
            color: colorPalette[idx % colorPalette.length],
          }));
        setCoRiders(instantCoRiders);
        prevCoRiderStatusesRef.current = Object.fromEntries(
          instantCoRiders.map((rider) => [rider.id, rider.status.toLowerCase()])
        );
      }
    } catch (err) {
      console.error("Arrival update failed:", err);
      Alert.alert(
        "Arrival Update Failed",
        err.message === "Network request failed"
          ? `Could not connect to ${API_URL_PASSENGER}. Check your internet connection and try again.`
          : err.message || "Could not update arrival status. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isArrived = myStatus === "arrived" || myStatus === "completed";
  const isDriverArrived = driverState === "arrived";

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
          <Text style={styles.statusPrimaryText}>Live Tracking & Hub Presence</Text>
          <Text style={styles.statusSecondaryText}>
            {walkingDistance && walkingDuration 
              ? `Walk ${walkingDistance} (~${walkingDuration}) to ${pickupHubName}` 
              : `Head to ${pickupHubName}`}
          </Text>
        </View>
      </View>

      {/* MAP SECTION */}
      <View style={styles.mapContainer}>
        <TrackingMap 
          currentLocation={currentLocation} 
          driverLocation={driverLocation}
          pickupLocation={pickupLocation}
          destinationLocation={destinationLocation}
          walkingRouteCoordinates={walkingCoordinates}
          routeCoordinates={routeCoordinates}
          mapRef={mapRef} 
          isDrawerExpanded={isDrawerExpanded}
        />
      </View>

      {/* COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed, { paddingBottom: insets.bottom }]}>
        
        {/* Toggle Handle Header */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Hub Presence & Matching</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                To <Text style={styles.boldText}>{pickupHubName}</Text>
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
              <View style={[styles.statusBadge, isArrived ? styles.badgeArrived : styles.badgeAccepted]}>
                <Text style={styles.badgeText}>{myStatus.toUpperCase()}</Text>
              </View>
              <View style={styles.expandToggleBadge}>
                <Text style={styles.expandToggleText}>{isDrawerExpanded ? "Collapse" : "Details"}</Text>
                <Ionicons name={isDrawerExpanded ? "chevron-down" : "chevron-up"} size={12} color="#6B7280" />
              </View>
            </View>
          </View>
        </Pressable>

        {/* Scrollable Content */}
        <ScrollView 
          showsVerticalScrollIndicator={false}
          style={styles.drawerScrollBody}
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          {/* Route Corridor Details */}
          <View style={styles.routeCard}>
            <View style={styles.routeItem}>
              <Ionicons name="location-sharp" size={18} color="#059669" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>PICKUP HUB</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{pickupHubName}</Text>
              </View>
            </View>

            <View style={styles.routeDivider} />

            <View style={styles.routeItem}>
              <Ionicons name="flag-sharp" size={18} color="#3B82F6" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>DESTINATION</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{dropoffHubName}</Text>
              </View>
            </View>
          </View>

          {/* Driver Card with Distinct Arrival Status Highlighting */}
          <View style={[styles.driverCard, isDriverArrived && styles.driverCardArrived]}>
            <Ionicons name="car" size={22} color={isDriverArrived ? "#059669" : "#2F4F4F"} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.driverLabel}>{driverName} • {vehicleInfo}</Text>
              <Text style={styles.driverSub}>
                Driver Status: <Text style={[styles.boldText, isDriverArrived && styles.driverArrivedText]}>{driverState.toUpperCase()}</Text>
              </Text>
            </View>
            {isDriverArrived && (
              <View style={styles.driverArrivedBadge}>
                <Text style={styles.driverArrivedBadgeText}>ARRIVED</Text>
              </View>
            )}
          </View>

          {/* Co-Riders Matrix */}
          <View style={styles.rosterContainer}>
            <Text style={styles.sectionHeader}>Co-Riders Presence Matrix</Text>
            
            <View style={styles.riderRow}>
              <View style={[styles.avatar, { backgroundColor: "#2F4F4F" }]}>
                <Text style={styles.avatarText}>YOU</Text>
              </View>
              <Text style={styles.riderName}>{user?.full_name || `You (User ${currentUserId})`}</Text>
              <Text style={[styles.statusTag, isArrived ? styles.tagArrived : styles.tagAccepted]}>
                {myStatus.toUpperCase()}
              </Text>
            </View>

            {coRiders.map((rider) => (
              <View key={rider.id} style={styles.riderRow}>
                <View style={[styles.avatar, { backgroundColor: rider.color }]}>
                  <Text style={styles.avatarText}>{rider.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.riderName}>{rider.name}</Text>
                <Text style={[
                  styles.statusTag, 
                  rider.status === "ARRIVED" ? styles.tagArrived :
                  (rider.status === "ACCEPTED" || rider.status === "MATCHED") ? styles.tagAccepted :
                  styles.tagPending
                ]}>
                  {rider.status}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Action Button */}
        {isDrawerExpanded && (
          <TouchableOpacity
            style={[styles.actionButton, (isArrived || isSubmitting) && styles.actionButtonDisabled]}
            disabled={isArrived || isSubmitting}
            onPress={handleSignalArrival}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.actionButtonText}>
                {isArrived ? "Awaiting Co-Riders & Driver Dispatch" : "I've Arrived at Hub"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  
  // Status Bar Banner
  statusBarBanner: { backgroundColor: "#059669", flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, zIndex: 20 },
  statusIndicatorWrapper: { width: 24, height: 24, justifyContent: "center", alignItems: "center", marginRight: 14 },
  statusCenterCoreDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#A7F3D0" },
  statusTextContainer: { flex: 1 },
  statusPrimaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  statusSecondaryText: { color: "#A7F3D0", fontSize: 11, marginTop: 2 },

  mapContainer: { flex: 1 },
  
  // Circular Glowing Compass Arrow Passenger Marker
  userArrowOuterHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(14, 165, 233, 0.25)", justifyContent: "center", alignItems: "center" },
  userArrowContainer: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#0EA5E9", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },

  // Driver Pin Marker
  driverMarkerOuterHalo: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(5, 150, 105, 0.25)", justifyContent: "center", alignItems: "center" },
  driverMarkerContainer: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 5 },

  glowingEmeraldOuterHalo: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(5, 150, 105, 0.2)", justifyContent: "center", alignItems: "center" },
  glowingEmeraldBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#059669", borderWidth: 2, borderColor: "#FFFFFF" },
  pickupPinContainer: { alignItems: "center", maxWidth: 190 },
  pickupPinLabel: { flexDirection: "row", alignItems: "center", backgroundColor: "#059669", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3 },
  pickupPinText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", marginLeft: 4, maxWidth: 150 },
  pickupPinTip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#059669", marginTop: -1 },
  glowingDestinationOuterHalo: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(59, 130, 246, 0.2)", justifyContent: "center", alignItems: "center" },
  glowingDestinationBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: "#3B82F6", borderWidth: 2, borderColor: "#FFFFFF" },

  slidingPanelDrawer: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 8, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 15, zIndex: 30 },
  drawerExpanded: { height: height * 0.52 },
  drawerCollapsed: { height: 125 },

  dragHandleContainer: { paddingBottom: 8 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1, marginRight: 10 },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  subtitle: { fontSize: 12, color: "#64748B", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#0F172A" },

  walkingInfoPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", marginTop: 6 },
  walkingInfoText: { fontSize: 11, color: "#059669", fontWeight: "600", marginLeft: 4 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeAccepted: { backgroundColor: "#FEF3C7" },
  badgeArrived: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#0F172A" },

  expandToggleBadge: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  expandToggleText: { fontSize: 11, color: "#6B7280", marginRight: 2, fontWeight: "500" },

  drawerScrollBody: { marginTop: 4 },

  routeCard: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 12 },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 8, marginLeft: 26 },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  routeValue: { fontSize: 13, fontWeight: "600", color: "#1E293B", marginTop: 1 },

  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F1F5F9", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#E2E8F0" },
  driverCardArrived: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  driverLabel: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  driverSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  driverArrivedText: { color: "#059669" },
  driverArrivedBadge: { backgroundColor: "#059669", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  driverArrivedBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },

  rosterContainer: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 },
  sectionHeader: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8 },
  riderRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  avatar: { width: 28, height: 28, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 10 },
  avatarText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  riderName: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1E293B" },
  statusTag: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagAccepted: { backgroundColor: "#FEF3C7", color: "#B45309" },
  tagArrived: { backgroundColor: "#ECFDF5", color: "#047857" },
  tagPending: { backgroundColor: "#F1F5F9", color: "#64748B" },

  actionButton: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginBottom: Platform.OS === 'ios' ? 20 : 10 },
  actionButtonDisabled: { backgroundColor: "#94A3B8" },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
});