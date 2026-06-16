import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

export default function MatchingScreen({ navigation, route }) {
  const [matched, setMatched] = useState(1);
   const { routeId, ride } = route.params;
  useEffect(() => {
    const timer1 = setTimeout(() => setMatched(2), 3000);
    const timer2 = setTimeout(() => setMatched(3), 6000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  useEffect(() => {
    if (matched === 3) {
      setTimeout(() => {
        navigation.replace("PickupProposalScreen", {
            routeId,
            ride,
            });
      }, 1500);
    }
  }, [matched]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1DB954" />

      <Text style={styles.title}>
        Finding Compatible Riders
      </Text>

      <Text style={styles.subtitle}>
        Megenagna → Bole Corridor
      </Text>

      <Text style={styles.count}>
        {matched}/3 Riders Found
      </Text>

      {matched === 3 && (
        <Text style={styles.success}>
          🎉 Match Found
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 20,
  },

  subtitle: {
    color: "#666",
    marginTop: 10,
  },

  count: {
    fontSize: 32,
    fontWeight: "bold",
    marginTop: 30,
  },

  success: {
    color: "green",
    fontWeight: "bold",
    marginTop: 20,
    fontSize: 18,
  },
});