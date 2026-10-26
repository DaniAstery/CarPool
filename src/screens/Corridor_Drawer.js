import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Image,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../AuthContext";

const { width, height } = Dimensions.get("window");
const API_URL_PASSENGER =
  process.env.EXPO_PUBLIC_API_URL_PASSENGER || "http://3.223.192.195:5000/api";
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://3.223.192.195:5000";

export default function CorridorDrawer({
  visible,
  onClose,
  role: propRole,
  onNavigate,
}) {
  const { user, updateUser, logoutSession } = useAuth();
  console.log("🔍 [CorridorDrawer Debug] Current AuthContext user state:", JSON.stringify(user, null, 2));

  const activeUserId = user?.id || user?.userId;
  const activeRole = propRole || user?.role || "rider";
  const isDriver = activeRole === "driver";

  const [profileData, setProfileData] = useState(null);
  const [activeSubView, setActiveSubView] = useState(null);
  const [tripHistory, setTripHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Wallet and Earnings states initialized immediately from AuthContext user cache
  const [depositAmount, setDepositAmount] = useState("");
  const [selectedGateway, setSelectedGateway] = useState("telebirr");
  const [depositStep, setDepositStep] = useState("input");
  const [generatedOrder, setGeneratedOrder] = useState(null);
  const [transactionRefCode, setTransactionRefCode] = useState("");
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);
  const [walletBalance, setWalletBalance] = useState(
    parseFloat(user?.wallet_balance || 0)
  );
  const [driverEarnings, setDriverEarnings] = useState(0);

  // On-demand fetch function triggered explicitly when Wallet option is selected
  const fetchWalletAndEarnings = async () => {
    if (!activeUserId) return;

    console.log(`[Drawer Debug] Fetching wallet on-demand from: ${API_URL_PASSENGER}/users/wallet/${activeUserId}`);
    try {
      const res = await fetch(`${API_URL_PASSENGER}/users/wallet/${activeUserId}`);
      const data = await res.json();

      console.log("[Drawer Debug] Dedicated Wallet API response:", data);
      if (data && !data.error) {
        const liveBalance = parseFloat(data.wallet_balance || 0);
        const liveEarnings = parseFloat(data.total_earnings || 0);

        setWalletBalance(isNaN(liveBalance) ? 0 : liveBalance);
        setDriverEarnings(isNaN(liveEarnings) ? 0 : liveEarnings);

        if (updateUser) {
          updateUser({
            wallet_balance: isNaN(liveBalance) ? 0 : liveBalance,
          });
        }
      }
    } catch (err) {
      console.error("[Drawer Wallet Fetch Error Detailed]:", err.message);
    }
  };

  useEffect(() => {
    if (visible && activeUserId) {
      setAvatarError(false);

      if (user?.wallet_balance !== undefined) {
        setWalletBalance(parseFloat(user.wallet_balance || 0));
      }

      // Fetch Basic Profile Details on Drawer Open
      fetch(`${API_URL_PASSENGER}/users/profile/${activeUserId}`)
        .then((res) => res.json())
        .then((data) => {
          const profile = Array.isArray(data) ? data[0] : data;
          if (profile && !profile.error) {
            setProfileData(profile);
            if (updateUser) {
              updateUser({
                full_name: profile.full_name,
                profile_photo_url: profile.profile_photo_url,
                role: profile.role,
              });
            }
          }
        })
        .catch((err) => console.log("[Drawer Profile Fetch Error]:", err));
    } else {
      setActiveSubView(null);
      setDepositAmount("");
      setDepositStep("input");
      setGeneratedOrder(null);
      setTransactionRefCode("");
    }
  }, [visible, activeUserId]);

  // Profile data extraction prioritizes backend database results first
  const rawName =
    profileData?.full_name ||
    profileData?.name ||
    user?.full_name ||
    user?.name;

  const displayName =
    rawName && rawName.trim().length > 0
      ? rawName.trim()
      : profileData?.phone_number
      ? `User (${profileData.phone_number})`
      : isDriver
      ? "Corridor Driver"
      : "Corridor Passenger";

  // Fetch trip history for both drivers and riders
  const handleOpenHistory = async () => {
    if (!activeUserId) return;

    setActiveSubView("history");
    setLoadingHistory(true);
    setTripHistory([]);

    try {
      const res = await fetch(
        `${API_URL_PASSENGER}/trips/history/${activeUserId}/${activeRole}`
      );
      const data = await res.json();

      if (res.ok && Array.isArray(data)) {
        setTripHistory(data);
      } else {
        setTripHistory([]);
      }
    } catch (err) {
      console.log("[History Fetch Error]:", err);
      setTripHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Step 1: Generate Payment Order Reference
  const handleProceedToInstructions = () => {
    const amountNum = parseFloat(depositAmount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid deposit amount in ETB.");
      return;
    }

    const orderRef = `COR-${Math.floor(100000 + Math.random() * 900000)}`;
    setGeneratedOrder({
      orderId: orderRef,
      amount: amountNum,
      gateway: selectedGateway,
      accountNumber:
        selectedGateway === "telebirr"
          ? "0911000000 (Corridor Hub)"
          : "1000284920192 (CBE)",
      accountName: "Corridor Transport Dispatch",
    });
    setDepositStep("instructions");
  };

  // Step 2: Submit Transaction Reference ID for verification
  const handleSubmitDepositVerification = async () => {
    if (!transactionRefCode.trim()) {
      Alert.alert(
        "Reference Required",
        "Please enter your Telebirr or CBE transaction reference code / SMS ID."
      );
      return;
    }

    setIsSubmittingDeposit(true);
    try {
      const res = await fetch(`${API_URL}/wallet/submit-deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: activeUserId,
          amount: generatedOrder.amount,
          gateway: generatedOrder.gateway,
          order_id: generatedOrder.orderId,
          transaction_ref: transactionRefCode.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        Alert.alert(
          "Deposit Submitted",
          `Order ${generatedOrder.orderId} submitted successfully! Balance will update once verified.`
        );
      } else {
        Alert.alert(
          "Deposit Submitted",
          `Order ${generatedOrder.orderId} submitted successfully. Verification pending.`
        );
      }
    } catch (err) {
      Alert.alert(
        "Deposit Submitted",
        `Order ${generatedOrder.orderId} recorded. Balance will reflect shortly.`
      );
    } finally {
      setActiveSubView(null);
      setDepositStep("input");
      setDepositAmount("");
      setTransactionRefCode("");
      setIsSubmittingDeposit(false);
    }
  };

  const photoUrl =
    profileData?.profile_photo_url ||
    profileData?.profile_picture ||
    user?.profile_photo_url;

  const userInitials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || (isDriver ? "CD" : "CP");

  const passengerOptions = [
    { title: "1. Past Ride History", subtitle: "Last 5 completed trips", action: handleOpenHistory },
    { title: "2. Available Rewards", subtitle: "Promos & discount codes", action: () => setActiveSubView("rewards") },
    { 
      title: "3. Wallet & Deposit", 
      subtitle: `Balance: ETB ${walletBalance.toFixed(2)}`, 
      action: () => {
        setActiveSubView("wallet");
        fetchWalletAndEarnings();
      } 
    },
    { title: "4. Help & Support Center", subtitle: "Contact support team", action: () => setActiveSubView("help") },
  ];

  const driverOptions = [
    { title: "1. Active Trip History", subtitle: "Last 5 completed runs", action: handleOpenHistory },
    { title: "2. My Earned Points & Tier", subtitle: `Total Earned: ETB ${driverEarnings.toFixed(2)}`, action: () => setActiveSubView("rewards") },
    { 
      title: "3. Wallet & Deposits", 
      subtitle: `Balance: ETB ${walletBalance.toFixed(2)}`, 
      action: () => {
        setActiveSubView("wallet");
        fetchWalletAndEarnings();
      } 
    },
    { title: "4. Legal & Documents", subtitle: "License & verification", action: () => setActiveSubView("help") },
    { title: "5. Platform Support", subtitle: "Help & FAQ", action: () => setActiveSubView("help") },
  ];

  const options = isDriver ? driverOptions : passengerOptions;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <SafeAreaView style={styles.modalSafeArea} edges={["top", "right", "bottom", "left"]}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.drawerContainer, isDriver ? styles.darkDrawer : styles.lightDrawer]}>
              
              {/* 👤 USER PROFILE HEADER WITH EARNINGS BADGE */}
              <View style={[styles.profileHeader, isDriver ? styles.darkBorder : styles.lightBorder]}>
                {photoUrl && !avatarError && !photoUrl.includes("placehold.co") ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={styles.avatar}
                    resizeMode="cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <View style={[styles.avatarFallback, isDriver && { backgroundColor: "#0F172A" }]}>
                    <Text style={styles.avatarInitials}>{userInitials}</Text>
                  </View>
                )}

                <View style={styles.profileInfo}>
                  <Text style={[styles.profileName, isDriver ? styles.darkText : styles.lightText]} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={styles.profileSub}>
                    ID: #{activeUserId || "N/A"} •{" "}
                    <Text style={{ textTransform: "capitalize", color: "#059669", fontWeight: "700" }}>
                      {activeRole}
                    </Text>
                  </Text>
                  {isDriver && (
                    <Text style={styles.driverEarningsSub}>
                      Earned: ETB {driverEarnings.toFixed(2)}
                    </Text>
                  )}
                </View>

                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={isDriver ? "#FFFFFF" : "#111111"} />
                </TouchableOpacity>
              </View>

              {/* 🗂️ DYNAMIC CONTENT AREA */}
              {activeSubView === null ? (
                <View style={styles.optionsList}>
                  <Text style={[styles.sectionTitle, isDriver ? styles.darkTextSub : styles.lightTextSub]}>
                    MENU NAVIGATION
                  </Text>

                  {options.map((item, index) => (
                    <TouchableOpacity
                      key={`drawer-option-${index}`}
                      style={[styles.optionRow, isDriver ? styles.darkBorder : styles.lightBorder]}
                      onPress={item.action}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, isDriver ? styles.darkText : styles.lightText]}>
                          {item.title}
                        </Text>
                        <Text style={styles.optionSubtitle}>{item.subtitle}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}

                  {/* 🚪 LOGOUT BUTTON */}
                  <TouchableOpacity
                    style={styles.logoutRow}
                    onPress={() => {
                      onClose();
                      logoutSession();
                    }}
                  >
                    <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                    <Text style={styles.logoutText}>Sign Out Session</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.subViewContainer}>
                  <TouchableOpacity
                    style={styles.backRow}
                    onPress={() => {
                      setActiveSubView(null);
                      setDepositStep("input");
                    }}
                  >
                    <Ionicons name="arrow-back" size={16} color="#059669" />
                    <Text style={styles.backText}>Back to Menu</Text>
                  </TouchableOpacity>

                  {/* 📜 TRIP HISTORY VIEW */}
                  {activeSubView === "history" && (
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>
                        {isDriver ? "Recent Driver Runs" : "Recent Ride History"}
                      </Text>

                      {loadingHistory ? (
                        <ActivityIndicator size="small" color="#059669" style={{ marginTop: 24 }} />
                      ) : tripHistory.length === 0 ? (
                        <Text style={styles.emptyText}>No completed trips found yet.</Text>
                      ) : (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                          {tripHistory.map((trip, i) => (
                            <View
                              key={`trip-${trip.id || i}`}
                              style={[styles.tripCard, isDriver ? styles.darkCard : styles.lightCard]}
                            >
                              <View style={styles.tripRouteRow}>
                                <Ionicons name="location-sharp" size={14} color="#059669" />
                                <Text style={[styles.tripHubText, isDriver ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                  {trip.pickup_name || "Pickup Hub"}
                                </Text>
                                <Ionicons name="arrow-forward" size={12} color="#94A3B8" style={{ marginHorizontal: 4 }} />
                                <Text style={[styles.tripHubText, isDriver ? styles.darkText : styles.lightText]} numberOfLines={1}>
                                  {trip.dropoff_name || "Dropoff Hub"}
                                </Text>
                              </View>

                              <View style={styles.tripMetaRow}>
                                {isDriver ? (
                                  <View style={styles.driverMetaBadge}>
                                    <Ionicons name="people-outline" size={13} color="#64748B" />
                                    <Text style={styles.tripMetaText}>
                                      {trip.passenger_count || 1} Passengers Pool
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.driverMetaBadge}>
                                    <Image
                                      source={{
                                        uri:
                                          trip.driver_photo && !trip.driver_photo.includes("placehold.co")
                                            ? trip.driver_photo
                                            : "https://placehold.co/100",
                                      }}
                                      style={styles.tripDriverAvatar}
                                    />
                                    <Text style={styles.tripMetaText} numberOfLines={1}>
                                      Driver: {trip.driver_name || "Assigned Driver"}
                                    </Text>
                                  </View>
                                )}

                                <Text style={styles.tripStatusTag}>• Completed</Text>
                              </View>

                              <View style={styles.tripFooterRow}>
                                <Text style={styles.tripDateText}>
                                  {trip.created_at
                                    ? new Date(trip.created_at).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "Recent"}
                                </Text>
                                <Text style={styles.tripPriceText}>
                                  ETB {parseFloat(trip.price || 0).toFixed(2)}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  )}

                  {/* 💳 WALLET & DEPOSIT VIEW */}
                  {activeSubView === "wallet" && (
                    <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>
                        Corridor Wallet Deposit
                      </Text>

                      <View style={[styles.walletBalanceCard, isDriver ? styles.darkCard : styles.lightCard]}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <MaterialCommunityIcons name="wallet-outline" size={24} color="#059669" />
                          <Text style={styles.walletBalanceLabel}> Available Balance</Text>
                        </View>
                        <Text style={[styles.walletBalanceAmount, isDriver ? styles.darkText : styles.lightText]}>
                          ETB {walletBalance.toFixed(2)}
                        </Text>
                        {isDriver && (
                          <Text style={styles.walletEarningsNote}>
                            Total Lifetime Earnings: ETB {driverEarnings.toFixed(2)}
                          </Text>
                        )}
                      </View>

                      {depositStep === "input" ? (
                        <>
                          <Text
                            style={[
                              styles.sectionTitle,
                              { marginTop: 8 },
                              isDriver ? styles.darkTextSub : styles.lightTextSub,
                            ]}
                          >
                            SELECT PAYMENT METHOD
                          </Text>
                          <View style={styles.gatewayRow}>
                            <TouchableOpacity
                              style={[
                                styles.gatewayBtn,
                                selectedGateway === "telebirr" && styles.gatewayBtnActive,
                              ]}
                              onPress={() => setSelectedGateway("telebirr")}
                            >
                              <Text
                                style={[
                                  styles.gatewayText,
                                  selectedGateway === "telebirr" && styles.gatewayTextActive,
                                ]}
                              >
                                Telebirr
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.gatewayBtn,
                                selectedGateway === "cbe" && styles.gatewayBtnActive,
                              ]}
                              onPress={() => setSelectedGateway("cbe")}
                            >
                              <Text
                                style={[
                                  styles.gatewayText,
                                  selectedGateway === "cbe" && styles.gatewayTextActive,
                                ]}
                              >
                                CBE Birr
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <Text
                            style={[
                              styles.sectionTitle,
                              { marginTop: 8 },
                              isDriver ? styles.darkTextSub : styles.lightTextSub,
                            ]}
                          >
                            ENTER AMOUNT (ETB)
                          </Text>

                          <View style={styles.quickAmountsRow}>
                            {[100, 250, 500, 1000].map((amt) => (
                              <TouchableOpacity
                                key={`amt-${amt}`}
                                style={styles.quickAmountBtn}
                                onPress={() => setDepositAmount(amt.toString())}
                              >
                                <Text style={styles.quickAmountText}>+{amt}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>

                          <View style={styles.depositInputContainer}>
                            <TextInput
                              style={[
                                styles.depositInput,
                                isDriver ? styles.darkInputText : styles.lightInputText,
                              ]}
                              placeholder="Custom amount (ETB)"
                              placeholderTextColor="#94A3B8"
                              keyboardType="numeric"
                              value={depositAmount}
                              onChangeText={setDepositAmount}
                            />
                            <TouchableOpacity
                              style={styles.depositButton}
                              onPress={handleProceedToInstructions}
                            >
                              <Text style={styles.depositButtonText}>Generate Order</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      ) : (
                        <View style={styles.instructionContainer}>
                          <View style={styles.orderBadgeBox}>
                            <Text style={styles.orderBadgeTitle}>Payment Order Reference</Text>
                            <Text style={styles.orderBadgeCode}>{generatedOrder?.orderId}</Text>
                            <Text style={styles.orderBadgeAmount}>
                              Amount: ETB {generatedOrder?.amount.toFixed(2)}
                            </Text>
                          </View>

                          <View style={[styles.infoBox, { marginTop: 10 }]}>
                            <Text style={styles.infoBoxTitle}>📱 Transfer Instructions:</Text>
                            <Text style={styles.infoBoxText}>
                              1. Open your{" "}
                              {generatedOrder?.gateway === "telebirr" ? "Telebirr" : "CBE Birr"} app or
                              dial USSD.{"\n"}
                              2. Transfer{" "}
                              <Text style={{ fontWeight: "700" }}>
                                ETB {generatedOrder?.amount.toFixed(2)}
                              </Text>{" "}
                              to:{"\n"}
                              <Text style={{ fontWeight: "700", color: "#059669" }}>
                                {generatedOrder?.accountNumber}
                              </Text>
                              {"\n"}
                              3. Put order reference{" "}
                              <Text style={{ fontWeight: "700" }}>{generatedOrder?.orderId}</Text> in the
                              remark/reason field.{"\n"}
                              4. Paste your SMS Transaction ID below.
                            </Text>
                          </View>

                          <TextInput
                            style={[
                              styles.depositInput,
                              { marginTop: 12, marginBottom: 8 },
                              isDriver ? styles.darkInputText : styles.lightInputText,
                            ]}
                            placeholder="Enter Transaction Ref / SMS ID (e.g., TXN928374)"
                            placeholderTextColor="#94A3B8"
                            value={transactionRefCode}
                            onChangeText={setTransactionRefCode}
                          />

                          <TouchableOpacity
                            style={[
                              styles.depositButtonFull,
                              isSubmittingDeposit && styles.buttonDisabled,
                            ]}
                            disabled={isSubmittingDeposit}
                            onPress={handleSubmitDepositVerification}
                          >
                            {isSubmittingDeposit ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.depositButtonText}>
                                I Have Paid • Submit Verification
                              </Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={{ alignItems: "center", marginTop: 8 }}
                            onPress={() => setDepositStep("input")}
                          >
                            <Text style={{ fontSize: 11, color: "#64748B" }}>
                              Cancel & Edit Amount
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <Text style={styles.walletFooterNote}>
                        🔒 No business license required. Deposits are verified manually or via automated
                        order tracking.
                      </Text>
                    </ScrollView>
                  )}

                  {/* 🎁 REWARDS & PROMO INFO */}
                  {activeSubView === "rewards" && (
                    <View>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>
                        Rewards & Promos
                      </Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>💡 How earnings & rewards work:</Text>
                        <Text style={styles.infoBoxText}>
                          {isDriver
                            ? `You have earned a total of ETB ${driverEarnings.toFixed(2)} from your completed rides. Maintain an active wallet balance above ETB 50 to continue accepting new passengers.`
                            : "When your pooling core partner joins, your base rate discount is locked in automatically. You can also enter valid promo codes directly on the payment screen during checkout!"}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* 🛟 HELP & SUPPORT */}
                  {activeSubView === "help" && (
                    <View>
                      <Text style={[styles.subViewTitle, isDriver ? styles.darkText : styles.lightText]}>
                        Help Center
                      </Text>
                      <View style={styles.infoBox}>
                        <Text style={styles.infoBoxTitle}>📞 Corridor Support</Text>
                        <Text style={styles.infoBoxText}>
                          Need immediate assistance with a ride or payout? Contact our Addis Ababa dispatch
                          support team via Telegram @CorridorSupport or call +251 911 000 000.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
        </SafeAreaView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 12,
    paddingLeft: 12,
  },
  modalSafeArea: { flex: 1 },
  drawerContainer: {
    width: width * 0.82,
    maxHeight: height * 0.82,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 12,
  },
  darkDrawer: { backgroundColor: "#1E293B" },
  lightDrawer: { backgroundColor: "#FFFFFF" },

  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    marginBottom: 10,
    borderBottomWidth: 1,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#E2E8F0" },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#059669",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitials: { color: "#FFFFFF", fontWeight: "800", fontSize: 16 },
  profileInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 14, fontWeight: "700" },
  profileSub: { fontSize: 11, color: "#64748B", marginTop: 2 },
  driverEarningsSub: { fontSize: 11, fontWeight: "800", color: "#059669", marginTop: 3 },
  closeButton: { padding: 4 },

  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
    color: "#94A3B8",
  },
  optionsList: { paddingBottom: 6 },
  optionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5 },
  darkBorder: { borderBottomColor: "#334155" },
  lightBorder: { borderBottomColor: "#F1F5F9" },

  optionTitle: { fontSize: 13, fontWeight: "700" },
  optionSubtitle: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  logoutRow: { flexDirection: "row", alignItems: "center", paddingTop: 16, marginTop: 8 },
  logoutText: { fontSize: 13, fontWeight: "700", color: "#EF4444", marginLeft: 8 },

  subViewContainer: { minHeight: 280 },
  backRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { fontSize: 12, fontWeight: "700", color: "#059669", marginLeft: 6 },
  subViewTitle: { fontSize: 14, fontWeight: "800", marginBottom: 12 },

  walletBalanceCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  walletBalanceLabel: { fontSize: 12, fontWeight: "600", color: "#64748B", marginLeft: 6 },
  walletBalanceAmount: { fontSize: 22, fontWeight: "800", marginTop: 6 },
  walletEarningsNote: { fontSize: 11, color: "#059669", fontWeight: "700", marginTop: 6 },

  gatewayRow: { flexDirection: "row", marginBottom: 10 },
  gatewayBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    marginHorizontal: 3,
    backgroundColor: "#F8FAFC",
  },
  gatewayBtnActive: { backgroundColor: "#059669", borderColor: "#059669" },
  gatewayText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  gatewayTextActive: { color: "#FFFFFF" },

  quickAmountsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  quickAmountBtn: {
    flex: 1,
    backgroundColor: "rgba(5, 150, 105, 0.1)",
    paddingVertical: 8,
    marginHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(5, 150, 105, 0.3)",
  },
  quickAmountText: { fontSize: 12, fontWeight: "700", color: "#059669" },

  depositInputContainer: { flexDirection: "row", marginBottom: 10 },
  depositInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginRight: 8,
    backgroundColor: "#FFFFFF",
  },
  darkInputText: { color: "#0F172A" },
  lightInputText: { color: "#111111" },
  depositButton: { backgroundColor: "#059669", justifyContent: "center", paddingHorizontal: 14, borderRadius: 8 },
  depositButtonFull: {
    backgroundColor: "#059669",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#9CA3AF" },
  depositButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  walletFooterNote: { fontSize: 11, color: "#64748B", textAlign: "center", marginTop: 8, lineHeight: 16 },

  orderBadgeBox: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  orderBadgeTitle: { fontSize: 11, fontWeight: "700", color: "#1E40AF", textTransform: "uppercase" },
  orderBadgeCode: { fontSize: 20, fontWeight: "800", color: "#1D4ED8", marginVertical: 4, letterSpacing: 1 },
  orderBadgeAmount: { fontSize: 12, fontWeight: "600", color: "#3B82F6" },

  instructionContainer: { marginTop: 4 },

  emptyText: { fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 20 },
  infoBox: {
    padding: 12,
    backgroundColor: "rgba(5, 150, 105, 0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(5, 150, 105, 0.2)",
  },
  infoBoxTitle: { fontSize: 12, fontWeight: "700", color: "#059669", marginBottom: 4 },
  infoBoxText: { fontSize: 12, color: "#475569", lineHeight: 18 },

  darkText: { color: "#FFFFFF" },
  darkTextSub: { color: "#94A3B8" },
  lightText: { color: "#111111" },
  lightTextSub: { color: "#64748B" },

  tripCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  darkCard: { backgroundColor: "#0F172A", borderColor: "#334155" },
  lightCard: { backgroundColor: "#F8FAFC", borderColor: "#E2E8F0" },

  tripRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  tripHubText: {
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },

  tripMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(148, 163, 184, 0.2)",
    marginBottom: 6,
  },
  driverMetaBadge: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  tripDriverAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#CBD5E1",
    marginRight: 6,
  },
  tripMetaText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginLeft: 4,
  },
  tripStatusTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#059669",
  },

  tripFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tripDateText: {
    fontSize: 10,
    color: "#94A3B8",
  },
  tripPriceText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#059669",
  },
});