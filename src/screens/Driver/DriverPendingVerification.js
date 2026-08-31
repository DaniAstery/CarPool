import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";


const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://98.89.38.224:5000/api";

export default function DriverPendingVerification({ route, navigation }) {
  const { userId } = route.params || {};
  const [isChecking, setIsChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Checking account approval status...");

  // Poll server to check if driver account has been approved/activated
  useEffect(() => {
    let interval;
    if (userId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/auth/check-status/${userId}`);
          if (res.ok) {
            const data = await res.json();
            
            // Once phone is verified and account is active, proceed to driver workspace
            if (data.phone_verified) {
              clearInterval(interval);
              navigation.replace("CreateCorridor", { userId });
            }
          }
        } catch (err) {
          console.log("Status check polling error:", err);
        }
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [userId, navigation]);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const res = await fetch(`${API_URL}/auth/check-status/${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.phone_verified) {
          navigation.replace("CreateCorridor", { userId });
        } else {
          setStatusMessage("Account verification still pending review.");
        }
      }
    } catch (err) {
      setStatusMessage("Could not connect to server. Please try again.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <FontAwesome5 name="user-clock" size={38} color="#059669" />
        </View>

        <Text style={styles.title}>Verification Pending</Text>
        <Text style={styles.subtitle}>
          Your Telegram phone verification was successful! Your driver profile is currently pending final review and activation by the Corridor operations team.
        </Text>

        <View style={styles.statusBox}>
          <ActivityIndicator size="small" color="#059669" style={{ marginRight: 8 }} />
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleManualCheck}
          disabled={isChecking}
          activeOpacity={0.8}
        >
          {isChecking ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.buttonText}>Check Status Now</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.replace("Registration")}
        >
          <Text style={styles.backButtonText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingHorizontal: 20, justifyContent: "center" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 24, borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center", elevation: 2 },
  iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#ECFDF5", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 10, textAlign: "center" },
  subtitle: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 24, fontWeight: "500" },
  statusBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginBottom: 24, width: "100%", justifyContent: "center" },
  statusText: { fontSize: 12, fontWeight: "700", color: "#4B5563" },
  button: { backgroundColor: "#059669", borderRadius: 12, paddingVertical: 14, width: "100%", flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 12, shadowColor: "#059669", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  backButton: { paddingVertical: 8 },
  backButtonText: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
});