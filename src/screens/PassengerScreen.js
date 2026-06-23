import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";

import PoolOfferCard from "../components/PoolOfferCard";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function PassengerScreen({ navigation }) {
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);

  // Track the actual active hub object selected by the user to extract its precise DB ID
  const [selectedPickupHub, setSelectedPickupHub] = useState(null);

  // SEPARATE LOADING STATES
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  /* ---------------- HUB SEARCH ---------------- */
  const searchHubs = async (text) => {
    setSearchText(text);

    if (text.length < 2) {
      setHubs([]);
      return;
    }

    setLoadingHubs(true);

    try {
      const res = await fetch(
        `http://192.168.238.52:5000/api/hubs/search/${text}`
      );
      const data = await res.json();
      setHubs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("hub search error:", err);
      setHubs([]);
    } finally {
      setLoadingHubs(false);
    }
  };

  /* ---------------- SELECT HUB → GET ROUTES ---------------- */
  const selectHub = async (hub) => {
    // Save the entire selected hub object so we can read hub.id later
    setSelectedPickupHub(hub);
    setSearchText(hub.name);
    setHubs([]);
    setRoutes([]);
    setSelectedRoutes([]);
    setLoadingRoutes(true);

    try {
      const res = await fetch(
        `http://192.168.238.52:5000/api/routes/from/${hub.name}`
      );
      const data = await res.json();
      setRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("route fetch error:", err);
      setRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  };

  /* ---------------- SELECT CORRIDOR → GET RIDES ---------------- */
const handleRouteSelect = async (routeId) => {
  setLoadingRides(true);

  try {
    // Queries cleanly by integer ID instead of unstructured location text strings
    const res = await fetch(
      `http://192.168.238.52:5000/api/rides?route_id=${routeId}`
    );

    const data = await res.json();
    console.log("FILTERED RIDES BY ROUTE_ID:", data);
    setSelectedRoutes(Array.isArray(data) ? data : []);
  } catch (err) {
    console.log("ride fetch error:", err);
    setSelectedRoutes([]);
  } finally {
    setLoadingRides(false);
  }
};

  /* ---------------- JOIN POOL ---------------- */
  const joinPool = async (routeId) => {
    try {
      // Find the specific route configuration array from state to derive terminal drop-off points
      const targetRoute = routes.find(r => r.route_id === routeId);
      
      // Fallback strategies to ensure parameters are never null or undefined
      const pickupHubId = selectedPickupHub ? selectedPickupHub.id : null;
      
      // For now, assume destination is the last hub in the sequence array chain
      // If you implement an explicit destination dropdown later, plug its selected ID directly here.
      const dropoffHubId = null; 

      const res = await fetch(
        "http://192.168.238.52:5000/api/routes/join",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route_id: routeId,
            user_id: 1, 
            pickup_hub_id: pickupHubId,   // 🚀 PASSING TO NEW BACKEND LAYER
            dropoff_hub_id: dropoffHubId, // 🚀 PASSING TO NEW BACKEND LAYER
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Join failed");
        return;
      }

      navigation.navigate("MatchingScreen", {
        routeId: routeId,
        ride: data.pool, // Updated parameter to point to data.pool returned by our new controller setup
      });

    } catch (err) {
      console.log("join error:", err);
    }
  };

  /* ---------------- UI ---------------- */
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Find Shared Ride</Text>

      {/* HUB SEARCH */}
      <TextInput
        placeholder="Search pickup hub..."
        value={searchText}
        onChangeText={searchHubs}
        style={styles.inputBox}
      />

      {loadingHubs && <ActivityIndicator />}

      {hubs.map((hub) => (
        <TouchableOpacity
          key={hub.id || hub.name}
          style={styles.suggestion}
          // Pass the complete hub object structure down instead of just string literals
          onPress={() => selectHub(hub)}
        >
          <Text>{hub.name}</Text>
        </TouchableOpacity>
      ))}

      {/* ROUTES */}
      <Text style={styles.label}>Available Corridors</Text>
      
      {/* FLOATING SWITCH BUTTON */}
      <TouchableOpacity 
        style={styles.floatingDriverBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate("CreateCorridorScreen")}
      >
        <FontAwesome5 name="exchange-alt" size={12} color="#10B981" style={{ marginRight: 8 }} />
        <Text style={styles.floatingDriverText}>SWITCH TO DRIVER</Text>
      </TouchableOpacity>

      {loadingRoutes ? (
        <ActivityIndicator />
      ) : (
        routes.map((route) => (
          <TouchableOpacity
            key={route.route_id || route.id}
            style={styles.routeCard}
            onPress={() => handleRouteSelect(route.stops || [])}
          >
            <Text style={styles.routeText}>
              {Array.isArray(route.stops)
                ? route.stops.join(" → ")
                : "Invalid route"}
            </Text>
            {route.base_price && (
              <Text style={styles.subText}>Base Price: {route.base_price} ETB</Text>
            )}
          </TouchableOpacity>
        ))
      )}

      {/* RIDES */}
      <Text style={styles.label}>Available Shared Rides</Text>

      {loadingRides ? (
        <ActivityIndicator />
      ) : (
        selectedRoutes.map((route) => (
          <PoolOfferCard
            key={route.id}
            route={route}
            // Pass routeId to initialize match bundles securely
            onPress={() => joinPool(route.route_id || route.id)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
  },
  inputBox: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 15,
    padding: 18,
    marginBottom: 10,
  },
  suggestion: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 15,
    marginBottom: 10,
  },
  routeCard: {
    backgroundColor: "#f5f5f5",
    padding: 18,
    borderRadius: 12,
    marginBottom: 12,
  },
  routeText: {
    fontSize: 16,
    fontWeight: "600",
  },
  subText: {
    fontSize: 12,
    color: "#10B981",
    fontWeight: "700",
    marginTop: 5,
  },
  floatingDriverBtn: {
    position: 'absolute',
    top: 70,            
    right: 20,           
    backgroundColor: '#111827', 
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
    zIndex: 9999,        
    elevation: 10,       
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  floatingDriverText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5
  }
});