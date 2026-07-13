import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from "@expo/vector-icons";

export default function TripPaymentScreen({ navigation, route }) {
  const fixedPrice = route?.params?.fixedPrice || 80;
  const corridor = route?.params?.corridor || "Megenagna → Bole";

  // State Management 
  const [selectedMethod, setSelectedMethod] = useState("telebirr"); 
  const [isProcessing, setIsProcessing] = useState(false);

  // Simulated Driver Payment Destination Records
  const driverPaymentDetails = {
    telebirr: { accountName: "Dawit Mengistu", accountNo: "0911****89" },
    cbe: { accountName: "Dawit Mengistu Toola", accountNo: "100034******9012" }
  };

  const handleSettlePayment = async () => {
    setIsProcessing(true);
    
    setTimeout(() => {
      setIsProcessing(false);
      
      Alert.alert(
        "Payment Successful 🎉",
        `ETB ${fixedPrice}.00 successfully processed via ${
          selectedMethod === "telebirr" ? "telebirr" : "CBE App"
        }.`,
        [
          {
            text: "Done",
            onPress: () => {
              navigation.reset({
                index: 0,
                routes: [{ name: "Passenger" }],
              });
            },
          },
        ]
      );
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header Context Bar */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Settle Split Fare</Text>
        <Text style={styles.headerSubtitle}>Verify driver details and settle your transit balance</Text>
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

      <Text style={styles.selectionSectionLabel}>Select Payment Method & Destination</Text>

      {/* 💳 TELEBIRR OPTION WITH DRIVER CREDENTIALS FIRST */}
      <TouchableOpacity
        style={[styles.paymentMethodCard, selectedMethod === "telebirr" && styles.activeCardBorder]}
        activeOpacity={0.85}
        onPress={() => setSelectedMethod("telebirr")}
      >
        {/* Driver Payment Account Container */}
        <View style={[styles.driverDetailSnippet, selectedMethod === "telebirr" && styles.activeSnippetBg]}>
          <Text style={styles.driverSnippetLabel}>TELEBIRR DESTINATION ACCOUNT</Text>
          <Text style={styles.driverSnippetValue}>{driverPaymentDetails.telebirr.accountName} ({driverPaymentDetails.telebirr.accountNo})</Text>
        </View>

        <View style={styles.methodInterfaceRow}>
          <View style={styles.cardLeftContent}>
            <View style={[styles.iconFrame, { backgroundColor: "#EFF6FF" }]}>
              <MaterialCommunityIcons name="cellphone-wireless" size={22} color="#1D4ED8" />
            </View>
            <View style={styles.methodMeta}>
              <Text style={styles.methodTitleName}>telebirr</Text>
              <Text style={styles.methodSubtext}>Instant merchant transfer via mobile network</Text>
            </View>
          </View>
          <View style={styles.radioOutlineCircle}>
            {selectedMethod === "telebirr" && <View style={styles.radioInnerCore} />}
          </View>
        </View>
      </TouchableOpacity>

      {/* 🏦 CBE APP / CBE BIRR OPTION WITH DRIVER CREDENTIALS FIRST */}
      <TouchableOpacity
        style={[styles.paymentMethodCard, selectedMethod === "cbe" && styles.activeCardBorder]}
        activeOpacity={0.85}
        onPress={() => setSelectedMethod("cbe")}
      >
        {/* Driver Payment Account Container */}
        <View style={[styles.driverDetailSnippet, selectedMethod === "cbe" && styles.activeSnippetBg]}>
          <Text style={styles.driverSnippetLabel}>CBE ACCOUNT DESTINATION</Text>
          <Text style={styles.driverSnippetValue}>{driverPaymentDetails.cbe.accountName} • {driverPaymentDetails.cbe.accountNo}</Text>
        </View>

        <View style={styles.methodInterfaceRow}>
          <View style={styles.cardLeftContent}>
            <View style={[styles.iconFrame, { backgroundColor: "#FFFBEB" }]}>
              <FontAwesome5 name="university" size={18} color="#D97706" />
            </View>
            <View style={styles.methodMeta}>
              <Text style={styles.methodTitleName}>CBE App / CBE Birr</Text>
              <Text style={styles.methodSubtext}>Commercial Bank of Ethiopia Direct Transfer</Text>
            </View>
          </View>
          <View style={styles.radioOutlineCircle}>
            {selectedMethod === "cbe" && <View style={styles.radioInnerCore} />}
          </View>
        </View>
      </TouchableOpacity>

      {/* FOOTER STICKY DISPATCH ACTION */}
      <View style={styles.footerStickyLayout}>
        <TouchableOpacity
          style={[styles.primaryCheckoutButton, isProcessing && styles.disabledCheckoutBtn]}
          activeOpacity={0.8}
          onPress={handleSettlePayment}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <View style={styles.btnInternalRow}>
              <Ionicons name="lock-closed" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.checkoutBtnText}>CONFIRM & PAY ETB {fixedPrice}.00</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
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
  paymentMethodCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 14, padding: 14, marginBottom: 16, overflow: "hidden" },
  activeCardBorder: { borderColor: "#10B981" },
  driverDetailSnippet: { backgroundColor: "#F3F4F6", marginHorizontal: -14, marginTop: -14, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#E5E7EB", marginBottom: 14 },
  activeSnippetBg: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  driverSnippetLabel: { fontSize: 9, fontWeight: "800", color: "#6B7280", letterSpacing: 0.5 },
  driverSnippetValue: { fontSize: 13, fontWeight: "700", color: "#111827", marginTop: 2 },
  methodInterfaceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLeftContent: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconFrame: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  methodMeta: { marginLeft: 14, flex: 1 },
  methodTitleName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  methodSubtext: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  radioOutlineCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  radioInnerCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#10B981" },
  footerStickyLayout: { position: "absolute", bottom: 24, left: 20, right: 20 },
  primaryCheckoutButton: { backgroundColor: "#111827", borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 4 },
  disabledCheckoutBtn: { backgroundColor: "#9CA3AF" },
  btnInternalRow: { flexDirection: "row", alignItems: "center" },
  checkoutBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.3 },
});