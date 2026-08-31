import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../AuthContext";
import { playSound } from "../utils/soundPlayer";

export default function TripPaymentScreen({ route, navigation }) {
  const { user } = useAuth();
  const currentUserId = parseInt(user?.id || user?.user_id, 10);

  const routeParams = route?.params || {};
  const paramFixedPrice = routeParams.fixedPrice;
  const paramCorridor = routeParams.corridor;

  const [fixedPrice, setFixedPrice] = useState(paramFixedPrice || 80);
  const [corridor, setCorridor] = useState(paramCorridor || "Loading corridor...");
  const [driverName, setDriverName] = useState("Assigned Driver");
  const [driverPhone, setDriverPhone] = useState("");
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://98.89.38.224:5000";

  // Fetch payment info and calculate correct split cost dynamically if not fully provided via route params
  useEffect(() => {
    let isMounted = true;
    async function fetchPaymentDetailsByUser() {
      if (!currentUserId) {
        setIsLoadingDetails(false);
        setCorridor("User ID Not Found");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/rides/payment-details-by-user/${currentUserId}`);
        const data = await res.json();
        if (res.ok && data.success && isMounted) {
          if (!paramFixedPrice) {
            const fetchedTotal = data.totalPrice || data.fixedPrice || 80;
            const fetchedPax = Math.max(1, data.passengerCount || 1);
            const computedSplit = Math.round((fetchedTotal / fetchedPax) * 100) / 100;
            setFixedPrice(computedSplit);
          }
          if (!paramCorridor && data.corridor) {
            setCorridor(data.corridor);
          }
          if (data.driverName) setDriverName(data.driverName);
          if (data.driverPhone) setDriverPhone(data.driverPhone);
        } else if (isMounted && !paramCorridor) {
          setCorridor("No Active Route Found");
        }
      } catch (err) {
        console.log("⚠️ Failed to fetch payment details:", err.message);
        if (isMounted && !paramCorridor) setCorridor("Connection Error");
      } finally {
        if (isMounted) setIsLoadingDetails(false);
      }
    }

    fetchPaymentDetailsByUser();
    return () => { isMounted = false; };
  }, [currentUserId, paramFixedPrice, paramCorridor]);

  const handleTelebirrPay = async () => {
    if (!driverPhone || driverPhone === "Phone Not Available") {
      Alert.alert("Notice", "Driver phone number is not available.");
      return;
    }

    setIsProcessing(true);
    try {
      await Clipboard.setStringAsync(driverPhone);
      setTimeout(() => {
        setIsProcessing(false);
        Alert.alert(
          "Telebirr Number Copied! 📋",
          `Driver phone number (${driverPhone}) copied to clipboard. Open Telebirr and paste it to transfer ETB ${fixedPrice}.`,
          [
            {
              text: "I Have Paid",
              onPress: () => {
                playSound(7);
                navigation.reset({
                  index: 0,
                  routes: [{ name: "Passenger" }],
                });
              },
            },
          ],
          { cancelable: false }
        );
      }, 600);
    } catch (err) {
      setIsProcessing(false);
      playSound(7);
      Alert.alert("Error", "Failed to copy number to clipboard.");
    }
  };

  const handleCbePay = async () => {
    setIsProcessing(true);
    const cbeAccount = "1000349012901";
    await Clipboard.setStringAsync(cbeAccount);
    
    setTimeout(() => {
      setIsProcessing(false);
      Alert.alert(
        "CBE Account Copied! 📋",
        `CBE Account (${cbeAccount}) copied to clipboard. Transfer ETB ${fixedPrice} via CBE Birr or Mobile Banking.`,
        [
          {
            text: "I Have Paid",
            onPress: () => {
              playSound(7);
              navigation.reset({
                index: 0,
                routes: [{ name: "Passenger" }],
              });
            },
          },
        ]
      );
    }, 600);
  };

  const handleFinishTrip = () => {
    playSound(7);
    navigation.reset({
      index: 0,
      routes: [{ name: "Passenger" }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Context Bar */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Settle Split Fare</Text>
          <Text style={styles.headerSubtitle}>Tap below to copy details and pay manually</Text>
        </View>

        {/* Itemized Fare Receipt Card */}
        <View style={styles.receiptCard}>
          <Text style={styles.receiptLabel}>TRANSIT CORRIDOR</Text>
          <Text style={styles.receiptValue}>
            {isLoadingDetails && !paramCorridor ? "Loading corridor..." : corridor}
          </Text>
          
          <View style={styles.dividerLine} />
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Total Split Cost</Text>
            <Text style={styles.priceValueAmount}>ETB {fixedPrice}</Text>
          </View>
        </View>

        <Text style={styles.selectionSectionLabel}>Choose Payment Method</Text>

        {/* 💳 TELEBIRR COPY BUTTON */}
        <TouchableOpacity
          style={styles.paymentMethodCard}
          activeOpacity={0.85}
          onPress={handleTelebirrPay}
          disabled={isProcessing}
        >
          <View style={styles.driverDetailSnippet}>
            <Text style={styles.driverSnippetLabel}>TELEBIRR DESTINATION ACCOUNT</Text>
            <Text style={styles.driverSnippetValue}>
              {driverName} ({driverPhone || "Loading..."})
            </Text>
          </View>

          <View style={styles.methodInterfaceRow}>
            <View style={styles.cardLeftContent}>
              <View style={[styles.iconFrame, { backgroundColor: "#EFF6FF" }]}>
                <MaterialCommunityIcons name="cellphone-wireless" size={22} color="#1D4ED8" />
              </View>
              <View style={styles.methodMeta}>
                <Text style={styles.methodTitleName}>Pay via telebirr</Text>
                <Text style={styles.methodSubtext}>Copies driver phone number to clipboard</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        {/* 🏦 CBE APP COPY BUTTON */}
        <TouchableOpacity
          style={styles.paymentMethodCard}
          activeOpacity={0.85}
          onPress={handleCbePay}
          disabled={isProcessing}
        >
          <View style={styles.driverDetailSnippet}>
            <Text style={styles.driverSnippetLabel}>CBE ACCOUNT DESTINATION</Text>
            <Text style={styles.driverSnippetValue}>{driverName} • 1000349012901</Text>
          </View>

          <View style={styles.methodInterfaceRow}>
            <View style={styles.cardLeftContent}>
              <View style={[styles.iconFrame, { backgroundColor: "#FFFBEB" }]}>
                <FontAwesome5 name="university" size={18} color="#D97706" />
              </View>
              <View style={styles.methodMeta}>
                <Text style={styles.methodTitleName}>Pay via CBE Birr</Text>
                <Text style={styles.methodSubtext}>Copies CBE account number to clipboard</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        {/* 🏁 FINISH BUTTON */}
        <TouchableOpacity
          style={styles.finishButton}
          activeOpacity={0.85}
          onPress={handleFinishTrip}
          disabled={isProcessing}
        >
          <View style={styles.buttonInternalGroup}>
            <Ionicons name="checkmark-done-circle" size={18} color="#374151" style={{ marginRight: 8 }} />
            <Text style={styles.finishButtonText}>Finish & Return to Home</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Copying payment details...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 30 },
  headerRow: { marginTop: 24, marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#111827" },
  headerSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  receiptCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 25, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  receiptLabel: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
  receiptValue: { fontSize: 15, fontWeight: "600", color: "#111827", marginTop: 4 },
  dividerLine: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 14 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceLabel: { fontSize: 14, fontWeight: "600", color: "#4B5563" },
  priceValueAmount: { fontSize: 22, fontWeight: "800", color: "#10B981" },
  selectionSectionLabel: { fontSize: 12, fontWeight: "700", color: "#4B5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, marginLeft: 2 },
  paymentMethodCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, padding: 14, marginBottom: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  driverDetailSnippet: { backgroundColor: "#ECFDF5", marginHorizontal: -14, marginTop: -14, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#A7F3D0", marginBottom: 14 },
  driverSnippetLabel: { fontSize: 9, fontWeight: "800", color: "#047857", letterSpacing: 0.5 },
  driverSnippetValue: { fontSize: 13, fontWeight: "700", color: "#065F46", marginTop: 2 },
  methodInterfaceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLeftContent: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconFrame: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  methodMeta: { marginLeft: 14, flex: 1 },
  methodTitleName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  methodSubtext: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  finishButton: { backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 14, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonInternalGroup: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  finishButtonText: { fontSize: 15, fontWeight: "700", color: "#374151" },
  loadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.8)", justifyContent: "center", alignItems: "center", zIndex: 99 },
  loadingText: { marginTop: 10, fontSize: 14, fontWeight: "600", color: "#374151" }
});