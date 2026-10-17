import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Animated,
  PanResponder,
} from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import * as Location from "expo-location";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";
import { playSound } from "../../utils/soundPlayer"; // 👈 1. Import sound player here
import { isValidMapCoordinate, toMapCoordinate } from "../../utils/mapCoordinates";

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");
const API_URL = `${API_BASE_URL}/api`;

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const { height } = Dimensions.get("window");

async function readJsonResponse(response, action) {
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    const detail = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(
      `${action} returned a non-JSON response (HTTP ${response.status}). ${
        detail || "Check the API URL and server deployment."
      }`
    );
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${action} returned invalid JSON (HTTP ${response.status}).`);
  }
}

function parsePassengerIds(value) {
  if (Array.isArray(value)) {
    return value.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger);
  }
  if (typeof value === "string") {
    return value
      .replace(/[{}\[\]]/g, "")
      .split(",")
      .map((id) => Number.parseInt(id.trim(), 10))
      .filter(Number.isInteger);
  }
  return [];
}

// Distance calculation utility (Haversine formula)
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function TripInProgressScreen({ navigation, route }) {
  const mapRef = useRef(null);
  const lastLocationRef = useRef(null);
  const lastGpsUpdateRef = useRef(0);
  const distanceTravelledRef = useRef(0);
  const hasFittedMapRef = useRef(false);
  const lastFittedDestinationRef = useRef(null);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const currentDriverId = route?.params?.driverId || user?.id || user?.driver_id;
  const routeId = route?.params?.routeId || route?.params?.route_id || null;
  const rideOfferId =
    route?.params?.rideOfferId ||
    route?.params?.ride_offer_id ||
    route?.params?.rideId ||
    null;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passengerStates, setPassengerStates] = useState([]);
  const [acceptedPassengerCount, setAcceptedPassengerCount] = useState(null);
  const [rideMetrics, setRideMetrics] = useState(null);
  const [mapHubData, setMapHubData] = useState(null);
  const [liveDestinationData, setLiveDestinationData] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [distanceTravelledKm, setDistanceTravelledKm] = useState(0);
  const [routeEstimate, setRouteEstimate] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [routeError, setRouteError] = useState(null);

  // Map readiness state to ensure auto-centering fires reliably
  const [isMapReady, setIsMapReady] = useState(false);

  // Destination coordinates
  const resolvedDestination =
    toMapCoordinate(mapHubData?.end_latitude, mapHubData?.end_longitude) ||
    toMapCoordinate(liveDestinationData?.latitude, liveDestinationData?.longitude);
  const destinationLocation = resolvedDestination
    ? {
        ...resolvedDestination,
        name: mapHubData?.end_hub_name || liveDestinationData?.name || "Destination Hub",
      }
    : null;

  // Draggable trip details panel
  const [isExpanded, setIsExpanded] = useState(true);
  const translateY = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const panelCollapsedOffset = Math.min(height * 0.32, 250);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Animated.spring(translateY, { toValue: panelCollapsedOffset, useNativeDriver: true, bounciness: 4 }).start(() => setIsExpanded(false));
        } else if (gestureState.dy < -50 || gestureState.vy < -0.5) {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(() => setIsExpanded(true));
        } else {
          Animated.spring(translateY, { toValue: isExpanded ? 0 : panelCollapsedOffset, useNativeDriver: true, bounciness: 4 }).start();
        }
        panY.setValue(0);
      },
    })
  ).current;

  const togglePanelState = () => {
    Animated.spring(translateY, {
      toValue: isExpanded ? panelCollapsedOffset : 0,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
    setIsExpanded(!isExpanded);
  };

  // Resolve the route's hub coordinates once; live tracking provides a fallback.
  useEffect(() => {
    if (!currentDriverId && !rideOfferId) return;
    let isMounted = true;
    async function fetchMapCoordinates() {
      try {
        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const res = await fetch(`${API_URL}/rides/map_coordinates?${queryParam}`);
        const data = await readJsonResponse(res, "Destination lookup");
        if (res.ok && data.success && data.coordinates && isMounted) {
          setMapHubData(data.coordinates);
        } else if (!res.ok) {
          console.warn("Destination lookup failed:", data.error || res.status);
        }
      } catch (err) {
        console.error("Error fetching map coordinates:", err);
      }
    }
    fetchMapCoordinates();
    return () => {
      isMounted = false;
    };
  }, [currentDriverId, rideOfferId]);

  // Keep the map, remaining distance, and trip distance tied to the driver's GPS.
  useEffect(() => {
    let locationSubscription;
    let isMounted = true;

    async function startLocationUpdates() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || !isMounted) {
          setLocationError("Allow location access to track your trip and distance.");
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 5,
            timeInterval: 3000,
          },
          (location) => {
            const coordinate = toMapCoordinate(
              location.coords.latitude,
              location.coords.longitude
            );
            if (!coordinate) return;

            const previousLocation = lastLocationRef.current;
            if (previousLocation) {
              const segmentKm = calculateDistanceKm(
                previousLocation.latitude,
                previousLocation.longitude,
                coordinate.latitude,
                coordinate.longitude
              );
              if (segmentKm >= 0.003 && segmentKm <= 0.5) {
                distanceTravelledRef.current += segmentKm;
                setDistanceTravelledKm(distanceTravelledRef.current);
              }
            }

            lastLocationRef.current = coordinate;
            lastGpsUpdateRef.current = Date.now();
            setDriverLocation(coordinate);
            setLocationError(null);
          }
        );
      } catch (error) {
        console.error("Unable to start trip location tracking:", error);
        if (isMounted) setLocationError("Live location is unavailable. Check device GPS.");
      }
    }

    startLocationUpdates();
    return () => {
      isMounted = false;
      locationSubscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY && isValidMapCoordinate(driverLocation) && isValidMapCoordinate(destinationLocation)) {
      setRouteError("Driving directions are unavailable. Showing direct distance to the hub.");
    }
  }, [
    driverLocation?.latitude,
    driverLocation?.longitude,
    destinationLocation?.latitude,
    destinationLocation?.longitude,
  ]);

  // Standard north-up map framing with both the live driver and destination visible.
  const handleRecenterMap = (loc = driverLocation) => {
    if (mapRef.current && isValidMapCoordinate(loc) && isValidMapCoordinate(destinationLocation)) {
      mapRef.current.fitToCoordinates([loc, destinationLocation], {
        edgePadding: {
          top: 100,
          right: 48,
          bottom: Math.min(height * 0.52, 420),
          left: 48,
        },
        animated: true,
      });
    } else if (mapRef.current && isValidMapCoordinate(loc)) {
      mapRef.current.animateToRegion({
        ...loc,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }, 500);
    }
  };

  // Frame the complete route once per destination; don't fight manual map gestures.
  useEffect(() => {
    if (!isMapReady || !isValidMapCoordinate(driverLocation)) return;
    const destinationKey = isValidMapCoordinate(destinationLocation)
      ? `${destinationLocation.latitude},${destinationLocation.longitude}`
      : null;
    const destinationChanged = destinationKey && destinationKey !== lastFittedDestinationRef.current;
    if (!hasFittedMapRef.current || destinationChanged) {
      handleRecenterMap(driverLocation);
      hasFittedMapRef.current = true;
      if (destinationKey) lastFittedDestinationRef.current = destinationKey;
    }
  }, [
    isMapReady,
    driverLocation?.latitude,
    driverLocation?.longitude,
    destinationLocation?.latitude,
    destinationLocation?.longitude,
  ]);

  // Poll live tracking data
  useEffect(() => {
    let isMounted = true;
    async function pollLiveTransitData() {
      if (!rideOfferId) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/rides/track-live/offer/${rideOfferId}`);
        if (!res.ok) {
          if (isMounted) setLoading(false);
          return;
        }
        const data = await readJsonResponse(res, "Trip tracking");
        if (!data || !isMounted) return;

        setRideMetrics(data);
        const acceptedIds = parsePassengerIds(data.accepted_passengers);
        if (Array.isArray(data.accepted_passengers)) {
          setAcceptedPassengerCount(acceptedIds.length);
        }
        const fallbackDestination = data.destinationLocation;
        if (fallbackDestination && isMounted) {
          setLiveDestinationData({
            ...fallbackDestination,
            name: data.end_hub_name || data.destinationName || "Destination Hub",
          });
        }

        if (data.driverLocation && Date.now() - lastGpsUpdateRef.current > 10000) {
          const serverLocation = toMapCoordinate(
            data.driverLocation.latitude,
            data.driverLocation.longitude
          );
          if (serverLocation) setDriverLocation(serverLocation);
        }

        if (data.passengers && Array.isArray(data.passengers)) {
          const parsedPassengers = data.passengers.map((p) => ({
            id: parseInt(p.userId || p.user_id || p.id, 10),
            name: p.full_name || p.name || `Rider #${p.userId || p.id}`,
            phone: p.phone_number || "",
            rating: p.rating || "5.00",
            profilePhoto: p.profile_photo_url || "",
            status: (p.status || "in_trip").toLowerCase()
          }));
          const visiblePassengerIds = new Set(parsedPassengers.map((passenger) => passenger.id));
          acceptedIds.forEach((passengerId) => {
            if (!visiblePassengerIds.has(passengerId)) {
              parsedPassengers.push({
                id: passengerId,
                name: `Passenger ${passengerId}`,
                phone: "",
                rating: "5.00",
                profilePhoto: "",
                status: "in_trip",
              });
              visiblePassengerIds.add(passengerId);
            }
          });
          setPassengerStates(parsedPassengers);
        }
        setLoading(false);
      } catch (err) {
        console.log("Transit tracking error:", err);
        if (isMounted) setLoading(false);
      }
    }
    pollLiveTransitData();
    const transitInterval = setInterval(pollLiveTransitData, 3000);
    return () => {
      isMounted = false;
      clearInterval(transitInterval);
    };
  }, [rideOfferId, currentDriverId]);

  const handleCallPassenger = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert("Contact Unavailable", "Passenger has no registered phone number.");
      return;
    }
    Linking.openURL(`tel:${phoneNumber}`);
  };

  const handleFinishTrip = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/rides/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_id: currentDriverId,
          ride_offer_id: rideOfferId,
        }),
      });
      const result = await readJsonResponse(response, "Trip completion");
      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || "Could not complete this corridor trip.");
      }

      const resolvedRideOfferId = result.rideOffer?.id || rideOfferId;
      try {
        await playSound("7");
      } catch (soundError) {
        console.warn("Trip completion sound could not be played:", soundError);
      }

      navigation.replace("TripEarningsSummary", {
        rideOfferId: resolvedRideOfferId,
        driverId: currentDriverId,
        routeId,
        finalPrice: result.finalPrice,
        ridersCount: result.updatedRidersCount,
      });
    } catch (err) {
      console.error("Trip completion failed:", err);
      Alert.alert("Unable to Finish Trip", err.message || "Unable to reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centeredLoadingScreen} edges={["top", "right", "bottom", "left"]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading trip navigation...</Text>
      </SafeAreaView>
    );
  }

  const directDistanceKm = isValidMapCoordinate(driverLocation) && isValidMapCoordinate(destinationLocation)
    ? calculateDistanceKm(
        driverLocation.latitude,
        driverLocation.longitude,
        destinationLocation.latitude,
        destinationLocation.longitude
      )
    : null;
  const remainingDistanceKm = routeEstimate?.distance ?? directDistanceKm;
  const estimatedMinutes = routeEstimate?.duration ??
    (remainingDistanceKm !== null ? Math.max(1, Math.round((remainingDistanceKm / 25) * 60)) : null);
  const activeCount = passengerStates.length;
  const totalSeats = rideMetrics?.total_seats || mapHubData?.total_seats || 4;
  const rawPricePerSeat = rideMetrics?.price_per_seat ?? mapHubData?.price_per_seat;
  const pricePerSeat = rawPricePerSeat === null || rawPricePerSeat === undefined
    ? null
    : Number.parseFloat(rawPricePerSeat);
  const totalEarnings = pricePerSeat !== null && Number.isFinite(pricePerSeat)
    ? (acceptedPassengerCount ?? activeCount) * pricePerSeat
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "right", "left"]}>
      <View style={styles.headerBlock}>
        <View style={styles.statusBarIndicator}>
          <View style={styles.pulseLiveDot} />
          <View>
            <Text style={styles.headerTitleText}>Trip in progress</Text>
            <Text style={styles.headerSubtitle}>Navigation to {destinationLocation?.name || "destination"}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.gpsNavButton} onPress={() => handleRecenterMap()}>
          <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#2563EB" />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFillObject}
          customMapStyle={professionalRideMapStyle}
          showsBuildings={true}
          showsTraffic={true}
          rotateEnabled={false}
          pitchEnabled={false}
          zoomEnabled={true}
          scrollEnabled={true}
          compassEnabled={true}
          onMapReady={() => setIsMapReady(true)}
        >
          {/* Flat Directional Arrow Marker */}
          {isValidMapCoordinate(driverLocation) && (
            <Marker 
              coordinate={driverLocation} 
              anchor={{ x: 0.5, y: 0.5 }} 
              flat={false}
              zIndex={2}
            >
              <View style={styles.arrowMarkerHalo}>
                <View style={styles.arrowMarkerCore}>
                  <MaterialCommunityIcons name="navigation" size={19} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}

          {/* Destination Marker */}
          {isValidMapCoordinate(destinationLocation) && (
            <Marker coordinate={destinationLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={1}>
              <View style={styles.destPinBadge}>
                <Text style={styles.destPinText}>DROP-OFF</Text>
              </View>
            </Marker>
          )}

          {/* Navigation Route Line */}
          {GOOGLE_MAPS_API_KEY && isValidMapCoordinate(driverLocation) && isValidMapCoordinate(destinationLocation) && (
            <MapViewDirections
              origin={driverLocation}
              destination={destinationLocation}
              apikey={GOOGLE_MAPS_API_KEY}
              strokeWidth={5}
              strokeColor="#2563EB"
              onReady={(result) => {
                setRouteEstimate({ distance: result.distance, duration: result.duration });
                setRouteError(null);
              }}
              onError={(errorMessage) => {
                console.warn("Driving route could not be loaded:", errorMessage);
                setRouteEstimate(null);
                setRouteError("Driving route unavailable. Distance is estimated directly to the hub.");
              }}
            />
          )}
        </MapView>
        {locationError || routeError ? (
          <View style={styles.mapMessage}>
            <Ionicons name="information-circle-outline" size={16} color="#475569" />
            <Text style={styles.mapMessageText}>{locationError || routeError}</Text>
          </View>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.slidingPanelDrawer,
          {
            bottom: 78 + insets.bottom,
            height: Math.min(height * 0.44, 360),
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          <TouchableOpacity activeOpacity={0.9} onPress={togglePanelState} style={styles.dragHandleContainer}>
            <View style={styles.dragIndicatorBar} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          <View style={styles.transitStatusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerSubtitle}>DROP-OFF HUB</Text>
              <Text style={styles.transitStatusBannerText} numberOfLines={1}>
                {destinationLocation?.name || "Resolving destination hub…"}
              </Text>
            </View>
            <View style={styles.metricsBadgeColumn}>
              <Text style={styles.metricBadgeValue}>
                {remainingDistanceKm === null ? "--" : `${remainingDistanceKm.toFixed(1)} km`}
              </Text>
              <Text style={styles.metricBadgeSubLabel}>
                {estimatedMinutes === null ? "Route distance" : `~${estimatedMinutes} min remaining`}
              </Text>
            </View>
          </View>

          <View style={styles.distanceSummary}>
            <View style={styles.distanceMetric}>
              <MaterialCommunityIcons name="map-marker-distance" size={17} color="#2563EB" />
              <Text style={styles.distanceMetricLabel}>Driven</Text>
              <Text style={styles.distanceMetricValue}>{distanceTravelledKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.distanceMetricDivider} />
            <View style={styles.distanceMetric}>
              <MaterialCommunityIcons name="flag-outline" size={17} color="#059669" />
              <Text style={styles.distanceMetricLabel}>Remaining</Text>
              <Text style={styles.distanceMetricValue}>
                {remainingDistanceKm === null ? "--" : `${remainingDistanceKm.toFixed(1)} km`}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHeadingLabel}>On-Board Manifest Registry ({activeCount})</Text>
          <View style={styles.manifestContainer}>
            {passengerStates.length === 0 ? (
              <Text style={styles.emptyManifestText}>No active passengers signed into transit registry.</Text>
            ) : (
              passengerStates.map((passenger, index) => (
                <View key={`transit-rider-${passenger.id}-${index}`} style={styles.passengerRow}>
                  <View style={styles.passengerIdentityRow}>
                    {passenger.profilePhoto ? (
                      <Image source={{ uri: passenger.profilePhoto }} style={styles.avatarImage} />
                    ) : (
                      <View style={styles.avatarWrapperCircle}>
                        <FontAwesome5 name="user" size={11} color="#2563EB" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.passengerNameText} numberOfLines={1}>{passenger.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                        <Ionicons name="star" size={11} color="#F59E0B" />
                        <Text style={styles.passengerRatingText}>{passenger.rating}</Text>
                        {passenger.phone ? <Text style={styles.passengerPhoneText}> • {passenger.phone}</Text> : null}
                      </View>
                    </View>
                  </View>
                  <View style={styles.passengerRightCluster}>
                    <TouchableOpacity style={styles.callIconButton} onPress={() => handleCallPassenger(passenger.phone)}>
                      <Ionicons name="call" size={14} color="#10B981" />
                    </TouchableOpacity>
                    <View style={styles.transitBadgePill}>
                      <Text style={styles.transitBadgePillText}>IN TRIP</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionHeadingLabel}>Live Corridor Balance Ledger</Text>
          <View style={styles.ledgerCard}>
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Active Seats Occupied</Text>
              <Text style={styles.ledgerValue}>{activeCount} / {totalSeats} seats</Text>
            </View>
            <View style={styles.horizontalDivider} />
            <View style={styles.ledgerRow}>
              <Text style={styles.ledgerLabel}>Total passenger amount</Text>
              <Text style={styles.driverGainValue}>
                {totalEarnings === null ? "Loading..." : `ETB ${totalEarnings.toFixed(2)}`}
              </Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>

      <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[styles.actionCTAButton, submitting && { opacity: 0.6 }]}
          activeOpacity={0.85}
          disabled={submitting}
          onPress={handleFinishTrip}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="flag-checkered" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.actionCTAButtonText}>Finish corridor trip</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const professionalRideMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#F8FAFC" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748B" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#F1F5F9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#F1F5F9" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#CBD5E1" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#BAE6FD" }] }
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  centeredLoadingScreen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" },
  loadingText: { marginTop: 12, fontSize: 13, color: "#4B5563", fontWeight: "600" },
  
  headerBlock: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#E5E7EB", zIndex: 10 },
  statusBarIndicator: { flexDirection: "row", alignItems: "center" },
  pulseLiveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#10B981", marginRight: 10 },
  headerTitleText: { fontSize: 16, fontWeight: "800", color: "#111827" },
  headerSubtitle: { fontSize: 11, fontWeight: "500", color: "#64748B", marginTop: 2 },
  gpsNavButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "#EFF6FF", borderRadius: 20, borderWidth: 1, borderColor: "#BFDBFE" },
  
  mapContainer: { flex: 1, backgroundColor: "#E5E7EB" },
  mapMessage: { position: "absolute", top: 12, left: 16, right: 16, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255, 255, 255, 0.94)", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, gap: 7, elevation: 2 },
  mapMessageText: { flex: 1, color: "#475569", fontSize: 11, fontWeight: "600" },

  arrowMarkerHalo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(37, 99, 235, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  arrowMarkerCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#2563EB",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  
  destPinBadge: { backgroundColor: "#0284C7", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 2, borderColor: "#FFFFFF" },
  destPinText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  
  slidingPanelDrawer: { position: "absolute", left: 10, right: 10, backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 15, paddingTop: 5, borderWidth: 1, borderColor: "#E5E7EB", zIndex: 20, elevation: 8, overflow: "hidden" },
  dragHandleContainer: { width: "100%", alignItems: "center", paddingVertical: 10 },
  dragIndicatorBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1" },

  transitStatusBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#0F766E", borderRadius: 14, padding: 14, marginBottom: 10 },
  bannerSubtitle: { fontSize: 9, fontWeight: "800", color: "#99F6E4", letterSpacing: 0.8, marginBottom: 3 },
  transitStatusBannerText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  metricsBadgeColumn: { alignItems: "flex-end", paddingLeft: 12 },
  metricBadgeValue: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  metricBadgeSubLabel: { color: "#CCFBF1", fontSize: 10, fontWeight: "600", marginTop: 2 },

  distanceSummary: { flexDirection: "row", alignItems: "center", paddingHorizontal: 3, paddingVertical: 9, marginBottom: 14, backgroundColor: "#F8FAFC", borderRadius: 11, borderWidth: 1, borderColor: "#E2E8F0" },
  distanceMetric: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  distanceMetricLabel: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  distanceMetricValue: { color: "#0F172A", fontSize: 12, fontWeight: "800" },
  distanceMetricDivider: { width: 1, height: 22, backgroundColor: "#CBD5E1" },
  
  sectionHeadingLabel: { fontSize: 11, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, marginLeft: 2 },
  manifestContainer: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
  emptyManifestText: { paddingVertical: 16, textAlign: "center", color: "#9CA3AF", fontSize: 13 },
  passengerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6" },
  passengerIdentityRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  avatarWrapperCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#EFF6FF", justifyContent: "center", alignItems: "center", marginRight: 10 },
  avatarImage: { width: 32, height: 32, borderRadius: 16, marginRight: 10, backgroundColor: "#E5E7EB" },
  passengerNameText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  passengerRatingText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginLeft: 4 },
  passengerPhoneText: { fontSize: 11, color: "#9CA3AF" },
  
  passengerRightCluster: { flexDirection: "row", alignItems: "center" },
  callIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginRight: 8, borderWidth: 1, borderColor: "#A7F3D0" },
  transitBadgePill: { backgroundColor: "#EFF6FF", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "#BFDBFE" },
  transitBadgePillText: { color: "#2563EB", fontSize: 10, fontWeight: "700" },
  
  ledgerCard: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", paddingHorizontal: 14, marginBottom: 16 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  ledgerLabel: { fontSize: 13, color: "#4B5563", fontWeight: "500" },
  ledgerValue: { fontSize: 13, fontWeight: "700", color: "#111827" },
  driverGainValue: { fontSize: 15, fontWeight: "800", color: "#10B981" },
  horizontalDivider: { height: 1, backgroundColor: "#F3F4F6" },
  
  footerContainer: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderColor: "#E5E7EB", zIndex: 30 },
  actionCTAButton: { backgroundColor: "#0F766E", borderRadius: 13, minHeight: 52, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", elevation: 2 },
  actionCTAButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.2 }
});