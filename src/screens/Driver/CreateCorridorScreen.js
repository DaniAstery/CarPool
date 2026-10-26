import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from "react";
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
  Pressable,
  Switch,
  Modal,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, Circle } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import CorridorDrawer from "../Corridor_Drawer";
import { useAuth } from "../../AuthContext";
import { io } from "socket.io-client";
import { playSound } from "../../utils/soundPlayer";
import { isValidMapCoordinate, toMapCoordinate } from "../../utils/mapCoordinates";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000";
const API_URL = RAW_API_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");
console.log("🔌 [DEBUG] API_URL loaded as:", API_URL);
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const cleanMinimalMapStyle = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

const FALLBACK_LOCATION = {
  latitude: 9.0238,
  longitude: 38.8475,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

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
// MEMOIZED DISPATCH MAP
// ------------------------------------------------------------------
const DispatchMap = memo(({
  driverCoords,
  heading,
  targetHubForLine,
  topHubs,
  currentHub,
  nearestHub,
  mapRef,
  isDrawerExpanded,
  onSelectHub,
  showRadiusCircle,
  onToggleRadius,
  currentDriverDistance,
  isCorridorActive
}) => {
  useEffect(() => {
    if (mapRef.current && isValidMapCoordinate(driverCoords) && isValidMapCoordinate(targetHubForLine)) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      mapRef.current.fitToCoordinates(
        [
          { latitude: parseFloat(driverCoords.latitude), longitude: parseFloat(driverCoords.longitude) },
          { latitude: parseFloat(targetHubForLine.latitude), longitude: parseFloat(targetHubForLine.longitude) }
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
        initialRegion={driverCoords ? {
          ...driverCoords,
          latitude: parseFloat(driverCoords.latitude),
          longitude: parseFloat(driverCoords.longitude)
        } : FALLBACK_LOCATION}
        customMapStyle={cleanMinimalMapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {topHubs.map((hub) => {
          const isSelectedActive = currentHub && currentHub.id === hub.id;
          const isNearest = nearestHub && nearestHub.id === hub.id;
          const hubCoordinate = toMapCoordinate(hub.latitude, hub.longitude);

          if (!hubCoordinate) return null;
          const hubLat = hubCoordinate.latitude;
          const hubLng = hubCoordinate.longitude;

          return (
            <React.Fragment key={`hub-${hub.id}`}>
              <Marker
                coordinate={{ latitude: hubLat, longitude: hubLng }}
                title={hub.name}
                description={`${hub.distanceKm ? hub.distanceKm.toFixed(1) : "?"} km away`}
                onPress={() => isCorridorActive && onSelectHub(hub)}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
              >
                <View style={[
                  styles.destinationHalo,
                  (isSelectedActive || isNearest) && {
                    backgroundColor: isCorridorActive ? "rgba(5, 150, 105, 0.3)" : "rgba(107, 114, 128, 0.3)"
                  }
                ]}>
                  {isSelectedActive && (
                    <View style={[styles.targetBadge, !isCorridorActive && { backgroundColor: "#6B7280" }]}>
                      <Text style={styles.targetBadgeText}>TARGET HUB</Text>
                    </View>
                  )}
                  <View style={[
                    styles.destinationBadge,
                    (isSelectedActive || isNearest) && {
                      backgroundColor: isCorridorActive ? "#059669" : "#6B7280"
                    }
                  ]} />
                </View>
              </Marker>

              {showRadiusCircle && (
                <Circle
                  center={{ latitude: hubLat, longitude: hubLng }}
                  radius={2000}
                  strokeColor={
                    isSelectedActive
                      ? isCorridorActive ? "#059669" : "#6B7280"
                      : "rgba(156, 163, 175, 0.5)"
                  }
                  fillColor={
                    isSelectedActive
                      ? isCorridorActive ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)"
                      : "rgba(229, 231, 235, 0.2)"
                  }
                  strokeWidth={isSelectedActive ? 2 : 1}
                />
              )}
            </React.Fragment>
          );
        })}

        {driverCoords && !isNaN(parseFloat(driverCoords.latitude)) && !isNaN(parseFloat(driverCoords.longitude)) && (
          <Marker
            coordinate={{
              latitude: parseFloat(driverCoords.latitude),
              longitude: parseFloat(driverCoords.longitude)
            }}
            title="Your Vehicle Location"
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading || 0}
            flat={true}
            tracksViewChanges={true}
          >
            <View style={[styles.carMarkerWrapper, !isCorridorActive && { backgroundColor: "#6B7280" }]}>
              <View style={[styles.carMarkerBubble, !isCorridorActive && { backgroundColor: "#4B5563" }]}>
                <Ionicons name="navigate" size={17} color="#FFFFFF" />
              </View>
            </View>
          </Marker>
        )}

        {GOOGLE_MAPS_API_KEY && isValidMapCoordinate(driverCoords) && isValidMapCoordinate(targetHubForLine) && isCorridorActive && (
          <MapViewDirections
            origin={driverCoords}
            destination={targetHubForLine}
            apikey={GOOGLE_MAPS_API_KEY}
            mode="DRIVING"
            strokeColor="#059669"
            strokeWidth={5}
            lineCap="round"
            resetOnChange={false}
            onError={(message) => console.warn("Driver hub route directions failed:", message)}
          />
        )}
      </MapView>

      {targetHubForLine && typeof currentDriverDistance === "number" && (
        <View style={styles.persistentDistanceBanner}>
          <Ionicons name="navigate" size={14} color={isCorridorActive ? "#059669" : "#6B7280"} style={{ marginRight: 6 }} />
          <Text style={styles.persistentDistanceText}>
            Distance to <Text style={styles.boldText}>{targetHubForLine.name || "Hub"}</Text>:{" "}
            <Text style={[styles.boldText, { color: !isCorridorActive ? "#6B7280" : currentDriverDistance <= 2.0 ? "#059669" : "#EF4444" }]}>
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

// ------------------------------------------------------------------
// STANDARD RIDE DISPATCH OFFER MODAL
// ------------------------------------------------------------------
const StandardOfferModal = ({ offer, onAccept, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(offer?.expiresInSeconds || 20);

  useEffect(() => {
    if (!offer) return;
    setTimeLeft(offer.expiresInSeconds || 20);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offer]);

  if (!offer) return null;

  return (
    <Modal transparent animationType="slide" visible={!!offer}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeaderRow}>
            <View style={styles.livePulseDot} />
            <Text style={styles.modalHeaderTitle}>STANDARD RIDE DISPATCH ({timeLeft}s)</Text>
          </View>

          <Text style={styles.modalFareText}>{offer.fare || "ETB 150"}</Text>
          
          <Text style={styles.modalCorridorText}>
            {offer.routeText || offer.destinationName || "On-Demand Direct Trip"}
          </Text>
          
          <View style={styles.modalDistanceBadge}>
            <Ionicons name="location" size={14} color="#2563EB" />
            <Text style={styles.modalDistanceText}>{offer.distanceKm || "1.2"} km to pickup</Text>
          </View>

          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalDeclineButton} onPress={onDecline}>
              <Text style={styles.modalDeclineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalAcceptButton} onPress={() => onAccept(offer)}>
              <Text style={styles.modalAcceptText}>Accept Request</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function CreateCorridorScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const currentDriverId = user?.id || user?.user_id || null;
  const activeVehicleId = user?.vehicle_id || user?.vehicleId || 1;

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const userRole = user?.role || "driver";
  const userName = user?.name || user?.full_name || "Driver";

  const [isOnline, setIsOnline] = useState(false);
  const [operatingMode, setOperatingMode] = useState("STANDARD");
  
  const isStandardActive = isOnline && operatingMode === "STANDARD";
  const isCorridorActive = isOnline && operatingMode === "CORRIDOR";

  const [currentOffer, setCurrentOffer] = useState(null);
  const socketRef = useRef(null);

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [capacity] = useState(4);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [currentHub, setCurrentHub] = useState(null);
  const [nearestHub] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [heading, setHeading] = useState(0);

  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [allHubs, setAllHubs] = useState([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [hubsLoadError, setHubsLoadError] = useState(false);
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

  const handleToggleOnline = (value) => {
    setIsOnline(value);
    if (!value) {
      setSelectedRoute(null);
      setCurrentOffer(null);
    }
  };

  const handleModeSwitch = (newMode) => {
    if (selectedRoute) setSelectedRoute(null);
    if (currentOffer) setCurrentOffer(null);
    setOperatingMode(newMode);
  };

  useEffect(() => {
    if (!currentDriverId || !isStandardActive) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setCurrentOffer(null);
      return;
    }

    socketRef.current = io(API_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

    socketRef.current.on("connect", () => {
      socketRef.current.emit("register_driver_channel", { driverId: currentDriverId });
    });

    socketRef.current.on("new_ride_offer", (offerData) => {
      try {
        playSound("1.mp3");
      } catch (soundErr) {
        console.warn("Audio warning:", soundErr);
      }
      setCurrentOffer(offerData);
    });

    socketRef.current.on("offer_retracted", ({ rideId, ride_id }) => {
      const retractedRideId = rideId || ride_id;
      setCurrentOffer((offer) =>
        String(offer?.rideId || offer?.ride_id || offer?.id) === String(retractedRideId)
          ? null
          : offer
      );
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off("connect");
        socketRef.current.off("new_ride_offer");
        socketRef.current.off("offer_retracted");
        socketRef.current.disconnect();
      }
    };
  }, [isStandardActive, currentDriverId]);

  const sendLocationPing = async (coords, headingVal) => {
    if (!currentDriverId || !isOnline) return;

    try {
      await fetch(`${API_URL}/api/drivers/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          lat: parseFloat(coords.latitude),
          lng: parseFloat(coords.longitude),
          heading: parseFloat(headingVal) || 0,
          status: isOnline ? "online" : "offline",
          operating_mode: operatingMode,
        }),
      });
    } catch (err) {
      console.log("❌ Driver ping error:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let locationSubscription;
    let headingSubscription;

    async function setupLocationTracking() {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (isMounted) {
            setCurrentRegion(null);
            setDriverCoords(null);
            setLoadingLocation(false);
          }
          return;
        }

        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isMounted && location) {
          const coords = {
            latitude: parseFloat(location.coords.latitude),
            longitude: parseFloat(location.coords.longitude),
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          };
          setCurrentRegion(coords);
          setDriverCoords(coords);
          prevLocRef.current = coords;
        }

        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (newLoc) => {
            if (isMounted && newLoc) {
              const newCoord = {
                latitude: parseFloat(newLoc.coords.latitude),
                longitude: parseFloat(newLoc.coords.longitude),
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              };

              let computedHeading = heading;
              if (prevLocRef.current) {
                computedHeading = calculateBearing(
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

              sendLocationPing(newCoord, computedHeading);
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
        if (isMounted) console.error("Driver GPS initialization failed:", error);
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
  }, [isOnline, operatingMode]);

  useEffect(() => {
    if (!currentHub?.name) return;

    const normalizedHub = currentHub.name.toLowerCase().trim();
    const socket = io(API_URL, {
      transports: ["websocket"],
      autoConnect: true,
    });

    socket.on("connect", () => {
      socket.emit("join_hub", { hub_name: normalizedHub });
    });

    const handleFullRefresh = (updatedCorridors) => {
      if (Array.isArray(updatedCorridors)) {
        setPredefinedCorridors(updatedCorridors);
      }
    };

    socket.on("hub_corridors_updated", handleFullRefresh);
    socket.on("queue_update", handleFullRefresh);

    socket.on("seat_updated", (data) => {
      setPredefinedCorridors((prevCorridors) =>
        prevCorridors.map((route) => {
          const isTargetRoute = String(route.route_id || route.id) === String(data.route_id);
          if (!isTargetRoute) return route;

          let currentQueue = Number(route.driver_queue_count ?? 0);
          if (data.queue_id || data.driver_id) {
            currentQueue = data.status === "queued" ? currentQueue + 1 : Math.max(0, currentQueue - 1);
          }

          return {
            ...route,
            available_seats: data.available_seats !== undefined ? data.available_seats : route.available_seats,
            capacity: data.total_seats !== undefined ? data.total_seats : (route.capacity ?? 4),
            driver_queue_count: currentQueue,
          };
        })
      );
    });

    return () => {
      socket.off("connect");
      socket.off("hub_corridors_updated");
      socket.off("queue_update");
      socket.off("seat_updated");
      socket.disconnect();
    };
  }, [currentHub?.name]);

  useEffect(() => {
    let isMounted = true;

    async function fetchAllHubs() {
      try {
        const res = await fetch(`${API_URL}/api/hubs`);
        if (!res.ok) {
          throw new Error(`Hub request failed with status ${res.status}.`);
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Hub request returned an invalid response.");
        }

        const sanitizedHubs = data.map(h => ({
          ...h,
          latitude: parseFloat(h.latitude),
          longitude: parseFloat(h.longitude)
        }));
        if (isMounted) {
          setAllHubs(sanitizedHubs);
          setHubsLoadError(false);
        }
      } catch (err) {
        console.error("Failed to fetch nearby hubs:", err);
        if (isMounted) {
          setAllHubs([]);
          setHubsLoadError(true);
        }
      } finally {
        if (isMounted) setLoadingHubs(false);
      }
    }

    fetchAllHubs();

    return () => {
      isMounted = false;
    };
  }, []);

  const topHubs = useMemo(() => {
    if (!driverCoords || allHubs.length === 0) {
      return allHubs.slice(0, 4);
    }

    return allHubs
      .map(hub => {
        const coordinate = toMapCoordinate(hub.latitude, hub.longitude);
        if (!coordinate) return null;
        return {
          ...hub,
          ...coordinate,
          distanceKm: getDistanceFromLatLonInKm(
            driverCoords.latitude,
            driverCoords.longitude,
            coordinate.latitude,
            coordinate.longitude
          )
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 4);
  }, [allHubs, driverCoords]);

  const handleHubSelection = useCallback(async (hub) => {
    if (!hub || !hub.id) return;

    setCurrentHub(hub);
    setSelectedRoute(null);
    setLoadingCorridors(true);
    
    try {
      const corridorUrl = `${API_URL}/api/routes/from/${hub.id}`;
      const [corridorRes, requestsRes] = await Promise.all([
        fetch(corridorUrl),
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

  useEffect(() => {
    if (topHubs.length > 0 && !currentHub) {
      handleHubSelection(topHubs[0]);
    }
  }, [topHubs, handleHubSelection]);

  const handleAcceptStandardOffer = async (offerParam) => {
    const isEvent = offerParam && offerParam.nativeEvent;
    const offer = (!isEvent && offerParam) ? offerParam : currentOffer;

    if (!offer) {
      Alert.alert("Notice", "No active offer available to accept.");
      return;
    }

    const passengerUserId = offer.userId || offer.user_id || offer.passenger_id;
    const targetRideId = offer.rideId || offer.ride_id || offer.id;

    if (!currentDriverId) {
      Alert.alert("Session Error", "Driver ID missing from auth state.");
      return;
    }

    if (!targetRideId) {
      Alert.alert("Offer Error", "Missing ride identifier in offer.");
      return;
    }

    const targetUrl = `${API_URL}/api/rides/solo/accept`;
    const payload = { 
      ...(passengerUserId ? { user_id: passengerUserId } : {}),
      ride_id: targetRideId, 
      driver_id: currentDriverId 
    };

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setCurrentOffer(null);
        navigation.navigate("DriverEnRoute", { 
          ride: {
            ...data.ride,
            passenger_name: data.passenger?.full_name,
            passenger_phone: data.passenger?.phone_number,
          },
          rideId: data.ride_id || data.ride?.id || targetRideId,
          driverId: currentDriverId,
          passengerId: data.ride?.user_id || passengerUserId
        });
      } else {
        Alert.alert("Offer Claimed", data.message || "Ride request is no longer available.");
        setCurrentOffer(null);
      }
    } catch (err) {
      Alert.alert("Connection Error", `Dispatch Error: ${err.message}`);
    }
  };

  let currentDriverDistance = null;
  if (isValidMapCoordinate(driverCoords) && currentHub) {
    const currentHubCoordinate = toMapCoordinate(currentHub.latitude, currentHub.longitude);
    if (currentHubCoordinate) {
      currentDriverDistance = getDistanceFromLatLonInKm(
        driverCoords.latitude,
        driverCoords.longitude,
        currentHubCoordinate.latitude,
        currentHubCoordinate.longitude
      );
    }
  }

  const ALLOWED_RANGE_KM = 2.0;
  const isInRangeOfSelected = currentDriverDistance !== null && currentDriverDistance <= ALLOWED_RANGE_KM;

  const handleGoOnlineCorridor = async () => {
    if (!isOnline) {
      Alert.alert("Status Offline", "Toggle your status to ONLINE at the top before starting.");
      return;
    }

    if (operatingMode !== "CORRIDOR") {
      Alert.alert("Mode Mismatch", "Switch to 'Corridor Pool' mode to launch a shared trip.");
      return;
    }

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
        `You are currently ~${currentDriverDistance !== null ? currentDriverDistance.toFixed(2) : "?"} km away from ${currentHub.name}. You must be within ${ALLOWED_RANGE_KM} km of the hub boundary to launch.`
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
          route_id: selectedRoute.route_id || selectedRoute.id,
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
      playSound("1.mp3");
      navigation.navigate("WaitingForRiders", { 
        driverId: currentDriverId,
        routeId: selectedRoute.route_id || selectedRoute.id,
        rideOfferId: data.ride_id,
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

  if (loadingLocation || !currentRegion) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]} edges={["top", "right", "bottom", "left"]}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.loadingText}>Detecting your location & profiles...</Text>
      </SafeAreaView>
    );
  }

  const targetHubForLine = currentHub || nearestHub;

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left"]}>
      <StandardOfferModal 
        offer={currentOffer} 
        onAccept={handleAcceptStandardOffer} 
        onDecline={() => setCurrentOffer(null)} 
      />

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
          isCorridorActive={isCorridorActive}
        />
      </View>

      {/* TOP FLOATING HEADER */}
      <View style={styles.topFloatingHeader}>
        <View style={styles.headerLeftCluster}>
          <TouchableOpacity 
            style={styles.hamburgerButton} 
            onPress={() => setIsDrawerOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="menu" size={22} color="#111111" />
          </TouchableOpacity>
        </View>

        <View style={styles.toggleContainer}>
          <Text style={[styles.toggleLabelText, { color: isOnline ? "#059669" : "#DC2626" }]}>
            {isOnline ? "ONLINE" : "OFFLINE"}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: "#ee2222", true: "#A7F3D0" }}
            thumbColor={isOnline ? "#059669" : "#DC2626"}
          />
        </View>
      </View>

      {/* SLIDING DRAWER PANEL */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          
          {/* OPERATING MODE SELECTOR */}
          <View style={styles.modeSegmentContainer}>
            <TouchableOpacity
              style={[
                styles.modeSegment, 
                operatingMode === "STANDARD" && styles.modeSegmentActive,
                !isOnline && styles.modeSegmentDisabled
              ]}
              onPress={() => handleModeSwitch("STANDARD")}
              disabled={!isOnline}
            >
              <Ionicons 
                name="car-outline" 
                size={16} 
                color={operatingMode === "STANDARD" && isOnline ? "#059669" : "#6B7280"} 
              />
              <Text style={[
                styles.modeText, 
                operatingMode === "STANDARD" && isOnline && styles.modeTextActive
              ]}>
                Standard Ride
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeSegment, 
                operatingMode === "CORRIDOR" && styles.modeSegmentActive,
                !isOnline && styles.modeSegmentDisabled
              ]}
              onPress={() => handleModeSwitch("CORRIDOR")}
              disabled={!isOnline}
            >
              <MaterialCommunityIcons 
                name="bus-side" 
                size={16} 
                color={operatingMode === "CORRIDOR" && isOnline ? "#059669" : "#6B7280"} 
              />
              <Text style={[
                styles.modeText, 
                operatingMode === "CORRIDOR" && isOnline && styles.modeTextActive
              ]}>
                Corridor Pool
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Top 4 Nearest Hubs</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {!isOnline 
                  ? "Toggle switch to ONLINE to configure trip" 
                  : operatingMode === "STANDARD"
                  ? "Standard Mode: Listening for direct ride requests..."
                  : currentHub ? `Active: ${currentHub.name}` : "Select a nearby hub"}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, isCorridorActive && isInRangeOfSelected ? styles.badgeArrived : styles.badgeOutOfRange]}>
                <Text style={[styles.badgeText, (!isCorridorActive || !isInRangeOfSelected) && { color: "#EF4444" }]}>
                  {!isOnline ? "OFFLINE" : operatingMode === "STANDARD" ? "STANDARD" : isInRangeOfSelected ? "IN RANGE" : "OUT OF RANGE"}
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
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {!isOnline ? (
            <View style={styles.noticeBanner}>
              <Ionicons name="cloud-offline-outline" size={18} color="#4B5563" />
              <Text style={styles.noticeBannerText}>
                You are currently OFFLINE. Toggle ONLINE above to select modes and begin dispatching.
              </Text>
            </View>
          ) : operatingMode === "STANDARD" ? (
            <View style={styles.standardInfoContainer}>
              <View style={styles.radarPingBanner}>
                <View style={styles.livePulseDot} />
                <Text style={styles.radarPingTitle}>Radar Online & Scanning</Text>
              </View>
              <Text style={styles.standardInfoDesc}>
                You are broadcasting availability for direct point-to-point ride requests. Keep your app open to receive immediate alerts when passengers request a ride nearby.
              </Text>
              
              <View style={styles.standardMetricsGrid}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Radius</Text>
                  <Text style={styles.metricVal}>2.5 km</Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Status</Text>
                  <Text style={[styles.metricVal, { color: "#059669" }]}>Listening</Text>
                </View>
              </View>
            </View>
          ) : null}

          <>
            {/* HUB CHIPS HORIZONTAL SCROLL */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hubChipsScroll}>
              {loadingHubs ? (
                <Text style={styles.emptyText}>Loading nearby hubs...</Text>
              ) : hubsLoadError ? (
                <Text style={styles.emptyText}>Could not load nearby hubs. Please try again later.</Text>
              ) : topHubs.length === 0 ? (
                <Text style={styles.emptyText}>No nearby hubs available.</Text>
              ) : null}
              {topHubs.map((hub) => {
                const isSelected = currentHub && currentHub.id === hub.id;
                const distStr = hub.distanceKm !== undefined ? `${hub.distanceKm.toFixed(1)} km` : "";
                return (
                  <TouchableOpacity
                    key={`hub-chip-${hub.id}`}
                    style={[
                      styles.hubChip,
                      isSelected && styles.hubChipSelected,
                      !isCorridorActive && styles.hubChipDisabled
                    ]}
                    onPress={() => isCorridorActive && handleHubSelection(hub)}
                    disabled={!isCorridorActive}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="location"
                      size={14}
                      color={isSelected && isCorridorActive ? "#FFFFFF" : isCorridorActive ? "#059669" : "#9CA3AF"}
                    />
                    <Text style={[
                      styles.hubChipText,
                      isSelected && styles.hubChipTextSelected,
                      !isCorridorActive && styles.hubChipTextDisabled
                    ]}>
                      {hub.name} {distStr ? `(${distStr})` : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* CORRIDOR SECTION & ROUTES LIST */}
            <View style={styles.corridorSection}>
              <Text style={styles.sectionHeadingLabel}>
                Available Corridors from {currentHub ? currentHub.name : "Hub"}
              </Text>

              {loadingCorridors ? (
                <View style={styles.inlineLoader}>
                  <ActivityIndicator size="small" color="#059669" />
                  <Text style={styles.inlineLoaderText}>Loading active corridors...</Text>
                </View>
              ) : predefinedCorridors.length === 0 ? (
                <Text style={styles.emptyText}>No active routes configured for this hub yet.</Text>
              ) : (
                predefinedCorridors.map((route, idx) => {
                    const rId = route.route_id || route.id;
                    const isRouteSelected = selectedRoute && (selectedRoute.route_id === rId || selectedRoute.id === rId);
                    
                    const pickupName = route.pickup_hub_name || currentHub?.name || "Start";
                    const passThroughName = route.pass_through_name; 
                    const destinationName = route.destination_name || "Destination";

                    const routeDisplayName = passThroughName 
                      ? `${pickupName} ➔ ${passThroughName} ➔ ${destinationName}`
                      : (route.name || route.route_name || `${pickupName} ➔ ${destinationName}`);
                    
                    const totalCapacity = route.capacity || route.total_seats || 4;
                    const availableSeats = route.available_seats !== undefined ? route.available_seats : totalCapacity;
                    const basePrice = route.recommended_base_price || route.fare || 150;
                    const queueCount = route.driver_queue_count || 0;
                    const waitingPassengers = route.waiting_passengers || passengerRequests.length || 0;
                    const dynamicWaitTime = route.estimated_wait || (waitingPassengers > 0 ? "~3 mins" : "~5 mins");
                    const offerStatus = route.status || null;

                    return (
                      <TouchableOpacity
                        key={`route-${rId || idx}`}
                        style={[
                          styles.corridorCard,
                          isRouteSelected && styles.corridorCardSelected,
                          !isCorridorActive && styles.corridorCardDisabled,
                        ]}
                        onPress={() => isCorridorActive && setSelectedRoute(route)}
                        disabled={!isCorridorActive}
                      >
                        <View style={styles.corridorCardHeader}>
                          <View style={styles.routeTitleContainer}>
                            <Ionicons
                              name="git-commit-outline"
                              size={18}
                              color={isRouteSelected ? "#059669" : "#374151"}
                            />
                            {/* Full text visibility with 2 lines */}
                            <Text style={styles.corridorRouteName} numberOfLines={2}>
                              {routeDisplayName}
                            </Text>
                          </View>
                          <View style={styles.priceBadge}>
                            <Text style={styles.priceBadgeText}>{basePrice} ETB</Text>
                          </View>
                        </View>

                        {route.description ? (
                          <Text style={styles.corridorDescription}>{route.description}</Text>
                        ) : null}

                        <View style={styles.corridorMetaRow}>
                          <View style={styles.metaItem}>
                            <Ionicons name="car-outline" size={14} color="#6B7280" style={{ marginRight: 4 }} />
                            <Text style={styles.metaText}>
                              Seats: <Text style={styles.boldText}>{availableSeats}/{totalCapacity}</Text>
                            </Text>
                          </View>

                          {offerStatus && (
                            <View style={styles.statusBadge}>
                              <Text style={styles.statusBadgeText}>{offerStatus}</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.queueStatsFooter}>
                          <View style={styles.queueInfoBadge}>
                            <Ionicons name="car-sport-outline" size={14} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={styles.queueInfoText}>
                              Drivers: <Text style={styles.boldText}>{queueCount}</Text>
                            </Text>
                          </View>

                          <View style={[styles.queueInfoBadge, waitingPassengers > 0 && styles.demandBadgeActive]}>
                            <Ionicons
                              name="people-outline"
                              size={14}
                              color={waitingPassengers > 0 ? "#059669" : "#6B7280"}
                              style={{ marginRight: 4 }}
                            />
                            <Text style={styles.queueInfoText}>
                              Waiting:{" "}
                              <Text style={[styles.boldText, waitingPassengers > 0 && { color: "#059669" }]}>
                                {waitingPassengers} pax
                              </Text>
                            </Text>
                          </View>

                          <View style={styles.queueInfoBadge}>
                            <Ionicons name="time-outline" size={14} color="#6B7280" style={{ marginRight: 4 }} />
                            <Text style={styles.queueInfoText}>
                              Wait: <Text style={styles.boldText}>{dynamicWaitTime}</Text>
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                })
              )}
            </View>
          </>
        </ScrollView>
      </View>

      {/* FIXED STICKY FOOTER BUTTON */}
      <View style={[styles.stickyFooterContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[
            styles.launchButton,
            (!isCorridorActive || !selectedRoute || isPublishing) && styles.launchButtonDisabled,
          ]}
          onPress={handleGoOnlineCorridor}
          disabled={!isCorridorActive || !selectedRoute || isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="rocket-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.launchButtonText}>Launch Corridor Pool</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {isDrawerOpen && (
        <CorridorDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          navigation={navigation}
          userName={userName}
          userRole={userRole}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#4B5563",
    fontSize: 14,
  },
  mapContainer: {
    flex: 1,
  },
  topFloatingHeader: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  headerLeftCluster: {
    flexDirection: "row",
    alignItems: "center",
  },
  hamburgerButton: {
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleContainer: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleLabelText: {
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
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
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 9,
  },
  drawerExpanded: {
    height: height * 0.55,
  },
  drawerCollapsed: {
    height: 180,
  },
  dragHandleContainer: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    alignSelf: "center",
    marginBottom: 8,
  },
  modeSegmentContainer: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    padding: 3,
    marginBottom: 10,
  },
  modeSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeSegmentActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeSegmentDisabled: {
    opacity: 0.5,
  },
  modeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginLeft: 6,
  },
  modeTextActive: {
    color: "#059669",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLeftCluster: {
    flex: 1,
    marginRight: 10,
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
    paddingVertical: 4,
    borderRadius: 6,
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
    marginTop: 4,
  },
  expandToggleText: {
    fontSize: 11,
    color: "#6B7280",
    marginRight: 2,
  },
  drawerScrollBody: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
  },
  noticeBannerText: {
    fontSize: 12,
    color: "#4B5563",
    marginLeft: 8,
    flex: 1,
  },
  standardInfoContainer: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  radarPingBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#059669",
    marginRight: 6,
  },
  radarPingTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
  },
  standardInfoDesc: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
    marginBottom: 12,
  },
  standardMetricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  metricLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  hubChipsScroll: {
    marginBottom: 14,
  },
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
  },
  hubChipSelected: {
    backgroundColor: "#059669",
    borderColor: "#059669",
  },
  hubChipDisabled: {
    opacity: 0.5,
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  hubChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginLeft: 6,
  },
  hubChipTextSelected: {
    color: "#FFFFFF",
  },
  hubChipTextDisabled: {
    color: "#9CA3AF",
  },
  corridorSection: {
    marginTop: 4,
  },
  sectionHeadingLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 10,
  },
  inlineLoader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  inlineLoaderText: {
    marginLeft: 8,
    fontSize: 12,
    color: "#6B7280",
  },
  emptyText: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 20,
  },
  corridorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  corridorCardSelected: {
    borderColor: "#059669",
    backgroundColor: "#F0FDF4",
  },
  corridorCardDisabled: {
    opacity: 0.6,
    backgroundColor: "#F9FAFB",
    borderColor: "#E5E7EB",
  },
  corridorCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  routeTitleContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    marginRight: 8,
  },
  corridorRouteName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginLeft: 6,
    flex: 1,
    lineHeight: 18,
  },
  priceBadge: {
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priceBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
  },
  corridorDescription: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 6,
  },
  corridorMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 11,
    color: "#4B5563",
  },
  boldText: {
    fontWeight: "700",
    color: "#111827",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B45309",
  },
  queueStatsFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 8,
  },
  queueInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  demandBadgeActive: {
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  queueInfoText: {
    fontSize: 11,
    color: "#4B5563",
  },
  stickyFooterContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    zIndex: 11,
  },
  launchButton: {
    backgroundColor: "#059669",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  launchButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  launchButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  destinationHalo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(5, 150, 105, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  targetBadge: {
    position: "absolute",
    top: -18,
    backgroundColor: "#059669",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  targetBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  destinationBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#059669",
  },
  carMarkerWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  carMarkerBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#047857",
    justifyContent: "center",
    alignItems: "center",
  },
  persistentDistanceBanner: {
    position: "absolute",
    top: 110,
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  persistentDistanceText: {
    fontSize: 12,
    color: "#374151",
  },
  radarToggleFloatingButton: {
    position: "absolute",
    top: 110,
    right: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  radarToggleText: {
    fontSize: 11,
    color: "#6B7280",
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 35,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  modalHeaderTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },
  modalFareText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  modalCorridorText: {
    fontSize: 14,
    color: "#4B5563",
    marginBottom: 12,
  },
  modalDistanceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
    marginBottom: 20,
  },
  modalDistanceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
    marginLeft: 6,
  },
  modalButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modalDeclineButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginRight: 8,
  },
  modalDeclineText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4B5563",
  },
  modalAcceptButton: {
    flex: 1,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginLeft: 8,
  },
  modalAcceptText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});