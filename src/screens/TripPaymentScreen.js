import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

export default function TripPaymentScreen({ navigation, route }) {
  const fixedPrice = route?.params?.fixedPrice || 80;
  const corridor = route?.params?.corridor || "Megenagna → Bole";
  const driverName = route?.params?.driverName || "Dawit Mengistu";
  const driverPhone = route?.params?.driverPhone || "0911234567";

  const [isProcessing, setIsProcessing] = useState(false);

  const handleTelebirrPay = async () => {
    setIsProcessing(true);
    try {
      // 1. Copy driver phone number to clipboard instantly
      await Clipboard.setStringAsync(driverPhone);

      // 2. Telebirr package/scheme intent
      const telebirrAndroidScheme = "cn.tydic.ethiopay://";
      const telebirrIOSScheme = "telebirr://";
      const targetScheme = Platform.OS === "ios" ? telebirrIOSScheme : telebirrAndroidScheme;

      const supported = await Linking.canOpenURL(targetScheme);

      setTimeout(async () => {
        setIsProcessing(false);
        if (supported) {
          await Linking.openURL(targetScheme);
        } else {
          // Fallback to USSD code or dialer if app scheme isn't directly caught
          Linking.openURL("tel:*127#");
        }

        // Show confirmation prompt that redirects home after they return
        Alert.alert(
          "Number Copied! 📋",
          `Driver's phone number (${driverPhone}) has been copied to your clipboard. Paste it into Telebirr to complete your ETB ${fixedPrice} payment.`,
          [
            {
              text: "I Have Paid",
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: "Passenger" }],
                });
              },
            },
          ],
          { cancelable: false }
        );
      }, 1000);
    } catch (err) {
      setIsProcessing(false);
      Alert.alert("Notice", `Driver phone ${driverPhone} copied. Please open Telebirr manually to transfer.`);
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
              navigation.reset({
                index: 0,
                routes: [{ name: "Passenger" }],
              });
            },
          },
        ]
      );
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Context Bar */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Settle Split Fare</Text>
        <Text style={styles.headerSubtitle}>Tap below to copy details and launch your payment app</Text>
      </View>

      {/* Itemized Fare Receipt Card */}
      <View style={styles.receiptCard}>
        <Text style={styles.receiptLabel}>TRANSIT CORRIDOR</Text>
        <Text style={styles.receiptValue}>{corridor}</Text>
        
        <View style={styles.dividerLine} />
        
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Total Split Cost</Text>
          <Text style={styles.priceValueAmount}>ETB {fixedPrice}.00</Text>
        </View>
      </View>

      <Text style={styles.selectionSectionLabel}>Choose Payment App</Text>

      {/* 💳 TELEBIRR FAST LAUNCH BUTTON */}
      <TouchableOpacity
        style={styles.paymentMethodCard}
        activeOpacity={0.85}
        onPress={handleTelebirrPay}
        disabled={isProcessing}
      >
        <View style={styles.driverDetailSnippet}>
          <Text style={styles.driverSnippetLabel}>TELEBIRR DESTINATION ACCOUNT</Text>
          <Text style={styles.driverSnippetValue}>{driverName} ({driverPhone})</Text>
        </View>

        <View style={styles.methodInterfaceRow}>
          <View style={styles.cardLeftContent}>
            <View style={[styles.iconFrame, { backgroundColor: "#EFF6FF" }]}>
              <MaterialCommunityIcons name="cellphone-wireless" size={22} color="#1D4ED8" />
            </View>
            <View style={styles.methodMeta}>
              <Text style={styles.methodTitleName}>Pay via telebirr</Text>
              <Text style={styles.methodSubtext}>Copies number & opens Telebirr automatically</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>

      {/* 🏦 CBE APP FAST LAUNCH BUTTON */}
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
              <Text style={styles.methodSubtext}>Copies account number for mobile banking</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
      </TouchableOpacity>

      {isProcessing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Preparing payment bridge...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", paddingHorizontal: 20 },
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
  loadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.8)", justifyContent: "center", alignItems: "center", zIndex: 99 },
  loadingText: { marginTop: 10, fontSize: 14, fontWeight: "600", color: "#374151" }
});