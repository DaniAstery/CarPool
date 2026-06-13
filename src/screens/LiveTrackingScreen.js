import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView
} from "react-native";

import MapView, { Marker, Polyline } from "react-native-maps";

export default function LiveTrackingScreen() {
  const [driverLocation, setDriverLocation] = useState({
    latitude: 9.010,
    longitude: 38.760,
  });

  const [pickupLocation] = useState({
    latitude: 9.020,
    longitude: 38.770,
  });

  const [passengerLocation] = useState({
    latitude: 9.000,
    longitude: 38.750,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setDriverLocation((prev) => ({
        ...prev,
        latitude: prev.latitude + 0.0001,
        longitude: prev.longitude + 0.0001,
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 9.010,
          longitude: 38.760,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          coordinate={driverLocation}
          title="Driver"
        />

        <Marker
          coordinate={pickupLocation}
          title="Pickup Point"
        />

        <Marker
          coordinate={passengerLocation}
          title="You"
        />

        <Polyline
          coordinates={[
            passengerLocation,
            pickupLocation,
          ]}
          strokeWidth={4}
        />
      </MapView>

      <ScrollView style={styles.bottomCard}>
        <Text style={styles.title}>
          I'M ON MY WAY
        </Text>

        <Text style={styles.subtitle}>
          Walk to your pickup point
        </Text>

        <View style={styles.driverCard}>
          <Image
            source={{
              uri: "https://randomuser.me/api/portraits/men/32.jpg",
            }}
            style={styles.avatar}
          />

          <View>
            <Text style={styles.driverName}>
              Abebe T.
            </Text>

            <Text>
              Toyota Prius
            </Text>

            <Text>
              ⭐ 4.8
            </Text>
          </View>
        </View>

        <View style={styles.poolCard}>
          <Text style={styles.poolTitle}>
            Pool Details
          </Text>

          <Text>
            Pickup 1 - Bole Airport
          </Text>

          <Text>
            Pickup 2 - Thunder Place
          </Text>

          <Text>
            Dropoff - Kazanchis Hilton
          </Text>

          <Text>
            Seats Filled: 2/3
          </Text>
        </View>

        <TouchableOpacity style={styles.cancelButton}>
          <Text style={styles.cancelText}>
            CANCEL RIDE
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  map: {
    flex: 1,
  },

  bottomCard: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "50%",
    padding: 20,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    color: "green",
  },

  subtitle: {
    textAlign: "center",
    marginBottom: 20,
  },

  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },

  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },

  driverName: {
    fontWeight: "700",
    fontSize: 18,
  },

  poolCard: {
    padding: 15,
    backgroundColor: "#f7f7f7",
    borderRadius: 10,
    marginBottom: 20,
  },

  poolTitle: {
    fontWeight: "700",
    marginBottom: 10,
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: "red",
    borderRadius: 10,
    padding: 15,
  },

  cancelText: {
    color: "red",
    textAlign: "center",
    fontWeight: "700",
  },
});