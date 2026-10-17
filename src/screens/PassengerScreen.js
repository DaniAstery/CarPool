import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { useAuth } from '../AuthContext'; 
import * as Location from 'expo-location';
import io from "socket.io-client";
import CorridorDrawer from "../screens/Corridor_Drawer";
import { playSound } from "../utils/soundPlayer";
import { useLocationPinger } from '../hooks/useLocationPinger';
import { isValidMapCoordinate, toMapCoordinate } from "../utils/mapCoordinates";

const API_URL = process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://3.223.192.195:5000/api";
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || "http://3.223.192.195:5000";
const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: true,
});

// 🔑 Insert your Google Cloud Maps API key or EXPO_PUBLIC variable here
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const { width, height } = Dimensions.get('window');

// Calculate dynamic lock-in fare for the joining passenger
const getDynamicSeatPrice = (route, activePaxCount) => {
  switch (activePaxCount) {
    case 0:
      return route.standard_solo_fare ?? route.recommended_base_price ?? 0;
    case 1:
      return route.seat_price_2pax ?? route.recommended_base_price ?? 0;
    case 2:
      return route.seat_price_3pax ?? route.seat_price_2pax ?? 0;
    case 3:
    default:
      return route.seat_price_4pax ?? route.seat_price_3pax ?? 0;
  }
};

// Calculate remaining countdown seconds for matched corridors
const getRemainingSeconds = (route) => {
  if (!route.matched_at && !route.match_expires_at) return 0;
  
  const expiryTime = route.match_expires_at 
    ? new Date(route.match_expires_at).getTime() 
    : new Date(route.matched_at).getTime() + (3 * 60 * 1000);

  const seconds = Math.floor((expiryTime - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
};

// Format seconds to MM:SS
const formatCountdown = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function PassengerScreen({ navigation }) {
  const { user } = useAuth();
  
  const currentUserId = user?.id || user?.userId || 12;
  useLocationPinger(currentUserId, true);
  const userRole = user?.role || "passenger";
  const userName = user?.name || user?.full_name || "Passenger";

  const mapRef = useRef(null);
  const corridorScrollRef = useRef(null);

  const [checkingGatekeeper, setCheckingGatekeeper] = useState(true);
  const [isLocating, setIsLocating] = useState(true);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [canScrollCorridors, setCanScrollCorridors] = useState(false);

  const [userCoords, setUserCoords] = useState(null);
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);
  const [distanceToHub, setDistanceToHub] = useState(null);
  const [routes, setRoutes] = useState([]);
  
  const [rideMode, setRideMode] = useState("shared"); 

  // Standard direct ride state
  const [customDestinationInput, setCustomDestinationInput] = useState("");
  const [placePredictions, setPlacePredictions] = useState([]);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [calculatingStandardFare, setCalculatingStandardFare] = useState(false);
  const [fareEstimate, setFareEstimate] = useState(null);
  
  const [isStandardCardCollapsed, setIsStandardCardCollapsed] = useState(false);

  const activeHubNameRef = useRef(null);

  useEffect(() => {
    if (selectedPickupHub?.name) {
      activeHubNameRef.current = selectedPickupHub.name;
    }
  }, [selectedPickupHub]);


 useEffect(() => {
  if (!socket) return;

  const handleRoutePoolUpdate = (updatedData) => {
    console.log("⚡ [Socket] Route pool update received:", updatedData);

    setRoutes((prevRoutes) =>
      prevRoutes.map((route) => {
        const routeId = String(route.route_id || route.id);
        const incomingId = String(updatedData.route_id);

        if (routeId === incomingId) {
          console.log(`✅ [UI Match] Updating Route #${routeId} -> Pax: ${updatedData.searching_pax}, Price: ${updatedData.price}`);
          return {
            ...route,
            searching_pax: updatedData.searching_pax,
            matched_pax: updatedData.matched_pax,
            current_pax: updatedData.current_pax,
            price: updatedData.price,
            dynamic_price: updatedData.price, 
            status: updatedData.status,
          };
        }
        return route;
      })
    );
  };

  socket.on('route_pool_updated', handleRoutePoolUpdate);

  return () => {
    socket.off('route_pool_updated', handleRoutePoolUpdate);
  };
}, [socket]);


  /* 📍 GEOLOCATION & HUB TRACKING */
  useEffect(() => {
    let locationSubscription = null;

    async function startHubTracking() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert("Permission Required", "We need location services active to auto-match you with nearby hubs.");
          setIsLocating(false);
          return;
        }

        const initialLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const initialCoords = toMapCoordinate(
          initialLocation.coords.latitude,
          initialLocation.coords.longitude
        );
        if (initialCoords) {
          setUserCoords(initialCoords);
          await resolveClosestHub(initialCoords.latitude, initialCoords.longitude);
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 10000, 
            distanceInterval: 15, 
          },
          (location) => {
            const { latitude, longitude } = location.coords;
            setUserCoords({ latitude, longitude });
            resolveClosestHub(latitude, longitude);
          }
        );
      } catch (err) {
        console.error("❌ Geolocator startup failed:", err);
        setIsLocating(false);
      }
    }

    startHubTracking();
    return () => {
      if (locationSubscription) locationSubscription.remove();
    };
  }, []);

  const resolveClosestHub = async (lat, lng) => {
    try {
      const response = await fetch(`${API_URL}/passenger/validate-location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_lat: lat, user_lng: lng }),
      });

      const validationData = await response.json();

      if (validationData && validationData.nearestHub) {
        const targetHub = validationData.nearestHub;
        setSelectedPickupHub(targetHub);
        activeHubNameRef.current = targetHub.name;
        
        if (validationData.distanceInMeters) {
          setDistanceToHub(Math.round(validationData.distanceInMeters));
        } else {
          const dist = calculateHaversine(lat, lng, parseFloat(targetHub.latitude), parseFloat(targetHub.longitude));
          setDistanceToHub(Math.round(dist * 1000));
        }

        // 🔑 Pass the full targetHub object to send hub.id
        fetchActiveCorridors(targetHub);
      }
    } catch (err) {
      console.log("Error querying closest hub matrix:", err);
    } finally {
      setIsLocating(false);
    }
  };

  const calculateHaversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  };

  const fetchActiveCorridors = async (hub, showLoader = true) => {
    if (showLoader) setLoadingRoutes(true);
    try {
      const hubId = hub.id || 1; 
      const res = await fetch(`${API_URL}/routes/from/${hubId}`);
      const data = await res.json();
      const fetchedRoutes = Array.isArray(data) ? data : [];
      setRoutes(fetchedRoutes);
      setCanScrollCorridors(fetchedRoutes.length > 2);
    } catch (err) {
      console.log("Route corridor compilation lookup error:", err);
      setRoutes([]);
      setCanScrollCorridors(false);
    } finally {
      if (showLoader) setLoadingRoutes(false);
    }
  };

  const handleMapPress = () => {
    Keyboard.dismiss();
    setPlacePredictions([]);
    if (rideMode === "standard") {
      setIsStandardCardCollapsed(true);
    }
  };

  const handleDestinationInput = async (text) => {
    setCustomDestinationInput(text);
    setSelectedDestination(null);
    setFareEstimate(null);

    if (text.length > 2) {
      try {
        const res = await fetch(`${API_URL}/rides/autocomplete?input=${encodeURIComponent(text)}`);
        const responseText = await res.text();
        try {
          const data = JSON.parse(responseText);
          if (data.success) {
            setPlacePredictions(data.predictions);
          }
        } catch (jsonErr) {
          console.error("❌ Non-JSON response:", responseText.substring(0, 100));
        }
      } catch (err) {
        console.log("Autocomplete network fetch error:", err);
      }
    } else {
      setPlacePredictions([]);
    }
  };

  const handleSelectPrediction = async (prediction) => {
    setCustomDestinationInput(prediction.description);
    setPlacePredictions([]);
    setCalculatingStandardFare(true);
    setFareEstimate(null);
    Keyboard.dismiss();

    try {
      const detailsRes = await fetch(`${API_URL}/rides/details?placeId=${prediction.placeId}`);
      const detailsText = await detailsRes.text();

      let detailsData;
      try {
        detailsData = JSON.parse(detailsText);
      } catch (jsonErr) {
        console.error("❌ /rides/details returned non-JSON:", detailsText.substring(0, 200));
        Alert.alert("Server Error", "Place details endpoint returned an invalid response.");
        return;
      }

      if (detailsData.success) {
        const dest = detailsData.place;
        setSelectedDestination(dest);

        const origin = toMapCoordinate(userCoords?.latitude, userCoords?.longitude);
        if (!origin) {
          Alert.alert("Location unavailable", "Wait for your current location before estimating this trip.");
          return;
        }

        const estimateRes = await fetch(`${API_URL}/rides/estimate-fare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin_lat: origin.latitude,
            origin_lng: origin.longitude,
            destination_lat: dest.lat,
            destination_lng: dest.lng,
          }),
        });

        const estimateText = await estimateRes.text();
        let estimateData;
        try {
          estimateData = JSON.parse(estimateText);
        } catch (jsonErr) {
          console.error("❌ /rides/estimate-fare returned non-JSON:", estimateText.substring(0, 200));
          Alert.alert("Server Error", "Fare estimation endpoint returned an invalid response.");
          return;
        }

        if (estimateData.success) {
          setFareEstimate({
            distanceKm: estimateData.distanceKm,
            durationText: estimateData.durationText,
            estimatedPrice: estimateData.estimatedPrice,
          });
        } else {
          Alert.alert("Fare Error", estimateData.message || "Could not calculate fare.");
        }
      } else {
        Alert.alert("Place Error", "Could not retrieve coordinates for this location.");
      }
    } catch (err) {
      console.log("❌ Network request exception:", err);
      Alert.alert("Connection Error", "Failed to communicate with server.");
    } finally {
      setCalculatingStandardFare(false);
    }
  };

  const joinPool = async (item) => {
    const routePrice = parseFloat(item.price) || 150;

    Alert.alert(
      "Confirm Corridor Share Ride",
      `Join shared corridor pool from ${selectedPickupHub?.name || "Hub"} to ${item.destination_name || item.name} for ETB ${routePrice}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Join Pool",
          style: "default",
          onPress: async () => {
            try {
              if (!userCoords) {
                Alert.alert("Location unavailable", "Your current location is needed to join this corridor.");
                return;
              }
              const pickup = toMapCoordinate(userCoords.latitude, userCoords.longitude);
              if (!pickup) {
                Alert.alert("Location unavailable", "Your current location is invalid. Please retry GPS.");
                return;
              }

              const pickupHubId = selectedPickupHub ? selectedPickupHub.id : 7; 
              const targetRouteId = parseInt(item.route_id || item.id, 10);
              
              if (!targetRouteId || isNaN(targetRouteId)) {
                Alert.alert("System Sync Error", `Could not resolve a valid corridor route sequence ID.`);
                return;
              }

              playSound(1);
              const payload = {
                user_lat: pickup.latitude,
                user_lng: pickup.longitude,
                user_id: currentUserId,
                pickup_hub_id: pickupHubId,
                route_id: targetRouteId,
                dropoff_hub_id: item.drop_off_hub_id || null, 
                booking_type: "shared"
              };

             const res = await fetch(`${API_URL}/routes/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                Alert.alert("Join Failed", errorData.message || `Server rejected join request (${res.status})`);
                return;
              }
              
              const data = await res.json();
              playSound(1);

              let targetScreen = "MatchingScreen";
              if (data.navigateTo) {
                targetScreen = data.navigateTo;
              } else if (data.pool?.status === 'matched' || data.matched_ride_offer_id) {
                targetScreen = "PickupProposal";
              }

              const pickupName = item.pickup_hub_name || selectedPickupHub?.name || "Start";
              const passThrough = item.pass_through_name ? ` ➔ ${item.pass_through_name}` : "";
              const destinationName = item.destination_name || item.name || "Destination";
              const routeTitle = `${pickupName}${passThrough} ➔ ${destinationName}`;

              navigation.navigate(targetScreen, {
                routeId: targetRouteId,
                hubId: pickupHubId,
                userId: currentUserId,
                poolId: data.pool?.id || data.poolId || null,
                rideOfferId: data.matched_ride_offer_id || null,
                poolStatus: data.pool?.status || "searching",
                bookingType: "shared",
                ride: {
                  corridor: routeTitle,
                  time: "Evaluating Corridor Options...",
                  price: `ETB ${routePrice}`, 
                }
              });
      
            } catch (err) {
              console.error("❌ Join Pool Exception caught:", err);
              Alert.alert("Connection Error", "Failed to communicate with dispatch server. Please try again.");
            }
          }
        }
      ]
    );
  };

  const requestStandardRide = () => {
    if (!customDestinationInput.trim() || !selectedDestination || !fareEstimate) {
      Alert.alert("Destination Required", "Please select a valid destination with calculated fare to proceed.");
      return;
    }

    Alert.alert(
      "Confirm Standard Direct Ride",
      `Request a direct car for this ${fareEstimate.distanceKm} km trip to "${selectedDestination.name || customDestinationInput.trim()}" for ETB ${fareEstimate.estimatedPrice}? Proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request Standard Car",
          style: "default",
          onPress: async () => {
            try {
              const pickup = toMapCoordinate(userCoords?.latitude, userCoords?.longitude);
              if (!pickup) {
                Alert.alert("Location unavailable", "Your current location is needed to request a standard ride.");
                return;
              }
              playSound(1);
              
              const payload = {
                user_id: currentUserId,
                pickup_lat: pickup.latitude,
                pickup_lng: pickup.longitude,
                destination_lat: selectedDestination.lat,
                destination_lng: selectedDestination.lng,
                destination_name: selectedDestination.name || customDestinationInput.trim(),
                destination_address: selectedDestination.address || '',
                booking_type: "standard",
                estimated_price: fareEstimate.estimatedPrice,
                distance_km: fareEstimate.distanceKm
              };

              const response = await fetch(`${API_URL}/rides/solo/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              const data = await response.json();

              if (!response.ok || !data.success) {
                throw new Error(data.message || "Failed to create ride request.");
              }

              playSound(1);

              navigation.navigate("Standard", {
                userId: currentUserId,
                standardRequestId: data.ride.id,
                resolvedHubId: data.resolvedHubId,
                bookingType: "standard",
                ride: {
                  id: data.ride.id,
                  corridor: `Direct Pickup ➔ ${selectedDestination.name || customDestinationInput.trim()}`,
                  time: `~${fareEstimate.durationText || '10 mins'} (${fareEstimate.distanceKm} km)`,
                  price: `ETB ${fareEstimate.estimatedPrice}`,
                  pickup_lat: payload.pickup_lat,
                  pickup_lng: payload.pickup_lng,
                }
              });

            } catch (err) {
              console.error("Standard ride request error:", err);
              Alert.alert("Dispatch Error", err.message || "Failed to dispatch standard ride.");
            }
          }
        }
      ]
    );
  };

  const isOutOfRange = distanceToHub > 1000;
  const formattedDistance = distanceToHub !== null 
    ? (distanceToHub >= 1000 ? `${(distanceToHub / 1000).toFixed(1)} km` : `${distanceToHub}m`) 
    : "Locating...";

  const pickupHubCoords = selectedPickupHub
    ? toMapCoordinate(selectedPickupHub.latitude, selectedPickupHub.longitude)
    : null;
  const selectedDestinationCoords = toMapCoordinate(selectedDestination?.lat, selectedDestination?.lng);

  return (
    <View style={styles.outerContainer}>
      
      {/* 🗺️ DYNAMIC MAP & STREET ROUTE LINES */}
      <MapView
        ref={mapRef}
        style={styles.absoluteMap}
        onPress={handleMapPress}
        initialRegion={{
          latitude: userCoords?.latitude ?? 9.0235,
          longitude: userCoords?.longitude ?? 38.8275,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        showsUserLocation={true}
        showsMyLocationButton={false}
      >
        {isValidMapCoordinate(userCoords) && (
          <Marker
            coordinate={{ latitude: userCoords.latitude, longitude: userCoords.longitude }}
            title="Your Location"
            description={rideMode === "shared" ? "Current Location" : "Pickup Spot"}
          >
            <View style={styles.userMarkerPin}>
              <Ionicons name="radio-button-on" size={16} color="#2563EB" />
            </View>
          </Marker>
        )}

        {rideMode === "shared" && isValidMapCoordinate(pickupHubCoords) && (
          <>
            <Marker
              coordinate={pickupHubCoords}
              title={selectedPickupHub.name || "Pickup Hub"}
              description="Nearest Corridor Hub"
            >
              <View style={styles.hubMarkerPin}>
                <Ionicons name="location" size={20} color="#059669" />
              </View>
            </Marker>

            {isValidMapCoordinate(userCoords) && (
              <MapViewDirections
                origin={{ latitude: userCoords.latitude, longitude: userCoords.longitude }}
                destination={pickupHubCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={5}
                strokeColor="#059669"
                lineCap="round"
                mode="WALKING"
                resetOnChange={false}
                onReady={result => {
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: {
                      right: width / 10,
                      bottom: height / 3,
                      left: width / 10,
                      top: height / 10,
                    },
                    animated: true,
                  });
                }}
                onError={(errorMessage) => {
                  console.log('Shared Hub Route Directions Error:', errorMessage);
                }}
              />
            )}
          </>
        )}

        {rideMode === "standard" && selectedDestination && isValidMapCoordinate(selectedDestinationCoords) && (
          <>
            <Marker
              coordinate={selectedDestinationCoords}
              title={selectedDestination.name || "Destination"}
              description={selectedDestination.address}
            >
              <View style={styles.destinationMarkerPin}>
                <Ionicons name="location" size={20} color="#EF4444" />
              </View>
            </Marker>

            {isValidMapCoordinate(userCoords) && (
              <MapViewDirections
                origin={{ latitude: userCoords.latitude, longitude: userCoords.longitude }}
                destination={selectedDestinationCoords}
                apikey={GOOGLE_MAPS_API_KEY}
                strokeWidth={5}
                strokeColor="#2563EB"
                lineCap="round"
                mode="DRIVING"
                resetOnChange={false}
                onReady={result => {
                  mapRef.current?.fitToCoordinates(result.coordinates, {
                    edgePadding: {
                      right: width / 10,
                      bottom: height / 8,
                      left: width / 10,
                      top: isStandardCardCollapsed ? height / 4 : height / 2.2,
                    },
                    animated: true,
                  });
                }}
                onError={(errorMessage) => {
                  console.log('Standard Ride Directions Error:', errorMessage);
                }}
              />
            )}
          </>
        )}
      </MapView>

      <SafeAreaView style={styles.overlayContainer} pointerEvents="box-none">
        
        {/* 🧭 TOP DASHBOARD CONTROL CARD */}
        <View style={styles.topDashboardCard}>
          <View style={styles.topHeaderRow}>
            <TouchableOpacity 
              style={styles.hamburgerButton} 
              onPress={() => setIsDrawerOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="menu" size={22} color="#111111" />
            </TouchableOpacity>

            {rideMode === "shared" ? (
              <View style={styles.hubCluster}>
                <View style={[styles.miniHubIcon, { backgroundColor: isOutOfRange ? "#FEF3C7" : "#D1FAE5" }]}>
                  <Ionicons 
                    name="location-sharp" 
                    size={16} 
                    color={isOutOfRange ? "#D97706" : "#059669"} 
                  />
                </View>
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text style={styles.topHubSubText}>NEAREST HUB</Text>
                  <Text style={styles.topHubTitle} numberOfLines={1}>
                    {selectedPickupHub ? selectedPickupHub.name : "Detecting Hub..."}
                  </Text>
                </View>
                <View style={[styles.topRangeBadgeBox, isOutOfRange ? styles.alertRangeBox : styles.optimalRangeBox]}>
                  <Text style={[styles.topRangeValueText, { color: isOutOfRange ? "#B45309" : "#047857" }]}>
                    {formattedDistance}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.standardTopHeaderInfo}>
                <Text style={styles.standardTopHeaderTitle}>Standard Direct Ride</Text>
                <Text style={styles.standardTopHeaderSub}>Door-to-door private transport</Text>
              </View>
            )}
          </View>

          <View style={styles.topToggleGroup}>
            <TouchableOpacity 
              style={[styles.archetypeButton, rideMode === "shared" && styles.activeArchetypeButton]}
              onPress={() => {
                setRideMode("shared");
                setIsStandardCardCollapsed(false);
                handleMapPress();
              }}
            >
              <Ionicons name="people" size={14} color={rideMode === "shared" ? "#FFF" : "#4B5563"} />
              <Text style={[styles.archetypeText, rideMode === "shared" && styles.activeArchetypeText]} numberOfLines={1}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.archetypeButton, styles.disabledArchetypeButton]}
              activeOpacity={1}
              onPress={() => Alert.alert("Coming Soon", "Express Solo corridor booking will be available in the next release.")}
            >
              <FontAwesome5 name="user-alt" size={11} color="#9CA3AF" />
              <Text style={[styles.archetypeText, { color: "#9CA3AF" }]} numberOfLines={1}>Solo</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>SOON</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.archetypeButton, rideMode === "standard" && styles.activeStandardButton]}
              onPress={() => {
                setRideMode("standard");
                setIsStandardCardCollapsed(false);
              }}
            >
              <Ionicons name="car" size={14} color={rideMode === "standard" ? "#FFF" : "#4B5563"} />
              <Text style={[styles.archetypeText, rideMode === "standard" && styles.activeStandardText]} numberOfLines={1}>Standard</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🚗 STANDARD RIDE CARD */}
        {rideMode === "standard" && (
          isStandardCardCollapsed ? (
            <TouchableOpacity 
              style={styles.collapsedStandardCardTop}
              onPress={() => setIsStandardCardCollapsed(false)}
              activeOpacity={0.9}
            >
              <View style={styles.collapsedStandardInfo}>
                <View style={styles.collapsedIconCircle}>
                  <Ionicons name="car-sport" size={18} color="#2563EB" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.collapsedMainText} numberOfLines={1}>
                    {selectedDestination ? (selectedDestination.name || customDestinationInput) : "Where to?"}
                  </Text>
                  <Text style={styles.collapsedSubText} numberOfLines={1}>
                    {fareEstimate ? `ETB ${fareEstimate.estimatedPrice} • ${fareEstimate.distanceKm} km` : "Tap to expand and search route"}
                  </Text>
                </View>
              </View>
              <View style={styles.collapsedExpandBtn}>
                <Text style={styles.collapsedExpandBtnText}>Expand</Text>
                <Ionicons name="chevron-down" size={16} color="#2563EB" style={{ marginLeft: 2 }} />
              </View>
            </TouchableOpacity>
          ) : (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidContainerTop}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
            >
              <View style={styles.standardCard}>
                <ScrollView
                  contentContainerStyle={{ paddingBottom: 6 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled={true}
                >
                  <View style={styles.standardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF", width: 34, height: 34 }]}>
                      <Ionicons name="car-sport" size={18} color="#2563EB" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.standardTitle}>Standard Direct Ride</Text>
                      <Text style={styles.standardSub}>Door-to-door service • KM-based fare</Text>
                    </View>
                    
                    <TouchableOpacity 
                      style={styles.collapseChevronBtn}
                      onPress={() => {
                        Keyboard.dismiss();
                        setPlacePredictions([]);
                        setIsStandardCardCollapsed(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chevron-up" size={20} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Where would you like to go?</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="search" size={18} color="#2563EB" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Search destination, street, or landmark..."
                      placeholderTextColor="#9CA3AF"
                      value={customDestinationInput}
                      onChangeText={handleDestinationInput}
                      onFocus={() => setIsStandardCardCollapsed(false)}
                    />
                    {customDestinationInput.length > 0 && (
                      <TouchableOpacity onPress={() => { setCustomDestinationInput(""); setPlacePredictions([]); setSelectedDestination(null); setFareEstimate(null); }}>
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {placePredictions.length > 0 && (
                    <View style={styles.inlineSuggestionsContainer}>
                      <FlatList
                        data={placePredictions}
                        keyExtractor={(item) => item.placeId}
                        keyboardShouldPersistTaps="handled"
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                          <TouchableOpacity 
                            style={styles.suggestionItem}
                            onPress={() => handleSelectPrediction(item)}
                          >
                            <Ionicons name="location-outline" size={16} color="#6B7280" style={{ marginRight: 8 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.suggestionMainText} numberOfLines={1}>{item.mainText}</Text>
                              <Text style={styles.suggestionSubText} numberOfLines={1}>{item.secondaryText}</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}

                  {calculatingStandardFare && (
                    <View style={{ paddingVertical: 8, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color="#2563EB" />
                      <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>Calculating route & fare...</Text>
                    </View>
                  )}

                  <View style={styles.standardPriceBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.priceLabel}>ESTIMATED FARE (BY KM)</Text>
                      <Text style={styles.priceText}>
                        {fareEstimate ? `ETB ${fareEstimate.estimatedPrice}` : "Select Destination"}
                      </Text>
                      {fareEstimate && (
                        <Text style={styles.distanceSubtext}>
                          {fareEstimate.distanceKm} km • ~{fareEstimate.durationText}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity 
                      style={[styles.standardButton, (!selectedDestination || !fareEstimate) && { opacity: 0.5 }]}
                      onPress={requestStandardRide}
                      disabled={!selectedDestination || !fareEstimate}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.standardButtonText}>Request Car</Text>
                      <Ionicons name="arrow-forward" size={16} color="#FFF" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          )
        )}

        {/* 🟩 SHARED MODE: BOTTOM CORRIDORS LIST */}
        {rideMode === "shared" && (
          <View style={styles.bottomCorridorsContainer}>
            <View style={styles.corridorsWrapperCard}>
              <View style={styles.listSectionHeader}>
                <Text style={styles.sectionTitle}>
                  Available Corridors ({routes.length})
                </Text>
                {loadingRoutes && <ActivityIndicator size="small" color="#059669" />}
              </View>

              {routes.length === 0 ? (
                <View style={styles.fallbackBlock}>
                  <Ionicons name="map-outline" size={28} color="#9CA3AF" />
                  <Text style={styles.fallbackTitle}>No Corridors Found</Text>
                  <Text style={styles.fallbackSub}>
                    {selectedPickupHub 
                      ? `No active routes originating from ${selectedPickupHub.name}` 
                      : "Scanning for nearby departure hubs..."}
                  </Text>
                </View>
              ) : (
                <View style={{ position: 'relative' }}>
                  <View style={styles.corridorContainer}>
                    <ScrollView
                      ref={corridorScrollRef}
                      style={styles.corridorScrollList}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                      {routes.map((route, index) => {
                        const routeId = route.id || route.route_id;
                        
                        // 🧭 Upgraded robust 3-way route title formatting
                        const pickupName = route.pickup_hub_name || selectedPickupHub?.name || "Start";
                        const passThroughName = route.pass_through_name; 
                        const destinationName = route.destination_name || route.name || "Destination";

                        const routeTitle = passThroughName 
                          ? `${pickupName} ➔ ${passThroughName} ➔ ${destinationName}`
                          : `${pickupName} ➔ ${destinationName}`;

                        const maxSeats = parseInt(route.total_seats, 10) || 4;

                        const searchingPax = parseInt(route.searching_pax ?? route.searching_count ?? 0, 10) || 0;
                        const matchedPax = parseInt(route.matched_pax ?? route.matched_count ?? 0, 10) || 0;
                        const calculatedSum = searchingPax + matchedPax;

                        const rawCurrentPax = route.current_pax !== undefined && route.current_pax !== null 
                          ? parseInt(route.current_pax, 10) 
                          : 0;

                        const totalActivePax = rawCurrentPax > 0 ? rawCurrentPax : calculatedSum;

                        const isMatchedStatus = route.status === 'matched' || matchedPax > 0;
                        const remainingSeconds = getRemainingSeconds(route);
                        const isJoinWindowOpen = isMatchedStatus && remainingSeconds > 0;

                        const dynamicPrice = route.price !== undefined && route.price !== null
                          ? route.price
                          : (route.dynamic_price !== undefined && route.dynamic_price !== null
                              ? route.dynamic_price
                              : getDynamicSeatPrice(route, totalActivePax));

                        const formattedPrice = Number(dynamicPrice).toFixed(0);

                        console.log(`🎨 [RENDER DEBUG] Route #${routeId} (${routeTitle}) -> activePax: ${totalActivePax}`);

                        return (
                          <TouchableOpacity 
                            key={route.route_id || route.id || `route-${index}`} 
                            style={[
                              styles.supremeCard,
                              isOutOfRange && styles.disabledCard,
                              isJoinWindowOpen && styles.matchedCardBorder
                            ]} 
                            onPress={() => joinPool({ 
                              ...route, 
                              route_id: routeId, 
                              dynamicPrice, 
                              activePaxCount: totalActivePax,
                              isMatchedPool: isJoinWindowOpen 
                            })}
                            disabled={isOutOfRange}
                            activeOpacity={0.8}
                          >
                            <View style={styles.cardHeader}>
                              <View style={styles.routePill}>
                                <Text style={styles.routeLabel}>{routeTitle}</Text>
                              </View>
                              
                              <View style={[
                                styles.seatBadge, 
                                isJoinWindowOpen 
                                  ? styles.amberBadge 
                                  : (totalActivePax > 0 ? styles.activeSeatBadge : styles.emptySeatBadge)
                              ]}>
                                <View style={[
                                  styles.pulseDot, 
                                  { 
                                    backgroundColor: isJoinWindowOpen 
                                      ? "#F59E0B" 
                                      : (totalActivePax > 0 ? "#10B981" : "#9CA3AF") 
                                  }
                                ]} />
                                <Text style={[
                                  styles.seatText, 
                                  { 
                                    color: isJoinWindowOpen 
                                      ? "#B45309" 
                                      : (totalActivePax > 0 ? "#047857" : "#4B5563") 
                                  }
                                ]}>
                                  {totalActivePax > 0 
                                    ? `${totalActivePax}/${maxSeats} ${isJoinWindowOpen ? 'Matched' : 'Waiting'}` 
                                    : "0 Waiting"}
                                </Text>
                              </View>
                            </View>

                            {isJoinWindowOpen && (
                              <View style={styles.matchedTimerBanner}>
                                <Ionicons name="timer-outline" size={16} color="#B45309" />
                                <Text style={styles.matchedTimerText}>
                                  Driver matched! Join window closes in{" "}
                                  <Text style={styles.countdownBold}>
                                    {formatCountdown(remainingSeconds)}
                                  </Text>
                                </Text>
                              </View>
                            )}
                            
                            <View style={styles.cardFooter}>
                              <View style={styles.priceContainer}>
                                <Text style={styles.priceLabel}>
                                  {isJoinWindowOpen 
                                    ? `MATCHED FARE (Rider #${totalActivePax + 1})` 
                                    : (totalActivePax > 0 ? `LOCK-IN FARE (Rider #${totalActivePax + 1})` : "STARTING FARE (1st Pax)")}
                                </Text>
                                <Text style={styles.priceText}>
                                  ETB {formattedPrice}
                                </Text>
                              </View>

                              <View style={styles.actionArrowZone}>
                                <Text style={[
                                  styles.actionText, 
                                  { 
                                    color: isOutOfRange 
                                      ? "#9CA3AF" 
                                      : (isJoinWindowOpen ? "#D97706" : "#059669") 
                                  }
                                ]}>
                                  {isOutOfRange 
                                    ? "Out of Range" 
                                    : (isJoinWindowOpen ? "Join Matched Pool" : (totalActivePax > 0 ? "Join Pool" : "Request Pool"))}
                                </Text>
                                <Ionicons 
                                  name="chevron-forward-circle" 
                                  size={22} 
                                  color={isOutOfRange ? "#D1D5DB" : (isJoinWindowOpen ? "#D97706" : "#059669")} 
                                />
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {canScrollCorridors && (
                    <TouchableOpacity 
                      style={styles.floatingScrollIndicator}
                      onPress={() => {
                        corridorScrollRef.current?.scrollTo({ y: 180, animated: true });
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.floatingScrollText}>More corridors below</Text>
                      <Ionicons name="chevron-down" size={14} color="#059669" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, backgroundColor: "#F9FAFB" },
  absoluteMap: { ...StyleSheet.absoluteFillObject },
  overlayContainer: { flex: 1, justifyContent: "flex-start" },

  gatekeeperContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" },
  gatekeeperText: { marginTop: 12, color: "#4B5563", fontWeight: "700", fontSize: 14, letterSpacing: 0.2 },
  
  userMarkerPin: {
    backgroundColor: "#FFFFFF",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#2563EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  hubMarkerPin: {
    backgroundColor: "#FFFFFF",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#059669",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  destinationMarkerPin: {
    backgroundColor: "#FFFFFF",
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#EF4444",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },

  topDashboardCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  topHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  hamburgerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  hubCluster: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    backgroundColor: "#F9FAFB",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  standardTopHeaderInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: "center",
  },
  standardTopHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  standardTopHeaderSub: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 1,
  },
  miniHubIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  topHubSubText: { fontSize: 9, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.6 },
  topHubTitle: { fontSize: 13, fontWeight: "800", color: "#111827", marginTop: 1 },
  
  topRangeBadgeBox: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  optimalRangeBox: { backgroundColor: "#ECFDF5" },
  alertRangeBox: { backgroundColor: "#FEF3C7" },
  topRangeValueText: { fontSize: 11, fontWeight: "700" },

  topToggleGroup: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    padding: 2,
  },
  archetypeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    borderRadius: 8,
  },
  activeArchetypeButton: {
    backgroundColor: "#059669",
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  activeStandardButton: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  disabledArchetypeButton: {
    opacity: 0.7,
    position: "relative",
  },
  archetypeText: { fontSize: 12, fontWeight: "700", color: "#4B5563", marginLeft: 4 },
  activeArchetypeText: { color: "#FFFFFF" },
  activeStandardText: { color: "#FFFFFF" },
  comingSoonBadge: {
    position: "absolute",
    top: 1,
    right: 4,
    backgroundColor: "#D1D5DB",
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 3,
  },
  comingSoonText: { fontSize: 7, fontWeight: "800", color: "#374151" },

  keyboardAvoidContainerTop: {
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  standardCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },
  standardHeaderRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  collapseChevronBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  iconCircle: { justifyContent: "center", alignItems: "center", borderRadius: 10 },
  standardTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  standardSub: { fontSize: 10, color: "#6B7280", marginTop: 1 },
  inputLabel: { fontSize: 11, fontWeight: "700", color: "#374151", marginBottom: 6 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  textInput: { flex: 1, fontSize: 13, color: "#111827", paddingVertical: 0 },
  
  inlineSuggestionsContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginTop: 6,
    maxHeight: 130,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  suggestionMainText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  suggestionSubText: { fontSize: 10, color: "#6B7280", marginTop: 1 },

  standardPriceBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  distanceSubtext: { fontSize: 10, color: "#64748B", fontWeight: "600", marginTop: 2 },
  standardButton: {
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  standardButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  collapsedStandardCardTop: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  collapsedStandardInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  collapsedIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  collapsedMainText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  collapsedSubText: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 1,
  },
  collapsedExpandBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  collapsedExpandBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },

  bottomCorridorsContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  corridorsWrapperCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
    maxHeight: 310,
  },
  corridorScrollList: {
    maxHeight: 220,
  },

  listSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#374151", letterSpacing: 0.5, textTransform: "uppercase" },
  
  fallbackBlock: { justifyContent: "center", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18, backgroundColor: "#FFFFFF", borderRadius: 16 },
  fallbackTitle: { fontSize: 14, fontWeight: "800", color: "#374151", textAlign: "center", marginTop: 4 },
  fallbackSub: { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 2, lineHeight: 16 },

  supremeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  disabledCard: { opacity: 0.6, backgroundColor: "#F9FAFB" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  routePill: { flex: 1, marginRight: 8 },
  routeLabel: { fontSize: 13, fontWeight: "800", color: "#111827", lineHeight: 17 },
  
  seatBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeSeatBadge: { backgroundColor: "#ECFDF5" },
  emptySeatBadge: { backgroundColor: "#F3F4F6" },
  pulseDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  seatText: { fontSize: 10, fontWeight: "700" },

  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 8 },
  priceContainer: {},
  priceLabel: { fontSize: 8, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  priceText: { fontSize: 14, fontWeight: "900", color: "#059669", marginTop: 1 },
  
  actionArrowZone: { flexDirection: "row", alignItems: "center" },
  actionText: { fontSize: 12, fontWeight: "700", marginRight: 4 },

  floatingScrollIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: '#ECFDF5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#059669',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 10,
  },
  floatingScrollText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },

  matchedCardBorder: {
    borderColor: '#F59E0B',
    borderWidth: 1.5,
    backgroundColor: '#FFFDF5',
  },
  amberBadge: {
    backgroundColor: '#FEF3C7',
  },
  matchedTimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  matchedTimerText: {
    fontSize: 12,
    color: '#92400E',
    marginLeft: 6,
    fontWeight: '500',
  },
  countdownBold: {
    fontWeight: '700',
    color: '#B45309',
  },
});