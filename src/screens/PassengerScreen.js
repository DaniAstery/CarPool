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
// FIX: Ensure FontAwesome5 is explicitly declared here
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";


export default function PassengerScreen({ navigation }) {
  const [searchText, setSearchText] = useState("");
  const [hubs, setHubs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRoutes, setSelectedRoutes] = useState([]);

  // ✅ SEPARATE LOADING STATES (IMPORTANT FIX)
  const [loadingHubs, setLoadingHubs] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [loadingRides, setLoadingRides] = useState(false);

  /* ---------------- HUB SEARCH ---------------- */

  {/* Temporary Developer Portal Bypass Button */}

  const searchHubs = async (text) => {
    setSearchText(text);

    if (text.length < 2) {
      setHubs([]);
      return;
    }

    setLoadingHubs(true);

    try {
      const res = await fetch(
        `http:/192.168.176.52:5000/api/hubs/search/${text}`
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
  const selectHub = async (hubName) => {
    setSearchText(hubName);
    setHubs([]);
    setRoutes([]);
    setSelectedRoutes([]);

    setLoadingRoutes(true);

    try {
      const res = await fetch(
        `http://192.168.176.52:5000/api/routes/from/${hubName}`
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
  const handleRouteSelect = async (routeStops) => {
    setLoadingRides(true);

    const start = routeStops?.[0];

    try {
      const res = await fetch(
        `http://192.168.176.52:5000/api/rides?start=${start}`
      );

      const data = await res.json();

      console.log("RIDES:", data);

      setSelectedRoutes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log("ride fetch error:", err);
      setSelectedRoutes([]);
    } finally {
      setLoadingRides(false);
    }
  };

  /* ---------------- JOIN POOL ---------------- */
 /* ---------------- JOIN POOL ---------------- */
const joinPool = async (routeId) => {
  try {
    const res = await fetch(
      "http://192.168.176.52:5000/api/routes/join",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: routeId,
          user_id: 1,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Join failed");
      return;
    }

    // IMPORTANT: we now pass routeId forward
    navigation.navigate("MatchingScreen", {
      routeId: routeId,
      ride: data.ride,
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
          onPress={() => selectHub(hub.name)}
        >
          <Text>{hub.name}</Text>
        </TouchableOpacity>
      ))}

      {/* ROUTES */}
      <Text style={styles.label}>Available Corridors</Text>
      {/* FLOATING SWITCH BUTTON - FORCE RENDER ON TOP */}
      <TouchableOpacity 
        style={{
          position: 'absolute',
          top: 70,            // Pushes it down past any phone notches
          right: 20,           // Places it on the right side
          backgroundColor: '#111827', 
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 25,
          zIndex: 9999,        // FORCES it to float ABOVE the MapView component
          elevation: 10,       // FORCES visibility on Android shadows layer
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#374151',
        }}
        activeOpacity={0.8}
        onPress={() => navigation.navigate("CreateCorridorScreen")}
      >
        <FontAwesome5 name="exchange-alt" size={12} color="#10B981" style={{ marginRight: 8 }} />
        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
          SWITCH TO DRIVER
        </Text>
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
            onPress={() => joinPool(route.id)}
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
    color: "#666",
    marginTop: 5,
  },
});