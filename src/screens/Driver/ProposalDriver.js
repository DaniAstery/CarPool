import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../AuthContext";
import { playSound } from "../../utils/soundPlayer";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000/api";

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

export default function ProposalDriver({ navigation, route }) {
  const { user } = useAuth();
  const currentDriverId = user?.id || user?.driver_id;
  const rideOfferId = route?.params?.rideOfferId || null;
  
  const mapRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState({
    latitude: 9.0105,
    longitude: 38.7935,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });

  const [driverAccepted, setDriverAccepted] = useState(false);
  const [offerDetails, setOfferDetails] = useState(null);
  const [mapHubData, setMapHubData] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [poolPassengers, setPoolPassengers] = useState([]);
  const [strictlyAcceptedCount, setStrictlyAcceptedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(45);
  const [networkError, setNetworkError] = useState(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);

  const routeId = route?.params?.routeId || "1";
  const activeRideOfferIdRef = useRef(null);

  // 🎵 Sound Tracking Refs (Sound 1 for pool entrance, Sound 4 for accepted status transition)
  const acceptedSoundPlayedRef = useRef(new Set());
  const prevPoolLengthRef = useRef(0);
  const isInitialManifestLoad = useRef(true);

  // Financial and seat metrics pulled directly from map_coordinates endpoint data
  const pricePerSeat = mapHubData?.price_per_seat ? parseFloat(mapHubData.price_per_seat) : 80.0;
  const currentDriverPayout = strictlyAcceptedCount * pricePerSeat;
  
  const totalSeats = mapHubData?.total_seats ? parseInt(mapHubData.total_seats, 10) : 4;
  const availableSeats = Math.max(0, totalSeats - strictlyAcceptedCount);

  const hasMinimumRequiredPassengers = strictlyAcceptedCount >= 2;
  const isDriverButtonUnlocked = hasMinimumRequiredPassengers;
  const isOfferLockedIn =
    driverAccepted ||
    mapHubData?.status === "accepted" ||
    mapHubData?.status === "in_trip";

  // 📍 Resolved Hub Coordinates & Names from Dedicated Endpoint
  const startCoords = {
    latitude: parseFloat(mapHubData?.start_latitude || 9.0105),
    longitude: parseFloat(mapHubData?.start_longitude || 38.7935),
    name: mapHubData?.start_hub_name || "Pickup Terminal"
  };

  const endDestinationName = mapHubData?.end_hub_name || "Destination Terminal";

  // Compute live distance between device GPS and pickup hub in km
  const currentDriverDistance = currentLocation && startCoords
    ? getDistanceFromLatLonInKm(currentLocation.latitude, currentLocation.longitude, startCoords.latitude, startCoords.longitude)
    : null;

  // GPS Initializer & Live Watcher
  useEffect(() => {
    let locationSubscription = null;
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          setCurrentLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          });

          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 5 },
            (loc) => {
              setCurrentLocation({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                latitudeDelta: 0.015,
                longitudeDelta: 0.015,
              });
            }
          );
        }
      } catch (err) {
        console.log("GPS hardware error:", err);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, []);

  // Fetch Hub Names & Coordinates from Dedicated Endpoint
  useEffect(() => {
    if (!currentDriverId) return;

    async function fetchMapCoordinates() {
      try {
        const queryParam = rideOfferId ? `ride_offer_id=${rideOfferId}` : `driver_id=${currentDriverId}`;
        const res = await fetch(`${API_URL}/rides/map_coordinates?${queryParam}`);
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          return;
        }

        const data = await res.json();
        if (res.ok && data.success && data.coordinates) {
          setMapHubData(data.coordinates);
          activeRideOfferIdRef.current = data.coordinates.ride_offer_id;
        }
      } catch (err) {
        console.error("Error fetching map coordinates:", err);
      }
    }

    fetchMapCoordinates();
    const interval = setInterval(fetchMapCoordinates, 4000);
    return () => clearInterval(interval);
  }, [currentDriverId, rideOfferId]);

  // Fetch real road path geometry from OSRM public routing API
  useEffect(() => {
    if (!currentLocation?.latitude || !startCoords?.latitude) return;

    async function fetchRoadPath() {
      try {
        const url = `http://router.project-osrm.org/route/v1/driving/${currentLocation.longitude},${currentLocation.latitude};${startCoords.longitude},${startCoords.latitude}?overview=full&geometries=geojson`;
        
        const res = await fetch(url);
        const data = await res.json();

        if (data.routes && data.routes.length > 0) {
          const formattedCoords = data.routes[0].geometry.coordinates.map(coord => ({
            latitude: coord[1],
            longitude: coord[0]
          }));
          setRouteCoordinates(formattedCoords);
        } else {
          setRouteCoordinates([
            { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
            { latitude: startCoords.latitude, longitude: startCoords.latitude }
          ]);
        }
      } catch (err) {
        setRouteCoordinates([
          { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          { latitude: startCoords.latitude, longitude: startCoords.latitude }
        ]);
      }
    }

    fetchRoadPath();
  }, [currentLocation?.latitude, currentLocation?.longitude, startCoords?.latitude, startCoords?.longitude]);

  // Auto-fit map camera when location or pickup hub updates
  useEffect(() => {
    if (mapRef.current && currentLocation?.latitude && startCoords?.latitude) {
      const bottomPadding = isSheetCollapsed ? 150 : height * 0.45;
      mapRef.current.fitToCoordinates(
        [
          { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
          { latitude: startCoords.latitude, longitude: startCoords.longitude }
        ],
        {
          edgePadding: { top: 100, right: 60, bottom: bottomPadding, left: 60 },
          animated: true,
        }
      );
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, startCoords?.latitude, startCoords?.longitude, isSheetCollapsed]);

  const handleDriverTimeout = async () => {
    try {
      const offerId = mapHubData?.ride_offer_id || activeRideOfferIdRef.current;
      if (!offerId) return null;

      const res = await fetch(`${API_URL}/rides/driver-expired`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: offerId,
          driver_id: currentDriverId,
          route_id: routeId,
        }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      console.error("Error notifying backend of driver expiration:", err);
      return null;
    }
  };

  // Dispatch Timer
  useEffect(() => {
    if (!hasMinimumRequiredPassengers || isOfferLockedIn) return;

    if (timeLeft <= 0 && !driverAccepted) {
      handleDriverTimeout().then((result) => {
        const isQueueDeleted = result?.action === "deleted";

        Alert.alert(
          isQueueDeleted ? "Station Queue Expired" : "Offer Expired",
          isQueueDeleted
            ? "The dispatch window elapsed and no alternative drivers or active clusters remain. Returning to station setup."
            : "The dispatch window for this cluster has expired. Reassigning run.",
          [
            {
              text: "OK",
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ 
                    name: "CreateCorridor", 
                    params: { driverId: currentDriverId } 
                  }],
                });
              },
            },
          ]
        );
      });
      return;
    }

    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, hasMinimumRequiredPassengers, driverAccepted, isOfferLockedIn, currentDriverId, routeId, mapHubData]);

  // Live Database Polling for Manifest Registry
  useEffect(() => {
    if (!currentDriverId) return;

    async function syncDatabaseManifestState() {
      try {
        const url = `${API_URL}/rides/driver-proposal/${currentDriverId}`;
        const res = await fetch(url);
        
        // If proposal returns 404 or not found, ride offer has been removed/deleted
        if (res.status === 404 || !res.ok) {
          navigation.reset({
            index: 0,
            routes: [{ name: "CreateCorridor", params: { driverId: currentDriverId } }],
          });
          return;
        }

        const data = await res.json();
        setNetworkError(null);

        // If proposal data is empty, deleted, or expired, navigate back to CreateCorridor
        if (!data || (!data.hasActiveProposal && !data.id) || data.status === 'deleted' || data.status === 'expired') {
          navigation.reset({
            index: 0,
            routes: [{ name: "CreateCorridor", params: { driverId: currentDriverId } }],
          });
          return;
        }

        setOfferDetails(data);
        activeRideOfferIdRef.current = data.ride_offer_id || data.id;

        let cleanAcceptedIds = [];
        if (data.accepted_passengers) {
          if (Array.isArray(data.accepted_passengers)) {
            cleanAcceptedIds = data.accepted_passengers.map((id) => parseInt(id, 10));
          } else if (typeof data.accepted_passengers === "string") {
            cleanAcceptedIds = data.accepted_passengers
              .replace(/[{}]/g, "")
              .split(",")
              .map((id) => parseInt(id.trim(), 10))
              .filter((id) => !isNaN(id));
          }
        }

        let rawPoolArray = [];
        if (Array.isArray(data.passengers)) {
          rawPoolArray = data.passengers;
        } else if (Array.isArray(data.route_pool_passengers)) {
          rawPoolArray = data.route_pool_passengers;
        } else if (typeof data.route_pool_passengers === "string") {
          try {
            rawPoolArray = JSON.parse(data.route_pool_passengers);
          } catch (jsonErr) {
            console.error("Failed to parse pool JSON:", jsonErr);
          }
        }

        const cleanPoolArray = Array.isArray(rawPoolArray)
          ? rawPoolArray.filter((p) => p && (p.user_id !== null || p.id !== null))
          : [];

        const poolUserIds = cleanPoolArray.map((p) => parseInt(p.user_id || p.id, 10));

        const unifiedRoster = cleanPoolArray.map((rider) => {
          const userId = parseInt(rider.user_id || rider.id, 10);
          let rawDbStatus = rider?.status ? rider.status.toString().trim().toLowerCase() : "matched";
          let finalStatus = cleanAcceptedIds.includes(userId) ? "accepted" : rawDbStatus;
          const passengerName = rider?.passenger_name || rider?.full_name || rider?.name || `Passenger ${userId}`;

          return { user_id: userId, status: finalStatus, name: passengerName };
        });

        cleanAcceptedIds.forEach((acceptedId) => {
          if (!poolUserIds.includes(acceptedId)) {
            unifiedRoster.push({ user_id: acceptedId, status: "accepted", name: `Passenger ${acceptedId}` });
          }
        });

        const currentTotalPoolLength = unifiedRoster.length;

        // 🎵 SOUND TRIGGER 1: Play Sound "1" when new riders enter/increase in the matched pool
        if (!isInitialManifestLoad.current && currentTotalPoolLength > prevPoolLengthRef.current) {
          playSound("1");
        }
        prevPoolLengthRef.current = currentTotalPoolLength;
        isInitialManifestLoad.current = false;

        const acceptedCount = unifiedRoster.filter((p) => p.status === "accepted").length;
        setStrictlyAcceptedCount(acceptedCount);
        setPoolPassengers(unifiedRoster);

        const currentOfferStatus = data.status ? data.status.toString().trim().toLowerCase() : "";
        if (["accepted", "in_trip", "arrived"].includes(currentOfferStatus)) {
          setDriverAccepted(true);
          const payloadId = parseInt(data.ride_offer_id || data.id, 10);
          navigation.replace("NavigateToPickup", {
            routeId: data.route_id || routeId,
            route_id: data.route_id || routeId,
            rideOfferId: payloadId,
            ride_offer_id: payloadId,
            rideId: payloadId,
            driverId: currentDriverId,
          });
        }
      } catch (err) {
        console.error("Connection Error:", err.message);
        setNetworkError(`Cannot connect to host: ${API_URL}`);
      }
    }

    syncDatabaseManifestState();
    const pollInterval = setInterval(syncDatabaseManifestState, 3000);
    return () => clearInterval(pollInterval);
  }, [currentDriverId, routeId, navigation]);

  const handleDriverAccept = async () => {
    if (!currentDriverId) return;
    if (!isDriverButtonUnlocked || isOfferLockedIn || timeLeft <= 0) return;

    setDriverAccepted(true);
    try {
      const res = await fetch(`${API_URL}/rides/driver-accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ride_offer_id: activeRideOfferIdRef.current || mapHubData?.ride_offer_id,
          driver_id: currentDriverId,
        }),
      });
      
      const responseData = await res.json();
      if (res.ok && responseData.success) {
        const finalId = parseInt(responseData.rideOfferId || activeRideOfferIdRef.current || mapHubData?.ride_offer_id, 10);
        navigation.replace("NavigateToPickup", {
          routeId,
          route_id: routeId,
          rideOfferId: finalId,
          ride_offer_id: finalId,
          rideId: finalId,
          driverId: currentDriverId,
        });
          playSound("4"); // 🎵 SOUND TRIGGER 3: Play Sound "4" when driver successfully locks in the manifest
      } else {
        setDriverAccepted(false);
        Alert.alert("Dispatch Rejection", responseData.error || "Manifest cluster locked or changed.");
      }
    } catch (err) {
      setDriverAccepted(false);
      Alert.alert("Connection Failure", "Could not reach Corridor routing hub.");
    }
  };

  const handleDriverDecline = async () => {
    if (!currentDriverId) return;
    Alert.alert("Decline Dispatch Manifest?", "Rejecting this cluster removes you from the station queue.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline Run",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${API_URL}/rides/driver-decline`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                driver_id: currentDriverId,
                ride_offer_id: activeRideOfferIdRef.current || mapHubData?.ride_offer_id,
              }),
            });
          } catch (err) {
            console.log("Decline error:", err);
          }
          navigation.reset({
            index: 0,
            routes: [{ name: "CreateCorridor", params: { driverId: currentDriverId } }],
          });
        },
      },
    ]);
  };

  const renderStatusBadge = (status) => {
    const normStatus = (status || "matched").toLowerCase();
    if (normStatus === "accepted" || normStatus === "confirmed") {
      return <View style={[styles.badge, styles.badgeAccepted]}><Text style={[styles.badgeText, styles.textAccepted]}>Accepted</Text></View>;
    }
    if (normStatus === "arrived") {
      return <View style={[styles.badge, styles.badgeArrived]}><Text style={[styles.badgeText, styles.textArrived]}>Arrived</Text></View>;
    }
    return <View style={[styles.badge, styles.badgeMatched]}><Text style={[styles.badgeText, styles.textMatched]}>Matched</Text></View>;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Corridor Run Offer</Text>
        <View style={{ width: 24 }} />
      </View>

      {networkError && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color="#FFFFFF" />
          <Text style={styles.errorBannerText}>{networkError}</Text>
        </View>
      )}

      {/* 🗺️ MAP VIEW */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.mapView}
          initialRegion={currentLocation}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {/* 1. Driver GPS Location Marker */}
          {currentLocation?.latitude && currentLocation?.longitude && (
            <Marker coordinate={currentLocation} title="Your Vehicle Position" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
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

          {/* 2. Pickup Hub Terminal Marker */}
          {startCoords?.latitude && startCoords?.longitude && (
            <Marker coordinate={startCoords} title={startCoords.name} description="Assigned Pickup Hub Terminal" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={styles.driverPinnedContainer}>
                <View style={[styles.driverPinBadge, { backgroundColor: "#0284C7" }]}>
                  <Text style={styles.driverPinText}>PICKUP</Text>
                </View>
                <View style={[styles.glowingDriverHalo, { backgroundColor: "rgba(2, 132, 199, 0.15)", borderColor: "rgba(2, 132, 199, 0.4)" }]}>
                  <View style={[styles.driverMarkerBubble, { backgroundColor: "#0284C7" }]}>
                    <Ionicons name="location" size={16} color="#FFFFFF" />
                  </View>
                </View>
              </View>
            </Marker>
          )}

          {/* 3. 🔴 OSRM Road-Following Route Polyline */}
          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeWidth={5}
              strokeColor="#EF4444" 
              geodesic={true}
            />
          )}
        </MapView>

        {/* 📏 Distance Banner */}
        {currentDriverDistance !== null && (
          <View style={styles.persistentDistanceBanner}>
            <Ionicons name="navigate" size={14} color="#EF4444" style={{ marginRight: 6 }} />
            <Text style={styles.persistentDistanceText}>
              Distance to <Text style={styles.boldText}>{startCoords.name}</Text>:{" "}
              <Text style={[styles.boldText, { color: currentDriverDistance <= 2.0 ? "#10B981" : "#EF4444" }]}>
                {currentDriverDistance.toFixed(2)} km
              </Text>
            </Text>
          </View>
        )}
      </View>

      {/* 📱 Collapsible Bottom Sheet */}
      <View style={[styles.proposalCard, isSheetCollapsed && styles.proposalCardCollapsed]}>
        <TouchableOpacity 
          style={styles.dragHandleBarArea} 
          activeOpacity={0.8}
          onPress={() => setIsSheetCollapsed(!isSheetCollapsed)}
        >
          <View style={styles.dragHandleIndicator} />
          <View style={styles.collapseToggleRow}>
            <Text style={styles.collapseToggleTitle}>
              {isSheetCollapsed ? "Tap to view manifest & earnings details ↗" : "Swipe down or tap to expand map view ↙"}
            </Text>
            <Ionicons name={isSheetCollapsed ? "chevron-up" : "chevron-down"} size={18} color="#64748B" />
          </View>
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollSheetContent}>
          
          <View style={styles.priceTierCard}>
            <View style={styles.priceHeaderRow}>
              <Text style={styles.priceTierHeading}>CURRENT RUN DISPATCH PAYOUT</Text>
              <View style={styles.seatIndicatorBadge}>
                <Ionicons name="people-outline" size={12} color="#0369A1" />
                <Text style={styles.seatIndicatorText}>{`${availableSeats} / ${totalSeats} Seats Available`}</Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.mainPriceText}>
                {`ETB ${currentDriverPayout}.00`}
              </Text>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeText}>{`${strictlyAcceptedCount} Accepted`}</Text>
              </View>
            </View>
            <View style={styles.priceBreakdownBox}>
              <Text style={styles.breakdownText}>
                • Base Rate:{" "}
                <Text style={{ fontWeight: "700", color: "#10B981" }}>
                  {`ETB ${pricePerSeat}`}
                </Text>{" "}
                per accepted seat lock.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.timerBanner,
              !hasMinimumRequiredPassengers
                ? styles.timerWaiting
                : timeLeft < 15
                ? styles.timerUrgent
                : null,
            ]}
          >
            <MaterialCommunityIcons
              name={hasMinimumRequiredPassengers ? "clock-fast" : "account-clock-outline"}
              size={18}
              color={!hasMinimumRequiredPassengers ? "#6B7280" : timeLeft < 15 ? "#EF4444" : "#10B981"}
            />
            <Text
              style={[
                styles.timerText,
                !hasMinimumRequiredPassengers
                  ? { color: "#6B7280" }
                  : timeLeft < 15
                  ? { color: "#EF4444" }
                  : { color: "#10B981" },
              ]}
            >
              {!hasMinimumRequiredPassengers
                ? `Awaiting Passenger Thresholds (Need 2, got ${strictlyAcceptedCount})...`
                : driverAccepted
                ? "Locking Run..."
                : `Remaining Window to Accept: ${timeLeft}s`}
            </Text>
          </View>

          {/* Resolved Hub Names from Dedicated Endpoint */}
          <View style={styles.cardHeaderRow}>
            <View style={styles.locationPinCircle}>
              <Ionicons name="git-commit-sharp" size={20} color="#10B981" />
            </View>
            <View style={styles.locationTextWrapper}>
              <Text style={styles.locationTitle}>{startCoords.name}</Text>
              <Text style={styles.locationSubtitle}>{`Destination: ${endDestinationName}`}</Text>
            </View>
          </View>

          <Text style={styles.sectionHeading}>{`Manifest RoutePool Registry (${poolPassengers.length} Clustered)`}</Text>
          
          <View style={styles.statusTable}>
            {poolPassengers.length === 0 ? (
              <View style={{ paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ color: "#6B7280", fontSize: 13 }}>No passengers assigned to this run yet.</Text>
              </View>
            ) : (
              poolPassengers.map((passenger) => {
                const pId = parseInt(passenger.user_id || passenger.id, 10);
                const isAccepted = passenger.status === "accepted";

                // 🎵 SOUND TRIGGER 2: Play Sound "4" the exact moment this specific passenger becomes accepted
                if (isAccepted && !acceptedSoundPlayedRef.current.has(pId)) {
                  acceptedSoundPlayedRef.current.add(pId);
                  playSound("4");
                }

                return (
                  <View key={`manifest-rider-row-${pId}`} style={styles.tableRow}>
                    <View style={styles.tableUserLabelGroup}>
                      <Ionicons name="person-outline" size={14} color={isAccepted ? "#10B981" : "#0284C7"} />
                      <Text style={styles.tableUserText}>{passenger.name || `Passenger ${pId}`}</Text>
                    </View>
                    {renderStatusBadge(passenger.status)}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.actionButtonContainer}>
            <View style={styles.buttonButtonGroup}>
              <TouchableOpacity
                style={styles.declineButton}
                onPress={handleDriverDecline}
                activeOpacity={0.7}
                disabled={isOfferLockedIn}
              >
                <Text style={styles.declineButtonText}>DECLINE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.acceptButton,
                  !isDriverButtonUnlocked || (hasMinimumRequiredPassengers && timeLeft <= 0)
                    ? { backgroundColor: "#9CA3AF" }
                    : driverAccepted
                    ? { backgroundColor: "#059669" }
                    : { backgroundColor: "#10B981" },
                ]}
                onPress={handleDriverAccept}
                activeOpacity={0.8}
                disabled={!isDriverButtonUnlocked || (hasMinimumRequiredPassengers && timeLeft <= 0) || driverAccepted}
              >
                <Text style={styles.acceptButtonText}>
                  {driverAccepted
                    ? "LOCKING MANIFEST..."
                    : hasMinimumRequiredPassengers && timeLeft <= 0
                    ? "DISPATCH WINDOW ELAPSED"
                    : !isDriverButtonUnlocked
                    ? `AWAITING ACCEPTED (${strictlyAcceptedCount}/2)`
                    : `Accept [${currentDriverPayout} ETB]`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, backgroundColor: "#FFFFFF" },
  backButton: { fontSize: 24, fontWeight: "600", color: "#111111" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#111111" },
  errorBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#EF4444", paddingVertical: 6, paddingHorizontal: 12 },
  errorBannerText: { color: "#FFFFFF", fontSize: 11, fontWeight: "600", marginLeft: 6, textAlign: "center" },
  mapContainer: { flex: 1 },
  mapView: { ...StyleSheet.absoluteFillObject },

  // Clean Circular Pinned Marker Styles
  driverPinnedContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  driverPinBadge: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  driverPinText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  glowingDriverHalo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.4)",
  },
  driverMarkerBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },

  persistentDistanceBanner: { position: "absolute", top: 15, alignSelf: "center", backgroundColor: "#FFFFFF", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4, borderWidth: 1, borderColor: "#E2E8F0" },
  persistentDistanceText: { fontSize: 12, color: "#1E293B", fontWeight: "600" },
  boldText: { fontWeight: "800" },

  proposalCard: { position: "absolute", bottom: 0, width: width, maxHeight: "75%", backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 24, elevation: 10, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 10 },
  proposalCardCollapsed: { maxHeight: 90, overflow: "hidden" },
  dragHandleBarArea: { paddingVertical: 10, alignItems: "center" },
  dragHandleIndicator: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", marginBottom: 6 },
  collapseToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  collapseToggleTitle: { fontSize: 11, fontWeight: "700", color: "#64748B", marginRight: 4 },
  scrollSheetContent: { paddingBottom: 20 },
  priceTierCard: { backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  priceHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceTierHeading: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 0.5 },
  seatIndicatorBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#E0F2FE", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  seatIndicatorText: { fontSize: 10, fontWeight: "700", color: "#0369A1", marginLeft: 3 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  mainPriceText: { fontSize: 22, fontWeight: "800", color: "#111111" },
  tierBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tierBadgeText: { fontSize: 11, color: "#065F46", fontWeight: "700" },
  priceBreakdownBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8 },
  breakdownText: { fontSize: 12, color: "#4B5563", marginVertical: 2 },
  timerBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#E6F4EA", paddingVertical: 10, borderRadius: 10, marginBottom: 16 },
  timerWaiting: { backgroundColor: "#F3F4F6", borderWidth: 0.5, borderColor: "#D1D5DB" },
  timerUrgent: { backgroundColor: "#FEE2E2" },
  timerText: { fontSize: 13, color: "#059669", marginLeft: 6, fontWeight: "600" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  locationPinCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  locationTextWrapper: { flex: 1 },
  locationTitle: { fontSize: 15, fontWeight: "700" },
  locationSubtitle: { fontSize: 12, color: "#6B7280" },
  sectionHeading: { fontSize: 13, fontWeight: "700", marginBottom: 8 },
  statusTable: { marginBottom: 16 },
  tableRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#F3F4F6" },
  tableUserLabelGroup: { flexDirection: "row", alignItems: "center" },
  tableUserText: { fontSize: 13, marginLeft: 10, fontWeight: "500" },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, minWidth: 95, alignItems: "center" },
  badgeMatched: { backgroundColor: "#E0F2FE" },
  badgeAccepted: { backgroundColor: "#ECFDF5" },
  badgeArrived: { backgroundColor: "#FEF3C7" },
  badgeText: { fontSize: 12, fontWeight: "600" },
  textMatched: { color: "#0284C7" },
  textAccepted: { color: "#059669" },
  textArrived: { color: "#D97706" },
  actionButtonContainer: { marginTop: 4 },
  buttonButtonGroup: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  declineButton: { width: "30%", borderWidth: 1, borderColor: "#EF4444", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  declineButtonText: { color: "#EF4444", fontWeight: "700" },
  acceptButton: { width: "66%", backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  acceptButtonText: { color: "#FFFFFF", fontWeight: "700" }
});