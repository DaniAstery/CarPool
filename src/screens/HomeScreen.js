import React from "react";
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, StatusBar } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../AuthContext";

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const userName = user?.full_name?.split(" ")[0] || "Rider";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FA" />
      
      {/* Header Section */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {userName} 👋</Text>
          <Text style={styles.subtitle}>Ready for your next trip?</Text>
        </View>
        <TouchableOpacity style={styles.profileButton}>
          <Ionicons name="person-circle" size={48} color="#2F4F4F" />
        </TouchableOpacity>
      </View>

      {/* Main Action Card */}
      <View style={styles.actionCard}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="car-hatchback" size={40} color="#2F4F4F" />
        </View>
        <Text style={styles.cardTitle}>Find a Corridor Ride</Text>
        <Text style={styles.cardDescription}>
          Join a pool and share a ride to your destination quickly and efficiently.
        </Text>
        
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => console.log("Navigate to Route Selection or Hub Picker")}
        >
          <Text style={styles.primaryButtonText}>Request a Ride</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {/* Recent Activity or Fallback Info */}
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#E28743" />
          <Text style={styles.infoText}>
            You have no active ride proposals right now. If your previous request expired or encountered an issue, you can start a fresh search above.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1A1A1A",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    marginTop: 4,
  },
  profileButton: {
    justifyContent: "center",
    alignItems: "center",
  },
  actionCard: {
    backgroundColor: "#FFF",
    marginHorizontal: 20,
    marginTop: 30,
    padding: 24,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    alignItems: "center",
  },
  iconContainer: {
    width: 72,
    height: 72,
    backgroundColor: "#E8F0F0",
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  primaryButton: {
    flexDirection: "row",
    backgroundColor: "#2F4F4F",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  infoSection: {
    marginTop: 40,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: "#FFF3E0",
    padding: 16,
    borderRadius: 12,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: "#D2691E",
    lineHeight: 20,
  },
});