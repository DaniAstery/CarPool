import React from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from "react-native";

import DriverRideCard from "../components/DriverRideCard";
import { rideRequests } from "../data/mockData";

export default function DriverScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        Available Requests
      </Text>

      <FlatList
        data={rideRequests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DriverRideCard ride={item} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827",
    padding: 20,
  },

  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
});