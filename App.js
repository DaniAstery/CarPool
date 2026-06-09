import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PassengerJoinedPoolScreen from "./src/screens/JoinedPoolScreen";
import PassengerScreen from "./src/screens/PassengerScreen";
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

      </Stack.Navigator>
    </NavigationContainer>
  );
}