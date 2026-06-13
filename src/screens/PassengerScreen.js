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
  const searchHubs = async (text) => {
    setSearchText(text);

    if (text.length < 2) {
      setHubs([]);
      return;
    }

    setLoadingHubs(true);

    try {
      const res = await fetch(
        `http://192.168.2.52:5000/api/hubs/search/${text}`
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
        `http://192.168.2.52:5000/api/routes/from/${hubName}`
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
        `http://192.168.2.52:5000/api/rides?start=${start}`
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
  const joinPool = async (routeId) => {
    try {
      const res = await fetch(
        "http://192.168.2.52:5000/api/routes/join",
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

      navigation.navigate("JoinedPool", {
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