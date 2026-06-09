import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

export default function DriverRideCard({ ride }) {
  return (
    <View style={styles.card}>
      <Text style={styles.pickup}>
        {ride.pickup}
      </Text>

      <Text style={styles.passengers}>
        {ride.passengers} Pax Bundle
      </Text>

      <Text style={styles.price}>
        {ride.price} ETB
      </Text>

      <Text style={styles.timer}>
        {ride.timer} left
      </Text>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.btnText}>
          Claim Job
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1f2937",
    padding: 15,
    borderRadius: 15,
    marginBottom: 15,
  },

  pickup: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },

  passengers: {
    color: "#ddd",
    marginTop: 5,
  },

  price: {
    color: "#fff",
    marginTop: 10,
    fontSize: 18,
  },

  timer: {
    color: "#f97316",
    marginTop: 10,
  },

  button: {
    backgroundColor: "#22c55e",
    marginTop: 15,
    padding: 12,
    borderRadius: 10,
  },

  btnText: {
    textAlign: "center",
    color: "#fff",
    fontWeight: "bold",
  },
});