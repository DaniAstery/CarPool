import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";

// 🔐 AUTH & CONTEXT
import { AuthProvider, useAuth } from "./src/AuthContext";

// 🛠️ SCREENS IMPORT MATRIX
import RegistrationScreen from "./src/screens/RegistrationScreen";
import PassengerScreen from "./src/screens/PassengerScreen";
import DriverPendingVerification from "./src/screens/Driver/DriverPendingVerification"; 
import PassengerJoinedPoolScreen from "./src/screens/JoinedPoolScreen";
import LivetrackingScreen from "./src/screens/LiveTrackingScreen";
import MatchingScreen from "./src/screens/MatchingScreen";
import PickupProposalScreen from "./src/screens/PickupProposalScreen";
import TripDepartureScreen from "./src/screens/TripDepartureScreen";
import TripCompletionScreen from "./src/screens/TripCompletionScreen";
import CreateCorridorScreen from "./src/screens/Driver/CreateCorridorScreen";
import WaitingForRidersScreen from "./src/screens/Driver/WaitingForRidersScreen";
import ProposalDriver from "./src/screens/Driver/ProposalDriver";
import WaitingForAcceptanceScreen from "./src/screens/Driver/WaitingForAcceptanceScreen";
import NavigateToPickupScreen from "./src/screens/Driver/NavigateToPickupScreen";
import WaitingForPassengersScreen from "./src/screens/Driver/WaitingForPassengersScreen";
import TripInProgressScreen from "./src/screens/Driver/TripInProgressScreen"; 
import TripEarningsSummaryScreen from "./src/screens/Driver/TripEarningsSummaryScreen";
import TripPaymentScreen from "./src/screens/TripPaymentScreen";
import HomeScreen from "./src/screens/HomeScreen";
import StandardScreen from "./src/screens/StandardScreen";
import DriverEnRouteScreen from "./src/screens/Driver/DriverEnRouteScreen";

const Stack = createNativeStackNavigator();

// 📍 GLOBAL NAVIGATION REF
export const navigationRef = createNavigationContainerRef();

function AppNavigator({ hasLocationPermission, requestLocationPermission }) {
  const { user, isLoading } = useAuth();

  // 1. Prevent screen flash while reading storage or checking permissions
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  // 2. Location Permission Gate (Blocks registration/sign-in if location is rejected)
  if (!hasLocationPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionIcon}>📍</Text>
        <Text style={styles.permissionTitle}>Location Access Required</Text>
        <Text style={styles.permissionSubtitle}>
          Corridor needs your location to match drivers and passengers at exact pickup hubs and compute distances.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={requestLocationPermission}>
          <Text style={styles.primaryButtonText}>Grant Location Permission</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.secondaryButtonText}>Open System Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // 🔐 AUTHENTICATION WORKSPACE
          <>
            <Stack.Screen name="Registration" component={RegistrationScreen} />
            <Stack.Screen name="DriverPendingVerification" component={DriverPendingVerification} />
          </>
        ) : user.role === "driver" ? (
          // 🚖 DRIVER SYSTEM WORKSPACE
          <>
            <Stack.Screen name="CreateCorridor" component={CreateCorridorScreen} />
            <Stack.Screen name="WaitingForRiders" component={WaitingForRidersScreen} />
            <Stack.Screen name="ProposalDriver" component={ProposalDriver} />
            <Stack.Screen name="DriverDepartureScreen" component={TripInProgressScreen} />
            <Stack.Screen name="WaitingForAcceptance" component={WaitingForAcceptanceScreen} />
            <Stack.Screen name="NavigateToPickup" component={NavigateToPickupScreen} />
            <Stack.Screen name="WaitingForPassengers" component={WaitingForPassengersScreen} />
            <Stack.Screen name="TripInProgress" component={TripInProgressScreen} />
            <Stack.Screen name="TripEarningsSummary" component={TripEarningsSummaryScreen} />
            <Stack.Screen name="DriverPendingVerification" component={DriverPendingVerification} />
            <Stack.Screen name="DriverEnRoute" component={DriverEnRouteScreen} />
          </>
        ) : (
          // 🎒 PASSENGER WORKSPACE
          <>
            <Stack.Screen name="Passenger" component={PassengerScreen} />
            <Stack.Screen name="JoinedPool" component={PassengerJoinedPoolScreen} />
            <Stack.Screen name="LiveTracking" component={LivetrackingScreen} />
            <Stack.Screen name="MatchingScreen" component={MatchingScreen} />
            <Stack.Screen name="PickupProposal" component={PickupProposalScreen} />
            <Stack.Screen name="TripDeparture" component={TripDepartureScreen} />
            <Stack.Screen name="TripCompletion" component={TripCompletionScreen} />
            <Stack.Screen name="TripPayment" component={TripPaymentScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Standard" component={StandardScreen} />
          

          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [hasLocationPermission, setHasLocationPermission] = useState(false);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(status === "granted");
    } catch (err) {
      console.warn("Location permission error:", err);
    }
  };

  useEffect(() => {
    // 1. Check Location Permission on App Boot
    requestLocationPermission();

    // 2. Configure Audio Session
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: false,
      staysActiveInBackground: false,
    }).catch((err) => console.log("Audio mode setup error:", err));
  }, []);

  return (
    <AuthProvider>
      <AppNavigator 
        hasLocationPermission={hasLocationPermission} 
        requestLocationPermission={requestLocationPermission} 
      />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  permissionIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 10,
  },
  permissionSubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: "#10B981",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
});