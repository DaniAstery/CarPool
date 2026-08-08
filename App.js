import React, { useEffect } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 🔐 AUTH & CONTEXT
import { AuthProvider, useAuth } from "./src/AuthContext"; // Adjust path if AuthContext is elsewhere

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
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

const Stack = createNativeStackNavigator();

// 📍 GLOBAL NAVIGATION REF
export const navigationRef = createNavigationContainerRef();

function AppNavigator() {
  const { user, isLoading } = useAuth();

  // Prevent flash of auth screen while reading AsyncStorage session
  if (isLoading) {
    return null; 
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {

  useEffect(() => {
    // Configure audio session globally on app startup to allow background mixing without ducking
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: false, // Prevents Android from lowering other apps
      staysActiveInBackground: false,
    }).catch((err) => console.log("Audio mode setup error:", err));
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}