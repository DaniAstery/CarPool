import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

export default function PickupProposalScreen({
  navigation,
}) {
  const [accepted, setAccepted] = useState(false);

  const acceptPickup = () => {
    setAccepted(true);

    setTimeout(() => {
      navigation.replace("LiveTrackingScreen");
    }, 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        📍 Pickup Proposal
      </Text>

      <View style={styles.card}>
        <Text style={styles.location}>
          Megenagna Blue Taxi Stop
        </Text>

        <Text>
          Your Walk: 180m (2 min)
        </Text>

        <Text>
          Rider 2: 140m
        </Text>

        <Text>
          Rider 3: 220m
        </Text>
      </View>

      {!accepted ? (
        <TouchableOpacity
          style={styles.button}
          onPress={acceptPickup}
        >
          <Text style={styles.buttonText}>
            ACCEPT PICKUP POINT
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.waiting}>
          Waiting for other passengers...
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 15,
    elevation: 5,
  },

  location: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
  },

  button: {
    backgroundColor: "#1DB954",
    marginTop: 30,
    padding: 15,
    borderRadius: 12,
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "bold",
  },

  waiting: {
    marginTop: 20,
    textAlign: "center",
    color: "green",
    fontWeight: "bold",
  },
});