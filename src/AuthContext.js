import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@corridor_user_session";

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredProfileData();
  }, []);

  const loadStoredProfileData = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
        console.log("💾 [AuthContext] Session recovered successfully:", parsedUser);
      }
    } catch (e) {
      console.error("AsyncStorage read error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logs in or creates a user session.
   * Safely normalizes and merges incoming userData with any existing session state
   * so critical fields (full_name, profile_photo_url, etc.) are never overwritten with undefined.
   */
  const loginSession = async (userData) => {
    try {
      const normalizedUser = {
        id: userData?.id || userData?.userId || user?.id,
        full_name: userData?.full_name || userData?.name || user?.full_name || "",
        role: userData?.role || user?.role || "rider",
        profile_photo_url:
          userData?.profile_photo_url || user?.profile_photo_url || null,
        phone_verified:
          userData?.phone_verified ?? user?.phone_verified ?? true,
        wallet_balance:
          userData?.wallet_balance ?? user?.wallet_balance ?? 0,
        ...userData, // Spread remaining payload properties safely
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
      setUser(normalizedUser);
      console.log("🔓 [AuthContext] Logged in successfully:", normalizedUser);
    } catch (e) {
      console.error("AsyncStorage write error:", e);
    }
  };

  /**
   * Helper function to update partial user data (e.g., drawer avatar update or balance change)
   * without requiring a full re-login or clearing existing keys.
   */
  const updateUser = async (partialData) => {
    try {
      if (!user) return;
      const updatedUser = { ...user, ...partialData };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
      console.log("🔄 [AuthContext] Session updated successfully:", updatedUser);
    } catch (e) {
      console.error("AsyncStorage update error:", e);
    }
  };

  const logoutSession = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setUser(null);
      console.log("🔒 [AuthContext] Session cleared.");
    } catch (e) {
      console.error("AsyncStorage deletion error:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        loginSession,
        updateUser,
        logoutSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);