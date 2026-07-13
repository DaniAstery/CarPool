import React from "react";
import { ActivityIndicator, View, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// 🔐 IMPORT THE GLOBAL AUTH STATE SYSTEM
// 🎯 FIXED: Set to your exact path in the src folder
import { AuthProvider, useAuth } from "./src/AuthContext"; 

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
import TripInProgressScreen from "./src/screens/Driver/TripInProgressScreen"; // 🎯 SINGLE DEFAULT EXPORT
import TripEarningsSummaryScreen from "./src/screens/Driver/TripEarningsSummaryScreen";
import TripPaymentScreen from "./src/screens/TripPaymentScreen";

const Stack = createNativeStackNavigator();

// 🗺️ NAVIGATION GATEWAY ENGINE
function NavigationGateway() {
  const { user, isLoading } = useAuth();

  // 🌀 Show an overlay loading indicator while AsyncStorage reads matching keys from disk storage
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#007BFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        
        {user === null ? (
          // 🛑 1. UNAUTHENTICATED ROUTE CHANNEL (User needs to create an identity)
          <Stack.Screen 
            name="Register" 
            component={RegisterScreen} 
          />
        ) : user.role === "driver" ? (
          // 🚖 2. DRIVER SYSTEM HUB WORKSPACE (Boots straight to corridor map pipeline setup)
          <>
            <Stack.Screen name="CreateCorridorScreen" component={CreateCorridorScreen} />
            <Stack.Screen name="WaitingForRiders" component={WaitingForRidersScreen} />
            <Stack.Screen name="ProposalDriver" component={ProposalDriver} />
            {/* 🎯 FIXED: Both rows now point safely to the single imported TripInProgressScreen component */}
            <Stack.Screen name="DriverDepartureScreen" component={TripInProgressScreen} />
            <Stack.Screen name="WaitingForAcceptance" component={WaitingForAcceptanceScreen} />
            <Stack.Screen name="NavigateToPickup" component={NavigateToPickupScreen} />
            <Stack.Screen name="WaitingForPassengers" component={WaitingForPassengersScreen} />
            <Stack.Screen name="TripInProgress" component={TripInProgressScreen}/>
            <Stack.Screen name="TripEarningsSummary" component={TripEarningsSummaryScreen} />
          </>
        ) : (
          // 🎒 3. PASSENGER/RIDER WORKSPACE (Boots instantly to match channels)
          <>
            <Stack.Screen name="Passenger" component={PassengerScreen} />
            <Stack.Screen name="JoinedPool" component={PassengerJoinedPoolScreen} />
            <Stack.Screen name="LiveTracking" component={LivetrackingScreen} />
            <Stack.Screen name="MatchingScreen" component={MatchingScreen} />
            <Stack.Screen name="PickupProposal" component={PickupProposalScreen} />
            <Stack.Screen name="TripDeparture" component={TripDepartureScreen} />
            <Stack.Screen name="TripCompletionScreen" component={TripCompletionScreen} />
            <Stack.Screen name="TripPayment" component={TripPaymentScreen} />
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