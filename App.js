import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
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
import DriverDepartureScreen from "./src/screens/Driver/TripInProgressScreen";
import WaitingForAcceptanceScreen from "./src/screens/Driver/WaitingForAcceptanceScreen";
import NavigateToPickupScreen from "./src/screens/Driver/NavigateToPickupScreen";
import WaitingForPassengersScreen from "./src/screens/Driver/WaitingForPassengersScreen";
import TripInProgressScreen from "./src/screens/Driver/TripInProgressScreen";
import TripEarningsSummaryScreen from "./src/screens/Driver/TripEarningsSummaryScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* 👇 ALL YOUR SCREENS GO HERE */}
        <Stack.Screen
          name="Passenger"
          component={PassengerScreen}
        />

        <Stack.Screen
          name="JoinedPool"
          component={PassengerJoinedPoolScreen}
        />

        <Stack.Screen 
          name="LiveTrackingScreen" 
          component={LivetrackingScreen} 
        />
        <Stack.Screen
          name="MatchingScreen"
          component={MatchingScreen}
        />

        <Stack.Screen
          name="PickupProposalScreen"
          component={PickupProposalScreen}
        />

        <Stack.Screen
          name="TripDepartureScreen"
          component={TripDepartureScreen}
        />

         <Stack.Screen
          name="TripCompletionScreen"
          component={TripCompletionScreen}
        />
          <Stack.Screen
          name="CreateCorridorScreen"
          component={CreateCorridorScreen}
        />

        <Stack.Screen name="WaitingForRiders" component={WaitingForRidersScreen} />
        <Stack.Screen name="ProposalDriver" component={ProposalDriver} />
        <Stack.Screen name="DriverDepartureScreen" component={DriverDepartureScreen} />
        <Stack.Screen name="WaitingForAcceptance" component={WaitingForAcceptanceScreen} />
        <Stack.Screen name="NavigateToPickup" component={NavigateToPickupScreen} />
        <Stack.Screen name="WaitingForPassengers" component={WaitingForPassengersScreen} />
        <Stack.Screen name="TripInProgress" component={TripInProgressScreen}/>
        <Stack.Screen name="TripEarningsSummary" component={TripEarningsSummaryScreen} />
    </Stack.Navigator>
    </NavigationContainer>
  );
}
