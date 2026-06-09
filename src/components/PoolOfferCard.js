import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function PoolOfferCard({ route, onPress }) {
  if (!route) return null;

  const {
    start_location,
    end_location,
    driver_name,
    status,
    filled,
    total_seats,
    price_per_seat,
    stops,
  } = route;

  return (
    <View style={styles.card}>
      
      {/* ROUTE NAME */}
      <Text style={styles.route}>
        {start_location} → {end_location}
      </Text>

      {/* DRIVER */}
      <Text style={styles.driver}>
        🚖 {driver_name || "Driver"}
      </Text>

      {/* STATUS */}
      <Text
        style={[
          styles.status,
          status === "active"
            ? styles.active
            : status === "optimized"
            ? styles.optimized
            : styles.waiting,
        ]}
      >
        {(status || "waiting").toUpperCase()}
      </Text>

      {/* SEATS */}
      <Text style={styles.info}>
        👥 {filled ?? 0} / {total_seats ?? 0} seats
      </Text>

      {/* PRICE */}
      <Text style={styles.price}>
        💰 {price_per_seat ?? 0} ETB / seat
      </Text>

      {/* STOPS (optional fallback) */}
      <Text style={styles.stops}>
        {Array.isArray(stops)
          ? stops.join(" → ")
          : `${start_location} → ${end_location}`}
      </Text>

      {/* BUTTON */}
      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>Join Pool</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },

  route: {
    fontSize: 16,
    fontWeight: "bold",
  },

  driver: {
    marginTop: 4,
    color: "#444",
  },

  status: {
    marginTop: 6,
    fontWeight: "700",
  },

  waiting: { color: "#888" },
  active: { color: "#e67e22" },
  optimized: { color: "#2ecc71" },

  info: {
    marginTop: 6,
  },

  price: {
    marginTop: 6,
    fontWeight: "bold",
  },

  stops: {
    marginTop: 6,
    fontSize: 12,
    color: "#666",
  },

  button: {
    marginTop: 12,
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 8,
  },

  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
});