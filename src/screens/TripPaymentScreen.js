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
  const [selectedMethod, setSelectedMethod] = useState("telebirr"); // Default option
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSettlePayment = async () => {
    setIsProcessing(true);
    
    // Simulate payment channel verification delay
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
              // Reset navigation stack to wipe out the old ride state entries completely
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
        <Text style={styles.headerSubtitle}>Choose your preferred local mobile wallet provider</Text>
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

      <Text style={styles.selectionSectionLabel}>Payment Providers</Text>

      {/* 💳 TELEBIRR OPTION WALLET CARD */}
      <TouchableOpacity
        style={[styles.paymentMethodCard, selectedMethod === "telebirr" && styles.activeCardBorder]}
        activeOpacity={0.85}
        onPress={() => setSelectedMethod("telebirr")}
      >
        <View style={styles.cardLeftContent}>
          <View style={[styles.iconFrame, { backgroundColor: "#EFF6FF" }]}>
            <MaterialCommunityIcons name="cellphone-wireless" size={22} color="#1D4ED8" />
          </View>
          <View style={styles.methodMeta}>
            <Text style={styles.methodTitleName}>telebirr</Text>
            <Text style={styles.methodSubtext}>Instant transfer via Ethio Telecom</Text>
          </View>
        </View>
        <View style={styles.radioOutlineCircle}>
          {selectedMethod === "telebirr" && <View style={styles.radioInnerCore} />}
        </View>
      </TouchableOpacity>

      {/* 🏦 CBE APP / CBE BIRR OPTION CARD */}
      <TouchableOpacity
        style={[styles.paymentMethodCard, selectedMethod === "cbe" && styles.activeCardBorder]}
        activeOpacity={0.85}
        onPress={() => setSelectedMethod("cbe")}
      >
        <View style={styles.cardLeftContent}>
          <View style={[styles.iconFrame, { backgroundColor: "#FFFBEB" }]}>
            <FontAwesome5 name="university" size={18} color="#D97706" />
          </View>
          <View style={styles.methodMeta}>
            <Text style={styles.methodTitleName}>CBE App / CBE Birr</Text>
            <Text style={styles.methodSubtext}>Commercial Bank of Ethiopia Direct</Text>
          </View>
        </View>
        <View style={styles.radioOutlineCircle}>
          {selectedMethod === "cbe" && <View style={styles.radioInnerCore} />}
        </View>
      </TouchableOpacity>

      {/* FOOTER DISPATCH ACTION BUTTON LAYER */}
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
  receiptCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 25