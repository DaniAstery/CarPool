import React, { useEffect, useRef, useState } from "react";
import { AppState, View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

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
import TrackingDriverScreen from "./src/screens/TrackingDriverScreen";
import DriverStandardTripInProgress from "./src/screens/Driver/DriverStandardTripInProgress";

const Stack = createNativeStackNavigator();
const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000")
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

async function fetchRecoveryJson(path) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${API_URL}${path}`, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function getPoolPassengerCount(poolSession) {
  const passengers = Array.isArray(poolSession?.passengers) ? poolSession.passengers : null;
  if (passengers) {
    const passengerIds = new Set(
      passengers
        .map((passenger) => Number(passenger?.user_id ?? passenger?.userId))
        .filter((passengerId) => Number.isInteger(passengerId) && passengerId > 0)
    );
    return passengerIds.size;
  }
  return Number(poolSession?.currentPoolCount ?? poolSession?.pool_count ?? 0) || 0;
}

async function resolveLifecycleRoute(user, { includeCompleted = true } = {}) {
  const userId = user?.id || user?.user_id;
  if (!userId) return null;
  const role = String(user.role || "passenger").toLowerCase().trim();
  const isDriver = role === "driver";

  if (isDriver) {
    const proposal = await fetchRecoveryJson(`/api/rides/driver-proposal/${userId}`);
    if (proposal?.hasActiveProposal && proposal.id) {
      const status = String(proposal.status || "").toLowerCase().trim();
      const acceptedCount = Array.isArray(proposal.accepted_passengers)
        ? proposal.accepted_passengers.length
        : 0;
      const passengerCount = Math.max(
        acceptedCount,
        Array.isArray(proposal.passengers) ? proposal.passengers.length : 0
      );
      const commonParams = {
        driverId: userId,
        rideOfferId: proposal.ride_offer_id || proposal.id,
        ride_offer_id: proposal.ride_offer_id || proposal.id,
        routeId: proposal.route_id,
        route_id: proposal.route_id,
      };

      if (["in_trip", "inprogress", "intransit"].includes(status)) {
        return { name: "TripInProgress", params: commonParams };
      }
      if (["accepted", "arrived", "heading_to_pickup"].includes(status)) {
        return { name: "NavigateToPickup", params: commonParams };
      }
      if (["pending", "proposed", "matched"].includes(status)) {
        return {
          name: passengerCount >= 2 ? "WaitingForAcceptance" : "WaitingForRiders",
          params: {
            ...commonParams,
            ride: {
              id: proposal.id,
              total_seats: proposal.total_seats,
              filled: passengerCount,
            },
          },
        };
      }
    }

    const driverSession = await fetchRecoveryJson(`/api/rides/driver-active-session/${userId}`);
    if (driverSession?.hasActiveSession && driverSession.rideOfferId) {
      const status = String(driverSession.status || "").toLowerCase().trim();
      const params = {
        driverId: userId,
        rideOfferId: driverSession.rideOfferId,
        ride_offer_id: driverSession.rideOfferId,
        routeId: driverSession.routeId,
        route_id: driverSession.routeId,
      };
      if (includeCompleted && status === "completed") {
        return { name: "TripEarningsSummary", params };
      }
      if (["in_trip", "inprogress", "intransit"].includes(status)) {
        return { name: "TripInProgress", params };
      }
      if (["accepted", "arrived", "heading_to_pickup"].includes(status)) {
        return { name: "NavigateToPickup", params };
      }
      if (["pending", "proposed", "matched"].includes(status)) {
        return { name: "WaitingForRiders", params };
      }
    }
  }

  if (!isDriver) {
    const poolSession =
      (await fetchRecoveryJson(`/api/routes/status/${userId}`)) ||
      (await fetchRecoveryJson(`/passenger/status/${userId}`));
    const poolStatus = String(poolSession?.status || "").toLowerCase().trim();
    const rideOfferId = poolSession?.matched_ride_offer_id || null;
    const routeId = poolSession?.routeId || null;
    const passengerCount = getPoolPassengerCount(poolSession);
    const rideStatus = String(poolSession?.rideStatus || "").toLowerCase().trim();

    if (poolStatus && !["idle", "cancelled", "expired"].includes(poolStatus)) {
      const params = {
        userId,
        rideOfferId,
        ride_offer_id: rideOfferId,
        routeId,
        route_id: routeId,
        poolId: poolSession.poolId,
        poolStatus,
        currentPoolCount: passengerCount,
      };
      if (
        ["in_trip", "inprogress", "started"].includes(poolStatus) ||
        ["departed", "started", "inprogress", "in_trip"].includes(rideStatus)
      ) {
        return { name: "TripDeparture", params };
      }
      if (includeCompleted && poolStatus === "completed") {
        return { name: "TripDeparture", params };
      }
      const passengerAccepted = ["accepted", "arrived"].includes(poolStatus);
      const driverAccepted = ["accepted", "arrived"].includes(rideStatus);
      if (passengerAccepted && driverAccepted) {
        return { name: "LiveTracking", params };
      }
      if (
        rideOfferId &&
        (
          passengerCount >= 2 ||
          passengerAccepted
        )
      ) {
        return { name: "PickupProposal", params };
      }
      if (
        ["searching", "pending", "active", "joined", "matched", "assigned", "accepted_proposal", "proposed"].includes(poolStatus)
      ) {
        return { name: "MatchingScreen", params };
      }
    }
  }

  const soloSession = await fetchRecoveryJson(
    `/api/rides/solo/recovery/${userId}?role=${isDriver ? "driver" : "passenger"}&include_completed=${includeCompleted}`
  );
  const soloRide = soloSession?.ride;
  if (soloSession?.success && soloRide?.id) {
    const status = String(soloRide.status || "").toLowerCase().trim();
    if (isDriver) {
      const params = {
        rideId: soloRide.id,
        ride: soloRide,
        driverId: userId,
        passengerId: soloRide.user_id,
      };
      if (["in_trip", "intransit"].includes(status)) {
        return { name: "DriverStandardTripInProgress", params };
      }
      if (["accepted", "arrived", "heading_to_pickup"].includes(status)) {
        return { name: "DriverEnRoute", params };
      }
    } else {
      const params = {
        rideId: soloRide.id,
        standardRequestId: soloRide.id,
        userId,
        initialStatus: status,
        ride: soloRide,
      };
      if (["accepted", "arrived", "in_trip", "intransit", "completed"].includes(status)) {
        return { name: "TrackingDriver", params };
      }
      if (["pending", "searching", "requested", "created"].includes(status)) {
        return { name: "Standard", params };
      }
    }
  }

  if (isDriver) return null;
  return null;
}

// 📍 GLOBAL NAVIGATION REF
export const navigationRef = createNavigationContainerRef();

function AppNavigator({ hasLocationPermission, requestLocationPermission }) {
  const { user, isLoading } = useAuth();
  const [initialNavState, setInitialNavState] = useState(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const recoveryInFlightRef = useRef(false);

  // Resolve server lifecycle state before creating the first authenticated screen.
  useEffect(() => {
    let isMounted = true;

    async function restoreLifecycle() {
      try {
        const destination = await resolveLifecycleRoute(user);
        if (isMounted) {
          const defaultScreen = !user
            ? "Registration"
            : user.role === "driver"
              ? "CreateCorridor"
              : "Passenger";
          setInitialNavState({
            index: 0,
            routes: [{
              name: destination?.name || defaultScreen,
              params: destination?.params || { userId: user?.id || user?.user_id },
            }],
          });
        }
      } catch (err) {
        console.warn("Lifecycle recovery unavailable during startup:", err.message);
        if (isMounted) {
          const defaultScreen = !user
            ? "Registration"
            : user.role === "driver"
              ? "CreateCorridor"
              : "Passenger";
          setInitialNavState({
            index: 0,
            routes: [{ name: defaultScreen, params: { userId: user?.id || user?.user_id } }]
          });
        }
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    if (!isLoading) {
      restoreLifecycle();
    }

    return () => { isMounted = false; };
  }, [user, isLoading]);

  // Re-check on foreground and periodically so a temporary connection loss does
  // not leave the driver or passenger stranded on a stale lifecycle screen.
  useEffect(() => {
    if (isLoading || isRestoringSession || !(user?.id || user?.user_id)) return undefined;

    let isMounted = true;
    let timerId;
    let appIsActive = AppState.currentState === "active";

    const checkLifecycle = async () => {
      if (!isMounted || !appIsActive || recoveryInFlightRef.current || !navigationRef.isReady()) return;
      recoveryInFlightRef.current = true;
      try {
        const currentRoute = navigationRef.getCurrentRoute();
        const includeCompleted = ["TripInProgress", "TripDeparture", "TrackingDriver"].includes(currentRoute?.name);
        const destination = await resolveLifecycleRoute(user, { includeCompleted });
        if (!isMounted || !destination || !navigationRef.isReady()) return;

        const currentParams = currentRoute?.params || {};
        const currentRideId =
          currentParams.rideOfferId ||
          currentParams.ride_offer_id ||
          currentParams.rideId ||
          currentParams.standardRequestId;
        const destinationRideId =
          destination.params?.rideOfferId ||
          destination.params?.ride_offer_id ||
          destination.params?.rideId ||
          destination.params?.standardRequestId;

        if (currentRoute?.name !== destination.name || String(currentRideId || "") !== String(destinationRideId || "")) {
          navigationRef.resetRoot({
            index: 0,
            routes: [{ name: destination.name, params: destination.params }],
          });
        }
      } catch (err) {
        console.warn("Lifecycle recovery check failed; will retry:", err.message);
      } finally {
        recoveryInFlightRef.current = false;
        if (isMounted) timerId = setTimeout(checkLifecycle, 8000);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const wasActive = appIsActive;
      appIsActive = nextState === "active";
      if (appIsActive && !wasActive) {
        if (timerId) clearTimeout(timerId);
        checkLifecycle();
      }
    });

    const readyTimer = setTimeout(checkLifecycle, 1000);
    return () => {
      isMounted = false;
      clearTimeout(readyTimer);
      clearTimeout(timerId);
      appStateSubscription.remove();
    };
  }, [isLoading, isRestoringSession, user]);

  // 1. Prevent screen flash while reading storage or restoring session
  if (isLoading || isRestoringSession) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={{ color: "#94A3B8", marginTop: 12, fontSize: 13, fontWeight: "600" }}>
          Restoring corridor session...
        </Text>
      </View>
    );
  }

  // 2. Location Permission Gate (Blocks registration/sign-in if location is rejected)
  if (!hasLocationPermission) {
    return (
      <SafeAreaView style={styles.permissionContainer} edges={["top", "right", "bottom", "left"]}>
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
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} initialState={initialNavState}>
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
            <Stack.Screen name="DriverStandardTripInProgress" component={DriverStandardTripInProgress} />
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
            <Stack.Screen name="TrackingDriver" component={TrackingDriverScreen} />
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
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator
          hasLocationPermission={hasLocationPermission}
          requestLocationPermission={requestLocationPermission}
        />
      </AuthProvider>
    </SafeAreaProvider>
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