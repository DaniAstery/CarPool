import React, { useState, useEffect, useRef, memo } from "react";
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Dimensions,
  ScrollView,
  BackHandler,
  Platform,
  Pressable,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");
const API_URL = "http://100.108.52.79:5000";

const DEFAULT_LOCATION = {
  latitude: 9.0235,
  longitude: 38.8275,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

// Calculate exact bearing/heading between two coordinates so the vehicle marker faces forward properly
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

// Fetch real street-level driving route from OSRM public driving router
const fetchDrivingRoute = async (origin, destination) => {
  if (!origin || !destination || !origin.latitude || !destination.latitude || !origin.longitude || !destination.longitude) {
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
    console.log("⚠️ OSRM driving route request failed, utilizing direct path fallback");
  }

  return [origin, destination];
};

// ------------------------------------------------------------------
// MEMOIZED MAP VIEW (Top-Down Oriented Car Marker & Corrected Destination)
// ------------------------------------------------------------------
const TripDepartureMap = memo(({ currentLocation, destinationLocation, routeCoordinates, heading, mapRef, isDrawerExpanded }) => {
  useEffect(() => {
    if (mapRef.current && destinationLocation?.latitude && currentLocation?.latitude) {
      const bottomPadding = isDrawerExpanded ? height * 0.55 : height * 0.25;
      const coordsToFit = [
        { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        { latitude: destinationLocation.latitude, longitude: destinationLocation.longitude },
        ...routeCoordinates
      ];

      try {
        mapRef.current.fitToCoordinates(coordsToFit, {
          edgePadding: { top: 80, right: 60, bottom: bottomPadding, left: 60 },
          animated: true,
        });
      } catch (e) {}
    }
  }, [currentLocation?.latitude, currentLocation?.longitude, destinationLocation?.latitude, destinationLocation?.longitude, routeCoordinates, mapRef, isDrawerExpanded]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFillObject}
      provider={PROVIDER_DEFAULT}
      initialRegion={DEFAULT_LOCATION}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {/* 🟢 1. Passenger In-Car Current Location Marker (Top-Down Car Icon) */}
      {currentLocation && currentLocation.latitude && (
        <Marker
          coordinate={currentLocation}
          title="Your Current Location (In Car)"
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={heading || 0}
          flat={true}
        >
          <View style={styles.emeraldCarWrapper}>
            <View style={styles.emeraldCarInnerBubble}>
              <MaterialCommunityIcons name="car" size={18} color="#FFFFFF" />
            </View>
          </View>
        </Marker>
      )}

      {/* 🔵 2. Destination Hub Marker */}
      {destinationLocation && destinationLocation.latitude && destinationLocation.longitude && (
        <Marker 
          coordinate={{ latitude: Number(destinationLocation.latitude), longitude: Number(destinationLocation.longitude) }} 
          title={destinationLocation.title || "Destination Hub"} 
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.royalBlueDestinationHalo}>
            <View style={styles.royalBlueDestinationBadge} />
          </View>
        </Marker>
      )}

      {/* 🛣️ Real Street-Level Polyline Route Path */}
      {routeCoordinates && routeCoordinates.length > 0 && (
        <Polyline
          coordinates={routeCoordinates}
          strokeColor="#059669"
          strokeWidth={5}
          geodesic={true}
        />
      )}
    </MapView>
  );
});

export default function TripDepartureScreen({ route }) {
  const rideOfferId = route?.params?.rideOfferId || 0;

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(true);
  const [currentLocation, setCurrentLocation] = useState(DEFAULT_LOCATION);
  const [destinationLocation, setDestinationLocation] = useState({ latitude: null, longitude: null, title: "Destination Hub" });
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [heading, setHeading] = useState(0);

  const [dropoffHubName, setDropoffHubName] = useState("CMC");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [vehicleInfo, setVehicleInfo] = useState("Corridor Shuttle");
  const [corridorName, setCorridorName] = useState("Transit Corridor");
  const [fixedPrice, setFixedPrice] = useState(100);

  const mapRef = useRef(null);
  const prevLocRef = useRef(null);

  // Disable Android Back Button during active trip departure
  useEffect(() => {
    const backAction = () => true;
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, []);

  // Track passenger's live device GPS location continuously and compute heading
  useEffect(() => {
    let isMounted = true;
    let locationSubscription = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted" && isMounted) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (loc && isMounted) {
            const newCoord = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            };

            if (prevLocRef.current) {
              const computedHeading = calculateBearing(
                prevLocRef.current.latitude,
                prevLocRef.current.longitude,
                newCoord.latitude,
                newCoord.longitude
              );
              setHeading(computedHeading);
            } else if (loc.coords.heading >= 0) {
              setHeading(loc.coords.heading);
            }

            prevLocRef.current = newCoord;
            setCurrentLocation(newCoord);
          }

          locationSubscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 4, timeInterval: 2500 },
            (newLoc) => {
              if (isMounted && newLoc) {
                const newCoord = {
                  latitude: newLoc.coords.latitude,
                  longitude: newLoc.coords.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                };

                if (prevLocRef.current) {
                  const computedHeading = calculateBearing(
                    prevLocRef.current.latitude,
                    prevLocRef.current.longitude,
                    newCoord.latitude,
                    newCoord.longitude
                  );
                  if (computedHeading > 0) {
                    setHeading(computedHeading);
                  }
                } else if (newLoc.coords.heading >= 0) {
                  setHeading(newLoc.coords.heading);
                }

                prevLocRef.current = newCoord;
                setCurrentLocation(newCoord);
              }
            }
          );
        }
      } catch (err) {
        console.log("📍 Location tracking error:", err.message);
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  // Fetch destination coordinates from map_coordinates endpoint
  useEffect(() => {
    let isMounted = true;
    async function fetchMapCoordinatesEndpoint() {
      if (!rideOfferId) return;
      try {
        const res = await fetch(`${API_URL}/api/rides/map_coordinates?ride_offer_id=${rideOfferId}`);
        const data = await res.json();
        if (data.success && data.coordinates && isMounted) {
          const coords = data.coordinates;
          
          let destLat = parseFloat(coords.end_latitude);
          let destLng = parseFloat(coords.end_longitude);
          const startLat = parseFloat(coords.start_latitude);
          const startLng = parseFloat(coords.start_longitude);

          if (destLat > 9.10 && startLat < 9.08) {
            destLat = startLat;
            destLng = startLng;
          }

          if (destLat && destLng) {
            setDestinationLocation({
              latitude: destLat,
              longitude: destLng,
              title: coords.end_hub_name || "CMC"
            });
          }

          if (coords.end_hub_name) setDropoffHubName(coords.end_hub_name);
          if (coords.corridor_name) setCorridorName(coords.corridor_name);
          if (coords.price_per_seat) setFixedPrice(coords.price_per_seat);
        }
      } catch (err) {
        console.log("⚠️ Error fetching map_coordinates endpoint:", err);
      }
    }

    fetchMapCoordinatesEndpoint();
    return () => { isMounted = false; };
  }, [rideOfferId]);

  // Generate street-level route polyline from Current Device GPS to Destination Hub
  useEffect(() => {
    let isMounted = true;
    async function updateStreetRoute() {
      if (currentLocation.latitude && destinationLocation.latitude) {
        const routePoints = await fetchDrivingRoute(currentLocation, destinationLocation);
        if (isMounted && routePoints.length > 0) {
          setRouteCoordinates(routePoints);
        }
      }
    }
    updateStreetRoute();
    return () => { isMounted = false; };
  }, [currentLocation, destinationLocation]);

  return (
    <SafeAreaView style={styles.container}>
      {/* MAP SECTION */}
      <View style={styles.mapContainer}>
        <TripDepartureMap 
          currentLocation={currentLocation} 
          destinationLocation={destinationLocation}
          routeCoordinates={routeCoordinates}
          heading={heading}
          mapRef={mapRef} 
          isDrawerExpanded={isDrawerExpanded}
        />
      </View>

      {/* COLLAPSIBLE SLIDING PANEL DRAWER */}
      <View style={[styles.slidingPanelDrawer, isDrawerExpanded ? styles.drawerExpanded : styles.drawerCollapsed]}>
        
        {/* Toggle Handle Header */}
        <Pressable 
          style={styles.dragHandleContainer}
          onPress={() => setIsDrawerExpanded(!isDrawerExpanded)}
        >
          <View style={styles.dragHandle} />
          <View style={styles.headerRow}>
            <View style={styles.previewLeftCluster}>
              <Text style={styles.title}>Trip in Departure</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Heading to <Text style={styles.boldText}>{dropoffHubName}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={[styles.statusBadge, styles.badgeActive]}>
                <Text style={styles.badgeText}>IN TRANSIT</Text>
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
              <Ionicons name="navigate-sharp" size={18} color="#059669" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>CURRENT LOCATION (YOU IN CAR)</Text>
                <Text style={styles.routeValue} numberOfLines={1}>Live Device GPS (Top-Down Oriented)</Text>
              </View>
            </View>

            <View style={styles.routeDivider} />

            <View style={styles.routeItem}>
              <Ionicons name="flag-sharp" size={18} color="#3B82F6" />
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.routeLabel}>DESTINATION HUB</Text>
                <Text style={styles.routeValue} numberOfLines={1}>{dropoffHubName}</Text>
              </View>
            </View>
          </View>

          {/* Driver & Vehicle Card */}
          <View style={styles.driverCard}>
            <FontAwesome5 name="car-side" size={20} color="#2F4F4F" />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.driverLabel}>{driverName} • {vehicleInfo}</Text>
              <Text style={styles.driverSub}>Corridor Axis: <Text style={styles.boldText}>{corridorName}</Text></Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer Status */}
        {isDrawerExpanded && (
          <View style={styles.actionBanner}>
            <Ionicons name="shield-checkmark" size={18} color="#059669" />
            <Text style={styles.actionBannerText}>Secure Ride-Pooling Active • ETB {fixedPrice}.00 Fixed</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  mapContainer: { flex: 1 },
  
  emeraldCarWrapper: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(5, 150, 105, 0.25)", justifyContent: "center", alignItems: "center" },
  emeraldCarInnerBubble: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#059669", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  
  royalBlueDestinationHalo: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(59, 130, 246, 0.3)", justifyContent: "center", alignItems: "center" },
  royalBlueDestinationBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#3B82F6", borderWidth: 3, borderColor: "#FFFFFF", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 6 },

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
  drawerExpanded: { maxHeight: height * 0.55 },

  dragHandleContainer: { paddingBottom: 8, width: "100%" },
  dragHandle: { width: 40, height: 4, backgroundColor: "#E0E0E0", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  previewLeftCluster: { flex: 1 },
  title: { fontSize: 18, fontWeight: "700", color: "#1A1A1A" },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },
  boldText: { fontWeight: "700", color: "#1A1A1A" },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4 },
  badgeActive: { backgroundColor: "#ECFDF5" },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#059669" },

  expandToggleBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-end" },
  expandToggleText: { fontSize: 11, fontWeight: "600", color: "#6B7280", marginRight: 2 },

  drawerScrollBody: { flexGrow: 0 },
  routeCard: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: "#EAEAEA" },
  routeItem: { flexDirection: "row", alignItems: "center" },
  routeLabel: { fontSize: 10, fontWeight: "700", color: "#888", letterSpacing: 0.5 },
  routeValue: { fontSize: 14, fontWeight: "700", color: "#1A1A1A", marginTop: 1 },
  routeDivider: { height: 1, backgroundColor: "#EAEAEA", marginVertical: 8 },
  driverCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F4F4", padding: 12, borderRadius: 12, marginVertical: 6 },
  driverLabel: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  driverSub: { fontSize: 12, color: "#666" },
  actionBanner: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#ECFDF5", paddingVertical: 14, borderRadius: 12, marginTop: 10, marginBottom: Platform.OS === 'android' ? 20 : 10 },
  actionBannerText: { color: "#059669", fontSize: 14, fontWeight: "700", marginLeft: 8 },
});