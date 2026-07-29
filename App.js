import React from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 🔐 IMPORT THE GLOBAL AUTH STATE SYSTEM
import { AuthProvider, useAuth } from "./src/AuthContext"; 

// 🛰️ IMPORT THE ROLE-AWARE RIDE GATEWAY HOOK
import { useRideGateway } from "./src/hooks/useRideGateway";

// 🛠️ SCREENS IMPORT MATRIX
import RegisterScreen from "./src/screens/RegistrationScreen";
import PassengerJoinedPoolScreen from "./src/screens/JoinedPoolScreen";
import PassengerScreen from "./src/screens/PassengerScreen";
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
const Stack = createNativeStackNavigator();

// 📍 GLOBAL NAVIGATION REF (Allows NavigationGateway to trigger navigation)
export const navigationRef = createNavigationContainerRef();

// 🗺️ NAVIGATION GATEWAY ENGINE
function NavigationGateway() {
  const { user, isLoading } = useAuth();

  // 🚀 ACTIVATE ROLE-AWARE RIDE GATEWAY
  useRideGateway({
    userId: user?.id,
    userRole: user?.role, // "driver" vs "passenger"
    navigationRef: navigationRef,
    enabled: Boolean(user?.id),
  });

  // 🌀 Show loading indicator while reading storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        
        {user === null ? (
          // 🛑 1. UNAUTHENTICATED ROUTE CHANNEL
          <Stack.Screen 
            name="Register" 
            component={RegisterScreen} 
          />
        ) : user.role === "driver" ? (
          // 🚖 2. DRIVER SYSTEM HUB WORKSPACE
          <>
            <Stack.Screen name="CreateCorridor" component={CreateCorridorScreen} />
            <Stack.Screen name="WaitingForRiders" component={WaitingForRidersScreen} />
            <Stack.Screen name="ProposalDriver" component={ProposalDriver} />
            <Stack.Screen name="DriverDepartureScreen" component={TripInProgressScreen} />
            <Stack.Screen name="WaitingForAcceptance" component={WaitingForAcceptanceScreen} />
            <Stack.Screen name="NavigateToPickup" component={NavigateToPickupScreen} />
            <Stack.Screen name="WaitingForPassengers" component={WaitingForPassengersScreen} />
            <Stack.Screen name="TripInProgress" component={TripInProgressScreen}/>
            <Stack.Screen name="TripEarningsSummary" component={TripEarningsSummaryScreen} />
          </>
        ) : (
          // 🎒 3. PASSENGER/RIDER WORKSPACE
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

// 🏁 ROOT APPLICATION BOUNDARY ENTITY
export default function App() {
  return (
    <AuthProvider>
      <NavigationGateway />
    </AuthProvider>
  );
}